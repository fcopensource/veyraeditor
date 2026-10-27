// veyra-guard-ignore-file: built from src/, which defines the detection rules.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/action.ts
var action_exports = {};
__export(action_exports, {
  main: () => main,
  matcher: () => matcher
});
module.exports = __toCommonJS(action_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_child_process = require("node:child_process");

// src/scanner.ts
var SEVERITIES = ["critical", "high", "medium", "low"];
var severityRank = (s) => SEVERITIES.length - SEVERITIES.indexOf(s);
var FIXES = {
  "trojan-source": "Delete the hidden characters (Code Guard's quick fix does it), then re-read the line as it really is. If you didn't add them, treat the change as hostile and find out where it came from.",
  "invisible-character": "Remove the invisible characters, then check the names on the line: a variable with a hidden character is a different variable from the one it looks like.",
  "homoglyph": "Retype the name using plain Latin letters, then search the code for both spellings to see whether a look-alike function was defined somewhere.",
  "hidden-far-right": "Scroll right to read the hidden code, then move it to its own line or remove it. Nothing legitimate needs hundreds of spaces before it.",
  "eval-decoded": "Decode the string and read what it really does. Replace eval/Function with ordinary code; if the code came from someone else, treat it as malicious until proven otherwise.",
  "packed-code": "Unpack it (for example with a JavaScript beautifier) to see what it does, and replace it with the readable source. Don't ship packed code you can't read.",
  "python-exec": "Decode what is being executed and replace exec()/__import__ with normal imports and calls. Hidden execution has no place in reviewed code.",
  "download-execute": "Download to a file, check its checksum or signature, review it, then run it, or pin a specific version through your package manager instead.",
  "reverse-shell": "Remove it and assume the machine that ran it may be compromised: rotate credentials and check for other changes by the same author.",
  "crypto-miner": "Remove the miner and check where it came from (a dependency, a pull request, a build script). Rotate any credentials on machines that ran it.",
  "credential-theft": "Code should never read keys, wallets or browser data it wasn't built for. Remove it; if it ran, rotate the affected keys and passwords.",
  "exfil-endpoint": "Find out what is being sent and why. Remove the endpoint unless it is your own, documented integration, and keep webhook URLs out of source code.",
  "env-exfil": "Read only the variables you need, by name (process.env.API_URL), and never send the whole environment anywhere.",
  "persistence": "Remove the start-up entry unless installing a service is the program's documented purpose, and check machines that ran it for the entry it created.",
  "disable-defences": "Remove it. Software should never turn off antivirus, the firewall or logging; if it ran, re-enable the protections and investigate.",
  "hidden-powershell": "Decode the command and replace it with a readable script. Visible, signed scripts are the norm; hidden encoded ones are a red flag.",
  "insecure-tls": "Keep certificate checks on. For a private certificate authority, trust that authority explicitly (NODE_EXTRA_CA_CERTS, verify='ca.pem') instead of turning checks off.",
  "char-code-obfuscation": "Convert the character codes back to text to see what they spell, and write it as a normal string.",
  "hex-escapes": "Decode the escapes to see what they hide. If it's data, move it to a file; if it's code, rewrite it readably.",
  "base64-blob": "Decode it and check what it is. Move legitimate assets (images, fonts) into files; remove anything executable.",
  "raw-ip-url": "Use your service's domain name, ideally over https. If the address is unknown to you, find out who added it and why.",
  "secret": "Revoke the key with its provider now (deleting it from the code isn't enough: it stays in history), then load the new one from an environment variable or secret store.",
  "install-script": "Remove the install script, or replace it with a reviewed local script. If the package isn't yours, don't install it.",
  "install-hook": "Read the script it runs. If it's needed (building native code), keep it; otherwise remove it, and consider installing with --ignore-scripts.",
  "workflow-injection": 'Pass the value through an environment variable (env: TITLE: ${{ github.event.issue.title }}) and use "$TITLE" in the script, so it is treated as text, not code.',
  "workflow-pr-target": "Use the pull_request event for building pull requests, or don't check out the pull request's code in pull_request_target jobs.",
  "typosquat-package": "Check the name letter by letter. If you meant the popular package, fix the name, remove the look-alike and its lockfile entry, and rotate any secrets on machines that installed it.",
  "remote-dependency": "Install from the registry with a pinned version, or pin the git dependency to an exact commit you have reviewed.",
  "dependency-confusion": "Use a single index that proxies the public one (--index-url), reserve your private names publicly, and always use https.",
  "unpinned-dependency": "Pin a version range you have reviewed (for example ^4.18.2) and commit the lockfile.",
  "guard-opt-out": "Make sure each opt-out has a reason in the comment and was agreed in review."
};
function grade(findings) {
  const c = summarize(findings);
  const score = Math.max(0, 100 - (c.critical * 30 + c.high * 12 + c.medium * 4 + c.low));
  const letter = c.critical ? score >= 40 ? "D" : "F" : c.high ? score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F" : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const verdict = c.critical ? "Action needed: critical findings" : c.high ? "Review needed: high-risk findings" : c.medium ? "Mostly clean: a few things to check" : c.low ? "Clean: minor notes only" : "Clean: no signs of malicious code";
  return { score, letter, verdict, counts: c };
}
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
  },
  // ---- Supply chain: the packages a project pulls in ----
  {
    id: "typosquat-package",
    title: "Package name one letter away from a popular one",
    severity: "high",
    files: /(^|\/)(package\.json|requirements[\w.-]*\.txt|Pipfile|pyproject\.toml)$/i,
    check: (lines, path) => {
      const python = !/package\.json$/i.test(path);
      const popular = python ? POPULAR_PYPI : POPULAR_NPM;
      const out = [];
      const npmDeps = python ? void 0 : dependencyLines(lines);
      lines.forEach((line, i) => {
        if (npmDeps && !npmDeps.has(i)) return;
        const name = dependencyName(line, path);
        if (!name) return;
        const lower = name.toLowerCase().replace(/_/g, "-");
        if (popular.has(lower) || REAL_NEIGHBOURS.has(lower)) return;
        const near = [...popular].find((p) => p.length >= 4 && Math.abs(p.length - lower.length) <= 1 && editDistance(p, lower) === 1);
        if (near) out.push({ line: i + 1, column: line.indexOf(name) + 1, length: name.length, message: `"${name}" is one letter away from the popular package "${near}".` });
      });
      return out;
    },
    why: "Attackers publish packages with names one typo away from popular ones (expres, reqeusts) so a slip of the keyboard installs their malware. It is one of the most common supply-chain attacks."
  },
  {
    id: "remote-dependency",
    title: "Dependency installed from a URL or git, not the registry",
    severity: "medium",
    files: /(^|\/)(package\.json|requirements[\w.-]*\.txt)$/i,
    check: (lines, path) => {
      const out = [];
      const npm = /package\.json$/i.test(path), deps = npm ? dependencyLines(lines) : void 0;
      lines.forEach((line, i) => {
        if (deps && !deps.has(i)) return;
        const m = npm ? /"([@\w./-]+)"\s*:\s*"((?:https?:|git\+|git:|github:|gitlab:|bitbucket:)[^"]*)"/.exec(line) : /^\s*((?:git\+|https?:)\S+)/.exec(line);
        if (m) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `${npm ? `"${m[1]}" comes` : "This package comes"} from ${truncate(npm ? m[2] : m[1], 70)} instead of the package registry.` });
      });
      return out;
    },
    why: "Code fetched from a URL or a git repository skips the registry's checks and can change at any time without a new version, so what you reviewed may not be what gets installed."
  },
  {
    id: "dependency-confusion",
    title: "Extra package source that can be hijacked",
    severity: "high",
    files: /(^|\/)(requirements[\w.-]*\.txt|pip\.conf|\.npmrc|\.yarnrc(\.yml)?)$/i,
    pattern: /--extra-index-url\s+\S+|--index-url\s+http:\/\/\S+|--trusted-host\s+\S+|^\s*registry\s*=\s*http:\/\/\S+|npmRegistryServer:\s*["']?http:\/\/\S+|^\s*always-auth\s*=\s*false/im,
    why: "With an extra package index, pip installs whichever source has the higher version, so an attacker can publish a public package with your private package's name and get it installed (dependency confusion). Plain http sources can be tampered with in transit.",
    message: (m) => `Package source: ${truncate(m, 70)}`
  },
  {
    id: "unpinned-dependency",
    title: "Dependency with no version limit",
    severity: "low",
    files: /(^|\/)package\.json$/i,
    check: (lines) => {
      const deps = dependencyLines(lines);
      const out = [];
      lines.forEach((line, i) => {
        const m = /"([@\w./-]+)"\s*:\s*"(\*|latest|x|)"/.exec(line);
        if (m && deps.has(i)) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `"${m[1]}" has no version limit ("${m[2]}").` });
      });
      return out;
    },
    why: '"*" or "latest" installs whatever version is newest on the day, including a malicious one published by a hijacked account. Pin a version range you have reviewed.'
  }
];
var POPULAR_NPM = /* @__PURE__ */ new Set(["react", "react-dom", "express", "lodash", "axios", "chalk", "commander", "request", "moment", "debug", "typescript", "webpack", "eslint", "prettier", "jest", "mocha", "vue", "angular", "jquery", "underscore", "async", "bluebird", "uuid", "dotenv", "cors", "body-parser", "mongoose", "sequelize", "socket.io", "nodemon", "yargs", "inquirer", "colors", "redis", "mysql", "mysql2", "jsonwebtoken", "bcrypt", "bcryptjs", "multer", "passport", "cheerio", "puppeteer", "electron", "rxjs", "tslib", "classnames", "prop-types", "styled-components", "tailwindcss", "vite", "rollup", "esbuild", "glob", "minimist", "semver", "fs-extra", "node-fetch", "cross-env", "rimraf", "mkdirp", "crypto-js", "discord.js", "ethers", "web3", "next", "nuxt", "svelte", "zod", "dayjs", "date-fns", "graphql", "apollo-server", "playwright", "cypress", "sharp", "nodemailer", "winston", "morgan", "helmet", "chokidar", "ioredis", "knex", "prisma", "openai", "stripe", "firebase", "aws-sdk", "pg", "ws"]);
var POPULAR_PYPI = /* @__PURE__ */ new Set(["requests", "numpy", "pandas", "django", "flask", "urllib3", "setuptools", "boto3", "botocore", "scipy", "matplotlib", "pillow", "cryptography", "pyyaml", "beautifulsoup4", "selenium", "tensorflow", "torch", "scikit-learn", "colorama", "python-dateutil", "jinja2", "sqlalchemy", "pytest", "fastapi", "uvicorn", "pydantic", "httpx", "aiohttp", "openai", "anthropic", "transformers", "psycopg2", "pymongo", "redis", "celery", "gunicorn", "paramiko", "pycryptodome", "openpyxl", "lxml", "click", "tqdm", "rich", "certifi", "idna", "six", "wheel", "pip", "docker", "kubernetes", "streamlit"]);
var REAL_NEIGHBOURS = /* @__PURE__ */ new Set(["preact", "color", "uid", "boto", "nest", "vuex", "rxjs", "jsdom", "pino", "ky", "got", "yaml", "axe", "chai", "sinon", "redux", "ioredis", "execa", "globby", "lxml", "httpie", "attrs", "black", "mypy", "pytz", "tomli", "toml", "jsonschema", "esbuild-wasm", "vitest"]);
function dependencyLines(lines) {
  const inside = /* @__PURE__ */ new Set();
  let depth = 0, open = false;
  lines.forEach((line, i) => {
    if (!open && /"(?:dependencies|devDependencies|peerDependencies|optionalDependencies|overrides|resolutions)"\s*:\s*\{/.test(line)) {
      open = true;
      depth = 0;
    }
    if (!open) return;
    for (const c of line) {
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    inside.add(i);
    if (depth <= 0) open = false;
  });
  return inside;
}
function dependencyName(line, path) {
  if (/package\.json$/i.test(path)) {
    const m2 = /^\s*"(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)"\s*:\s*"[~^<>=*\d xX.|-]+[\w.-]*"\s*,?\s*$/i.exec(line);
    return m2 && !["version", "node", "npm", "vscode", "name", "license", "main", "types"].includes(m2[1]) ? m2[1] : void 0;
  }
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[=<>!~]=?|;|$|#)/.exec(line);
  return m && !line.trim().startsWith("-") ? m[1] : void 0;
}
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
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
function scan(text, path, options2 = {}) {
  const file = path.replace(/\\/g, "/");
  if (text.length > 5e6 || isBinary(text)) return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.slice(0, 5).some((l) => /veyra-guard-ignore-file/.test(l))) return options2.onlyLines ? scanOptOutsOnly(lines, options2.onlyLines) : [];
  const disabled = new Set(options2.disabled ?? []);
  const min = severityRank(options2.minSeverity ?? "low");
  const findings = [];
  const add = (rule, line, column, length, message, matched) => {
    if (options2.onlyLines && !options2.onlyLines.has(line)) return;
    const own = ignoredRules(lines[line - 1] ?? ""), prev = ignoredRules(lines[line - 2] ?? "");
    for (const ig of [own, prev]) if (ig === "all" || ig?.has(rule.id)) return;
    findings.push({ rule: rule.id, title: rule.title, severity: rule.severity, line, column, endColumn: column + Math.max(1, length), message, why: rule.why, fix: FIXES[rule.id] ?? "", snippet: visible(matched).slice(0, 200) });
  };
  for (const rule of RULES) {
    if (disabled.has(rule.id) || severityRank(rule.severity) < min) continue;
    if (rule.files && !rule.files.test(file)) continue;
    if (rule.skipFiles && rule.skipFiles.test(file)) continue;
    if (DOCS.test(file) && !/(^|\/)requirements[\w.-]*\.txt$/i.test(file) && rule.id !== "trojan-source" && rule.id !== "secret") continue;
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
  if (options2.onlyLines && !disabled.has("guard-opt-out")) {
    lines.forEach((line, i) => {
      const at = line.search(/veyra-guard-ignore/);
      if (at >= 0 && options2.onlyLines.has(i + 1)) findings.push({ rule: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium", line: i + 1, column: at + 1, endColumn: at + 1 + (/veyra-guard-ignore[\w:,\s-]*/.exec(line.slice(at))?.[0].trimEnd().length ?? 18), message: `This change tells Code Guard to skip ${/veyra-guard-ignore-file/.test(line) ? "this whole file" : "a line"}. Make sure that's intended.`, why: GUARD_OPT_OUT_WHY, fix: FIXES["guard-opt-out"], snippet: visible(line.trim()).slice(0, 200) });
    });
  }
  return findings.sort((a, b) => a.line - b.line || severityRank(b.severity) - severityRank(a.severity));
}
var GUARD_OPT_OUT_WHY = "An attacker who hides malicious code can also add an opt-out comment to stop it being flagged. A reviewer should confirm each opt-out is for a genuine, reviewed reason.";
function scanOptOutsOnly(lines, only) {
  return lines.flatMap((line, i) => {
    const at = line.search(/veyra-guard-ignore/);
    return at >= 0 && only.has(i + 1) ? [{ rule: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium", line: i + 1, column: at + 1, endColumn: at + 1 + 24, message: "This change tells Code Guard to skip this whole file. Make sure that's intended.", why: GUARD_OPT_OUT_WHY, fix: FIXES["guard-opt-out"], snippet: visible(line.trim()).slice(0, 200) }] : [];
  });
}
function isBinary(text) {
  const head = text.slice(0, 8e3);
  return head.includes("\0") || (head.match(/[\u0001-\u0008\u000e-\u001a]/g)?.length ?? 0) > 10;
}
var ruleList = () => [
  ...RULES.map((r) => ({ id: r.id, title: r.title, severity: r.severity, why: r.why, fix: FIXES[r.id] ?? "" })),
  { id: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium", why: GUARD_OPT_OUT_WHY, fix: FIXES["guard-opt-out"] }
];
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

// src/pdf.ts
var import_node_zlib = require("node:zlib");
var FONT_NAMES = { regular: ["F1", "Helvetica"], bold: ["F2", "Helvetica-Bold"], mono: ["F3", "Courier"], monoBold: ["F4", "Courier-Bold"] };
var HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
var HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
var EXTRA = {
  "\u2026": [133, 1e3, 1e3],
  "\u2013": [150, 556, 556],
  "\u2014": [151, 1e3, 1e3],
  "\u2018": [145, 222, 278],
  "\u2019": [146, 222, 278],
  "\u201C": [147, 333, 500],
  "\u201D": [148, 333, 500],
  "\u2022": [149, 350, 350],
  "\xB7": [183, 278, 278],
  "\xA9": [169, 737, 737],
  "\xD7": [215, 584, 584]
};
function normalize(text) {
  return text.replace(/\u2192/g, "->").replace(/\u2190/g, "<-").replace(/\u2713|\u2714/g, "OK").replace(/[\t]/g, "    ").replace(/[^\x20-\x7e]/g, (c) => EXTRA[c] ? c : "?");
}
function textWidth(text, font, size) {
  if (font === "mono" || font === "monoBold") return normalize(text).length * 600 * size / 1e3;
  const table = font === "bold" ? HELV_BOLD : HELV;
  let w = 0;
  for (const c of normalize(text)) w += EXTRA[c] ? EXTRA[c][font === "bold" ? 2 : 1] : table[c.charCodeAt(0) - 32] ?? 556;
  return w * size / 1e3;
}
function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (textWidth(tryLine, font, size) <= maxWidth) {
        line = tryLine;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (textWidth(line, font, size) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), font, size) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}
var hex = (c) => [1, 3, 5].map((i) => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
var num = (n) => (Math.round(n * 100) / 100).toString();
var encode = (text) => "<" + [...normalize(text)].map((c) => (EXTRA[c] ? EXTRA[c][0] : c.charCodeAt(0)).toString(16).padStart(2, "0")).join("") + ">";
var Page = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  ops = [];
  links = [];
  y(y) {
    return this.height - y;
  }
  text(x, y, text, o = {}) {
    const font = o.font ?? "regular", size = o.size ?? 10;
    const w = textWidth(text, font, size) + (o.spacing ?? 0) * Math.max(0, text.length - 1);
    const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${FONT_NAMES[font][0]} ${num(size)} Tf ${hex(o.color ?? "#000000")} rg ${o.spacing ? `${num(o.spacing)} Tc ` : ""}${num(x0)} ${num(this.y(y))} Td ${encode(text)} Tj ${o.spacing ? "0 Tc " : ""}ET`);
    return w;
  }
  /** Wrapped paragraph; returns the y below it. */
  paragraph(x, y, width, text, o = {}) {
    const size = o.size ?? 10, leading = o.leading ?? size * 1.45;
    for (const line of wrap(text, o.font ?? "regular", size, width)) {
      this.text(x, y + size, line, o);
      y += leading;
    }
    return y;
  }
  rect(x, y, w, h, o = {}) {
    const r = Math.min(o.radius ?? 0, w / 2, h / 2), Y = this.y(y + h);
    let path;
    if (r > 0) {
      const k = r * 0.5523;
      path = `${num(x + r)} ${num(Y)} m ${num(x + w - r)} ${num(Y)} l ${num(x + w - r + k)} ${num(Y)} ${num(x + w)} ${num(Y + r - k)} ${num(x + w)} ${num(Y + r)} c ${num(x + w)} ${num(Y + h - r)} l ${num(x + w)} ${num(Y + h - r + k)} ${num(x + w - r + k)} ${num(Y + h)} ${num(x + w - r)} ${num(Y + h)} c ${num(x + r)} ${num(Y + h)} l ${num(x + r - k)} ${num(Y + h)} ${num(x)} ${num(Y + h - r + k)} ${num(x)} ${num(Y + h - r)} c ${num(x)} ${num(Y + r)} l ${num(x)} ${num(Y + r - k)} ${num(x + r - k)} ${num(Y)} ${num(x + r)} ${num(Y)} c h`;
    } else path = `${num(x)} ${num(Y)} ${num(w)} ${num(h)} re`;
    this.paint(path, o);
  }
  circle(cx, cy, r, o = {}) {
    const k = r * 0.5523, Y = this.y(cy);
    this.paint(`${num(cx + r)} ${num(Y)} m ${num(cx + r)} ${num(Y + k)} ${num(cx + k)} ${num(Y + r)} ${num(cx)} ${num(Y + r)} c ${num(cx - k)} ${num(Y + r)} ${num(cx - r)} ${num(Y + k)} ${num(cx - r)} ${num(Y)} c ${num(cx - r)} ${num(Y - k)} ${num(cx - k)} ${num(Y - r)} ${num(cx)} ${num(Y - r)} c ${num(cx + k)} ${num(Y - r)} ${num(cx + r)} ${num(Y - k)} ${num(cx + r)} ${num(Y)} c h`, o);
  }
  line(x1, y1, x2, y2, o = {}) {
    this.paint(`${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l`, { stroke: o.stroke ?? "#000000", lineWidth: o.lineWidth });
  }
  /** A closed shape through the given points, with optional rounded joins. */
  polygon(points, o = {}) {
    const [first, ...rest] = points;
    this.paint(`${o.round ? "1 j 1 J " : ""}${num(first[0])} ${num(this.y(first[1]))} m ${rest.map(([x, y]) => `${num(x)} ${num(this.y(y))} l`).join(" ")} h`, o);
  }
  link(x, y, w, h, url) {
    this.links.push({ x, y: this.y(y + h), w, h, url });
  }
  paint(path, o) {
    const parts = ["q"];
    if (o.fill) parts.push(`${hex(o.fill)} rg`);
    if (o.stroke) parts.push(`${hex(o.stroke)} RG ${num(o.lineWidth ?? 1)} w`);
    parts.push(path, o.fill && o.stroke ? "B" : o.fill ? "f" : "S", "Q");
    this.ops.push(parts.join(" "));
  }
};
var PdfDocument = class {
  constructor(info = { title: "Document" }) {
    this.info = info;
  }
  pages = [];
  addPage(width = 595.28, height = 841.89) {
    const p = new Page(width, height);
    this.pages.push(p);
    return p;
  }
  toBuffer() {
    const objects = [];
    const add = (body) => {
      objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
      return objects.length;
    };
    const stream = (dict, data) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>
stream
`, "latin1"), data, Buffer.from("\nendstream", "latin1")]);
    const pdfString = (s) => "(" + normalize(s).replace(/[\\()]/g, (m) => "\\" + m) + ")";
    const catalog = add(""), pagesId = add("");
    const fontIds = Object.values(FONT_NAMES).map(([, base]) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`));
    const fontRes = Object.values(FONT_NAMES).map(([key], i) => `/${key} ${fontIds[i]} 0 R`).join(" ");
    const pageIds = [];
    for (const page of this.pages) {
      const content = add(stream("/Filter /FlateDecode", (0, import_node_zlib.deflateSync)(Buffer.from(page.ops.join("\n"), "latin1"))));
      const annots = page.links.map((l) => add(`<< /Type /Annot /Subtype /Link /Rect [${num(l.x)} ${num(l.y)} ${num(l.x + l.w)} ${num(l.y + l.h)}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(l.url)} >> >>`));
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fontRes} >> >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`));
    }
    objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
    objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");
    const date = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const info = add(`<< /Title ${pdfString(this.info.title)} /Author ${pdfString(this.info.author ?? "")} /Subject ${pdfString(this.info.subject ?? "")} /Keywords ${pdfString(this.info.keywords ?? "")} /Creator (Veyra Code Guard) /Producer (Veyra Code Guard) /CreationDate (D:${date}Z) >>`);
    const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets = [];
    let pos = chunks[0].length;
    objects.forEach((body, i) => {
      const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj
`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      offsets.push(pos);
      chunks.push(obj);
      pos += obj.length;
    });
    const xref = `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n 
`).join("")}`;
    chunks.push(Buffer.from(`${xref}trailer
<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>
startxref
${pos}
%%EOF
`, "latin1"));
    return Buffer.concat(chunks);
  }
};

// src/report.ts
var C = {
  night: "#0b1214",
  night2: "#111c1f",
  emerald: "#10b981",
  mint: "#34d399",
  deep: "#047857",
  ink: "#17232a",
  body: "#3b4a50",
  muted: "#6b7a80",
  faint: "#9aa8ad",
  line: "#e2e8e6",
  wash: "#f5f8f7",
  white: "#ffffff"
};
var SEVERITY_COLOR = { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#2563eb" };
var SEVERITY_TINT = { critical: "#fde8e8", high: "#feeedf", medium: "#fdf5d9", low: "#e3ecfd" };
var GRADE_COLOR = { A: "#10b981", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626" };
var W = 595.28;
var H = 841.89;
var M = 48;
var CONTENT = W - M * 2;
var BOTTOM = H - 64;
function shield(p, x, y, s, color) {
  const k = s / 168, pt = (px, py) => [x + (px - 62) * k, y + (py - 46) * k];
  p.polygon([pt(128, 46), pt(194, 70), pt(194, 126), pt(184, 160), pt(160, 190), pt(128, 212), pt(96, 190), pt(72, 160), pt(62, 126), pt(62, 70)], { stroke: color, lineWidth: 2.4 * k * 5, round: true });
  p.rect(x + 34 * k, y + 52 * k, 64 * k, 13 * k, { fill: "#8b9096", radius: 6.5 * k });
  p.rect(x + 34 * k, y + 78 * k, 46 * k, 13 * k, { fill: "#ff6b6b", radius: 6.5 * k });
  p.circle(x + 95 * k, y + 84.5 * k, 6.5 * k, { fill: "#ff6b6b" });
  p.rect(x + 34 * k, y + 104 * k, 54 * k, 13 * k, { fill: "#8b9096", radius: 6.5 * k });
}
function pill(p, x, y, s) {
  const label = s.toUpperCase(), w = textWidth(label, "bold", 7.5) + 0.6 * (label.length - 1) + 14;
  p.rect(x, y, w, 15, { fill: SEVERITY_COLOR[s], radius: 7.5 });
  p.text(x + 7, y + 10.6, label, { font: "bold", size: 7.5, color: C.white, spacing: 0.6 });
  return w;
}
var fmtDate = (d) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function buildReport(input) {
  const all = input.files.flatMap((f) => f.findings.map((x) => ({ ...x, path: f.path })));
  const g = grade(all);
  const doc = new PdfDocument({ title: `Security Code Review: ${input.project}`, author: "Veyra Code Guard", subject: `${g.letter} (${g.score}/100), ${all.length} findings`, keywords: "security, code review, malicious code, Veyra Code Guard" });
  const when = input.generatedAt ?? /* @__PURE__ */ new Date();
  const cover = doc.addPage();
  cover.rect(0, 0, W, 330, { fill: C.night });
  for (let i = 0; i < 9; i++) cover.line(0, 40 + i * 36, W, 40 + i * 36, { stroke: "#16252a", lineWidth: 0.6 });
  for (let i = 0; i < 16; i++) cover.line(i * 40, 0, i * 40, 330, { stroke: "#16252a", lineWidth: 0.6 });
  shield(cover, M, 54, 46, C.white);
  cover.text(M + 52, 72, "VEYRA CODE GUARD", { font: "bold", size: 9, color: C.mint, spacing: 1.6 });
  cover.text(M + 52, 88, "Security code review", { size: 9, color: C.faint });
  cover.text(W - M, 72, fmtDate(when), { size: 9, color: C.faint, align: "right" });
  cover.text(W - M, 88, input.scope, { size: 9, color: C.faint, align: "right" });
  cover.text(M, 168, "Security Code Review", { font: "bold", size: 34, color: C.white });
  let y = 186;
  for (const line of wrap(input.project, "bold", 18, CONTENT).slice(0, 2)) {
    cover.text(M, y + 18, line, { font: "bold", size: 18, color: C.mint });
    y += 24;
  }
  cover.paragraph(M, y + 8, CONTENT - 40, "An automated line-by-line review for trojans, backdoors, hidden characters, leaked secrets and supply-chain attacks.", { size: 10.5, color: "#b8c6c2" });
  const cardY = 268, cardH = 150;
  cover.rect(M, cardY + 3, CONTENT, cardH, { fill: "#d9e2df", radius: 14 });
  cover.rect(M, cardY, CONTENT, cardH, { fill: C.white, stroke: C.line, lineWidth: 0.8, radius: 14 });
  const gc = GRADE_COLOR[g.letter];
  cover.circle(M + 70, cardY + 75, 46, { fill: gc });
  cover.circle(M + 70, cardY + 75, 38, { stroke: C.white, lineWidth: 1.2 });
  cover.text(M + 70, cardY + 92, g.letter, { font: "bold", size: 46, color: C.white, align: "center" });
  cover.text(M + 136, cardY + 44, "SECURITY GRADE", { font: "bold", size: 8, color: C.muted, spacing: 1.2 });
  cover.text(M + 136, cardY + 76, `${g.score}`, { font: "bold", size: 30, color: C.ink });
  cover.text(M + 136 + textWidth(`${g.score}`, "bold", 30) + 4, cover.height ? cardY + 76 : 0, "/ 100", { size: 12, color: C.muted });
  cover.paragraph(M + 136, cardY + 86, 150, g.verdict, { font: "bold", size: 10, color: gc, leading: 13 });
  const boxX = M + 300, boxW = (CONTENT - 300 - 18) / 2;
  SEVERITIES.forEach((s, i) => {
    const bx = boxX + i % 2 * (boxW + 8), by = cardY + 20 + Math.floor(i / 2) * 58;
    cover.rect(bx, by, boxW, 50, { fill: g.counts[s] ? SEVERITY_TINT[s] : C.wash, radius: 8 });
    cover.rect(bx, by + 10, 3, 30, { fill: SEVERITY_COLOR[s], radius: 1.5 });
    cover.text(bx + 14, by + 31, `${g.counts[s]}`, { font: "bold", size: 20, color: g.counts[s] ? SEVERITY_COLOR[s] : C.faint });
    cover.text(bx + 14, by + 43, s[0].toUpperCase() + s.slice(1), { size: 8, color: C.muted });
  });
  y = cardY + cardH + 36;
  cover.text(M, y, "AT A GLANCE", { font: "bold", size: 8, color: C.emerald, spacing: 1.2 });
  y += 14;
  const stats = [[input.filesScanned.toLocaleString("en-US"), "files checked"], [input.linesScanned.toLocaleString("en-US"), "lines read"], [`${ruleList().length}`, "rules applied"], [`${all.length}`, all.length === 1 ? "finding" : "findings"]];
  stats.forEach(([n, l], i) => {
    const sx = M + i * (CONTENT / 4);
    cover.text(sx, y + 24, n, { font: "bold", size: 20, color: C.ink });
    cover.text(sx, y + 38, l, { size: 9, color: C.muted });
    if (i) cover.line(sx - 12, y + 6, sx - 12, y + 40, { stroke: C.line });
  });
  y += 70;
  cover.text(M, y, all.length ? "TOP RISKS" : "RESULT", { font: "bold", size: 8, color: C.emerald, spacing: 1.2 });
  y += 12;
  const ranked = [...all].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.path.localeCompare(b.path) || a.line - b.line);
  if (!ranked.length) {
    cover.rect(M, y, CONTENT, 64, { fill: "#e7f8f0", radius: 10 });
    cover.text(M + 18, y + 28, "No signs of malicious code were found.", { font: "bold", size: 12, color: C.deep });
    cover.text(M + 18, y + 46, `Every line of ${input.filesScanned.toLocaleString("en-US")} files was checked against ${ruleList().length} rules.`, { size: 9.5, color: C.body });
  } else {
    for (const f of ranked.slice(0, 6)) {
      cover.rect(M, y, CONTENT, 34, { fill: C.wash, radius: 8 });
      const pw = pill(cover, M + 10, y + 9.5, f.severity);
      cover.text(M + 18 + pw, y + 15, truncateTo(f.title, "bold", 9.5, CONTENT - pw - 40), { font: "bold", size: 9.5, color: C.ink });
      cover.text(M + 18 + pw, y + 27, truncateTo(`${f.path}:${f.line}`, "mono", 8, CONTENT - pw - 40), { font: "mono", size: 8, color: C.muted });
      y += 40;
    }
    if (ranked.length > 6) cover.text(M, y + 8, `\u2026and ${ranked.length - 6} more, detailed on the following pages.`, { size: 9, color: C.muted });
  }
  let page;
  const newPage = (title) => {
    page = doc.addPage();
    page.rect(0, 0, W, 6, { fill: C.emerald });
    page.text(M, 46, title, { font: "bold", size: 18, color: C.ink });
    return 66;
  };
  if (ranked.length) {
    y = newPage("Findings");
    y = page.paragraph(M, y, CONTENT, `Each finding shows where it is, the code around it, why it matters and how to fix it. Findings are ordered by severity.`, { size: 9.5, color: C.muted }) + 10;
    for (const f of ranked) {
      const file = input.files.find((x) => x.path === f.path);
      const excerpt = excerptLines(file?.text, f.line);
      const what = wrap(f.message, "regular", 9.5, CONTENT - 120), why = wrap(f.why, "regular", 9.5, CONTENT - 120), fix = wrap(f.fix, "regular", 9.5, CONTENT - 120);
      const height = 44 + (excerpt.length ? excerpt.length * 12 + 16 : 0) + (what.length + why.length + fix.length) * 13.5 + 30;
      if (y + height > BOTTOM) y = newPage("Findings (continued)");
      const p2 = page;
      p2.line(M, y, W - M, y, { stroke: C.line });
      y += 14;
      const pw = pill(p2, M, y, f.severity);
      p2.text(M + pw + 8, y + 11, truncateTo(f.title, "bold", 11.5, CONTENT - pw - 90), { font: "bold", size: 11.5, color: C.ink });
      p2.text(W - M, y + 11, f.rule, { font: "mono", size: 7.5, color: C.faint, align: "right" });
      y += 22;
      p2.text(M, y + 8, truncateTo(`${f.path}  line ${f.line}, column ${f.column}`, "mono", 8.5, CONTENT), { font: "mono", size: 8.5, color: C.muted });
      y += 16;
      if (excerpt.length) {
        const boxH = excerpt.length * 12 + 10;
        p2.rect(M, y, CONTENT, boxH, { fill: C.wash, stroke: C.line, lineWidth: 0.6, radius: 6 });
        excerpt.forEach((row, i) => {
          const ry = y + 5 + i * 12;
          if (row.n === f.line) {
            p2.rect(M + 1, ry, CONTENT - 2, 12, { fill: SEVERITY_TINT[f.severity] });
            p2.rect(M + 1, ry, 2.5, 12, { fill: SEVERITY_COLOR[f.severity] });
          }
          p2.text(M + 30, ry + 9, String(row.n), { font: "mono", size: 7.5, color: C.faint, align: "right" });
          p2.text(M + 38, ry + 9, truncateTo(row.text, "mono", 8, CONTENT - 46), { font: row.n === f.line ? "monoBold" : "mono", size: 8, color: row.n === f.line ? C.ink : C.body });
        });
        y += boxH + 8;
      }
      const block = (label, lines, color, bar) => {
        if (bar) p2.rect(M, y + 2, 2.5, lines.length * 13.5 - 2, { fill: bar, radius: 1 });
        p2.text(M + (bar ? 10 : 0), y + 10, label, { font: "bold", size: 8, color, spacing: 0.4 });
        lines.forEach((l, i) => p2.text(M + 112, y + 10 + i * 13.5, l, { size: 9.5, color: C.body }));
        y += lines.length * 13.5 + 3;
      };
      block("WHAT WE FOUND", what, C.ink);
      block("WHY IT MATTERS", why, C.ink);
      block("HOW TO FIX", fix, C.deep, C.emerald);
      y += 8;
    }
  }
  y = newPage("How this review works");
  const p = page;
  y = p.paragraph(M, y, CONTENT, `Veyra Code Guard ${input.version} read every line of ${input.filesScanned.toLocaleString("en-US")} files (${input.linesScanned.toLocaleString("en-US")} lines) in ${/^whole /i.test(input.scope) ? `the ${input.scope.toLowerCase()}` : /^staged/i.test(input.scope) ? `the ${input.scope.toLowerCase()}` : input.scope.toLowerCase()} and checked them against the ${ruleList().length} rules below. Build output, dependencies (node_modules) and virtual environments are skipped. Lines marked as reviewed with a veyra-guard-ignore comment are not reported.`, { size: 9.5, color: C.body }) + 6;
  y = p.paragraph(M, y, CONTENT, "The grade starts at 100 and loses 30 points per critical, 12 per high, 4 per medium and 1 per low finding. Any critical finding limits the grade to D.", { size: 9.5, color: C.body }) + 14;
  p.rect(M, y, CONTENT, 20, { fill: C.night, radius: 5 });
  p.text(M + 10, y + 13.5, "SEVERITY", { font: "bold", size: 7.5, color: C.mint, spacing: 0.8 });
  p.text(M + 90, y + 13.5, "RULE", { font: "bold", size: 7.5, color: C.mint, spacing: 0.8 });
  p.text(M + 230, y + 13.5, "WHAT IT LOOKS FOR", { font: "bold", size: 7.5, color: C.mint, spacing: 0.8 });
  y += 24;
  const rules = [...ruleList()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id));
  rules.forEach((r, i) => {
    if (y + 16 > BOTTOM - 70) {
      y = newPage("Rules (continued)");
    }
    const pg = page;
    if (i % 2) pg.rect(M, y - 2, CONTENT, 16, { fill: C.wash, radius: 3 });
    pg.circle(M + 14, y + 6, 3, { fill: SEVERITY_COLOR[r.severity] });
    pg.text(M + 22, y + 9, r.severity, { size: 8.5, color: C.body });
    pg.text(M + 90, y + 9, r.id, { font: "mono", size: 8, color: C.ink });
    pg.text(M + 230, y + 9, truncateTo(r.title, "regular", 8.5, CONTENT - 236), { size: 8.5, color: C.body });
    y += 16;
  });
  const last = page;
  y += 14;
  last.rect(M, y, CONTENT, 62, { fill: C.wash, radius: 8 });
  last.paragraph(M + 14, y + 10, CONTENT - 28, "Code Guard recognises the patterns attackers use; it does not run your code. It catches the common and the sneaky, but a determined attacker can write code it won't recognise. Use this report alongside careful review, dependency audits and least-privilege access.", { size: 8.5, color: C.muted, leading: 12 });
  doc.pages.forEach((pg, i) => {
    const dark = i === 0;
    pg.line(M, H - 40, W - M, H - 40, { stroke: dark ? C.line : C.line, lineWidth: 0.6 });
    pg.text(M, H - 26, `Veyra Code Guard \xB7 ${truncateTo(input.project, "regular", 8, 260)} \xB7 Grade ${g.letter} (${g.score}/100)`, { size: 8, color: C.muted });
    pg.text(W - M, H - 26, `Page ${i + 1} of ${doc.pages.length}`, { size: 8, color: C.muted, align: "right" });
  });
  if (input.repositoryUrl) cover.link(M, 150, 300, 40, input.repositoryUrl);
  return doc.toBuffer();
}
function truncateTo(text, font, size, width) {
  const t = visible(text);
  if (textWidth(t, font, size) <= width) return t;
  let cut = t.length;
  while (cut > 1 && textWidth(t.slice(0, cut) + "\u2026", font, size) > width) cut--;
  return t.slice(0, cut) + "\u2026";
}
function excerptLines(text, line) {
  if (!text) return [];
  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let n = Math.max(1, line - 2); n <= Math.min(lines.length, line + 2); n++) out.push({ n, text: visible(lines[n - 1]).replace(/\t/g, "  ") });
  while (out.length > 1 && out[0].n !== line && !out[0].text.trim()) out.shift();
  while (out.length > 1 && out[out.length - 1].n !== line && !out[out.length - 1].text.trim()) out.pop();
  return out;
}

// src/sarif.ts
var LEVEL = { critical: "error", high: "error", medium: "warning", low: "note" };
var SCORE = { critical: "9.5", high: "8.0", medium: "5.5", low: "3.0" };
function toSarif(files, version) {
  const rules = ruleList();
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "Veyra Code Guard",
          version,
          semanticVersion: version,
          informationUri: "https://veyraeditor.com/code-guard",
          rules: rules.map((r) => ({
            id: r.id,
            name: r.id.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase()),
            shortDescription: { text: r.title },
            fullDescription: { text: r.why },
            help: { text: `${r.why}

How to fix: ${r.fix}`, markdown: `${r.why}

**How to fix:** ${r.fix}` },
            defaultConfiguration: { level: LEVEL[r.severity] },
            properties: { tags: ["security", "malicious-code"], "security-severity": SCORE[r.severity], precision: "high" }
          }))
        }
      },
      results: files.flatMap(({ path, findings }) => findings.map((f) => ({
        ruleId: f.rule,
        ruleIndex: rules.findIndex((r) => r.id === f.rule),
        level: LEVEL[f.severity],
        message: { text: `${f.message} ${f.fix}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: path.replace(/\\/g, "/") }, region: { startLine: f.line, startColumn: f.column, endColumn: f.endColumn } } }],
        partialFingerprints: { "veyraGuard/v1": `${f.rule}:${path}:${f.snippet.slice(0, 80)}` }
      })))
    }]
  };
}

// src/version.ts
var VERSION = "1.1.0";

// src/action.ts
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".next", "dist", "build", "out", "bundle", "coverage", ".venv", "venv", "__pycache__", "target", ".gradle", ".idea", ".vscode-test"]);
function matcher(patterns) {
  const res = patterns.map((p) => p.trim()).filter(Boolean).map((p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "__GLOBSTAR__").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/__GLOBSTAR__/g, ".*") + "$"));
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
function options() {
  const args = process.argv.slice(2), flag = (name) => args.includes(`--${name}`);
  const value = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : void 0;
  };
  const input = (name, fallback = "") => (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim() || fallback;
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && /^--(pdf|sarif|fail-on|min-severity|ignore|disable)$/.test(args[i - 1])))[0];
  return {
    root: (0, import_node_path.resolve)(process.env.GITHUB_WORKSPACE || positional || process.cwd()),
    staged: flag("staged"),
    pdf: value("pdf") || input("report-pdf") || void 0,
    sarif: value("sarif") || input("sarif") || void 0,
    json: flag("json"),
    failOn: value("fail-on") || input("fail-on", "high"),
    minSeverity: value("min-severity") || input("min-severity", "low"),
    ignore: matcher([...(value("ignore") ?? "").split(","), ...input("ignore-paths").split(/[\n,]/)]),
    disabled: [...(value("disable") ?? "").split(","), ...input("disable-rules").split(/[\s,]+/)].filter(Boolean),
    mode: input("scan", "changed-lines"),
    review: input("review", "true") === "true"
  };
}
async function github(path, init = {}) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const token = (process.env["INPUT_GITHUB-TOKEN"] ?? "").trim() || process.env.GITHUB_TOKEN || "";
  const res = await fetch(api + path, { ...init, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "veyra-code-guard", ...token ? { Authorization: `Bearer ${token}` } : {}, ...init.headers ?? {} } });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.status === 204 ? null : res.json();
}
async function pullRequestFiles(repo, number) {
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await github(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    for (const f of batch) if (f.status !== "removed") files.push({ path: f.filename, added: f.patch ? addedLines(f.patch) : /* @__PURE__ */ new Set() });
    if (batch.length < 100) break;
  }
  return files;
}
var escapeData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
var escapeProp = (s) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
var LEVEL2 = { critical: "error", high: "error", medium: "warning", low: "notice" };
var ICON = { critical: "\u{1F6D1}", high: "\u{1F534}", medium: "\u{1F7E0}", low: "\u{1F535}" };
function annotate(results) {
  for (const { path, findings } of results) for (const f of findings)
    console.log(`::${LEVEL2[f.severity]} file=${escapeProp(path)},line=${f.line},col=${f.column},endColumn=${f.endColumn},title=${escapeProp(`Veyra Code Guard \xB7 ${f.severity.toUpperCase()} \xB7 ${f.title}`)}::${escapeData(`${f.message}
${f.why}
How to fix: ${f.fix}`)}`);
}
function markdown(results, scope) {
  const all = results.flatMap((r) => r.findings), c = summarize(all), g = grade(all);
  const lines = [`## \u{1F6E1}\uFE0F Veyra Code Guard \xB7 Grade ${g.letter} (${g.score}/100)`, ""];
  if (!all.length) lines.push(`No signs of malicious code in ${scope}. \u2705`);
  else {
    lines.push(`**${g.verdict}.** Found **${all.length}** suspicious line${all.length === 1 ? "" : "s"} in ${scope}: ${SEVERITIES.filter((s) => c[s]).map((s) => `${ICON[s]} ${c[s]} ${s}`).join(" \xB7 ")}`, "");
    lines.push("| Severity | Where | What | How to fix |", "|---|---|---|---|");
    for (const { path, findings } of results) for (const f of findings) lines.push(`| ${ICON[f.severity]} ${f.severity} | \`${path}:${f.line}\` | **${f.title}**: ${f.message.replace(/\|/g, "\\|")} | ${f.fix.replace(/\|/g, "\\|")} |`);
    lines.push("", "Each line is marked in **Files changed**. To accept a line that is safe, add a comment `veyra-guard-ignore: <rule>` on it or the line above.");
  }
  return lines.join("\n");
}
async function postReview(repo, number, results, body, failing) {
  const comments = results.flatMap(({ path, findings, added }) => findings.filter((f) => !added || added.has(f.line)).map((f) => ({
    path,
    line: f.line,
    side: "RIGHT",
    body: `${ICON[f.severity]} **${f.title}** (${f.severity})

${f.message}

${f.why}

**How to fix:** ${f.fix}

<sub>Veyra Code Guard \xB7 rule \`${f.rule}\` \xB7 add \`veyra-guard-ignore: ${f.rule}\` to accept</sub>`
  }))).slice(0, 50);
  await github(`/repos/${repo}/pulls/${number}/reviews`, { method: "POST", body: JSON.stringify({ event: failing ? "REQUEST_CHANGES" : "COMMENT", body, comments }) });
}
function stagedFiles(root) {
  const git = (...a) => (0, import_node_child_process.execFileSync)("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0").filter(Boolean);
  return names.map((path) => ({ path, text: git("show", `:${path}`), added: addedLines(git("diff", "--cached", "-U0", "--", path)) }));
}
var tty = process.stdout.isTTY && !process.env.NO_COLOR;
var paint = (code, s) => tty ? `\x1B[${code}m${s}\x1B[0m` : s;
var SEV_COLOR = { critical: "1;31", high: "31", medium: "33", low: "34" };
function terminal(results, scope, filesScanned) {
  const all = results.flatMap((r) => r.findings), g = grade(all);
  console.log(`
${paint("1;32", "Veyra Code Guard")}  ${scope}  \xB7  ${filesScanned} files`);
  for (const { path, findings } of results) for (const f of findings) {
    console.log(`
  ${paint(SEV_COLOR[f.severity], f.severity.toUpperCase().padEnd(8))} ${paint("1", f.title)}  ${paint("2", `${path}:${f.line}:${f.column}`)}`);
    console.log(`           ${f.message}`);
    console.log(`           ${paint("32", "Fix:")} ${f.fix}`);
  }
  console.log(`
  Grade ${paint("1", g.letter)} (${g.score}/100) \xB7 ${g.verdict}${all.length ? ` \xB7 ${all.length} finding${all.length === 1 ? "" : "s"}` : ""}
`);
}
async function main() {
  const o = options();
  const event = process.env.GITHUB_EVENT_PATH && (0, import_node_fs.existsSync)(process.env.GITHUB_EVENT_PATH) ? JSON.parse((0, import_node_fs.readFileSync)(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const pr = process.env.GITHUB_ACTIONS ? event.pull_request?.number : void 0;
  const scanOpts = { minSeverity: o.minSeverity, disabled: o.disabled };
  const results = [];
  let scope = "Whole repository", filesScanned = 0, linesScanned = 0;
  const check = (path, text, added, onlyAdded = false) => {
    filesScanned++;
    linesScanned += text.split("\n").length;
    const findings = scan(text, path, { ...scanOpts, onlyLines: onlyAdded ? added : void 0 });
    if (findings.length) results.push({ path, findings, added, text });
  };
  if (o.staged) {
    scope = "Staged changes";
    for (const f of stagedFiles(o.root)) if (!o.ignore(f.path)) check(f.path, f.text, f.added, true);
  } else if (pr && o.mode !== "all") {
    scope = `Pull request #${pr}`;
    for (const f of await pullRequestFiles(repo, pr)) {
      if (o.ignore(f.path)) continue;
      const full = (0, import_node_path.join)(o.root, f.path);
      if ((0, import_node_fs.existsSync)(full)) check(f.path, (0, import_node_fs.readFileSync)(full, "utf8"), f.added, o.mode === "changed-lines");
    }
  } else {
    for (const path of walk(o.root)) {
      if (o.ignore(path)) continue;
      let text;
      try {
        text = (0, import_node_fs.readFileSync)((0, import_node_path.join)(o.root, path), "utf8");
      } catch {
        continue;
      }
      check(path, text);
    }
  }
  const all = results.flatMap((r) => r.findings);
  const failing = o.failOn !== "never" && all.some((f) => severityRank(f.severity) >= severityRank(o.failOn));
  const project = repo ? repo.split("/").pop() : (0, import_node_path.basename)(o.root);
  if (o.pdf) {
    const target = (0, import_node_path.resolve)(o.root, o.pdf);
    (0, import_node_fs.writeFileSync)(target, buildReport({ project, scope, files: results, filesScanned, linesScanned, version: VERSION, repositoryUrl: repo ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}` : void 0 }));
    if (!process.env.GITHUB_ACTIONS && !o.json) console.log(`Report saved: ${target}`);
  }
  if (o.sarif) (0, import_node_fs.writeFileSync)((0, import_node_path.resolve)(o.root, o.sarif), JSON.stringify(toSarif(results, VERSION), null, 2));
  if (process.env.GITHUB_ACTIONS) {
    const body = markdown(results, scope.replace(/^P/, "p").replace(/^W/, "the w"));
    const g = grade(all);
    annotate(results);
    if (process.env.GITHUB_STEP_SUMMARY) (0, import_node_fs.appendFileSync)(process.env.GITHUB_STEP_SUMMARY, body + "\n");
    if (process.env.GITHUB_OUTPUT) (0, import_node_fs.appendFileSync)(process.env.GITHUB_OUTPUT, `findings=${all.length}
critical=${summarize(all).critical}
grade=${g.letter}
score=${g.score}
${o.pdf ? `report=${(0, import_node_path.resolve)(o.root, o.pdf)}
` : ""}${o.sarif ? `sarif=${(0, import_node_path.resolve)(o.root, o.sarif)}
` : ""}`);
    if (pr && o.review && all.length) {
      try {
        await postReview(repo, pr, results, body, failing);
      } catch (e) {
        console.log(`::notice::Couldn't post a review comment (${e.message.split(":")[0]}). Findings are shown as annotations instead.`);
      }
    }
    if (failing) console.log(`::error::Veyra Code Guard found ${all.length} suspicious line(s) at or above "${o.failOn}".`);
  } else if (o.json) {
    console.log(JSON.stringify({ version: VERSION, scope, filesScanned, grade: grade(all), files: results.map(({ path, findings }) => ({ path, findings })) }, null, 2));
  } else {
    terminal(results, scope, filesScanned);
    if (failing && o.staged) console.log(`  ${paint("1;31", "Commit blocked.")} Fix the lines above, or mark a safe line with a "veyra-guard-ignore: <rule>" comment.
  To skip the check once: git commit --no-verify
`);
  }
  if (failing) process.exitCode = 1;
}
main().catch((e) => {
  console.log(`${process.env.GITHUB_ACTIONS ? "::error::" : ""}Veyra Code Guard failed: ${e.message}`);
  process.exitCode = 1;
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  main,
  matcher
});
