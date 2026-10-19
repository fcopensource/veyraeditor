// Unit tests for everything that does not need VS Code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { builtinModules } from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const m = require("../out/model.js");
const builtins = new Set(builtinModules);

test("finds every kind of import, with offsets inside the quotes", () => {
  const text = [
    `import React, { useState } from "react";`,
    `import type { Props } from './props';`,
    `import "./styles.css";`,
    `import {`,
    `  Button,`,
    `  type Theme,`,
    `} from '@mui/material/Button';`,
    `export * from "zod";`,
    `export { a as b } from 'lodash/fp';`,
    `const fs = require('node:fs');`,
    `const lazy = await import("chart.js");`,
    `vi.mock("axios");`,
    `// import fake from "commented-out";`,
    `/* require("also-commented") */`,
    `const s = "import x from 'in-a-string'";`,
  ].join("\n");
  const specs = m.findImports(text).map(f => f.spec);
  assert.deepEqual(specs, ["react", "./props", "./styles.css", "@mui/material/Button", "zod", "lodash/fp", "node:fs", "chart.js", "axios"]);
  for (const found of m.findImports(text)) assert.equal(text.slice(found.start, found.end), found.spec);
});

test("finds imports only inside the script parts of Vue, Svelte and Astro files", () => {
  const vue = `<template><div>import x from "nope"</div></template>\n<script setup lang="ts">\nimport { ref } from 'vue'\nimport dayjs from "dayjs"\n</script>`;
  const found = m.findImportsIn(vue, "vue");
  assert.deepEqual(found.map(f => f.spec), ["vue", "dayjs"]);
  for (const f of found) assert.equal(vue.slice(f.start, f.end), f.spec);
  const astro = `---\nimport Layout from '../layouts/Layout.astro';\nimport { format } from "date-fns";\n---\n<p>import y from "nope"</p>`;
  assert.deepEqual(m.findImportsIn(astro, "astro").map(f => f.spec), ["../layouts/Layout.astro", "date-fns"]);
});

test("knows when the cursor is inside an import string", () => {
  const line = `import { motion } from "fram";`;
  const at = line.indexOf("fram") + 4;
  assert.deepEqual(m.importContextAt(line, at), { prefix: "fram", start: line.indexOf("fram"), end: line.indexOf('";') });
  assert.equal(m.importContextAt(`const x = require('@tan`, 23).prefix, "@tan");
  assert.equal(m.importContextAt(`await import('`, 14).prefix, "");
  assert.equal(m.importContextAt(`import '`, 8).prefix, "");
  assert.equal(m.importContextAt(`const s = "hello wor`, 20), null);
  assert.equal(m.importContextAt(`import x from "react"; foo(`, 27), null);
});

test("works out package names and what a specifier refers to", () => {
  assert.equal(m.packageNameOf("@scope/pkg/deep/file.js"), "@scope/pkg");
  assert.equal(m.packageNameOf("lodash/fp"), "lodash");
  assert.equal(m.packageNameOf("react"), "react");
  for (const s of ["./x", "../x", "/abs", "C:\\x", "https://cdn/x.js", "node:fs", "@scope", ""]) assert.equal(m.packageNameOf(s), null, s);
  assert.equal(m.subpathOf("next/navigation"), "navigation");
  const ignore = [...m.DEFAULT_IGNORE, "@app/"];
  assert.equal(m.classify("fs", builtins, ignore), "builtin");
  assert.equal(m.classify("fs/promises", builtins, ignore), "builtin");
  assert.equal(m.classify("node:test", builtins, ignore), "builtin");
  assert.equal(m.classify("./a", builtins, ignore), "relative");
  assert.equal(m.classify("@/components/Button", builtins, ignore), "ignored");
  assert.equal(m.classify("~/utils", builtins, ignore), "ignored");
  assert.equal(m.classify("#internal", builtins, ignore), "ignored");
  assert.equal(m.classify("$app/stores", builtins, ignore), "ignored");
  assert.equal(m.classify("@app/db", builtins, ignore), "ignored");
  assert.equal(m.classify("virtual:pwa-register", builtins, ignore), "ignored");
  assert.equal(m.classify("@tanstack/react-query", builtins, ignore), "package");
});

test("reads package.json and tsconfig, comments and trailing commas included", () => {
  const manifest = m.readManifest(JSON.stringify({
    name: "shop", packageManager: "pnpm@9.1.0", scripts: { dev: "vite", lint: "eslint . && stylelint" },
    dependencies: { react: "^19.0.0", zod: "3.23.0" }, devDependencies: { vite: "^6.0.0", react: "dup" }, peerDependencies: { "react-dom": "*" },
  }), "/w/package.json");
  assert.equal(manifest.name, "shop");
  assert.deepEqual(manifest.deps.map(d => `${d.name}:${d.kind}`), ["react:dependencies", "zod:dependencies", "vite:devDependencies", "react-dom:peerDependencies"]);
  assert.equal(m.readManifest("{ not json", "/x"), null);
  const tsconfig = m.parseJsonc(`{
    // paths for the app
    "compilerOptions": { "baseUrl": ".", "paths": { "@app/*": ["src/*"], "#db": ["db.ts"], }, /* block */ },
  }`);
  assert.deepEqual(m.aliasPrefixes(tsconfig), ["@app/", "#db"]);
  assert.equal(m.parseJsonc(`{"url": "http://x//y", "a": "/* not a comment */"}`).url, "http://x//y");
});

