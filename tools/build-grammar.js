// Generates syntaxes/ov.tmLanguage.json. The regular expressions are written with String.raw here, which avoids the
// double escaping of JSON. Run: node tools/build-grammar.js
const fs = require("fs");
const path = require("path");

const words = (list) => String.raw`\b(?:${list.trim().split(/\s+/).join("|")})\b`;

// ---- vocabulary -------------------------------------------------------------------------------------------------
const CONTROL = `if else for foreach while do repeat forever case casex casez endcase default return break continue match
goto wait fork join join_any join_none disable unique unique0 priority iff inside begin end`;

const DECLARATION = `module endmodule pipeline stage interface endinterface package endpackage program endprogram bundle trait
config isa regmap memmap fsm fn function endfunction task endtask struct enum union typedef class endclass extends
implements import export generate endgenerate genvar val const localparam parameter probe test modport clocking
endclocking property endproperty sequence endsequence assert assume cover initial always always_ff always_comb
always_latch assign override same_domain`;

const TYPES = `logic reg wire bit byte int integer longint shortint real shortreal realtime time string event void
chandle tri tri0 tri1 supply0 supply1 wand wor`;

const MODIFIERS = `input output inout ref master slave monitor async sync strobe signed unsigned packed var automatic
static virtual local protected rand randc`;

const OV_CONTROL = `stall_when flush_when kill_when younger_when tie_off reset clock posedge negedge edge`;

const CONSTANTS = `true false null`;

const BUILTIN_FUNCTIONS = `clog2 min max abs isqrt`;

const TEST_COMMANDS = `step expect wait_until send recv print`;

const METHODS = `wrap fire zext sext fill delay list map reduce tree_reduce fold filter select enumerate reverse len msb
lsb as`;

// ---- grammar ----------------------------------------------------------------------------------------------------
const IDENT = String.raw`[A-Za-z_][A-Za-z0-9_$]*`;

