// Veyra Code Guard outside the editor: the GitHub Action (see action.yml), the command line and the git pre-commit hook.
//   GitHub Action:  reviews every pull request line by line, annotates, comments, writes a PDF report and SARIF.
//   Command line:   node cli.js [folder] [--staged] [--fix] [--watch] [--pdf report.pdf] [--sarif out.sarif] [--json] [--fail-on high]
import { appendFileSync, readFileSync, readdirSync, statSync, existsSync, watch, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { addedLines, CONFIG_FILE, globMatcher, grade, languageCounts, parseConfig, removeHiddenCharacters, scan, severityRank, summarize, SEVERITIES, type CustomRule, type Finding, type GuardConfig, type Severity } from "./scanner";
import { buildReport } from "./report";
import { toSarif } from "./sarif";
import { VERSION } from "./version";

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "out", "bundle", "coverage", ".venv", "venv", "__pycache__", "target", ".gradle", ".idea", ".vscode-test"]);

interface FileResult { path: string; findings: Finding[]; added?: Set<number>; text: string }
interface Options {
  root: string; staged: boolean; pdf?: string; sarif?: string; json: boolean; fix: boolean; watch: boolean;
  failOn: Severity | "never"; minSeverity: Severity; ignore: (path: string) => boolean; disabled: string[]; customRules: CustomRule[];
  mode: string; review: boolean;
  /** Running as the GitHub Action (not the command line or the git hook, even inside CI). */
  action: boolean;
}

/** Glob-ish path filters: "docs/**", "*.md", "test/fixtures/**". */
export const matcher = globMatcher;

function walk(root: string, dir = root, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(root, full, out); }
    else if (st.size < 5_000_000) out.push(relative(root, full).replace(/\\/g, "/"));
  }
  return out;
}

const HELP = `Veyra Code Guard ${VERSION}: checks code in any language for trojans, backdoors and supply-chain attacks.

  node cli.js [folder]            check every file in a folder (default: the current one)
    --staged                      only the lines staged for the next commit (the pre-commit guard)
    --fix                         remove hidden and invisible characters, then check again
    --watch                       keep checking files as they change, and say when one is clean again
    --pdf report.pdf              write a PDF security report
    --sarif out.sarif             write SARIF, for GitHub's Security tab
    --json                        print the findings as JSON
    --fail-on <severity|never>    exit with code 1 at this severity or above (default: high)
    --min-severity <severity>     the lowest severity to report (default: low)
    --ignore "docs/**,*.min.js"   paths to skip
    --disable rule-id,rule-id     rules to turn off

Team settings (ignorePaths, disabledRules, customRules, minSeverity, failOn) are read from ${CONFIG_FILE} in the folder.
`;

function options(): Options {
  const args = process.argv.slice(2), flag = (name: string) => args.includes(`--${name}`);
  const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const input = (name: string, fallback = "") => (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim() || fallback;
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && /^--(pdf|sarif|fail-on|min-severity|ignore|disable)$/.test(args[i - 1])))[0];
  // The git hook and an explicit folder always mean that folder, even when a commit happens inside CI.
  const root = resolve(positional || (flag("staged") ? process.cwd() : process.env.GITHUB_WORKSPACE || process.cwd()));
  // The project's own settings; the command line and the Action's inputs win where both say something.
  const file = join(root, CONFIG_FILE);
  const project: { config: GuardConfig; error?: string } = existsSync(file) ? parseConfig(readFileSync(file, "utf8")) : { config: {} };
  if (project.error) console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Veyra Code Guard: ${project.error}`);
  const p = project.config;
  return {
    root,
    action: !!process.env.GITHUB_ACTIONS && !flag("staged") && !positional,
    staged: flag("staged"),
    fix: flag("fix"),
    watch: flag("watch"),
    pdf: value("pdf") || input("report-pdf") || undefined,
    sarif: value("sarif") || input("sarif") || undefined,
    json: flag("json"),
    failOn: (value("fail-on") || input("fail-on") || p.failOn || "high") as Severity | "never",
    minSeverity: (value("min-severity") || input("min-severity") || p.minSeverity || "low") as Severity,
    ignore: matcher([...(value("ignore") ?? "").split(","), ...input("ignore-paths").split(/[\n,]/), ...(p.ignorePaths ?? [])]),
    disabled: [...(value("disable") ?? "").split(","), ...input("disable-rules").split(/[\s,]+/), ...(p.disabledRules ?? [])].filter(Boolean),
    customRules: p.customRules ?? [],
    mode: input("scan", "changed-lines"),
    review: input("review", "true") === "true",
  };
}

// ---------- GitHub ----------

async function github(path: string, init: RequestInit = {}) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const token = (process.env["INPUT_GITHUB-TOKEN"] ?? "").trim() || process.env.GITHUB_TOKEN || "";
  const res = await fetch(api + path, { ...init, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "veyra-code-guard", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text().then(t => t.slice(0, 200))}`);
  return res.status === 204 ? null : res.json();
}

