// `make eval`: run the full panel → edit → panel loop and drop before/after scorecards,
// the edited doc, the diff, and a summary into artifacts/eval/<mode>/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "./optimize.js";
import type { EditorMode } from "../editor/editor.js";
import type { PanelConfig } from "../harness/panel.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "../..");
const mode = (process.argv[2] as EditorMode) ?? "thorough";
const docsVersion = process.argv[3] ?? "za-guide.v0";
const runsPerModel = Number(process.argv[4] ?? 1);

const cfg: PanelConfig = {
  panel: ["mock-lenient", "mock-careful"],
  holdout: ["mock-literal"],
  runsPerModel,
};

const v0Docs = readFileSync(path.join(repo, "docs", `${docsVersion}.md`), "utf8");
const result = await optimize(v0Docs, cfg, mode);

const outDir = path.join(repo, "artifacts", "eval", mode);
mkdirSync(outDir, { recursive: true });

const appended = result.finalDocs.slice(v0Docs.length);
const diff = appended
  .split("\n")
  .map((l) => `+ ${l}`)
  .join("\n");

const fmt = (n: number): string => n.toFixed(2);
const summary: string[] = [
  `# Eval before/after — mode=${result.mode}, rubric ${result.before.perModel[0]?.scorecard.rubricVersion ?? "?"}`,
  "",
  "| model | role | before | after |",
  "|---|---|---|---|",
];
for (let i = 0; i < result.before.perModel.length; i += 1) {
  const b = result.before.perModel[i]!;
  const a = result.after.perModel[i]!;
  summary.push(`| ${b.providerId} | ${b.role} | ${fmt(b.mean)} | ${fmt(a.mean)} |`);
}
summary.push(
  "",
  `- **panel mean:** ${fmt(result.before.panelMean)} → ${fmt(result.after.panelMean)}`,
  `- **holdout mean:** ${fmt(result.before.holdoutMean)} → ${fmt(result.after.holdoutMean)}`,
  `- iterations: ${result.iterations}`,
  `- edits applied: ${result.applied.join(", ") || "(none)"}`,
  `- doc length: ${result.budget.v0Lines} → ${result.budget.finalLines} lines (budget ≤ ${result.budget.maxLines}, within: ${result.budget.withinBudget ? "yes" : "NO"})`,
  "",
);

writeFileSync(path.join(outDir, "before.json"), JSON.stringify(result.before, null, 2));
writeFileSync(path.join(outDir, "after.json"), JSON.stringify(result.after, null, 2));
writeFileSync(path.join(outDir, `${docsVersion}.after.md`), result.finalDocs);
writeFileSync(path.join(outDir, "diff.txt"), diff);
writeFileSync(path.join(outDir, "summary.md"), summary.join("\n"));

console.log(summary.join("\n"));
console.log(`Artifacts: ${path.relative(repo, outDir)}`);
process.exit(0);
