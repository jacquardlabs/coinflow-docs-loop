import path from "node:path";
import { fileURLToPath } from "node:url";
import { verify } from "./verify.js";
import { LINE_ITEMS } from "../rubric/rubric.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = process.argv[2] ?? "golden-good";
const fixtureDir = path.resolve(dir, "../../fixtures", fixture);

const { scorecard } = await verify(fixtureDir);

console.log(`\nFixture: ${fixture}   (rubric ${scorecard.rubricVersion})`);
for (const item of scorecard.lineItems) {
  const spec = LINE_ITEMS.find((s) => s.id === item.id);
  const tier = (spec?.tier ?? "").padEnd(8);
  const reason = !item.passed && item.reason ? `  → ${item.reason}` : "";
  console.log(`  [${item.passed ? "PASS" : "FAIL"}] ${tier} ${item.id.padEnd(22)} w=${spec?.weight}${reason}`);
}
console.log(`  roll-up = ${scorecard.rollUp}   full_pass = ${scorecard.fullPass}`);
process.exit(0);