const grammar = {
  $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  name: "Open Verilog",
  scopeName: "source.ov",
  fileTypes: ["ov"],
  patterns: [{ include: "#comments" }, { include: "#strings" }, { include: "#preprocessor" }, { include: "#numbers" },
    { include: "#declarations" }, { include: "#contextual" }, { include: "#keywords" }, { include: "#calls" },
    { include: "#names" }, { include: "#operators" }],
  repository: {
    comments: {
      patterns: [
        { name: "comment.line.double-slash.ov", match: String.raw`//.*$` },
        { name: "comment.block.ov", begin: String.raw`/\*`, end: String.raw`\*/` },
      ],
    },
    strings: {
      patterns: [
        {
          name: "string.quoted.double.ov",
          begin: '"',
          end: '"',
          patterns: [
            { name: "constant.character.escape.ov", match: String.raw`\\.` },
            { name: "constant.other.placeholder.ov", match: String.raw`%[-+0# ]*\d*(?:\.\d+)?[a-zA-Z%]` },
          ],
        },
      ],
    },
    preprocessor: {
      patterns: [{ name: "meta.preprocessor.ov", match: String.raw`\`${IDENT}` }],
    },
    numbers: {
      patterns: [
        // 8'hff, 4'b10_10, 'h1f, 'sd5, '0 / '1 / 'x
        { name: "constant.numeric.based.ov", match: String.raw`\b\d[\d_]*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-F_xXzZ?]+` },
        { name: "constant.numeric.based.ov", match: String.raw`(?<![\w'])'[sS]?[bBoOdDhH]\s*[0-9a-fA-F_xXzZ?]+` },
        { name: "constant.numeric.based.ov", match: String.raw`(?<![\w'])'[01xXzZ]\b` },
        { name: "constant.numeric.float.ov", match: String.raw`\b\d[\d_]*\.\d[\d_]*(?:[eE][-+]?\d+)?\b` },
        { name: "constant.numeric.integer.ov", match: String.raw`\b\d[\d_]*\b` },
      ],
    },
    declarations: {
      patterns: [
        // module Name, pipeline Name, bundle Name, struct Name, enum Name, ...
        {
          match: String.raw`\b(module|pipeline|interface|package|program|bundle|trait|config|isa|regmap|memmap|struct|enum|union|typedef|class)\s+(${IDENT})`,
          captures: { 1: { name: "storage.type.declaration.ov" }, 2: { name: "entity.name.type.ov" } },
        },
        // probe name on Module when (...)
        {
          match: String.raw`\b(probe)\s+(${IDENT})\s+(on)\s+(${IDENT})(?:\s+(when)\b)?`,
          captures: {
            1: { name: "storage.type.declaration.ov" },
            2: { name: "entity.name.function.ov" },
            3: { name: "keyword.other.ov" },
            4: { name: "entity.name.type.ov" },
            5: { name: "keyword.other.ov" },
          },
        },
        // fn name(, function name, task name
        {
          match: String.raw`\b(fn|function|task)\s+(${IDENT})`,
          captures: { 1: { name: "storage.type.declaration.ov" }, 2: { name: "entity.name.function.ov" } },
        },
        // stage name, fsm name
        {
          match: String.raw`\b(stage|fsm)\s+(${IDENT})`,
          captures: { 1: { name: "storage.type.declaration.ov" }, 2: { name: "entity.name.section.ov" } },
        },
        // export struct, extends Base
        {
          match: String.raw`\b(extends|implements|like)\s+(${IDENT})`,
          captures: { 1: { name: "storage.modifier.ov" }, 2: { name: "entity.name.type.ov" } },
        },
        // val name, const NAME
        {
          match: String.raw`\b(val|const|localparam|parameter)\s+(${IDENT})`,
          captures: { 1: { name: "storage.type.declaration.ov" }, 2: { name: "variable.other.constant.ov" } },
        },
        // test "name" for Module
        {
          match: String.raw`\b(test)\b(?=\s+["A-Za-z_])`,
          name: "storage.type.declaration.ov",
        },
      ],
    },
    // words that are keywords only in a certain place (they are ordinary names elsewhere)
    contextual: {
      patterns: [
        {
          match: String.raw`\b(for)\s+(${IDENT})\s+(in)\b`,
          captures: { 1: { name: "keyword.control.ov" }, 2: { name: "variable.other.ov" }, 3: { name: "keyword.control.ov" } },
        },
        { name: "keyword.other.ov", match: String.raw`\b(?:size|irq|opcode|max|timeout|limit)\b(?=\s+['"\d])` },
        { name: "keyword.other.ov", match: String.raw`\b(?:from|compatible|dt)\b(?=\s+")` },
      ],
    },
    keywords: {
      patterns: [
        { name: "keyword.control.ov", match: words(CONTROL) },
        { name: "storage.type.declaration.ov", match: words(DECLARATION) },
        { name: "storage.type.ov", match: words(TYPES) },
        { name: "storage.modifier.ov", match: words(MODIFIERS) },
        { name: "keyword.other.ov", match: words(OV_CONTROL) },
        { name: "constant.language.ov", match: words(CONSTANTS) },
      ],
    },
    calls: {
      patterns: [
        // $display, $clog2, $readmemh
        { name: "support.function.system.ov", match: String.raw`\$${IDENT}` },
        // .clk, .s(x): a port connection (a dot not preceded by a name, a bracket or a parenthesis)
        {
          match: String.raw`(?<![\w)\]])(\.)(${IDENT})`,
          captures: { 1: { name: "punctuation.accessor.ov" }, 2: { name: "variable.parameter.port.ov" } },
        },
        // .wrap(), .fire(), .zext(32)
        {
          match: String.raw`(\.)\s*(${METHODS.trim().split(/\s+/).join("|")})\b(?=\s*[(\s;,)\]\[]|$)`,
          captures: { 1: { name: "punctuation.accessor.ov" }, 2: { name: "support.function.builtin.ov" } },
        },
        // any other method call: x.name(
        {
          match: String.raw`(\.)\s*(${IDENT})(?=\s*\()`,
          captures: { 1: { name: "punctuation.accessor.ov" }, 2: { name: "entity.name.function.ov" } },
        },
        // an instance: Type name( or Type<args> name(
        {
          match: String.raw`\b([A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*)\s+(${IDENT})(?=\s*\()`,
          captures: { 1: { name: "entity.name.type.ov" }, 2: { name: "variable.other.instance.ov" } },
        },
        {
          match: String.raw`(?<=\S)(>)\s+(${IDENT})(?=\s*\()`,
          captures: { 1: { name: "keyword.operator.ov" }, 2: { name: "variable.other.instance.ov" } },
        },
        { name: "support.function.builtin.ov", match: String.raw`\b(?:${BUILTIN_FUNCTIONS.trim().split(/\s+/).join("|")})\b(?=\s*\()` },
        { name: "support.function.test.ov", match: String.raw`\b(?:${TEST_COMMANDS.trim().split(/\s+/).join("|")})\b(?=\s*[(;])` },
        // a call of a name: foo(
        { name: "entity.name.function.ov", match: String.raw`\b${IDENT}(?=\s*\()` },
      ],
    },
    names: {
      patterns: [
        // NAMES_IN_CAPITALS: constants, enum members, parameters
        { name: "variable.other.constant.ov", match: String.raw`\b[A-Z][A-Z0-9_]*\b` },
        // Names, AxiLite, Stream: modules, bundles, structs, enums
        { name: "entity.name.type.ov", match: String.raw`\b[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*\b` },
      ],
    },
    operators: {
      patterns: [
        { name: "keyword.operator.range.ov", match: String.raw`\.\.` },
        { name: "keyword.operator.concat.ov", match: String.raw`\+\+` },
        { name: "keyword.operator.arrow.ov", match: String.raw`=>|->` },
        { name: "keyword.operator.ov", match: String.raw`<<<|>>>|<<|>>|<=|>=|===|!==|==|!=|&&|\|\||[-+*/%&|^~!<>=?:]` },
        { name: "punctuation.separator.ov", match: String.raw`[;,]` },
        { name: "punctuation.definition.ov", match: String.raw`[@#]` },
      ],
    },
  },
};

const out = path.join(__dirname, "..", "syntaxes", "ov.tmLanguage.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(grammar, null, 2) + "\n");
console.log("wrote", path.relative(process.cwd(), out));
