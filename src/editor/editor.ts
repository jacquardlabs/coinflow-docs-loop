import type { LineItemId } from "../rubric/rubric.js";

// The docs-editor. Offline it is a deterministic, GROUND-TRUTHED remediation mapper: a
// failing line-item maps to a targeted doc section. The editor knows ground truth (like a
// real docs author with SDK access); the implementer never does — we test the docs, not the
// editor. A real-model editor plugs into the same `docs + failing → newDocs` contract.
//
// "thorough" appends prose + a fenced code example (what a strict reader needs);
// "prose-only" appends prose alone — enough for lenient readers, but the held-out strict
// reader will lag, which is exactly what makes the holdout worth keeping.

export type EditorMode = "thorough" | "prose-only";

interface Remediation {
  marker: string;
  prose: string;
  code: string;
}

const REMEDIATION: Partial<Record<LineItemId, Remediation>> = {
  graceful_410: {
    marker: "## Handling an expired card reference (410 Gone)",
    prose: [
      "A Card-on-File charge can fail with **410 Gone** when the stored reference can no longer be",
      "used — it has exceeded the merchant's velocity limit or expired. Do not surface this as a raw",
      "error. Re-verify the card (run Zero Authorization again to obtain a fresh reference) or fall",
      "back to the hosted Coinflow UI to collect the card again.",
    ].join("\n"),
    code: [
      "```ts",
      "// A 410 means the stored reference hit its velocity limit or expired.",
      "if (res.status === 410) {",
      "  // Re-verify instead of erroring out.",
      '  return { status: "needs_reverification" };',
      "}",
      "```",
    ].join("\n"),
  },
  device_id: {
    marker: "## Chargeback protection: the nSure device id",
    prose: [
      "When chargeback protection is enabled, every Card-on-File charge must carry the nSure device",
      "id. Wrap the checkout in `CoinflowPurchaseProtection`, read the id with `getCoinflowDeviceId()`,",
      "and send it as the `x-device-id` header on the charge request.",
    ].join("\n"),
    code: [
      "```tsx",
      'import { CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";',
      "",
      "<CoinflowPurchaseProtection merchantId={merchantId}>",
      "  <CoinflowPurchase /* ...zeroAuthorizationConfig... */ />",
      "</CoinflowPurchaseProtection>;",
      "",
      "const deviceId = await getCoinflowDeviceId();",
      '// include on the Card-on-File request:  headers["x-device-id"] = deviceId;',
      "```",
    ].join("\n"),
  },
  cof_auth: {
    marker: "## Authenticating Card-on-File requests",
    prose: [
      "Card-on-File is a server-side call. Authenticate it with your merchant API key in the",
      "`Authorization` header — sent **raw**, not as a Bearer token — and identify the customer with",
      "the `x-coinflow-auth-user-id` header.",
    ].join("\n"),
    code: [
      "```ts",
      "const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {",
      '  method: "POST",',
      "  headers: {",
      '    "content-type": "application/json",',
      "    authorization: apiKey, // raw merchant key, not Bearer",
      '    "x-coinflow-auth-user-id": userId,',
      "  },",
      "  body: JSON.stringify({ originalPaymentId: paymentId, subtotal }),",
      "});",
      "```",
    ].join("\n"),
  },
  cof_correct_ref: {
    marker: "## Referencing the stored card",
    prose: [
      "Reference the prior Zero Authorization by passing its `paymentId` as `originalPaymentId` on",
      "the Card-on-File charge.",
    ].join("\n"),
    code: [
      "```ts",
      "await fetch(`${apiBase}/api/checkout/card-on-file`, {",
      '  method: "POST",',
      '  headers: { "content-type": "application/json" },',
      "  body: JSON.stringify({ originalPaymentId: paymentId, subtotal }),",
      "});",
      "```",
    ].join("\n"),
  },
};

export interface EditProposal {
  newDocs: string;
  added: LineItemId[];
  withinBudget: boolean;
}

// Targeted, append-only edits under a hard length budget (≤20% over v0) — a doc that
// balloons to win is a regression, so an edit that would exceed the budget is refused.
export function proposeEdit(docs: string, failing: LineItemId[], mode: EditorMode, v0Docs: string): EditProposal {
  const maxLines = Math.floor(v0Docs.split("\n").length * 1.2);
  let out = docs;
  const added: LineItemId[] = [];

  for (const id of failing) {
    const rem = REMEDIATION[id];
    if (!rem) continue;
    if (out.includes(rem.marker)) continue; // already documented
    const section = mode === "thorough" ? `\n\n${rem.marker}\n\n${rem.prose}\n\n${rem.code}\n` : `\n\n${rem.marker}\n\n${rem.prose}\n`;
    const candidate = out + section;
    if (candidate.split("\n").length > maxLines) {
      return { newDocs: out, added, withinBudget: false };
    }
    out = candidate;
    added.push(id);
  }

  return { newDocs: out, added, withinBudget: true };
}
