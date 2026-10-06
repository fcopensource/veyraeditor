// Set the app version everywhere it lives: npm run release:version 0.5.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version || "")) {
  console.error("Usage: npm run release:version <major.minor.patch>");
  process.exit(1);
}
const edit = (path, update) => writeFileSync(path, update(readFileSync(path, "utf8")));
edit("package.json", text => text.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit("src-tauri/tauri.conf.json", text => text.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit("src-tauri/Cargo.toml", text => text.replace(/^version = "[^"]+"/m, `version = "${version}"`));
console.log(`Version set to ${version}. Next: commit, then git tag v${version} && git push origin main v${version}`);
