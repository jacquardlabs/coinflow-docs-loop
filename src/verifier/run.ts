import path from "node:path";
import { fileURLToPath } from "node:url";
import { verify } from "./verify.js";
import { LINE_ITEMS } from "../rubric/rubric.js";
import type { LineItemId } from "../rubric/rubric.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = process.argv[2] ?? "golden-good";
const fixtureDir = path.resolve(dir, "../../fixtures", fixture);

// Expected outcomes for the known golden fixtures, so `pnpm verify golden-*` is a real CI
// assertion (exit non-zero on mismatch), not just a report. Unknown fixtures (agent output)
// are reported only — there is no expected score for a run under optimization.
interface Expectation {
  fullPass: boolean;
  rollUp?: number;
  failing?: LineItemId[];
}
const EXPECT: Record<string, Expectation> = {
  "golden-good": { fullPass: true, rollUp: 1 },
  "golden-v0": { fullPass: true, rollUp: 0.7 },
  "golden-broken": { fullPass: false, failing: ["cof_correct_ref"] },
};

const { scorecard } = await verify(fixtureDir);

console.log(`\nFixture: ${fixture}   (rubric ${scorecard.rubricVersion})`);
for (const item of scorecard.lineItems) {
  const spec = LINE_ITEMS.find((s) => s.id === item.id);
  const reason = !item.passed && item.reason ? `  → ${item.reason}` : "";
  console.log(`  [${item.passed ? "PASS" : "FAIL"}] ${(spec?.tier ?? "").padEnd(8)} ${item.id.padEnd(22)}${reason}`);
}
console.log(`  roll-up = ${scorecard.rollUp}   full_pass = ${scorecard.fullPass}`);

const expect = EXPECT[fixture];
if (expect) {
  const problems: string[] = [];
  if (scorecard.fullPass !== expect.fullPass) problems.push(`full_pass ${scorecard.fullPass} != expected ${expect.fullPass}`);
  if (expect.rollUp !== undefined && Math.abs(scorecard.rollUp - expect.rollUp) > 1e-9) {
    problems.push(`roll-up ${scorecard.rollUp} != expected ${expect.rollUp}`);
  }
  for (const id of expect.failing ?? []) {
    if (scorecard.lineItems.find((li) => li.id === id)?.passed !== false) problems.push(`expected ${id} to fail`);
  }
  if (problems.length > 0) {
    console.log(`\nFAIL ${fixture} did not match expectations: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`\nOK ${fixture} matches expectations`);
}
process.exit(0);
