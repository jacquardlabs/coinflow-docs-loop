// The metric, as code. A registry of line-items — adding a failure mode is one entry
// here, not a scorer rewrite (same posture as adding a model). The roll-up is the
// gradient the editor optimizes; the gating veto + full_pass are the correctness gate.

export type LineItemId =
  | "boots"
  | "za_renders"
  | "onsuccess_payment_id"
  | "cof_correct_ref"
  | "graceful_410"
  | "cof_auth"
  | "device_id";

export type Tier = "gating" | "additive";

export interface LineItemSpec {
  id: LineItemId;
  tier: Tier;
  weight: number;
  label: string;
}

// v2: added `cof_auth`, promoted from a live-sandbox probe finding (the real COF API needs
// `Authorization: <merchant-api-key>` + `x-coinflow-auth-user-id`). Bumping the version forces
// a re-baseline — scores are never compared across rubric versions.
export const RUBRIC_VERSION = "v2";

// Weights sum to 1.0. Weight ∝ centrality to the documented use case: the ZA→COF chain
// (gating) carries 0.70, robustness (additive) carries 0.30. Fixed before the loop runs.
export const LINE_ITEMS: LineItemSpec[] = [
  { id: "boots", tier: "gating", weight: 0.1, label: "App builds and serves" },
  { id: "za_renders", tier: "gating", weight: 0.15, label: "Zero-Auth iframe renders" },
  { id: "onsuccess_payment_id", tier: "gating", weight: 0.25, label: "onSuccess fires with a paymentId" },
  { id: "cof_correct_ref", tier: "gating", weight: 0.2, label: "COF references paymentId correctly" },
  { id: "graceful_410", tier: "additive", weight: 0.15, label: "410 handled gracefully" },
  { id: "cof_auth", tier: "additive", weight: 0.08, label: "COF auth headers (Authorization + x-coinflow-auth-user-id)" },
  { id: "device_id", tier: "additive", weight: 0.07, label: "nSure device id forwarded" },
];

export interface LineItemResult {
  id: LineItemId;
  passed: boolean;
  /** machine-readable failure reason (null when passed) — the editor's direction signal */
  reason: string | null;
}

export interface Scorecard {
  rubricVersion: string;
  lineItems: LineItemResult[];
  rollUp: number;
  fullPass: boolean;
}

export function score(results: LineItemResult[]): Scorecard {
  const byId = new Map(results.map((r) => [r.id, r]));
  const rollUp = LINE_ITEMS.reduce((sum, s) => sum + (byId.get(s.id)?.passed ? s.weight : 0), 0);
  const fullPass = LINE_ITEMS.filter((s) => s.tier === "gating").every((s) => byId.get(s.id)?.passed === true);
  return {
    rubricVersion: RUBRIC_VERSION,
    lineItems: LINE_ITEMS.map((s) => byId.get(s.id) ?? { id: s.id, passed: false, reason: "not_evaluated" }),
    rollUp: Number(rollUp.toFixed(4)),
    fullPass,
  };
}
