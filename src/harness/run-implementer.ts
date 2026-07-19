// One implementer run: give an agent ONLY the docs + task/contract, let it write the
// integration, capture everything, then score it with the verifier. Artifacts land under
// artifacts/runs/ so the produced repo, transcript, and scorecard are all inspectable.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "../runner/registry.js";
import { buildTask } from "./task.js";
import { runAgent } from "./agent.js";
import { verify } from "../verifier/verify.js";
import { LINE_ITEMS } from "../rubric/rubric.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "../..");
const providerId = process.argv[2] ?? "mock";
const docsVersion = process.argv[3] ?? "za-guide.v0";

const docs = readFileSync(path.join(repo, "docs", `${docsVersion}.md`), "utf8");
const provider = getProvider(providerId);
const task = buildTask(docs);

console.log(`Implementer run: provider=${provider.id}  docs=${docsVersion}`);
const run = await runAgent(provider, task);
console.log(`  steps=${run.steps}  stop=${run.stopReason}  tokens in/out=${run.usage.inputTokens}/${run.usage.outputTokens}`);
console.log(`  files written: ${Object.keys(run.files).join(", ") || "(none)"}`);

const runId = `${docsVersion}__${provider.id}__${randomUUID().slice(0, 8)}`;
const runDir = path.join(repo, "artifacts", "runs", runId);
const integrationDir = path.join(runDir, "integration");
mkdirSync(integrationDir, { recursive: true });
for (const [name, content] of Object.entries(run.files)) writeFileSync(path.join(integrationDir, name), content);
writeFileSync(path.join(runDir, "transcript.json"), JSON.stringify(run.transcript, null, 2));
writeFileSync(path.join(runDir, "capture.json"), JSON.stringify({ provider: provider.id, docsVersion, steps: run.steps, stopReason: run.stopReason, usage: run.usage }, null, 2));

const { scorecard } = await verify(integrationDir);
writeFileSync(path.join(runDir, "scorecard.json"), JSON.stringify(scorecard, null, 2));

console.log(`\nScorecard (rubric ${scorecard.rubricVersion}):`);
for (const item of scorecard.lineItems) {
  const spec = LINE_ITEMS.find((s) => s.id === item.id);
  const reason = !item.passed && item.reason ? `  → ${item.reason}` : "";
  console.log(`  [${item.passed ? "PASS" : "FAIL"}] ${(spec?.tier ?? "").padEnd(8)} ${item.id.padEnd(22)}${reason}`);
}
console.log(`  roll-up = ${scorecard.rollUp}   full_pass = ${scorecard.fullPass}`);
console.log(`\nArtifacts: ${path.relative(repo, runDir)}`);
process.exit(0);
