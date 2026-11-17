// Unit tests for the Blast Radius engine (compiled to out/ by `tsc -p .`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jsImports, pyImports, resolveJs, resolvePy, aliasesFromTsconfig, pythonRoots, buildGraph, blastRadius,
  classify, detectRunner, markdownReport, parseGitStatus, pathTo, Graph, stripJsComments,
} from "../out/model.js";

const ctxFor = (files, extra = {}) => ({ files: new Set(files), aliases: [], baseUrls: [], pyRoots: pythonRoots(files), ...extra });

test("reads every kind of JS/TS import", () => {
  const src = `
    import React from "react";
    import { a, b as c } from './lib/a';
    import type { T } from "../types";
    import * as all from './all.js';
    import './side-effect.css';
    export { x } from "./re-export";
    export * from './star';
    const z = require('./legacy');
    const lazy = () => import("./lazy");
    import Default, { named } from '@/components/Button';
  `;
  assert.deepEqual(jsImports(src).sort(), ["../types", "./all.js", "./lazy", "./legacy", "./lib/a", "./re-export", "./side-effect.css", "./star", "@/components/Button", "react"].sort());
});

test("ignores imports inside comments but not inside strings", () => {
  const src = `// import x from "./commented"\n/* require('./blocked') */\nconst s = "// not a comment"; import y from "./real";`;
  assert.deepEqual(jsImports(src), ["./real"]);
  assert.ok(stripJsComments(`a /* x\ny */ b`).includes("\n"), "keeps line breaks");
});

test("multi-line imports are found", () => {
  assert.deepEqual(jsImports(`import {\n  one,\n  two,\n} from "./many";`), ["./many"]);
});

test("reads Python imports, relative and absolute, with submodule candidates", () => {
  const src = `import os, sys\nimport app.models as m\nfrom . import utils\nfrom ..core import db, cache as c\nfrom app.services.users import (\n  create,\n  delete,\n)\n# import commented\n"""\nimport inside_docstring\n"""`;
  const got = pyImports(src);
  for (const want of ["os", "sys", "app.models", ".", ".utils", "..core", "..core.db", "..core.cache", "app.services.users"]) assert.ok(got.includes(want), `missing ${want}: ${got}`);
  assert.ok(!got.includes("commented") && !got.includes("inside_docstring"));
});

test("resolves relative JS imports with extensions, index files and .js → .ts", () => {
  const ctx = ctxFor(["src/lib/a.ts", "src/lib/index.ts", "src/ui/Button.tsx", "src/esm.ts", "src/data.json", "src/legacy.cjs"]);
  assert.equal(resolveJs("./lib/a", "src/app.ts", ctx), "src/lib/a.ts");
  assert.equal(resolveJs("./lib", "src/app.ts", ctx), "src/lib/index.ts");
  assert.equal(resolveJs("../ui/Button", "src/lib/a.ts", ctx), "src/ui/Button.tsx");
  assert.equal(resolveJs("./esm.js", "src/app.ts", ctx), "src/esm.ts");
  assert.equal(resolveJs("./legacy", "src/app.ts", ctx), "src/legacy.cjs");
  assert.equal(resolveJs("react", "src/app.ts", ctx), null);
  assert.equal(resolveJs("../../../outside", "src/app.ts", ctx), null);
});

test("resolves tsconfig paths aliases and baseUrl", () => {
  const tsconfig = `{
    // comments and trailing commas are allowed
    "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], "@ui/*": ["src/components/ui/*"], "config": ["./src/config.ts"], }, },
  }`;
  const { aliases, baseUrl } = aliasesFromTsconfig("tsconfig.json", tsconfig);
  assert.equal(baseUrl, "");
  const ctx = ctxFor(["src/lib/db.ts", "src/components/ui/Card.tsx", "src/config.ts", "utils/x.ts"], { aliases, baseUrls: [baseUrl] });
  assert.equal(resolveJs("@/lib/db", "app/page.tsx", ctx), "src/lib/db.ts");
  assert.equal(resolveJs("@ui/Card", "app/page.tsx", ctx), "src/components/ui/Card.tsx");
  assert.equal(resolveJs("config", "app/page.tsx", ctx), "src/config.ts");
  assert.equal(resolveJs("utils/x", "app/page.tsx", ctx), "utils/x.ts", "baseUrl");
});

