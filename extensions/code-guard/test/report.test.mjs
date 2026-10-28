// veyra-guard-ignore-file: builds reports from sample attacks on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const g = require("../out/scanner.js");
const { buildReport } = require("../out/report.js");
const { PdfDocument, wrap, textWidth } = require("../out/pdf.js");
const { toSarif } = require("../out/sarif.js");

const j = (...parts) => parts.join("");

/** Checks a PDF's structure and returns its pages' decoded text. */
function readPdf(buf) {
  const text = buf.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"), "PDF header");
  assert.ok(text.trimEnd().endsWith("%%EOF"), "PDF trailer");
  const startxref = Number(/startxref\s+(\d+)/.exec(text)[1]);
  assert.ok(text.slice(startxref).startsWith("xref"), "startxref points at the cross-reference table");
  const xref = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text);
  const offsets = xref[2].trim().split("\n").slice(1).map(l => Number(l.slice(0, 10)));
  assert.equal(offsets.length, Number(xref[1]) - 1);
  offsets.forEach((o, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} is where the table says`));
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)[1]);
  // Inflate every content stream and decode the hex strings drawn with Tj.
  const decoded = [];
  const re = /\/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].length, data = buf.subarray(start, start + Number(m[1]));
    const ops = inflateSync(data).toString("latin1");
    decoded.push([...ops.matchAll(/<([0-9a-f]*)> Tj/g)].map(x => Buffer.from(x[1], "hex").toString("latin1")).join(" | "));
  }
  assert.equal(decoded.length, pages, "one content stream per page");
  return { pages, text: decoded };
}

const sample = () => {
  const files = {
    "src/update.js": ["function check() {", j("  ev", "al(at", "ob(process.env.PAYLOAD));"), "}"].join("\n"),
    "package.json": JSON.stringify({ name: "demo", version: "1.0.0", dependencies: { expres: "^4.18.2" } }, null, 2),
  };
  return Object.entries(files).map(([path, text]) => ({ path, text, findings: g.scan(text, path) })).filter(f => f.findings.length);
};

test("the security report is a valid PDF with cover, findings and rules", () => {
  const files = sample();
  const pdf = buildReport({ project: "demo-app", scope: "Whole workspace", files, filesScanned: 12, linesScanned: 340, version: "1.1.0", generatedAt: new Date("2026-10-27T10:00:00Z") });
  const { pages, text } = readPdf(pdf);
  assert.ok(pages >= 3, `${pages} pages`);
  const cover = text[0];
  assert.match(cover, /Security Code Review/);
  assert.match(cover, /demo-app/);
  assert.match(cover, /\| D \|/, "grade D (one critical finding)");
  assert.match(cover, /TOP RISKS/);
  const body = text.slice(1).join(" ");
  assert.match(body, /Running decoded or obfuscated code/);
  assert.match(body, /HOW TO FIX/);
  assert.match(body, /"expres" is one letter away from the popular package "express"/);
  assert.match(body, /eval\(atob\(process\.env\.PAYLOAD\)\);/, "the code excerpt is included");
  const rulesPages = text.slice(text.findIndex(t => /How this review works/.test(t))).join(" ");
  for (const r of g.ruleList()) assert.ok(rulesPages.includes(r.id), `the rules table lists ${r.id}`);
  assert.match(text.at(-1), new RegExp(`Page ${pages} of ${pages}`));
});

test("a clean project gets an A and a short report", () => {
  const { pages, text } = readPdf(buildReport({ project: "clean", scope: "Whole workspace", files: [], filesScanned: 50, linesScanned: 4000, version: "1.1.0" }));
  assert.ok(pages <= 3, `${pages} pages`);
  assert.match(text[0], /\| A \|/);
  assert.match(text[0], /No signs of malicious code were found\./);
});

test("many findings flow onto more pages without overlapping the footer", () => {
  const text = Array.from({ length: 60 }, (_, i) => j("fetch('http://203.0.", "113.", String(i + 1), "/x')")).join("\n");
  const files = [{ path: "src/net.js", text, findings: g.scan(text, "src/net.js") }];
  assert.equal(files[0].findings.length, 60);
  const { pages } = readPdf(buildReport({ project: "busy", scope: "Whole workspace", files, filesScanned: 1, linesScanned: 60, version: "1.1.0" }));
  assert.ok(pages > 10, `${pages} pages`);
});

test("text that the standard fonts can't show is replaced, never breaks the file", () => {
  const doc = new PdfDocument({ title: "t" });
  doc.addPage().text(10, 10, "Café → 日本 \u{1f600} (brackets) \\ back…");
  const { text } = readPdf(doc.toBuffer());
  assert.match(text[0], /Caf\? -> \?\? \?\? \(brackets\) \\ back/);
});

test("wrapping measures real font widths", () => {
  assert.equal(textWidth("iiii", "regular", 10), 8.88);
  assert.ok(textWidth("WWWW", "bold", 10) > textWidth("iiii", "bold", 10) * 3);
  assert.equal(textWidth("abcd", "mono", 10), 24);
  for (const line of wrap("The quick brown fox jumps over the lazy dog ".repeat(10), "regular", 10, 200)) assert.ok(textWidth(line, "regular", 10) <= 200);
  assert.deepEqual(wrap("a".repeat(50), "mono", 10, 60).map(l => l.length), [10, 10, 10, 10, 10], "long words are split");
});

test("SARIF output for GitHub code scanning", () => {
  const sarif = toSarif(sample(), "1.1.0");
  assert.equal(sarif.version, "2.1.0");
  const run = sarif.runs[0];
  assert.equal(run.tool.driver.name, "Veyra Code Guard");
  assert.equal(run.tool.driver.rules.length, g.ruleList().length);
  const result = run.results.find(r => r.ruleId === "eval-decoded");
  assert.equal(result.level, "error");
  assert.deepEqual(result.locations[0].physicalLocation.region, { startLine: 2, startColumn: 3, endColumn: result.locations[0].physicalLocation.region.endColumn });
  assert.equal(run.tool.driver.rules[result.ruleIndex].id, "eval-decoded");
  assert.equal(run.tool.driver.rules[result.ruleIndex].properties["security-severity"], "9.5");
});
