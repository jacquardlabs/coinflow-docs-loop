// Runs a docs version across a panel of models + a held-out model, N runs each, and
// aggregates. The editor optimizes panelMean; holdoutMean is reported separately and must
// generalize. Variance across N is reported — ~0 for deterministic mocks, real for
// stochastic models. Also surfaces which line-items are failing across the panel: the
// editor's steering signal.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "../runner/registry.js";
import { buildTask } from "./task.js";
import { runAgent } from "./agent.js";
import { verify } from "../verifier/verify.js";
import { LINE_ITEMS } from "../rubric/rubric.js";
import type { LineItemId, Scorecard } from "../rubric/rubric.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "../..");
const tmpRoot = path.join(repo, "artifacts", "tmp");

export interface PanelConfig {
  panel: string[];
  holdout: string[];
  runsPerModel: number;
}
export interface ModelScore {
  providerId: string;
  role: "panel" | "holdout";
  runs: number[];
  mean: number;
  spread: number;
  scorecard: Scorecard;
}
export interface PanelResult {
  perModel: ModelScore[];
  panelMean: number;
  holdoutMean: number;
  /** Line-items failing on at least one PANEL model — what the editor targets next. */
  panelFailing: LineItemId[];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

async function scoreOnce(providerId: string, docs: string): Promise<Scorecard> {
  const provider = getProvider(providerId);
  const run = await runAgent(provider, buildTask(docs));
  const d = path.join(tmpRoot, `${providerId}__${randomUUID().slice(0, 8)}`);
  mkdirSync(d, { recursive: true });
  try {
    for (const [name, content] of Object.entries(run.files)) writeFileSync(path.join(d, name), content);
    const { scorecard } = await verify(d);
    return scorecard;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

export async function runPanel(docs: string, cfg: PanelConfig): Promise<PanelResult> {
  const perModel: ModelScore[] = [];
  const roles: Array<["panel" | "holdout", string[]]> = [
    ["panel", cfg.panel],
    ["holdout", cfg.holdout],
  ];
  for (const [role, ids] of roles) {
    for (const id of ids) {
      const cards: Scorecard[] = [];
      for (let i = 0; i < cfg.runsPerModel; i += 1) cards.push(await scoreOnce(id, docs));
      const runs = cards.map((c) => c.rollUp);
      perModel.push({
        providerId: id,
        role,
        runs,
        mean: Number(mean(runs).toFixed(4)),
        spread: Number(stdev(runs).toFixed(4)),
        scorecard: cards[cards.length - 1]!,
      });
    }
  }

  const failing = new Set<LineItemId>();
  for (const m of perModel.filter((m) => m.role === "panel")) {
    for (const li of m.scorecard.lineItems) if (!li.passed) failing.add(li.id);
  }

  return {
    perModel,
    panelMean: Number(mean(perModel.filter((m) => m.role === "panel").map((m) => m.mean)).toFixed(4)),
    holdoutMean: Number(mean(perModel.filter((m) => m.role === "holdout").map((m) => m.mean)).toFixed(4)),
    panelFailing: LINE_ITEMS.filter((s) => failing.has(s.id)).map((s) => s.id),
  };
}
