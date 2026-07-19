// The closed loop: score the panel, let the editor make targeted edits to the docs, score
// again, and iterate until the panel plateaus, nothing new is left to add, or the budget
// is hit. The holdout is scored throughout but never optimized — it only ever tells us
// whether the improvement generalized.
import { runPanel } from "../harness/panel.js";
import type { PanelConfig, PanelResult } from "../harness/panel.js";
import { proposeEdit } from "../editor/editor.js";
import type { EditorMode } from "../editor/editor.js";
import type { LineItemId } from "../rubric/rubric.js";

export interface OptimizeResult {
  mode: EditorMode;
  before: PanelResult;
  after: PanelResult;
  iterations: number;
  applied: LineItemId[];
  finalDocs: string;
  budget: { v0Lines: number; maxLines: number; finalLines: number; withinBudget: boolean };
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

  while (iterations < maxIters && current.panelFailing.length > 0) {
    const edit = proposeEdit(docs, current.panelFailing, mode, v0Docs);
    if (edit.added.length === 0) break; // nothing new the editor can add
    if (!edit.withinBudget) {
      withinBudget = false;
      break;
    }
    docs = edit.newDocs;
    applied.push(...edit.added);
    iterations += 1;

    const next = await runPanel(docs, cfg);
    if (next.panelMean <= current.panelMean + 1e-9) {
      current = next; // no improvement — plateau
      break;
    }
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
  };
}