/** Changed files of the pull request with the lines it adds. */
async function pullRequestFiles(repo: string, number: number) {
  const files: Array<{ path: string; added: Set<number> }> = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await github(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`) as Array<{ filename: string; status: string; patch?: string }>;
    for (const f of batch) if (f.status !== "removed") files.push({ path: f.filename, added: f.patch ? addedLines(f.patch) : new Set() });
    if (batch.length < 100) break;
  }
  return files;
}

const escapeData = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProp = (s: string) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
const LEVEL: Record<Severity, string> = { critical: "error", high: "error", medium: "warning", low: "notice" };
const ICON: Record<Severity, string> = { critical: "\u{1f6d1}", high: "\u{1f534}", medium: "\u{1f7e0}", low: "\u{1f535}" };

function annotate(results: FileResult[]) {
  for (const { path, findings } of results) for (const f of findings)
    console.log(`::${LEVEL[f.severity]} file=${escapeProp(path)},line=${f.line},col=${f.column},endColumn=${f.endColumn},title=${escapeProp(`Veyra Code Guard · ${f.severity.toUpperCase()} · ${f.title}`)}::${escapeData(`${f.message}\n${f.why}\nHow to fix: ${f.fix}`)}`);
}

function markdown(results: FileResult[], scope: string) {
  const all = results.flatMap(r => r.findings), c = summarize(all), g = grade(all);
  const lines = [`## \u{1f6e1}\u{fe0f} Veyra Code Guard · Grade ${g.letter} (${g.score}/100)`, ""];
  if (!all.length) lines.push(`No signs of malicious code in ${scope}. ✅`);
  else {
    lines.push(`**${g.verdict}.** Found **${all.length}** suspicious line${all.length === 1 ? "" : "s"} in ${scope}: ${SEVERITIES.filter(s => c[s]).map(s => `${ICON[s]} ${c[s]} ${s}`).join(" · ")}`, "");
    lines.push("| Severity | Where | What | How to fix |", "|---|---|---|---|");
    for (const { path, findings } of results) for (const f of findings) lines.push(`| ${ICON[f.severity]} ${f.severity} | \`${path}:${f.line}\` | **${f.title}**: ${f.message.replace(/\|/g, "\\|")} | ${f.fix.replace(/\|/g, "\\|")} |`);
    lines.push("", "Each line is marked in **Files changed**. To accept a line that is safe, add a comment `veyra-guard-ignore: <rule>` on it or the line above.");
  }
  return lines.join("\n");
}

async function postReview(repo: string, number: number, results: FileResult[], body: string, failing: boolean) {
  // GitHub only accepts comments on lines that are part of the diff.
  const comments = results.flatMap(({ path, findings, added }) => findings.filter(f => !added || added.has(f.line)).map(f => ({ path, line: f.line, side: "RIGHT",
    body: `${ICON[f.severity]} **${f.title}** (${f.severity})\n\n${f.message}\n\n${f.why}\n\n**How to fix:** ${f.fix}\n\n<sub>Veyra Code Guard · rule \`${f.rule}\` · add \`veyra-guard-ignore: ${f.rule}\` to accept</sub>` }))).slice(0, 50);
  await github(`/repos/${repo}/pulls/${number}/reviews`, { method: "POST", body: JSON.stringify({ event: failing ? "REQUEST_CHANGES" : "COMMENT", body, comments }) });
}

// ---------- Collecting files ----------

/** Files and lines staged for the next commit, read from the index (what will actually be committed). */
function stagedFiles(root: string) {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0").filter(Boolean);
  return names.map(path => ({ path, text: git("show", `:${path}`), added: addedLines(git("diff", "--cached", "-U0", "--", path)) }));
}

// ---------- Terminal ----------

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const SEV_COLOR: Record<Severity, string> = { critical: "1;31", high: "31", medium: "33", low: "34" };

function printFindings(path: string, findings: Finding[]) {
  for (const f of findings) {
    console.log(`\n  ${paint(SEV_COLOR[f.severity], f.severity.toUpperCase().padEnd(8))} ${paint("1", f.title)}  ${paint("2", `${path}:${f.line}:${f.column}`)}`);
    console.log(`           ${f.message}`);
    console.log(`           ${paint("32", "Fix:")} ${f.fix}`);
  }
}

function gradeLine(all: Finding[]) {
  const g = grade(all);
  return `  Grade ${paint("1", g.letter)} (${g.score}/100) · ${g.verdict}${all.length ? ` · ${all.length} finding${all.length === 1 ? "" : "s"}` : ""}`;
}

function terminal(results: FileResult[], scope: string, filesScanned: number, languages: Array<[string, number]>) {
  const all = results.flatMap(r => r.findings);
  const langs = languages.length ? `  ·  ${languages.length} language${languages.length === 1 ? "" : "s"} (${languages.slice(0, 5).map(([l]) => l).join(", ")}${languages.length > 5 ? ", …" : ""})` : "";
  console.log(`\n${paint("1;32", "Veyra Code Guard")}  ${scope}  ·  ${filesScanned} files${langs}`);
  for (const { path, findings } of results) printFindings(path, findings);
  console.log(`\n${gradeLine(all)}\n`);
}

// ---------- Fixing and watching ----------

/** Remove hidden characters from flagged files, then check those files again. Returns how many characters went. */
function fixHidden(o: Options, results: FileResult[], check: (path: string, text: string) => FileResult | undefined) {
  let removed = 0, files = 0;
  for (const r of [...results]) {
    if (!r.findings.some(f => f.rule === "trojan-source" || f.rule === "invisible-character")) continue;
    const fixed = removeHiddenCharacters(r.text);
    if (!fixed.removed) continue;
    writeFileSync(join(o.root, r.path), fixed.text);
    removed += fixed.removed; files++;
    // Rescan: the file's entry is replaced by what is left after the fix (or dropped when it is clean).
    results.splice(results.indexOf(r), 1);
    const again = check(r.path, fixed.text);
    if (again) results.push(again);
  }
  return { removed, files };
}

/** Keep checking files as they change; report new findings and files that become clean. */
function watchFolder(o: Options, results: FileResult[]) {
  const known = new Map(results.map(r => [r.path, r.findings]));
  const timers = new Map<string, NodeJS.Timeout>();
  const total = () => [...known.values()].flat();
  console.log(`  ${paint("2", `Watching ${o.root} for changes. Press Ctrl+C to stop.`)}\n`);
  const recheck = (path: string) => {
    const full = join(o.root, path), before = known.get(path) ?? [];
    let text: string | undefined;
    try { if (statSync(full).isFile() && statSync(full).size < 5_000_000) text = readFileSync(full, "utf8"); } catch { /* deleted */ }
    const findings = text === undefined ? [] : scan(text, path, { minSeverity: o.minSeverity, disabled: o.disabled, customRules: o.customRules });
    if (findings.length) known.set(path, findings); else known.delete(path);
    const key = (f: Finding) => `${f.rule}:${f.snippet}`, old = new Set(before.map(key));
    const fresh = findings.filter(f => !old.has(key(f)));
    const time = paint("2", new Date().toLocaleTimeString());
    if (text === undefined && before.length) console.log(`${time}  ${paint("32", "✓")} ${path} was deleted: ${before.length} finding${before.length === 1 ? "" : "s"} gone`);
    else if (!findings.length && before.length) console.log(`${time}  ${paint("32", "✓")} ${path} rescanned: clean again (${before.length} finding${before.length === 1 ? "" : "s"} removed)`);
    else if (findings.length < before.length && !fresh.length) console.log(`${time}  ${paint("32", "↓")} ${path} rescanned: ${before.length} → ${findings.length} findings`);
    else if (fresh.length) { console.log(`${time}  ${paint("31", "!")} ${path}: ${fresh.length} new finding${fresh.length === 1 ? "" : "s"}`); printFindings(path, fresh); console.log(""); }
    else return;
    console.log(gradeLine(total()) + "\n");
  };
  watch(o.root, { recursive: true }, (_event, name) => {
    if (!name) return;
    const path = name.toString().replace(/\\/g, "/");
    if (path.split("/").some(part => SKIP_DIRS.has(part)) || o.ignore(path) || /\.(pdf|sarif)$/i.test(path)) return;
    clearTimeout(timers.get(path));
    timers.set(path, setTimeout(() => { timers.delete(path); recheck(path); }, 250));
  });
}

// ---------- Main ----------

export async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) return void console.log(HELP);
  const o = options();
  const event = process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const pr = o.action ? event.pull_request?.number as number | undefined : undefined;
  const scanOpts = { minSeverity: o.minSeverity, disabled: o.disabled, customRules: o.customRules };

  const results: FileResult[] = [], paths: string[] = [];
  let scope = "Whole repository", filesScanned = 0, linesScanned = 0;
  const examine = (path: string, text: string, added?: Set<number>, onlyAdded = false): FileResult | undefined => {
    const findings = scan(text, path, { ...scanOpts, onlyLines: onlyAdded ? added : undefined });
    return findings.length ? { path, findings, added, text } : undefined;
  };
  const check = (path: string, text: string, added?: Set<number>, onlyAdded = false) => {
    filesScanned++; linesScanned += text.split("\n").length; paths.push(path);
    const r = examine(path, text, added, onlyAdded);
    if (r) results.push(r);
  };

  if (o.staged) {
    scope = "Staged changes";
    for (const f of stagedFiles(o.root)) if (!o.ignore(f.path)) check(f.path, f.text, f.added, true);
  } else if (pr && o.mode !== "all") {
    scope = `Pull request #${pr}`;
    for (const f of await pullRequestFiles(repo, pr)) {
      if (o.ignore(f.path)) continue;
      const full = join(o.root, f.path);
      if (existsSync(full)) check(f.path, readFileSync(full, "utf8"), f.added, o.mode === "changed-lines");
    }
  } else {
    for (const path of walk(o.root)) {
      if (o.ignore(path)) continue;
      let text; try { text = readFileSync(join(o.root, path), "utf8"); } catch { continue; }
      check(path, text);
    }
  }

  const fixed = o.fix && !o.staged && !o.action ? fixHidden(o, results, (path, text) => examine(path, text)) : undefined;
  results.sort((a, b) => a.path.localeCompare(b.path));
  const languages = languageCounts(paths);
  const all = results.flatMap(r => r.findings);
  const failing = o.failOn !== "never" && all.some(f => severityRank(f.severity) >= severityRank(o.failOn as Severity));
  const project = repo ? repo.split("/").pop()! : basename(o.root);

  if (o.pdf) {
    const target = resolve(o.root, o.pdf);
    writeFileSync(target, buildReport({ project, scope, files: results, filesScanned, linesScanned, version: VERSION, languages, repositoryUrl: repo ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}` : undefined }));
    if (!o.action && !o.json) console.log(`Report saved: ${target}`);
  }
  if (o.sarif) writeFileSync(resolve(o.root, o.sarif), JSON.stringify(toSarif(results, VERSION), null, 2));

  if (o.action) {
    const body = markdown(results, scope.replace(/^P/, "p").replace(/^W/, "the w"));
    const g = grade(all);
    annotate(results);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `findings=${all.length}\ncritical=${summarize(all).critical}\ngrade=${g.letter}\nscore=${g.score}\n${o.pdf ? `report=${resolve(o.root, o.pdf)}\n` : ""}${o.sarif ? `sarif=${resolve(o.root, o.sarif)}\n` : ""}`);
    if (pr && o.review && all.length) {
      // Pull requests from forks get a read-only token: the annotations above still mark every line.
      try { await postReview(repo, pr, results, body, failing); } catch (e) { console.log(`::notice::Couldn't post a review comment (${(e as Error).message.split(":")[0]}). Findings are shown as annotations instead.`); }
    }
    if (failing) console.log(`::error::Veyra Code Guard found ${all.length} suspicious line(s) at or above "${o.failOn}".`);
  } else if (o.json) {
    console.log(JSON.stringify({ version: VERSION, scope, filesScanned, languages: Object.fromEntries(languages), ...(fixed ? { fixed } : {}), grade: grade(all), files: results.map(({ path, findings }) => ({ path, findings })) }, null, 2));
  } else {
    terminal(results, scope, filesScanned, languages);
    if (fixed) console.log(fixed.removed ? `  ${paint("32", "Fixed:")} removed ${fixed.removed} hidden character${fixed.removed === 1 ? "" : "s"} from ${fixed.files} file${fixed.files === 1 ? "" : "s"} and rescanned them. The results above are after the fix.\n` : "  Nothing to fix automatically: no hidden characters were found.\n");
    if (failing && o.staged) console.log(`  ${paint("1;31", "Commit blocked.")} Fix the lines above, or mark a safe line with a "veyra-guard-ignore: <rule>" comment.\n  To skip the check once: git commit --no-verify\n`);
  }
  if (o.watch && !o.staged && !o.action) return watchFolder(o, results);
  if (failing) process.exitCode = 1;
}

main().catch(e => { console.log(`${process.env.GITHUB_ACTIONS ? "::error::" : ""}Veyra Code Guard failed: ${(e as Error).message}`); process.exitCode = 1; });
