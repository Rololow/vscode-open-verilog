// Open Verilog for VS Code: the language server (diagnostics, go-to-definition) and the commands that run the `ovc`
// compiler, and their installation.
//
// `ovc` is the compiler (ovc-rs), `ovc-lsp` its language server. Each is found in this order: its setting (`ov.path`,
// `ov.lspPath`), then the copy the extension keeps in its storage, else the extension offers to download the release
// for this platform (with its SHA256 checked).

const vscode = require("vscode");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const https = require("https");
const path = require("path");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

const output = vscode.window.createOutputChannel("Open Verilog");
let client = null;

// the asset of a tool for each platform in a release (see .github/workflows/release.yml)
function assetName(tool) {
  const platforms = { "win32-x64": "windows-x64.exe", "linux-x64": "linux-x64", "darwin-arm64": "macos-arm64", "darwin-x64": "macos-x64" };
  const suffix = platforms[`${process.platform}-${process.arch}`];
  return suffix ? `${tool}-${suffix}` : null;
}

// the copy of a tool the extension keeps: `ovc` or `ovc-lsp`
function storedBinary(context, tool) {
  const name = process.platform === "win32" ? `${tool}.exe` : tool;
  return path.join(context.globalStorageUri.fsPath, name);
}

// the compiler to run: the setting, the stored copy, or nothing (the user is then asked to install it)
function compilerPath(context) {
  const configured = vscode.workspace.getConfiguration("ov").get("path");
  if (configured) {
    return configured;
  }
  const stored = storedBinary(context, "ovc");
  return fs.existsSync(stored) ? stored : null;
}

// the language server to start: the setting, else the stored copy, else nothing
function lspPath(context) {
  const configured = vscode.workspace.getConfiguration("ov").get("lspPath");
  if (configured) {
    return configured;
  }
  const stored = storedBinary(context, "ovc-lsp");
  return fs.existsSync(stored) ? stored : null;
}

// runs ovc with arguments; resolves with its output (stdout and stderr) and exit code
function runOvc(binary, args, cwd) {
  return new Promise((resolve) => {
    childProcess.execFile(binary, args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
  });
}

// GET with redirects (GitHub release assets redirect to their storage)
function download(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "vscode-open-verilog" } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
          response.resume();
          resolve(download(new URL(response.headers.location, url).toString(), redirects - 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${url}: HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

// downloads ovc and ovc-lsp for this platform into the storage, checking each SHA256 against the release's SHA256SUMS
async function install(context) {
  const base = vscode.workspace.getConfiguration("ov").get("releaseUrl").replace(/\/$/, "");
  const sums = (await download(`${base}/SHA256SUMS`)).toString("utf8");
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
  for (const tool of ["ovc", "ovc-lsp"]) {
    const asset = assetName(tool);
    if (!asset) {
      throw new Error(`no ${tool} build for ${process.platform} ${process.arch}: set ov.path and ov.lspPath to builds you made`);
    }
    output.appendLine(`Downloading ${base}/${asset}`);
    const binary = await download(`${base}/${asset}`);
    const expected = sums
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .find((parts) => parts[1] && parts[1].endsWith(asset));
    const actual = crypto.createHash("sha256").update(binary).digest("hex");
    if (!expected || expected[0].toLowerCase() !== actual) {
      throw new Error(`the SHA256 of ${asset} does not match the release's SHA256SUMS`);
    }
    const target = storedBinary(context, tool);
    fs.writeFileSync(target, binary);
    if (process.platform !== "win32") {
      fs.chmodSync(target, 0o755);
    }
    output.appendLine(`Installed ${target}`);
  }
  return storedBinary(context, "ovc");
}

// the compiler to use, installing it first when it is missing
async function requireCompiler(context) {
  const existing = compilerPath(context);
  if (existing) {
    return existing;
  }
  const choice = await vscode.window.showInformationMessage("Open Verilog needs the ovc compiler. Download it from the latest release?", "Download", "Cancel");
  if (choice !== "Download") {
    return null;
  }
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Installing ovc" }, () => install(context));
}

// starts the language server: diagnostics on the workspace's .ov files, and go-to-definition across them
async function startServer(context) {
  if (client) {
    await client.stop();
    client = null;
  }
  const binary = lspPath(context);
  if (!binary) {
    output.appendLine("ovc-lsp not found: set ov.lspPath, or run Open Verilog: Install or update ovc.");
    return;
  }
  const serverOptions = { command: binary, transport: TransportKind.stdio };
  const clientOptions = { documentSelector: [{ scheme: "file", language: "open-verilog" }], outputChannel: output };
  client = new LanguageClient("ovc-lsp", "Open Verilog Language Server", serverOptions, clientOptions);
  await client.start();
}

function activeOvFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "open-verilog") {
    vscode.window.showWarningMessage("Open Verilog: open a .ov file first.");
    return null;
  }
  return editor.document;
}

function workspaceRoot() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  return folder ? folder.uri.fsPath : null;
}

