import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

test("reads projects.json: a list, or the Project Manager format, skipping what makes no sense", () => {
  const { projects, error } = m.parseProjects(JSON.stringify([
    { name: "App", rootPath: "C:/code/app", tags: ["work", "work", " web ", 3] },
    { rootPath: "/home/sam/blog/" },
    { name: "Off", rootPath: "/x", enabled: false },
    { name: "No path" },
    "junk",
    { name: "Old", rootPath: "/old", lastOpened: 1700000000000, paths: [], group: "" },
  ]));
  assert.equal(error, undefined);
  assert.deepEqual(projects, [
    { name: "App", rootPath: "C:/code/app", tags: ["work", "web"] },
    { name: "blog", rootPath: "/home/sam/blog/", tags: [] },
    { name: "Old", rootPath: "/old", tags: [], lastOpened: 1700000000000 },
  ]);
  assert.deepEqual(m.parseProjects("").projects, []);
  assert.deepEqual(m.parseProjects('{"projects":[{"rootPath":"/a"}]}').projects, [{ name: "a", rootPath: "/a", tags: [] }]);
  assert.match(m.parseProjects("{oops").error, /isn't valid JSON/);
  assert.match(m.parseProjects('{"a":1}').error, /should be a list/);
});

test("projects.json round-trips", () => {
  const list = [{ name: "A", rootPath: "/a", tags: ["x"] }, { name: "B", rootPath: "/b", tags: [], lastOpened: 5 }];
  assert.deepEqual(m.parseProjects(m.serializeProjects(list)).projects, list);
});

test("paths compare without caring about slashes, a trailing slash, or case on Windows", () => {
  assert.ok(m.samePath("C:\\Code\\App\\", "c:/code/app", true));
  assert.ok(!m.samePath("/home/Sam/app", "/home/sam/app", false));
  assert.ok(m.samePath("/home/sam/app/", "/home/sam/app", false));
});

test("save, rename, tag, open and remove", () => {
  let p = m.upsert([], "App", "/code/app", false);
  p = m.upsert(p, "Blog", "/code/blog", false);
  p = m.upsert(p, "My App", "/code/app/", false); // the same folder: renamed, not added twice
  assert.deepEqual(p.map(x => x.name), ["My App", "Blog"]);
  p = m.setTags(p, "/code/blog", ["writing", " writing", "", "web"], false);
  assert.deepEqual(p[1].tags, ["writing", "web"]);
  p = m.touch(p, "/code/blog", 99, false);
  assert.equal(p[1].lastOpened, 99);
  assert.deepEqual(m.allTags(p), ["web", "writing"]);
  assert.deepEqual(m.withTag(p, "web").map(x => x.name), ["Blog"]);
  assert.deepEqual(m.withTag(p, null).map(x => x.name), ["My App"]);
  assert.deepEqual(m.remove(p, "/code/app", false).map(x => x.name), ["Blog"]);
});

test("sorts by name (naturally), by most recently opened, or as saved", () => {
  const list = [{ name: "app10" }, { name: "App2", lastOpened: 1 }, { name: "beta", lastOpened: 3 }, { name: "alpha" }];
  assert.deepEqual(m.sortProjects(list, "name").map(x => x.name), ["alpha", "App2", "app10", "beta"]);
  assert.deepEqual(m.sortProjects(list, "recent").map(x => x.name), ["beta", "App2", "alpha", "app10"]);
  assert.deepEqual(m.sortProjects(list, "saved").map(x => x.name), ["app10", "App2", "beta", "alpha"]);
});

test("knows the kind of project from its files", () => {
  assert.equal(m.kindOf(["package.json", "src"]), "node");
  assert.equal(m.kindOf(["pyproject.toml", "package.json"]), "python");
  assert.equal(m.kindOf(["Cargo.toml"]), "rust");
  assert.equal(m.kindOf(["go.mod"]), "go");
  assert.equal(m.kindOf(["App.csproj"]), "dotnet");
  assert.equal(m.kindOf(["build.gradle.kts"]), "java");
  assert.equal(m.kindOf(["pubspec.yaml"]), "dart");
  assert.equal(m.kindOf(["Makefile", "main.c"]), "cpp");
  assert.equal(m.kindOf(["Makefile", "notes.txt"]), "folder");
  assert.equal(m.kindOf(["README.md"]), "folder");
});

test("short paths and ~", () => {
  assert.equal(m.shortPath("C:\\Users\\sam\\code\\app", "C:\\Users\\sam"), "~/code/app");
  assert.equal(m.shortPath("/srv/app", "/home/sam"), "/srv/app");
  assert.equal(m.shortPath("/home/samuel/x", "/home/sam"), "/home/samuel/x");
  assert.equal(m.expandHome("~/code", "/home/sam"), path.join("/home/sam", "code"));
  assert.equal(m.expandHome("/abs", "/home/sam"), "/abs");
});

test("finds Git repositories, without going into them, dependencies or hidden folders", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-pm-scan-"));
  const mk = (rel, files = []) => { fs.mkdirSync(path.join(root, rel), { recursive: true }); for (const f of files) fs.writeFileSync(path.join(root, rel, f), ""); };
  mk("web/shop/.git"); mk("web/shop", ["package.json"]);
  mk("web/shop/packages/inner/.git"); // inside a repo: not listed
  mk("rust-tool/.git"); mk("rust-tool", ["Cargo.toml"]);
  mk("worktree"); fs.writeFileSync(path.join(root, "worktree", ".git"), "gitdir: ../x"); // a .git file counts
  mk("node_modules/dep/.git"); mk(".cache/thing/.git"); mk("deep/a/b/c/d/e/.git");
  mk("notes", ["todo.txt"]);
  const found = await m.scanForRepos([root], { depth: 4 });
  assert.deepEqual(found.map(f => [f.name, f.kind]), [["rust-tool", "rust"], ["shop", "node"], ["worktree", "folder"]]);
  const deeper = await m.scanForRepos([root], { depth: 6, ignore: ["web"] });
  assert.deepEqual(deeper.map(f => f.name), ["e", "rust-tool", "worktree"]);
  assert.equal((await m.scanForRepos([root], { depth: 6, limit: 1 })).length, 1);
  assert.deepEqual(await m.scanForRepos([path.join(root, "missing")], { depth: 3 }), []);
  fs.rmSync(root, { recursive: true, force: true });
});
