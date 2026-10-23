import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

const at = (line, lang, aliases = [], bare = false) => { const col = line.indexOf("|"); return m.contextAt(line.replace("|", ""), col, lang, aliases, bare); };

test("knows when a path is being typed, and where", () => {
  assert.deepEqual(at(`import { a } from "./ut|"`, "typescript"), { kind: "import", typed: "./ut", start: 19, end: 23, quote: '"' });
  assert.equal(at(`import "./styles/|";`, "javascript").kind, "import");
  assert.equal(at(`export * from '../lib/|'`, "typescript").kind, "import");
  assert.equal(at(`const m = await import('./pages/|')`, "javascript").kind, "import");
  assert.equal(at(`const fs = require("./conf|")`, "javascript").kind, "require");
  assert.equal(at(`jest.mock("../api/cli|")`, "typescript").kind, "require");
  assert.equal(at(`import x from "@/comp|"`, "typescript", ["@/"]).typed, "@/comp");
  assert.equal(at(`import React from "rea|"`, "typescript"), undefined, "bare package names are left to npm IntelliSense");
  assert.equal(at(`import fp from "lodash/f|"`, "typescript"), undefined);
  assert.equal(at(`import H from "components/He|"`, "typescript", [], true).typed, "components/He", "baseUrl paths when the project has a baseUrl");
  assert.equal(at(`import x from "@scope/pkg/|"`, "typescript", [], true), undefined, "scoped packages are still packages");
  assert.equal(at(`<img src="./img/lo|">`, "html").kind, "html");
  assert.equal(at(`<link rel="stylesheet" href="css/|">`, "html").kind, "html");
  assert.equal(at(`<a href="https://exa|">`, "html").kind, "html", "html attributes always offer paths…");
  assert.equal(m.looksLikePath("https://exa"), false, "…but URLs are not checked as paths");
  assert.deepEqual(at(`  background: url(../img/b|);`, "css"), { kind: "css", typed: "../img/b", start: 18, end: 26 });
  assert.equal(at(`@import "./base/|";`, "scss").kind, "css");
  assert.equal(at(`See [the guide](./docs/gu|)`, "markdown").kind, "markdown");
  assert.equal(at(`![logo](../media/|)`, "markdown").typed, "../media/");
  assert.equal(at(`const data = readFileSync("./data/us|")`, "python").kind, "string");
  assert.equal(at(`print("hello wor|")`, "python"), undefined, "ordinary strings are not paths");
  assert.equal(at("const s = `./a/${x}/|`", "javascript"), undefined, "a template with expressions is skipped");
  assert.equal(at(`// import x from "./a|"`, "javascript"), undefined, "comments are skipped");
  assert.equal(at(`const a = "done"; import b from "./b|"`, "javascript").typed, "./b", "earlier finished strings don't confuse it");
});

test("reads tsconfig with comments, trailing commas and extends", () => {
  const files = {
    "/repo/tsconfig.base.json": `{
      // shared
      "compilerOptions": { "baseUrl": ".", "paths": { "@lib/*": ["packages/lib/src/*"], }, "moduleResolution": "NodeNext", },
    }`,
    "/repo/apps/web/tsconfig.json": `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "paths": { "@/*": ["./src/*"], "config": ["./src/config.ts"] } } }`,
    "/repo/apps/api/tsconfig.json": `{ "extends": "../../tsconfig.base", "compilerOptions": { "strict": true } }`,
  };
  const read = f => files[f.replace(/\\/g, "/").replace(/^[A-Z]:/, "")];
  const web = m.readProjectConfig("/repo/apps/web/tsconfig.json", read);
  const norm = p => p.replace(/\\/g, "/").replace(/^[A-Z]:/, "");
  assert.deepEqual(web.aliases.map(a => [a.pattern, a.targets.map(norm)]), [["@/*", ["/repo/apps/web/src/*"]], ["config", ["/repo/apps/web/src/config.ts"]]], "paths are relative to the file that sets them");
  assert.equal(norm(web.baseUrl), "/repo");
  assert.equal(web.moduleResolution, "nodenext", "inherited");
  const api = m.readProjectConfig("/repo/apps/api/tsconfig.json", read);
  assert.deepEqual(api.aliases.map(a => [a.pattern, a.targets.map(norm)]), [["@lib/*", ["/repo/packages/lib/src/*"]]], "inherited paths stay relative to the base config's baseUrl");
  assert.deepEqual(m.parseJsonc('{ "a": "// not a comment", /* x */ "b": [1, 2,], }'), { a: "// not a comment", b: [1, 2] });
  assert.deepEqual(m.aliasPrefixes(web.aliases), ["@/", "config"]);
});

