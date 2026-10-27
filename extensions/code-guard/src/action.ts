// Veyra Code Guard outside the editor: the GitHub Action (see action.yml), the command line and the git pre-commit hook.
//   GitHub Action:  reviews every pull request line by line, annotates, comments, writes a PDF report and SARIF.
//   Command line:   node cli.js [folder] [--staged] [--pdf report.pdf] [--sarif out.sarif] [--json] [--fail-on high]
import { appendFileSync, readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { addedLines, grade, scan, severityRank, summarize, SEVERITIES, type Finding, type Severity } from "./scanner";
import { buildReport } from "./report";
import { toSarif } from "./sarif";
import { VERSION } from "./version";

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "out", "bundle", "coverage", ".venv", "venv", "__pycache__", "target", ".gradle", ".idea", ".vscode-test"]);

interface FileResult { path: string; findings: Finding[]; added?: Set<number>; text: string }
interface Options {
  root: string; staged: boolean; pdf?: string; sarif?: string; json: boolean;
  failOn: Severity | "never"; minSeverity: Severity; ignore: (path: string) => boolean; disabled: string[];
  mode: string; review: boolean;
}

/** Glob-ish path filters: "docs/**", "*.md", "test/fixtures/**". */
export function matcher(patterns: string[]) {
  const res = patterns.map(p => p.trim()).filter(Boolean).map(p => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "__GLOBSTAR__").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/__GLOBSTAR__/g, ".*") + "$"));
  return (path: string) => res.some(r => r.test(path));
}

function walk(root: string, dir = root, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(root, full, out); }
    else if (st.size < 5_000_000) out.push(relative(root, full).replace(/\\/g, "/"));
  }
  return out;
}

function options(): Options {
  const args = process.argv.slice(2), flag = (name: string) => args.includes(`--${name}`);
  const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const input = (name: string, fallback = "") => (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim() || fallback;
  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && /^--(pdf|sarif|fail-on|min-severity|ignore|disable)$/.test(args[i - 1])))[0];
  return {
    root: resolve(process.env.GITHUB_WORKSPACE || positional || process.cwd()),
    staged: flag("staged"),
    pdf: value("pdf") || input("report-pdf") || undefined,
    sarif: value("sarif") || input("sarif") || undefined,
    json: flag("json"),
    failOn: (value("fail-on") || input("fail-on", "high")) as Severity | "never",
    minSeverity: (value("min-severity") || input("min-severity", "low")) as Severity,
    ignore: matcher([...(value("ignore") ?? "").split(","), ...input("ignore-paths").split(/[\n,]/)]),
    disabled: [...(value("disable") ?? "").split(","), ...input("disable-rules").split(/[\s,]+/)].filter(Boolean),
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
  if (!all.length) lines.push(`No signs of malicious code in ${scope}. \u2705`);
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

function terminal(results: FileResult[], scope: string, filesScanned: number) {
  const all = results.flatMap(r => r.findings), g = grade(all);
  console.log(`\n${paint("1;32", "Veyra Code Guard")}  ${scope}  ·  ${filesScanned} files`);
  for (const { path, findings } of results) for (const f of findings) {
    console.log(`\n  ${paint(SEV_COLOR[f.severity], f.severity.toUpperCase().padEnd(8))} ${paint("1", f.title)}  ${paint("2", `${path}:${f.line}:${f.column}`)}`);
    console.log(`           ${f.message}`);
    console.log(`           ${paint("32", "Fix:")} ${f.fix}`);
  }
  console.log(`\n  Grade ${paint("1", g.letter)} (${g.score}/100) · ${g.verdict}${all.length ? ` · ${all.length} finding${all.length === 1 ? "" : "s"}` : ""}\n`);
}

// ---------- Main ----------

export async function main() {
  const o = options();
  const event = process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const pr = process.env.GITHUB_ACTIONS ? event.pull_request?.number as number | undefined : undefined;
  const scanOpts = { minSeverity: o.minSeverity, disabled: o.disabled };

  const results: FileResult[] = [];
  let scope = "Whole repository", filesScanned = 0, linesScanned = 0;
  const check = (path: string, text: string, added?: Set<number>, onlyAdded = false) => {
    filesScanned++; linesScanned += text.split("\n").length;
    const findings = scan(text, path, { ...scanOpts, onlyLines: onlyAdded ? added : undefined });
    if (findings.length) results.push({ path, findings, added, text });
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

  const all = results.flatMap(r => r.findings);
  const failing = o.failOn !== "never" && all.some(f => severityRank(f.severity) >= severityRank(o.failOn as Severity));
  const project = repo ? repo.split("/").pop()! : basename(o.root);

  if (o.pdf) {
    const target = resolve(o.root, o.pdf);
    writeFileSync(target, buildReport({ project, scope, files: results, filesScanned, linesScanned, version: VERSION, repositoryUrl: repo ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}` : undefined }));
    if (!process.env.GITHUB_ACTIONS && !o.json) console.log(`Report saved: ${target}`);
  }
  if (o.sarif) writeFileSync(resolve(o.root, o.sarif), JSON.stringify(toSarif(results, VERSION), null, 2));

  if (process.env.GITHUB_ACTIONS) {
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
    console.log(JSON.stringify({ version: VERSION, scope, filesScanned, grade: grade(all), files: results.map(({ path, findings }) => ({ path, findings })) }, null, 2));
  } else {
    terminal(results, scope, filesScanned);
    if (failing && o.staged) console.log(`  ${paint("1;31", "Commit blocked.")} Fix the lines above, or mark a safe line with a "veyra-guard-ignore: <rule>" comment.\n  To skip the check once: git commit --no-verify\n`);
  }
  if (failing) process.exitCode = 1;
}

main().catch(e => { console.log(`${process.env.GITHUB_ACTIONS ? "::error::" : ""}Veyra Code Guard failed: ${(e as Error).message}`); process.exitCode = 1; });
