// The closed loop: score the panel, let the editor make targeted edits, score again, and
// iterate until the panel plateaus, nothing new is left to add, or the budget is hit. An edit
// is ACCEPTED only if it regresses no gating line-item (on any panel model) AND improves the
// panel mean — the gating veto — so the loop never ships a regression or keeps worse docs.
import { runPanel } from "../harness/panel.js";
import type { PanelConfig, PanelResult } from "../harness/panel.js";
import { proposeEdit } from "../editor/editor.js";
import type { EditorMode } from "../editor/editor.js";
import { LINE_ITEMS } from "../rubric/rubric.js";
import type { LineItemId } from "../rubric/rubric.js";

export interface OptimizeResult {
  mode: EditorMode;
  before: PanelResult;
  after: PanelResult;
  iterations: number;
  applied: LineItemId[];
  finalDocs: string;
  budget: { v0Lines: number; maxLines: number; finalLines: number; withinBudget: boolean };
  /** Set if an edit was rejected by the gating veto (a regression the loop refused to ship). */
  vetoed: boolean;
}

/** A gating line-item "passes" on the panel iff it passes on every panel model. */
function panelGatingPasses(r: PanelResult): Map<LineItemId, boolean> {
  const panels = r.perModel.filter((m) => m.role === "panel");
  const passes = new Map<LineItemId, boolean>();
  for (const spec of LINE_ITEMS) {
    if (spec.tier !== "gating") continue;
    passes.set(spec.id, panels.every((pm) => pm.scorecard.lineItems.find((li) => li.id === spec.id)?.passed === true));
  }
  return passes;
}

/** True if any gating item that passed the panel before now fails on some panel model. */
function regressesGating(prev: PanelResult, next: PanelResult): boolean {
  const before = panelGatingPasses(prev);
  const after = panelGatingPasses(next);
  for (const [id, passed] of before) if (passed && after.get(id) !== true) return true;
  return false;
}

export async function optimize(v0Docs: string, cfg: PanelConfig, mode: EditorMode, maxIters = 4): Promise<OptimizeResult> {
  const v0Lines = v0Docs.split("\n").length;
  const maxLines = Math.floor(v0Lines * 1.2);

  let docs = v0Docs;
  const before = await runPanel(docs, cfg);
  let current = before;
  const applied: LineItemId[] = [];
  let iterations = 0;
  let withinBudget = true;
  let vetoed = false;

  while (iterations < maxIters && current.panelFailing.length > 0) {
    const edit = proposeEdit(docs, current.panelFailing, mode, v0Docs);
    if (edit.added.length === 0) break; // nothing new the editor can add
    if (!edit.withinBudget) {
      withinBudget = false;
      break;
    }

    const next = await runPanel(edit.newDocs, cfg);

    // Gating veto: reject an edit that regresses any gating line-item, or that fails to improve
    // the panel mean. Rejected => keep the better `docs`/`current` (never ship the regression) and stop.
    if (regressesGating(current, next)) {
      vetoed = true;
      break;
    }
    if (next.panelMean <= current.panelMean + 1e-9) break; // plateau — keep the current (better/equal) docs

    docs = edit.newDocs;
    applied.push(...edit.added);
    iterations += 1;
    current = next;
  }

  return {
    mode,
    before,
    after: current,
    iterations,
    applied,
    finalDocs: docs,
    budget: { v0Lines, maxLines, finalLines: docs.split("\n").length, withinBudget },
    vetoed,
  };
}
