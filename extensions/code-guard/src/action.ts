// Veyra Code Guard for GitHub: reviews every pull request line by line and flags malicious code.
// Runs as a GitHub Action (see action.yml), or locally: node action/index.js [folder]
import { appendFileSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { addedLines, scan, severityRank, summarize, SEVERITIES, type Finding, type Severity } from "./scanner";

const input = (name: string, fallback = "") => (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim() || fallback;
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "out", "bundle", "coverage", ".venv", "venv", "__pycache__", "target", ".gradle", ".idea", ".vscode-test"]);

interface FileResult { path: string; findings: Finding[]; added?: Set<number> }

/** Glob-ish path filters: "docs/**", "*.md", "test/fixtures/**". */
function matcher(patterns: string[]) {
  const res = patterns.filter(Boolean).map(p => new RegExp("^" + p.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*") + "$"));
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

async function github(path: string, init: RequestInit = {}) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const token = input("github-token") || process.env.GITHUB_TOKEN || "";
  const res = await fetch(api + path, { ...init, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "veyra-code-guard", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text().then(t => t.slice(0, 200))}`);
  return res.status === 204 ? null : res.json();
}

/** Changed files of the pull request with the lines it adds. */
async function pullRequestFiles(repo: string, number: number) {
  const files: Array<{ path: string; added: Set<number>; status: string }> = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await github(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`) as Array<{ filename: string; status: string; patch?: string }>;
    for (const f of batch) if (f.status !== "removed") files.push({ path: f.filename, added: f.patch ? addedLines(f.patch) : new Set(), status: f.status });
    if (batch.length < 100) break;
  }
  return files;
}

const escapeData = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProp = (s: string) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
const LEVEL: Record<Severity, string> = { critical: "error", high: "error", medium: "warning", low: "notice" };
const ICON: Record<Severity, string> = { critical: "🛑", high: "🔴", medium: "🟠", low: "🔵" };

function annotate(results: FileResult[]) {
  for (const { path, findings } of results) for (const f of findings)
    console.log(`::${LEVEL[f.severity]} file=${escapeProp(path)},line=${f.line},col=${f.column},endColumn=${f.endColumn},title=${escapeProp(`Veyra Code Guard · ${f.severity.toUpperCase()} · ${f.title}`)}::${escapeData(`${f.message}\n${f.why}`)}`);
}

function report(results: FileResult[], scope: string) {
  const all = results.flatMap(r => r.findings), c = summarize(all);
  const lines = [`## 🛡️ Veyra Code Guard`, ""];
  if (!all.length) lines.push(`No signs of malicious code in ${scope}. ✅`);
  else {
    lines.push(`Found **${all.length}** suspicious line${all.length === 1 ? "" : "s"} in ${scope}: ${SEVERITIES.filter(s => c[s]).map(s => `${ICON[s]} ${c[s]} ${s}`).join(" · ")}`, "");
    lines.push("| Severity | Where | What |", "|---|---|---|");
    for (const { path, findings } of results) for (const f of findings) lines.push(`| ${ICON[f.severity]} ${f.severity} | \`${path}:${f.line}\` | **${f.title}**: ${f.message.replace(/\|/g, "\\|")} |`);
    lines.push("", "Each line is marked in **Files changed**. To accept a line that is safe, add a comment `veyra-guard-ignore: <rule>` on it or the line above.");
  }
  return lines.join("\n");
}

async function postReview(repo: string, number: number, results: FileResult[], body: string, failing: boolean) {
  // GitHub only accepts comments on lines that are part of the diff.
  const comments = results.flatMap(({ path, findings, added }) => findings.filter(f => !added || added.has(f.line)).map(f => ({ path, line: f.line, side: "RIGHT", body: `${ICON[f.severity]} **${f.title}** (${f.severity})\n\n${f.message}\n\n${f.why}\n\n<sub>Veyra Code Guard · rule \`${f.rule}\` · add \`veyra-guard-ignore: ${f.rule}\` to accept</sub>` }))).slice(0, 50);
  await github(`/repos/${repo}/pulls/${number}/reviews`, { method: "POST", body: JSON.stringify({ event: failing ? "REQUEST_CHANGES" : "COMMENT", body, comments }) });
}

async function main() {
  const root = process.env.GITHUB_WORKSPACE || process.argv[2] || process.cwd();
  const minSeverity = (input("min-severity", "low") as Severity);
  const failOn = input("fail-on", "high") as Severity | "never";
  const ignore = matcher(input("ignore-paths").split(/[\n,]/));
  const disabled = input("disable-rules").split(/[\s,]+/).filter(Boolean);
  const mode = input("scan", "changed-lines"); // changed-lines | changed-files | all
  const event = process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const pr = event.pull_request?.number as number | undefined;

  const results: FileResult[] = [];
  let scope = "the repository";
  if (pr && mode !== "all") {
    scope = `pull request #${pr}`;
    for (const f of await pullRequestFiles(repo, pr)) {
      if (ignore(f.path)) continue;
      const full = join(root, f.path);
      if (!existsSync(full)) continue;
      const findings = scan(readFileSync(full, "utf8"), f.path, { minSeverity, disabled, onlyLines: mode === "changed-lines" ? f.added : undefined });
      if (findings.length) results.push({ path: f.path, findings, added: f.added });
    }
  } else {
    for (const path of walk(root)) {
      if (ignore(path)) continue;
      let text; try { text = readFileSync(join(root, path), "utf8"); } catch { continue; }
      const findings = scan(text, path, { minSeverity, disabled });
      if (findings.length) results.push({ path, findings });
    }
  }

  const all = results.flatMap(r => r.findings);
  const failing = failOn !== "never" && all.some(f => severityRank(f.severity) >= severityRank(failOn));
  const body = report(results, scope);
  if (process.env.GITHUB_ACTIONS) {
    annotate(results);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `findings=${all.length}\ncritical=${summarize(all).critical}\n`);
    if (pr && input("review", "true") === "true" && all.length) {
      // Pull requests from forks get a read-only token: the annotations above still mark every line.
      try { await postReview(repo, pr, results, body, failing); } catch (e) { console.log(`::notice::Couldn't post a review comment (${(e as Error).message.split(":")[0]}). Findings are shown as annotations instead.`); }
    }
  } else {
    console.log(body);
  }
  if (failing) { console.log(`::error::Veyra Code Guard found ${all.length} suspicious line(s) at or above "${failOn}".`); process.exitCode = 1; }
}

main().catch(e => { console.log(`::error::Veyra Code Guard failed: ${(e as Error).message}`); process.exitCode = 1; });