test("a tsconfig in a sub-folder (monorepo) resolves from its own folder", () => {
  const { aliases } = aliasesFromTsconfig("apps/web/tsconfig.json", `{"compilerOptions":{"paths":{"~/*":["./src/*"]}}}`);
  const ctx = ctxFor(["apps/web/src/a.ts"], { aliases });
  assert.equal(resolveJs("~/a", "apps/web/src/b.ts", ctx), "apps/web/src/a.ts");
});

test("resolves Python modules, packages and relative imports", () => {
  const files = ["backend/app/__init__.py", "backend/app/models.py", "backend/app/core/__init__.py", "backend/app/core/db.py", "backend/app/api/users.py", "scripts/tool.py"];
  const ctx = ctxFor(files);
  assert.ok(ctx.pyRoots.includes("backend"));
  assert.equal(resolvePy("app.models", "backend/app/api/users.py", ctx), "backend/app/models.py");
  assert.equal(resolvePy("app.core", "backend/app/api/users.py", ctx), "backend/app/core/__init__.py");
  assert.equal(resolvePy("..core.db", "backend/app/api/users.py", ctx), "backend/app/core/db.py");
  assert.equal(resolvePy(".models", "backend/app/__init__.py", ctx), "backend/app/models.py");
  assert.equal(resolvePy("os", "backend/app/models.py", ctx), null);
});

const project = {
  "src/lib/db.ts": `export const db = 1;`,
  "src/lib/users.ts": `import { db } from "./db"; export const getUser = () => db;`,
  "src/lib/orders.ts": `import { db } from "./db";`,
  "src/components/UserCard.tsx": `import { getUser } from "../lib/users";`,
  "app/users/page.tsx": `import UserCard from "../../src/components/UserCard";`,
  "app/api/orders/route.ts": `import "../../../src/lib/orders";`,
  "tests/users.test.ts": `import { getUser } from "../src/lib/users";`,
  "src/unrelated.ts": `import React from "react";`,
};
const graph = () => buildGraph(Object.keys(project), f => project[f], ctxFor(Object.keys(project)));

test("builds forward and reverse edges", () => {
  const g = graph();
  assert.deepEqual([...g.importsOf("src/lib/users.ts")], ["src/lib/db.ts"]);
  assert.deepEqual([...g.importersOf("src/lib/db.ts")].sort(), ["src/lib/orders.ts", "src/lib/users.ts"]);
  assert.equal(g.importsOf("src/unrelated.ts").size, 0);
});

test("blast radius follows importers through every hop and classifies them", () => {
  const r = blastRadius(graph(), ["src/lib/db.ts"]);
  const files = r.hits.map(h => h.file);
  assert.deepEqual(files.slice(0, 1), ["src/lib/db.ts"]);
  for (const f of ["src/lib/users.ts", "src/lib/orders.ts", "src/components/UserCard.tsx", "app/users/page.tsx", "app/api/orders/route.ts", "tests/users.test.ts"]) assert.ok(files.includes(f), f);
  assert.ok(!files.includes("src/unrelated.ts"));
  assert.deepEqual(r.byKind.test.map(h => h.file), ["tests/users.test.ts"]);
  assert.deepEqual(r.byKind.route.map(h => h.file).sort(), ["app/api/orders/route.ts", "app/users/page.tsx"]);
  assert.deepEqual(r.byKind.component.map(h => h.file), ["src/components/UserCard.tsx"]);
  assert.equal(r.hits.find(h => h.file === "app/users/page.tsx").depth, 3);
  assert.deepEqual(pathTo(r, "app/users/page.tsx"), ["src/lib/db.ts", "src/lib/users.ts", "src/components/UserCard.tsx", "app/users/page.tsx"]);
});