test("package.json imports become aliases", () => {
  const aliases = m.packageImports("/repo", { imports: { "#utils/*": "./src/utils/*", "#db": { node: "./src/db/node.js", default: "./src/db/browser.js" }, "#ext": "some-package" } });
  assert.deepEqual(aliases.map(a => [a.pattern, a.targets.map(t => t.replace(/\\/g, "/").replace(/^[A-Z]:/, ""))]), [["#utils/*", ["/repo/src/utils/*"]], ["#db", ["/repo/src/db/node.js"]]]);
});

test("finds the folder to list for relative, absolute and alias paths", () => {
  const aliases = [{ pattern: "@/*", targets: [path.resolve("/repo/src/*")], source: "" }, { pattern: "~assets/*", targets: [path.resolve("/repo/public/assets/*")], source: "" }];
  const roots = { workspace: path.resolve("/repo"), aliases, baseUrl: path.resolve("/repo") };
  const fileDir = path.resolve("/repo/src/pages");
  const one = typed => { const [l] = m.lookup(typed, fileDir, roots); return l && [path.relative(roots.workspace, l.dir).replace(/\\/g, "/"), l.partial]; };
  assert.deepEqual(one("./"), ["src/pages", ""]);
  assert.deepEqual(one("./comp"), ["src/pages", "comp"]);
  assert.deepEqual(one("../lib/da"), ["src/lib", "da"]);
  assert.deepEqual(one("."), ["src/pages", ""]);
  assert.deepEqual(one("/img/"), ["img", ""]);
  assert.deepEqual(one("@/components/Bu"), ["src/components", "Bu"]);
  assert.deepEqual(one("@/"), ["src", ""]);
  assert.deepEqual(one("~assets/icons/"), ["public/assets/icons", ""]);
  assert.deepEqual(one("components/Header"), ["components", "Header"], "baseUrl imports");
  assert.deepEqual(m.resolveTargets("@/components/Button", fileDir, roots).map(t => path.relative(roots.workspace, t).replace(/\\/g, "/")), ["src/components/Button"]);
  assert.deepEqual(m.resolveTargets("./x.png?url", fileDir, roots).map(t => path.relative(roots.workspace, t).replace(/\\/g, "/")), ["src/pages/x.png"]);
});

test("writes imports the way the project needs them", () => {
  const bundler = m.importStyle({ moduleResolution: "bundler", aliases: [], dir: "/" }, undefined, "typescript", "auto");
  assert.equal(m.importName("Button.tsx", bundler), "Button");
  assert.equal(m.importName("data.json", bundler), "data.json");
  assert.equal(m.importName("types.d.ts", bundler), "types");
  const nodeEsm = m.importStyle({ moduleResolution: "nodenext", aliases: [], dir: "/" }, "module", "typescript", "auto");
  assert.equal(m.importName("server.ts", nodeEsm), "server.js", "Node ESM imports the compiled .js");
  assert.equal(m.importName("worker.mts", nodeEsm), "worker.mjs");
  const plainEsm = m.importStyle(undefined, "module", "javascript", "auto");
  assert.equal(m.importName("util.js", plainEsm), "util.js", "Node needs the extension in ESM JavaScript");
  assert.equal(m.importName("util.js", m.importStyle(undefined, "commonjs", "javascript", "auto")), "util");
  assert.equal(m.importName("App.tsx", m.importStyle({ allowImportingTsExtensions: true, aliases: [], dir: "/" }, undefined, "typescript", "auto")), "App.tsx");
  assert.equal(m.importName("App.tsx", m.importStyle(undefined, undefined, "typescript", "always")), "App.tsx");
  assert.equal(m.importName("App.tsx", m.importStyle({ moduleResolution: "nodenext", aliases: [], dir: "/" }, undefined, "typescript", "never")), "App");
});

test("candidates a resolver tries, and suggestions for a missing name", () => {
  const c = m.candidates(path.resolve("/r/utils/date"), "import").map(p => path.basename(path.dirname(p)) + "/" + path.basename(p));
  assert.ok(c.includes("utils/date.ts") && c.includes("utils/date.tsx") && c.includes("date/index.ts") && c.includes("utils/date.vue"));
  const js = m.candidates(path.resolve("/r/server.js"), "import").map(p => path.basename(p));
  assert.ok(js.includes("server.ts"), "an import of ./server.js finds server.ts");
  assert.deepEqual(m.candidates(path.resolve("/r/logo.png"), "html").map(p => path.basename(p)), ["logo.png"]);
  assert.deepEqual(m.suggest("helpr.ts", ["helper.ts", "help.md", "index.ts", "zebra.ts"]), ["helper.ts", "help.md"]);
  assert.deepEqual(m.suggest("Header", ["header.tsx", "footer.tsx"]), ["header.tsx"], "case and extension don't count");
  assert.deepEqual(m.suggest("completely-different", ["a.ts", "b.ts"]), []);
  assert.equal(m.distance("kitten", "sitting"), 3);
  assert.equal(m.formatSize(15300), "15.3 KB");
  assert.ok(m.IMAGE.test("logo.SVG"));
});
