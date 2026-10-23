# Open Verilog for VS Code / VSCodium

Syntax highlighting for **Open Verilog** (`.ov`) files. Nothing else: the extension does not run `ovc`, does not
check the code and does not start any process. It only colours the text.

## Available on the Visual Studio Marketplace

[![VS Marketplace](https://img.shields.io/badge/VS_Marketplace-Open_Verilog-blue.svg)](https://marketplace.visualstudio.com/items?itemName=open-verilog.open-verilog)

## What is coloured

| Text | Scope |
|---|---|
| `// line` and `/* block */` comments | `comment.line.double-slash.ov`, `comment.block.ov` |
| strings, escapes, `%0d` placeholders | `string.quoted.double.ov`, `constant.character.escape.ov`, `constant.other.placeholder.ov` |
| `8'hff`, `'h2a`, `4'b10_10`, `'1`, `42`, `1.5e3` | `constant.numeric.*.ov` |
| `module`, `pipeline`, `bundle`, `struct`, `enum`, `config`, `isa`, `regmap`, `memmap`, `fn`, `stage`, `fsm`, `val`, `const`, `test`, `probe`, `always_ff`, `assign`, ... | `storage.type.declaration.ov` |
| the name after a declaration | `entity.name.type.ov`, `entity.name.function.ov`, `entity.name.section.ov`, `variable.other.constant.ov` |
| `logic`, `reg`, `wire`, `bit`, `int`, ... | `storage.type.ov` |
| `input`, `output`, `master`, `slave`, `monitor`, `async`, `signed`, ... | `storage.modifier.ov` |
| `if`, `else`, `for ... in`, `case`, `match`, `default`, `return`, ... | `keyword.control.ov` |
| `stall_when`, `flush_when`, `tie_off`, `posedge`, `negedge`, and the words of `memmap`, `isa`, `test` and `probe` lines (`size`, `irq`, `opcode`, `timeout`, ...) | `keyword.other.ov` |
| `.wrap()`, `.fire()`, `.zext(32)`, `.fold(...)`, ... | `support.function.builtin.ov` |
| `$display`, `$clog2`, ... | `support.function.system.ov` |
| `clog2`, `min`, `max`, `abs`, `isqrt` | `support.function.builtin.ov` |
| `step`, `expect`, `wait_until`, `send`, `recv`, `print` in tests | `support.function.test.ov` |
| `.clk`, `.s(x)` port connections | `variable.parameter.port.ov` |
| `Type<args> name(`: the instance name | `variable.other.instance.ov` |
| `AxiLite`, `Stream`, `Hart`: names that start with a capital | `entity.name.type.ov` |
| `NAMES_IN_CAPITALS`: constants, enum members, parameters | `variable.other.constant.ov` |
| `true`, `false` | `constant.language.ov` |
| `..`, `++`, `=>`, `->` and the other operators | `keyword.operator.*.ov` |
| `` `define``, `` `ifdef`` ... | `meta.preprocessor.ov` |

Words that are only keywords in one place (`size`, `irq`, `opcode`, `from`, `compatible`, `in`, ...) are coloured
only there, so `s.aw.data.size` or a port called `in` keep the colour of an ordinary name.

The language configuration adds comment toggling (`//`, `/* */`), bracket matching and auto-closing, and indentation
after `{`.

## Install

Build the package once (Node.js is needed):

```
cd vscode-open-verilog
npm install
npm run package
```

This writes `open-verilog-<version>.vsix`. Then install it:

- VS Code: `code --install-extension open-verilog-0.1.0.vsix`
- VSCodium: `codium --install-extension open-verilog-0.1.0.vsix`
- or, in the editor: *Extensions* view, `...` menu, *Install from VSIX...*

To try it without installing: open this folder in VS Code and press `F5` (Extension Development Host), then open
`test/sample.ov`.

## Develop

The grammar is generated: edit `tools/build-grammar.js` (the regular expressions are written with `String.raw`, so
there is no double escaping) and run

```
npm run build     # writes syntaxes/ov.tmLanguage.json
npm test          # tokenizes test/sample.ov and every .ov file of the repository, checks the scopes
```

`npm test` runs the same TextMate engine as the editor (`vscode-textmate` with `vscode-oniguruma`), so it needs no
editor. A theme colours the scopes above; the extension itself ships no colours, so it follows the theme you use.
