import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");
const TAGS = ["TODO", "FIXME", "BUG", "HACK", "XXX", "NOTE"];
const find = text => m.findTodos(text, TAGS).map(t => [t.line, t.tag, t.text, t.owner ?? ""]);

test("finds tags in comments of many languages", () => {
  assert.deepEqual(find([
    "// TODO: tidy this up",
    "# FIXME handle empty input",
    "/* HACK: works around a browser bug */",
    " * NOTE - keep in sync with the server",
    "<!-- TODO: add the footer -->",
    "-- XXX slow query",
    "; BUG: wrong offset",
    "% TODO: cite the paper",
    "' TODO: VB comment",
    "REM TODO: batch file",
    "x = 1 # TODO trailing comment",
    "const a = 1; // FIXME(ada): off by one",
  ].join("\n")), [
    [0, "TODO", "tidy this up", ""],
    [1, "FIXME", "handle empty input", ""],
    [2, "HACK", "works around a browser bug", ""],
    [3, "NOTE", "keep in sync with the server", ""],
    [4, "TODO", "add the footer", ""],
    [5, "XXX", "slow query", ""],
    [6, "BUG", "wrong offset", ""],
    [7, "TODO", "cite the paper", ""],
    [8, "TODO", "VB comment", ""],
    [9, "TODO", "batch file", ""],
    [10, "TODO", "trailing comment", ""],
    [11, "FIXME", "off by one", "ada"],
  ]);
});

test("owners, and tags with no text", () => {
  assert.deepEqual(find("// TODO(@grace): review\n// TODO\n// TODO:"), [[0, "TODO", "review", "grace"], [1, "TODO", "", ""], [2, "TODO", "", ""]]);
});

test("Markdown task lists", () => {
  assert.deepEqual(find("- [ ] TODO write the intro\n- TODO: add links\n* NOTE images go in /img"), [[0, "TODO", "write the intro", ""], [1, "TODO", "add links", ""], [2, "NOTE", "images go in /img", ""]]);
});

test("ignores words that only look like tags", () => {
  assert.deepEqual(find([
    "const TODO_LIST = [];",
    "todo: lower case",
    "// TODOS are not tags",
    "// TODO-list is a word",
    "printf(\"TODO\");",
    "// NOTEBOOK cells",
  ].join("\n")), []);
});

test("knows where the tag is, for highlighting", () => {
  const [t] = m.findTodos("    x(); // FIXME: here", TAGS);
  assert.equal(t.column, 12);
  assert.equal(t.length, 5);
  assert.deepEqual(m.findTodos("nothing here", TAGS), []);
  assert.deepEqual(m.findTodos("// TODO: x", []), []);
});

test("custom tags", () => {
  assert.deepEqual(m.findTodos("// REVIEW: naming\n// TODO: x", ["REVIEW"]).map(t => t.tag), ["REVIEW"]);
  assert.deepEqual(m.findTodos("// C++ means later\nCCC no comment", ["C++"]).map(t => [t.tag, t.text]), [["C++", "means later"]], "special characters in tags are escaped");
});

test("builds a tree of folders, joining single-folder chains", () => {
  const t = { line: 0, column: 0, length: 4, tag: "TODO", text: "x" };
  const tree = m.buildTree([{ path: "src/app/util/a.ts", todos: [t] }, { path: "src/app/b.ts", todos: [t, t] }, { path: "README.md", todos: [t] }]);
  assert.deepEqual(tree.files.map(f => f.path), ["README.md"]);
  assert.deepEqual(tree.folders.map(f => f.name), ["src/app"]);
  assert.deepEqual(tree.folders[0].folders.map(f => [f.name, f.path]), [["util", "src/app/util"]]);
  assert.equal(m.countIn(tree), 4);
});

test("filters by text, tag, owner and path", () => {
  const files = [
    { path: "src/a.ts", todos: [{ line: 0, column: 0, length: 4, tag: "TODO", text: "add tests" }, { line: 1, column: 0, length: 5, tag: "FIXME", text: "crash", owner: "ada" }] },
    { path: "docs/b.md", todos: [{ line: 3, column: 0, length: 4, tag: "NOTE", text: "screenshots" }] },
  ];
  assert.equal(m.filterTodos(files, "").length, 2);
  assert.deepEqual(m.filterTodos(files, "fixme").map(f => f.todos.length), [1]);
  assert.deepEqual(m.filterTodos(files, "ADA").map(f => f.todos[0].text), ["crash"]);
  assert.deepEqual(m.filterTodos(files, "docs/").map(f => f.path), ["docs/b.md"]);
  assert.deepEqual(m.filterTodos(files, "nothing"), []);
});

test("writes a Markdown checklist grouped by tag", () => {
  const files = [{ path: "src/a.ts", todos: [{ line: 4, column: 0, length: 5, tag: "FIXME", text: "crash", owner: "ada" }, { line: 9, column: 0, length: 4, tag: "TODO", text: "" }] }];
  assert.equal(m.toMarkdown(files, TAGS), "## TODO (1)\n\n- [ ] (no text) — `src/a.ts:10`\n\n## FIXME (1)\n\n- [ ] crash (@ada) — `src/a.ts:5`\n");
  assert.equal(m.toMarkdown([], TAGS), "");
});

test("colour groups", () => {
  assert.deepEqual(["TODO", "FIXME", "BUG", "HACK", "XXX", "NOTE", "LATER"].map(m.colorKey), ["todo", "fixme", "fixme", "hack", "hack", "note", "todo"]);
});

test("globs for excluded files", () => {
  const g = s => m.globToRegExp(s);
  assert.ok(g("**/node_modules/**").test("node_modules/x/index.js"));
  assert.ok(g("**/node_modules/**").test("packages/a/node_modules/x.js"));
  assert.ok(!g("**/node_modules/**").test("src/node_modules_backup.js"));
  assert.ok(g("**/*.min.*").test("public/js/app.min.js"));
  assert.ok(g("**/*.min.*").test("app.min.css"));
  assert.ok(g("src/*.{ts,js}").test("src/app.ts") && g("src/*.{ts,js}").test("src/app.js"));
  assert.ok(!g("src/*.{ts,js}").test("src/lib/app.ts"), "* stays inside one folder");
  assert.ok(g("**/package-lock.json").test("package-lock.json"));
  assert.ok(g("file?.txt").test("file1.txt") && !g("file?.txt").test("file10.txt"));
  assert.ok(m.excludedBy("dist/a.js", [g("**/dist/**"), g("**/build/**")]));
  assert.ok(!m.excludedBy("src/a.js", [g("**/dist/**")]));
});