test("merges a package's dependencies with its monorepo root, nearest first", () => {
  const app = m.readManifest(`{"dependencies":{"react":"^19"}}`, "/repo/apps/web/package.json");
  const root = m.readManifest(`{"devDependencies":{"react":"^18","typescript":"^5"}}`, "/repo/package.json");
  assert.deepEqual(m.mergeDependencies([app, root]).map(d => `${d.name}@${d.version}`), ["react@^19", "typescript@^5"]);
});

test("reports imports that are missing from package.json or not installed", () => {
  const text = `import a from "react"; import b from "lodash"; import c from "ghost"; import d from "zod/v4"; import e from "fs"; import f from "@/x"; import g from "./y"; import h from "shop/utils";`;
  const problems = m.checkImports(m.findImports(text), {
    declared: new Set(["react", "zod"]), self: "shop", builtins, ignore: m.DEFAULT_IGNORE,
    installed: pkg => ["react", "lodash"].includes(pkg),
  });
  assert.deepEqual(problems.map(p => `${p.pkg}:${p.code}`), ["lodash:transitive", "ghost:missing", "zod:not-installed"]);
  const ghost = problems.find(p => p.pkg === "ghost");
  assert.equal(text.slice(ghost.start, ghost.end), "ghost");
});

test("finds unused dependencies, skipping tools, types and anything in scripts", () => {
  const manifest = m.readManifest(JSON.stringify({
    scripts: { start: "node server.js", seed: "prisma db seed", fmt: "biome format" },
    dependencies: { express: "^4", cors: "^2", prisma: "^5", "left-pad": "^1" },
    devDependencies: { typescript: "^5", "@types/express": "^4", "eslint-plugin-react": "^7", vitest: "^2", "some-dev-lib": "^1" },
    peerDependencies: { react: "*" },
  }), "/p/package.json");
  const unused = m.unusedDependencies(manifest, new Set(["express"]));
  assert.deepEqual(unused.map(u => u.dep.name), ["cors", "left-pad", "some-dev-lib"]);
  assert.match(unused.find(u => u.dep.name === "some-dev-lib").reason, /tool/);
});

test("picks the package manager and builds its commands", () => {
  assert.equal(m.detectPackageManager(["package.json", "pnpm-lock.yaml"]), "pnpm");
  assert.equal(m.detectPackageManager(["yarn.lock"]), "yarn");
  assert.equal(m.detectPackageManager(["bun.lock"]), "bun");
  assert.equal(m.detectPackageManager(["package-lock.json"]), "npm");
  assert.equal(m.detectPackageManager(["package-lock.json"], "yarn@4.1.0"), "yarn");
  assert.equal(m.installCommand("npm", ["zod"]), "npm install zod");
  assert.equal(m.installCommand("npm", ["vitest"], true), "npm install --save-dev vitest");
  assert.equal(m.installCommand("pnpm", ["@tanstack/react-query"], true), "pnpm add -D @tanstack/react-query");
  assert.equal(m.installCommand("bun", ["hono"], true), "bun add --dev hono");
  assert.equal(m.installCommand("yarn", []), "yarn install");
  assert.equal(m.installCommand("npm", ["evil; rm -rf /"]), 'npm install "evil; rm -rf /"');
  assert.equal(m.uninstallCommand("npm", ["a", "b"]), "npm uninstall a b");
  assert.equal(m.uninstallCommand("pnpm", ["a"]), "pnpm remove a");
});

test("reads exported subpaths and names imports", () => {
  assert.deepEqual(m.exportedSubpaths({ exports: { ".": "./index.js", "./client": "./c.js", "./server": {}, "./utils/*": "./u/*.js", "./package.json": "./package.json" } }), ["client", "package.json", "server"]);
  assert.deepEqual(m.exportedSubpaths({ exports: "./index.js" }), []);
  assert.equal(m.importName("@tanstack/react-query"), "reactQuery");
  assert.equal(m.importName("lodash.debounce"), "lodashDebounce");
  assert.equal(m.importName("node:fs/promises"), "fsPromises");
  assert.equal(m.importName("next/navigation"), "navigation");
  assert.equal(m.importName("7zip"), "_7zip");
  assert.equal(m.importName("class"), "classModule");
});

test("matches the file's style for new imports, and finds where they go", () => {
  assert.equal(m.usesRequire(`const x = require("x");\nmodule.exports = x;`, "a.js"), true);
  assert.equal(m.usesRequire(`import x from "x";`, "a.js"), false);
  assert.equal(m.usesRequire(``, "a.cjs"), true);
  assert.equal(m.usesRequire(`const x = require("x")`, "a.ts"), false);
  assert.equal(m.usesNodeProtocol(`import fs from "node:fs"`), true);
  assert.equal(m.importInsertLine(`"use client";\nimport a from "a";\nimport {\n  b,\n} from "b";\n\nconst x = 1;`), 5);
  assert.equal(m.importInsertLine(`// header\nconst x = 1;`), 0);
  assert.equal(m.importInsertLine(`const a = require("a");\nconst b = require("b");\n\nmain();`), 2);
});
