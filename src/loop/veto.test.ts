// Unit test for the gating-veto regression detector. The shipped append-only editor is
// monotonic in signals and can't make a passing gating item regress, so the veto can't fire in
// a normal run — this exercises `regressesGating` directly with synthetic panel results, so the
// guard is proven correct for the day a restructuring (real-model) editor is dropped in.
import { regressesGating } from "./optimize.js";
import type { ModelScore, PanelResult } from "../harness/panel.js";
import { LINE_ITEMS } from "../rubric/rubric.js";
import type { LineItemId } from "../rubric/rubric.js";

function model(role: "panel" | "holdout", overrides: Partial<Record<LineItemId, boolean>> = {}): ModelScore {
  const lineItems = LINE_ITEMS.map((s) => ({ id: s.id, passed: overrides[s.id] ?? true, reason: null as string | null }));
  return { providerId: "synthetic", role, runs: [1], mean: 1, spread: 0, scorecard: { rubricVersion: "v2", lineItems, rollUp: 1, fullPass: true } };
}
function panel(models: ModelScore[]): PanelResult {
  return { perModel: models, panelMean: 1, holdoutMean: 1, panelFailing: [] };
}

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) failures += 1;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}`);
}

// cof_correct_ref passes on both panel models, then fails on one → a gating regression.
check(
  "detects a gating regression on a panel model",
  regressesGating(panel([model("panel"), model("panel")]), panel([model("panel"), model("panel", { cof_correct_ref: false })])) === true,
);
check("no regression when nothing changed", regressesGating(panel([model("panel")]), panel([model("panel")])) === false);
// Only gating vetoes — an additive item regressing is fine.
check("ignores additive (graceful_410) regressions", regressesGating(panel([model("panel")]), panel([model("panel", { graceful_410: false })])) === false);
// A gating item already failing before didn't go pass→fail, so it's not a regression.
check("not a regression if the gating item was already failing", regressesGating(panel([model("panel", { boots: false })]), panel([model("panel", { boots: false })])) === false);
// Improvement (fail→pass) is the opposite of a regression.
check("improvement is not a regression", regressesGating(panel([model("panel", { cof_correct_ref: false })]), panel([model("panel")])) === false);
// Regressions on the HELD-OUT model must not veto — the veto only guards the optimization panel.
check("holdout regressions don't veto", regressesGating(panel([model("panel"), model("holdout")]), panel([model("panel"), model("holdout", { boots: false })])) === false);

console.log(failures === 0 ? "\ngating-veto guard verified ✔" : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
