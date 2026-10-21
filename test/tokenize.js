// Checks the grammar without an editor: tokenizes sample.ov and every .ov file of the repository, asserts the scopes of
// a few tokens, and fails when a file makes the tokenizer throw. Run: npm test
const fs = require("fs");
const path = require("path");
const vsctm = require("vscode-textmate");
const oniguruma = require("vscode-oniguruma");

const root = path.join(__dirname, "..");
const wasm = fs.readFileSync(path.join(root, "node_modules", "vscode-oniguruma", "release", "onig.wasm")).buffer;
const onig = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
  createOnigString: (s) => new oniguruma.OnigString(s),
}));

const registry = new vsctm.Registry({
  onigLib: onig,
  loadGrammar: async (scope) => {
    if (scope !== "source.ov") return null;
    const text = fs.readFileSync(path.join(root, "syntaxes", "ov.tmLanguage.json"), "utf8");
    return vsctm.parseRawGrammar(text, "ov.tmLanguage.json");
  },
});

function tokenize(grammar, text) {
  const lines = [];
  let state = vsctm.INITIAL;
  for (const line of text.split(/\r?\n/)) {
    const result = grammar.tokenizeLine(line, state);
    lines.push({ line, tokens: result.tokens });
    state = result.ruleStack;
  }
  return lines;
}

/** The scopes (after the root one) of the first token whose text is `word` on a line containing `context`. */
function scopesOf(lines, context, word) {
  for (const { line, tokens } of lines) {
    if (!line.includes(context)) continue;
    for (const t of tokens) {
      if (line.slice(t.startIndex, t.endIndex) === word) return t.scopes.slice(1).join(" ");
    }
  }
  return null;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "target" || e.name.startsWith("out") || e.name === "work") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ov")) out.push(p);
  }
}

(async () => {
  const grammar = await registry.loadGrammar("source.ov");
  let failures = 0;
  const expect = (lines, context, word, wanted) => {
    const got = scopesOf(lines, context, word);
    if (!got || !got.includes(wanted)) {
      failures++;
      console.error(`FAIL  '${word}' in '${context}': wanted ${wanted}, got ${got}`);
    }
  };

  const sample = tokenize(grammar, fs.readFileSync(path.join(__dirname, "sample.ov"), "utf8"));
  expect(sample, "// Sample", "// Sample for the highlighting: open it with the extension and look at the colours.", "comment.line");
  expect(sample, "`define", "`define", "meta.preprocessor");
  expect(sample, "pipeline Mac", "pipeline", "storage.type.declaration");
  expect(sample, "pipeline Mac", "Mac", "entity.name.type");
  expect(sample, "module Top", "module", "storage.type.declaration");
  expect(sample, "stage mul", "mul", "entity.name.section");
  expect(sample, "fn fire", "fire", "entity.name.function");
  expect(sample, "logic valid = 0", "logic", "storage.type");
  expect(sample, "output logic valid", "output", "storage.modifier");
  expect(sample, "slave Vec", "slave", "storage.modifier");
  expect(sample, "slave Vec", "Vec", "entity.name.type");
  expect(sample, "ADD = 0", "ADD", "variable.other.constant");
  expect(sample, "'h2", "'h2", "constant.numeric");
  expect(sample, "8'hff", "8'hff", "constant.numeric");
  expect(sample, "4'b1010", "4'b1010", "constant.numeric");
  expect(sample, "count %0d", "%0d", "constant.other.placeholder");
  expect(sample, "ram_init", "../sw/hello/hello.hex", "string.quoted");
  expect(sample, "$display", "$display", "support.function.system");
  expect(sample, ".wrap()", "wrap", "support.function.builtin");
  expect(sample, "in[0].fire()", "fire", "support.function.builtin");
  expect(sample, ".clk", "clk", "variable.parameter.port");
  expect(sample, "for i in 0..N", "for", "keyword.control");
  expect(sample, "for i in 0..N", "in", "keyword.control");
  expect(sample, "for i in 0..N", "..", "keyword.operator.range");
  expect(sample, "stall_when", "stall_when", "keyword.other");
  expect(sample, "memmap io", "memmap", "storage.type.declaration");
  expect(sample, "UART @", "size", "keyword.other");
  expect(sample, "UART @", "irq", "keyword.other");
  expect(sample, "UART @", "compatible", "keyword.other");
  expect(sample, "isa Mini", "opcode", "keyword.other");
  expect(sample, "LDX = 6", "like", "storage.modifier");
  expect(sample, "tie_off", "tie_off", "keyword.other");
  expect(sample, "test \"counts\"", "test", "storage.type.declaration");
  expect(sample, "probe watch", "probe", "storage.type.declaration");
  expect(sample, "probe watch", "when", "keyword.other");
  expect(sample, "send(in, 5)", "send", "support.function.test");
  expect(sample, "step(3)", "step", "support.function.test");
  expect(sample, "match (count)", "match", "keyword.control");
  expect(sample, "match (count)", "default", "keyword.control");
  // 'size' is a plain name in an assignment, not a keyword
  const plain = tokenize(grammar, "assign s.aw.data.size = 2;");
  const sizeScopes = scopesOf(plain, "assign", "size");
  if (sizeScopes && sizeScopes.includes("keyword")) {
    failures++;
    console.error(`FAIL  'size' as a field name must not be a keyword, got ${sizeScopes}`);
  }

  // every .ov file of the repository tokenizes, and the tokenizer stays in balance (no runaway block comment/string)
  const files = [];
  walk(path.join(root, ".."), files);
  let tokens = 0;
  for (const file of files) {
    try {
      const lines = tokenize(grammar, fs.readFileSync(file, "utf8"));
      tokens += lines.reduce((n, l) => n + l.tokens.length, 0);
      const last = lines[lines.length - 1];
      const open = last.tokens.some((t) => t.scopes.some((s) => s.startsWith("comment.block") || s.startsWith("string.quoted")));
      if (open) {
        failures++;
        console.error(`FAIL  ${path.relative(root, file)} ends inside a comment or a string`);
      }
    } catch (e) {
      failures++;
      console.error(`FAIL  ${path.relative(root, file)}: ${e.message}`);
    }
  }
  console.log(`${files.length} .ov files, ${tokens} tokens, ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
})();
