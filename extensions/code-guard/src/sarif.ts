// SARIF 2.1.0 output, so findings show up in GitHub's Security tab (code scanning) and other SARIF tools.
import { ruleList, type Finding, type Severity } from "./scanner";

const LEVEL: Record<Severity, string> = { critical: "error", high: "error", medium: "warning", low: "note" };
// GitHub shows "security-severity" as Critical (9+), High (7+), Medium (4+) or Low.
const SCORE: Record<Severity, string> = { critical: "9.5", high: "8.0", medium: "5.5", low: "3.0" };

export function toSarif(files: Array<{ path: string; findings: Finding[] }>, version: string) {
  const rules = ruleList();
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "Veyra Code Guard", version, semanticVersion: version, informationUri: "https://veyraeditor.com/code-guard",
          rules: rules.map(r => ({
            id: r.id, name: r.id.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()),
            shortDescription: { text: r.title }, fullDescription: { text: r.why },
            help: { text: `${r.why}\n\nHow to fix: ${r.fix}`, markdown: `${r.why}\n\n**How to fix:** ${r.fix}` },
            defaultConfiguration: { level: LEVEL[r.severity] },
            properties: { tags: ["security", "malicious-code"], "security-severity": SCORE[r.severity], precision: "high" },
          })),
        },
      },
      results: files.flatMap(({ path, findings }) => findings.map(f => ({
        ruleId: f.rule, ruleIndex: rules.findIndex(r => r.id === f.rule), level: LEVEL[f.severity],
        message: { text: `${f.message} ${f.fix}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: path.replace(/\\/g, "/") }, region: { startLine: f.line, startColumn: f.column, endColumn: f.endColumn } } }],
        partialFingerprints: { "veyraGuard/v1": `${f.rule}:${path}:${f.snippet.slice(0, 80)}` },
      }))),
    }],
  };
}