test("depth limit stops the search and says so", () => {
  const r = blastRadius(graph(), ["src/lib/db.ts"], 1);
  assert.ok(r.truncated);
  assert.ok(!r.hits.some(h => h.depth > 1));
});

test("import cycles do not loop forever", () => {
  const g = new Graph();
  g.setImports("a.ts", ["b.ts"]); g.setImports("b.ts", ["a.ts"]); g.setImports("c.ts", ["a.ts"]);
  const r = blastRadius(g, ["a.ts"]);
  assert.deepEqual(r.hits.map(h => h.file).sort(), ["a.ts", "b.ts", "c.ts"]);
});

test("updating a file's imports updates the reverse edges", () => {
  const g = graph();
  g.setImports("src/lib/orders.ts", []);
  assert.deepEqual([...g.importersOf("src/lib/db.ts")], ["src/lib/users.ts"]);
  g.remove("src/lib/users.ts");
  assert.equal(g.importersOf("src/lib/db.ts").size, 0);
});

test("a changed test file is a test to run", () => {
  const r = blastRadius(graph(), ["tests/users.test.ts"]);
  assert.deepEqual(r.byKind.test.map(h => h.file), ["tests/users.test.ts"]);
});

test("classifies files the way people expect", () => {
  const cases = {
    "src/a.test.ts": "test", "src/__tests__/a.ts": "test", "tests/test_users.py": "test", "app/users_test.py": "test", "e2e/login.spec.ts": "test",
    "app/page.tsx": "route", "src/pages/index.tsx": "route", "src/routes/+page.svelte": "route", "app/api/x/route.ts": "route", "backend/urls.py": "route",
    "src/components/Nav.tsx": "component", "src/Button.vue": "component", "src/ui/Card.tsx": "component",
    "next.config.ts": "config", "middleware.ts": "config", "proxy.ts": "config", "settings.py": "config",
    "src/lib/db.ts": "source", "src/utils/format.js": "source",
  };
  for (const [file, kind] of Object.entries(cases)) assert.equal(classify(file), kind, file);
});

test("detects the test runner", () => {
  const pkg = deps => JSON.stringify({ devDependencies: deps, scripts: {} });
  assert.equal(detectRunner(pkg({ vitest: "1" }), false, ["a.test.ts"]).command(["a.test.ts", "b c.test.ts"]), `npx vitest run a.test.ts "b c.test.ts"`);
  assert.equal(detectRunner(pkg({ jest: "29" }), false, ["a.test.ts"]).name, "Jest");
  assert.equal(detectRunner(JSON.stringify({ scripts: { test: "node --test" } }), false, ["a.test.mjs"]).name, "node --test");
  assert.equal(detectRunner(null, true, ["tests/test_a.py"]).command(["tests/test_a.py"]), "python -m pytest tests/test_a.py");
  assert.equal(detectRunner(pkg({}), false, ["a.test.ts"]), null);
});

test("markdown report lists everything and the test command", () => {
  const r = blastRadius(graph(), ["src/lib/db.ts"]);
  const md = markdownReport(r, detectRunner(JSON.stringify({ devDependencies: { vitest: "1" } }), false, ["tests/users.test.ts"]));
  assert.match(md, /\*\*1\*\* changed file can affect \*\*6\*\* other files/);
  assert.match(md, /### Tests to run \(1\)/);
  assert.match(md, /npx vitest run tests\/users\.test\.ts/);
});

test("parses git status, including renames and spaces", () => {
  const z = [" M src/a.ts", "A  src/new file.ts", "R  src/new-name.ts", "src/old-name.ts", "?? notes.md", " D gone.ts", ""].join("\0");
  assert.deepEqual(parseGitStatus(z), ["src/a.ts", "src/new file.ts", "src/new-name.ts", "notes.md", "gone.ts"]);
});
