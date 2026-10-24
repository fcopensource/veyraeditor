// Bundles the extension (Node) and the viewer (browser) with esbuild, and checks the output for code a malware scan flags.
import { build } from "esbuild";
import fs from "node:fs";

await build({ entryPoints: ["src/extension.ts"], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: "bundle/extension.js", external: ["vscode"], logLevel: "warning" });
// jszip's browser build is pre-minified, and its setImmediate polyfill can turn a string into code (new Function).
// Use jszip's readable source instead, with a polyfill that only schedules real functions.
const path = (await import("node:path")).default;
const cleanZip = {
  name: "clean-jszip",
  setup(b) {
    b.onResolve({ filter: /^jszip$/ }, () => ({ path: path.resolve("node_modules/jszip/lib/index.js") }));
    b.onResolve({ filter: /^setimmediate$/ }, () => ({ path: "setimmediate", namespace: "veyra-shim" }));
    b.onLoad({ filter: /.*/, namespace: "veyra-shim" }, () => ({
      loader: "js",
      contents: `if (typeof globalThis.setImmediate !== "function") globalThis.setImmediate = function (fn) { var args = Array.prototype.slice.call(arguments, 1); return setTimeout(function () { fn.apply(null, args); }, 0); };`,
    }));
  },
};
await build({ entryPoints: ["src/webview/main.ts"], bundle: true, platform: "browser", format: "iife", target: "es2020", outfile: "media/viewer.js", logLevel: "warning", legalComments: "eof", external: ["stream"], plugins: [cleanZip] });

for (const file of ["bundle/extension.js", "media/viewer.js"]) {
  const out = fs.readFileSync(file, "utf8");
  const flagged = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /require\("child_process"\)/, /\beval\s*\(/, /new Function\(/, /[A-Za-z0-9+/]{400,}={0,2}/].filter(re => re.test(out));
  if (flagged.length) { console.error(`${file} contains: ${flagged.map(String).join(", ")}`); process.exit(1); }
}