function activate(context) {
  startServer(context);

  context.subscriptions.push(
    // restart the language server (after an update of ovc-lsp, or a change of ov.lspPath)
    vscode.commands.registerCommand("ov.restartServer", () => startServer(context)),

    // check the open file: the compiler's messages go to the output channel
    vscode.commands.registerCommand("ov.check", async () => {
      const doc = activeOvFile();
      const binary = doc && (await requireCompiler(context));
      if (!binary) {
        return;
      }
      output.show(true);
      output.appendLine(`$ ovc ${doc.fileName}`);
      // the SystemVerilog is not wanted here: only the messages
      const result = await runOvc(binary, [doc.fileName, "-o", os.devNull], path.dirname(doc.fileName));
      output.appendLine(result.stderr || "no message");
      vscode.window.setStatusBarMessage(result.code === 0 ? "Open Verilog: no error" : "Open Verilog: errors, see the Open Verilog output", 5000);
    }),

    // show the SystemVerilog of the open file in a new editor
    vscode.commands.registerCommand("ov.showSystemVerilog", async () => {
      const doc = activeOvFile();
      const binary = doc && (await requireCompiler(context));
      if (!binary) {
        return;
      }
      const result = await runOvc(binary, [doc.fileName], path.dirname(doc.fileName));
      if (result.code !== 0) {
        output.show(true);
        output.appendLine(result.stderr);
        return;
      }
      const sv = await vscode.workspace.openTextDocument({ language: "systemverilog", content: result.stdout });
      await vscode.window.showTextDocument(sv, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    }),

    // build the whole workspace: one .sv per .ov under ./out, and the file list
    vscode.commands.registerCommand("ov.build", async () => {
      const root = workspaceRoot();
      const binary = root && (await requireCompiler(context));
      if (!binary) {
        vscode.window.showWarningMessage("Open Verilog: open a folder with .ov files first.");
        return;
      }
      output.show(true);
      output.appendLine(`$ ovc build ${root}`);
      const result = await runOvc(binary, ["build", root, "-o", path.join(root, "out"), "--root", root], root);
      output.appendLine(result.stderr || "build done");
      if (result.code !== 0) {
        vscode.window.showErrorMessage("Open Verilog: the build failed, see the Open Verilog output.");
      }
    }),

    // install or update ovc and ovc-lsp in the storage
    vscode.commands.registerCommand("ov.install", async () => {
      try {
        const target = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Installing ovc" }, () => install(context));
        vscode.window.showInformationMessage(`Open Verilog: ovc and ovc-lsp installed next to ${target}`);
        await startServer(context);
      } catch (error) {
        vscode.window.showErrorMessage(`Open Verilog: ${error.message}`);
      }
    }),

    output
  );
}

function deactivate() {
  return client ? client.stop() : undefined;
}

module.exports = { activate, deactivate };
