// Downloads VS Code for an extension's integration test, then hands its path to the test through VSCODE_PATH
// (every test/integration/run.mjs uses it). @vscode/test-electron gives up after 15 s without data, which made
// all the extension integration tests fail on GitHub's runners; here the idle timeout is 2 minutes, with retries.
// Run it from the extension's folder: it uses that extension's own @vscode/test-electron.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { downloadAndUnzipVSCode } = require("@vscode/test-electron");
const cachePath = path.join(process.env.RUNNER_TEMP || process.cwd(), "vscode-test");
const attempts = 4;
let lastError;
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    const executable = await downloadAndUnzipVSCode({ version: "stable", cachePath, timeout: 120_000 });
    console.log(`VS Code is ready: ${executable}`);
    if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `VSCODE_PATH=${executable}\n`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`Download attempt ${attempt} of ${attempts} failed: ${error?.message || error}`);
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 15_000));
  }
}
console.error(lastError);
process.exit(1);
