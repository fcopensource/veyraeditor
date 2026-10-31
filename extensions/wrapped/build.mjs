// Bundles the extension (Node) and the graph view (browser) with esbuild, and checks the output for code a malware scan flags.
import { build } from "esbuild";
import fs from "node:fs";

await build({ entryPoints: ["src/extension.ts"], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: "bundle/extension.js", external: ["vscode"], logLevel: "warning" });
await build({ entryPoints: ["src/webview/main.ts"], bundle: true, platform: "browser", format: "iife", target: "es2020", outfile: "media/viewer.js", logLevel: "warning" });

for (const file of ["bundle/extension.js", "media/viewer.js"]) {
  const out = fs.readFileSync(file, "utf8");
  const flagged = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /require\("child_process"\)/, /\beval\s*\(/, /new Function\(/, /[A-Za-z0-9+/]{400,}={0,2}/].filter(re => re.test(out));
  const longest = Math.max(...out.split("\n").map(l => l.length));
  if (flagged.length || longest > 2000) { console.error(`${file}: ${flagged.map(String).join(", ")} longest line ${longest}`); process.exit(1); }
}
