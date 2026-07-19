import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPanel } from "./panel.js";
import type { PanelConfig } from "./panel.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "../..");
const docsVersion = process.argv[2] ?? "za-guide.v0";
const runsPerModel = Number(process.argv[3] ?? 1);

// Default offline panel: two easier readers optimized on, the strict reader held out.
const cfg: PanelConfig = {
  panel: ["mock-lenient", "mock-careful"],
  holdout: ["mock-literal"],
  runsPerModel,
};

const docs = readFileSync(path.join(repo, "docs", `${docsVersion}.md`), "utf8");
const result = await runPanel(docs, cfg);

console.log(`\nPanel run: docs=${docsVersion}  N=${runsPerModel}`);
for (const m of result.perModel) {
  const runs = m.runs.map((r) => r.toFixed(2)).join(", ");
  console.log(`  ${m.role.padEnd(8)} ${m.providerId.padEnd(14)} mean=${m.mean.toFixed(3)} ±${m.spread.toFixed(3)}  [${runs}]`);
}
console.log(`  ----`);
console.log(`  panel mean   = ${result.panelMean}`);
console.log(`  holdout mean = ${result.holdoutMean}`);
process.exit(0);
