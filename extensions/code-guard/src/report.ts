// The Veyra Code Guard security report as a PDF: cover with grade and summary, every finding with its code, why it
// matters and how to fix it, and the rules that were checked.
import { PdfDocument, Page, wrap, textWidth, type RGB } from "./pdf";
import { grade, ruleList, SEVERITIES, severityRank, visible, type Finding, type Severity } from "./scanner";

export interface ReportFile { path: string; findings: Finding[]; text?: string }
export interface ReportInput {
  project: string;
  scope: string;              // "Whole workspace", "Pull request #7", "Staged changes"
  files: ReportFile[];        // files with findings (text used for code excerpts)
  filesScanned: number;
  linesScanned: number;
  version: string;
  generatedAt?: Date;
  repositoryUrl?: string;
}

const C = {
  night: "#0b1214", night2: "#111c1f", emerald: "#10b981", mint: "#34d399", deep: "#047857",
  ink: "#17232a", body: "#3b4a50", muted: "#6b7a80", faint: "#9aa8ad", line: "#e2e8e6", wash: "#f5f8f7", white: "#ffffff",
};
export const SEVERITY_COLOR: Record<Severity, RGB> = { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#2563eb" };
const SEVERITY_TINT: Record<Severity, RGB> = { critical: "#fde8e8", high: "#feeedf", medium: "#fdf5d9", low: "#e3ecfd" };
const GRADE_COLOR: Record<string, RGB> = { A: "#10b981", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626" };

const W = 595.28, H = 841.89, M = 48, CONTENT = W - M * 2, BOTTOM = H - 64;

function shield(p: Page, x: number, y: number, s: number, color: RGB) {
  // The Code Guard shield: same shape as the extension icon, scaled to s points tall.
  const k = s / 168, pt = (px: number, py: number): [number, number] => [x + (px - 62) * k, y + (py - 46) * k];
  p.polygon([pt(128, 46), pt(194, 70), pt(194, 126), pt(184, 160), pt(160, 190), pt(128, 212), pt(96, 190), pt(72, 160), pt(62, 126), pt(62, 70)], { stroke: color, lineWidth: 2.4 * k * 5, round: true });
  p.rect(x + 34 * k, y + 52 * k, 64 * k, 13 * k, { fill: "#8b9096", radius: 6.5 * k });
  p.rect(x + 34 * k, y + 78 * k, 46 * k, 13 * k, { fill: "#ff6b6b", radius: 6.5 * k });
  p.circle(x + 95 * k, y + 84.5 * k, 6.5 * k, { fill: "#ff6b6b" });
  p.rect(x + 34 * k, y + 104 * k, 54 * k, 13 * k, { fill: "#8b9096", radius: 6.5 * k });
}

function pill(p: Page, x: number, y: number, s: Severity) {
  const label = s.toUpperCase(), w = textWidth(label, "bold", 7.5) + 0.6 * (label.length - 1) + 14;
  p.rect(x, y, w, 15, { fill: SEVERITY_COLOR[s], radius: 7.5 });
  p.text(x + 7, y + 10.6, label, { font: "bold", size: 7.5, color: C.white, spacing: 0.6 });
  return w;
}

const fmtDate = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function buildReport(input: ReportInput): Buffer {
  const all = input.files.flatMap(f => f.findings.map(x => ({ ...x, path: f.path })));
  const g = grade(all);
  const doc = new PdfDocument({ title: `Security Code Review: ${input.project}`, author: "Veyra Code Guard", subject: `${g.letter} (${g.score}/100), ${all.length} findings`, keywords: "security, code review, malicious code, Veyra Code Guard" });
  const when = input.generatedAt ?? new Date();

  // ---------- Cover ----------
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
  for (const line of wrap(input.project, "bold", 18, CONTENT).slice(0, 2)) { cover.text(M, y + 18, line, { font: "bold", size: 18, color: C.mint }); y += 24; }
  cover.paragraph(M, y + 8, CONTENT - 40, "An automated line-by-line review for trojans, backdoors, hidden characters, leaked secrets and supply-chain attacks.", { size: 10.5, color: "#b8c6c2" });

  // Grade card, overlapping the band.
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
  // Severity counters
  const boxX = M + 300, boxW = (CONTENT - 300 - 18) / 2;
  SEVERITIES.forEach((s, i) => {
    const bx = boxX + (i % 2) * (boxW + 8), by = cardY + 20 + Math.floor(i / 2) * 58;
    cover.rect(bx, by, boxW, 50, { fill: g.counts[s] ? SEVERITY_TINT[s] : C.wash, radius: 8 });
    cover.rect(bx, by + 10, 3, 30, { fill: SEVERITY_COLOR[s], radius: 1.5 });
    cover.text(bx + 14, by + 31, `${g.counts[s]}`, { font: "bold", size: 20, color: g.counts[s] ? SEVERITY_COLOR[s] : C.faint });
    cover.text(bx + 14, by + 43, s[0].toUpperCase() + s.slice(1), { size: 8, color: C.muted });
  });

  // At a glance
  y = cardY + cardH + 36;
  cover.text(M, y, "AT A GLANCE", { font: "bold", size: 8, color: C.emerald, spacing: 1.2 });
  y += 14;
  const stats: Array<[string, string]> = [[input.filesScanned.toLocaleString("en-US"), "files checked"], [input.linesScanned.toLocaleString("en-US"), "lines read"], [`${ruleList().length}`, "rules applied"], [`${all.length}`, all.length === 1 ? "finding" : "findings"]];
  stats.forEach(([n, l], i) => {
    const sx = M + i * (CONTENT / 4);
    cover.text(sx, y + 24, n, { font: "bold", size: 20, color: C.ink });
    cover.text(sx, y + 38, l, { size: 9, color: C.muted });
    if (i) cover.line(sx - 12, y + 6, sx - 12, y + 40, { stroke: C.line });
  });

  // Top risks
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
    if (ranked.length > 6) cover.text(M, y + 8, `…and ${ranked.length - 6} more, detailed on the following pages.`, { size: 9, color: C.muted });
  }

  // ---------- Findings ----------
  let page: Page | undefined;
  const newPage = (title: string) => {
    page = doc.addPage();
    page.rect(0, 0, W, 6, { fill: C.emerald });
    page.text(M, 46, title, { font: "bold", size: 18, color: C.ink });
    return 66;
  };
  if (ranked.length) {
    y = newPage("Findings");
    y = page!.paragraph(M, y, CONTENT, `Each finding shows where it is, the code around it, why it matters and how to fix it. Findings are ordered by severity.`, { size: 9.5, color: C.muted }) + 10;
    for (const f of ranked) {
      const file = input.files.find(x => x.path === f.path);
      const excerpt = excerptLines(file?.text, f.line);
      const what = wrap(f.message, "regular", 9.5, CONTENT - 120), why = wrap(f.why, "regular", 9.5, CONTENT - 120), fix = wrap(f.fix, "regular", 9.5, CONTENT - 120);
      const height = 44 + (excerpt.length ? excerpt.length * 12 + 16 : 0) + (what.length + why.length + fix.length) * 13.5 + 30;
      if (y + height > BOTTOM) y = newPage("Findings (continued)");
      const p = page!;
      p.line(M, y, W - M, y, { stroke: C.line });
      y += 14;
      const pw = pill(p, M, y, f.severity);
      p.text(M + pw + 8, y + 11, truncateTo(f.title, "bold", 11.5, CONTENT - pw - 90), { font: "bold", size: 11.5, color: C.ink });
      p.text(W - M, y + 11, f.rule, { font: "mono", size: 7.5, color: C.faint, align: "right" });
      y += 22;
      p.text(M, y + 8, truncateTo(`${f.path}  line ${f.line}, column ${f.column}`, "mono", 8.5, CONTENT), { font: "mono", size: 8.5, color: C.muted });
      y += 16;
      if (excerpt.length) {
        const boxH = excerpt.length * 12 + 10;
        p.rect(M, y, CONTENT, boxH, { fill: C.wash, stroke: C.line, lineWidth: 0.6, radius: 6 });
        excerpt.forEach((row, i) => {
          const ry = y + 5 + i * 12;
          if (row.n === f.line) { p.rect(M + 1, ry, CONTENT - 2, 12, { fill: SEVERITY_TINT[f.severity] }); p.rect(M + 1, ry, 2.5, 12, { fill: SEVERITY_COLOR[f.severity] }); }
          p.text(M + 30, ry + 9, String(row.n), { font: "mono", size: 7.5, color: C.faint, align: "right" });
          p.text(M + 38, ry + 9, truncateTo(row.text, "mono", 8, CONTENT - 46), { font: row.n === f.line ? "monoBold" : "mono", size: 8, color: row.n === f.line ? C.ink : C.body });
        });
        y += boxH + 8;
      }
      const block = (label: string, lines: string[], color: RGB, bar?: RGB) => {
        if (bar) p.rect(M, y + 2, 2.5, lines.length * 13.5 - 2, { fill: bar, radius: 1 });
        p.text(M + (bar ? 10 : 0), y + 10, label, { font: "bold", size: 8, color, spacing: 0.4 });
        lines.forEach((l, i) => p.text(M + 112, y + 10 + i * 13.5, l, { size: 9.5, color: C.body }));
        y += lines.length * 13.5 + 3;
      };
      block("WHAT WE FOUND", what, C.ink);
      block("WHY IT MATTERS", why, C.ink);
      block("HOW TO FIX", fix, C.deep, C.emerald);
      y += 8;
    }
  }

  // ---------- Method and rules ----------
  y = newPage("How this review works");
  const p = page!;
  y = p.paragraph(M, y, CONTENT, `Veyra Code Guard ${input.version} read every line of ${input.filesScanned.toLocaleString("en-US")} files (${input.linesScanned.toLocaleString("en-US")} lines) in ${/^whole /i.test(input.scope) ? `the ${input.scope.toLowerCase()}` : /^staged/i.test(input.scope) ? `the ${input.scope.toLowerCase()}` : input.scope.toLowerCase()} and checked them against the ${ruleList().length} rules below. Build output, dependencies (node_modules) and virtual environments are skipped. Lines marked as reviewed with a veyra-guard-ignore comment are not reported.`, { size: 9.5, color: C.body }) + 6;
  y = p.paragraph(M, y, CONTENT, "The grade starts at 100 and loses 30 points per critical, 12 per high, 4 per medium and 1 per low finding. Any critical finding limits the grade to D.", { size: 9.5, color: C.body }) + 14;
  p.rect(M, y, CONTENT, 20, { fill: C.night, radius: 5 });
  p.text(M + 10, y + 13.5, "SEVERITY", { font: "bold", size: 7.5, color: C.mint, spacing: 0.8 });
  p.text(M + 90, y + 13.5, "RULE", { font: "bold", size: 7.5, color: C.mint, spacing: 0.8 });
  p.text(M + 230, y + 13.5, "WHAT IT LOOKS FOR", { font: "bold", size: 7.5, color: C.mint, spacing: 0.8 });
  y += 24;
  const rules = [...ruleList()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id));
  rules.forEach((r, i) => {
    if (y + 16 > BOTTOM - 70) { y = newPage("Rules (continued)"); }
    const pg = page!;
    if (i % 2) pg.rect(M, y - 2, CONTENT, 16, { fill: C.wash, radius: 3 });
    pg.circle(M + 14, y + 6, 3, { fill: SEVERITY_COLOR[r.severity] });
    pg.text(M + 22, y + 9, r.severity, { size: 8.5, color: C.body });
    pg.text(M + 90, y + 9, r.id, { font: "mono", size: 8, color: C.ink });
    pg.text(M + 230, y + 9, truncateTo(r.title, "regular", 8.5, CONTENT - 236), { size: 8.5, color: C.body });
    y += 16;
  });
  const last = page!;
  y += 14;
  last.rect(M, y, CONTENT, 62, { fill: C.wash, radius: 8 });
  last.paragraph(M + 14, y + 10, CONTENT - 28, "Code Guard recognises the patterns attackers use; it does not run your code. It catches the common and the sneaky, but a determined attacker can write code it won't recognise. Use this report alongside careful review, dependency audits and least-privilege access.", { size: 8.5, color: C.muted, leading: 12 });

  // ---------- Footers ----------
  doc.pages.forEach((pg, i) => {
    const dark = i === 0;
    pg.line(M, H - 40, W - M, H - 40, { stroke: dark ? C.line : C.line, lineWidth: 0.6 });
    pg.text(M, H - 26, `Veyra Code Guard · ${truncateTo(input.project, "regular", 8, 260)} · Grade ${g.letter} (${g.score}/100)`, { size: 8, color: C.muted });
    pg.text(W - M, H - 26, `Page ${i + 1} of ${doc.pages.length}`, { size: 8, color: C.muted, align: "right" });
  });
  if (input.repositoryUrl) cover.link(M, 150, 300, 40, input.repositoryUrl);
  return doc.toBuffer();
}

function truncateTo(text: string, font: "regular" | "bold" | "mono" | "monoBold", size: number, width: number) {
  const t = visible(text);
  if (textWidth(t, font, size) <= width) return t;
  let cut = t.length;
  while (cut > 1 && textWidth(t.slice(0, cut) + "…", font, size) > width) cut--;
  return t.slice(0, cut) + "…";
}

/** Two lines either side of the finding, made visible, with their line numbers. */
function excerptLines(text: string | undefined, line: number) {
  if (!text) return [];
  const lines = text.split(/\r\n|\r|\n/);
  const out: Array<{ n: number; text: string }> = [];
  for (let n = Math.max(1, line - 2); n <= Math.min(lines.length, line + 2); n++) out.push({ n, text: visible(lines[n - 1]).replace(/\t/g, "  ") });
  // Drop blank lines at the edges, but never the finding's own line.
  while (out.length > 1 && out[0].n !== line && !out[0].text.trim()) out.shift();
  while (out.length > 1 && out[out.length - 1].n !== line && !out[out.length - 1].text.trim()) out.pop();
  return out;
}
