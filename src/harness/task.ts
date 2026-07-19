import type { ToolSpec } from "../runner/provider.js";

export interface AgentTask {
  system: string;
  initialUser: string;
  tools: ToolSpec[];
}

// The system prompt is deliberately Coinflow-AGNOSTIC: it specifies the two files' shapes,
// the import specifiers, and the app's needs (a re-verify state exists; wire device id if
// the SDK has one) — but never the Coinflow specifics (endpoint path, field name, that a
// 410 signals expiry, the component names). Those must come from the docs. Anything the
// agent has to guess is, by construction, a doc gap.
const SYSTEM = `You are an autonomous coding agent integrating a payments SDK into a FIXED application scaffold.

You have ONLY the documentation page provided below — no SDK source, no other pages, no prior knowledge of this SDK's specifics. If the docs do not cover something, do your best from the docs; do NOT invent endpoints, field names, or component names that are not in the docs.

Produce a working integration by writing exactly two files, then calling submit:

1. frontend.tsx — a React module that exports:
     export function ZeroAuthStep({ onPaymentId, onDeviceId, merchantId, env }: ZeroAuthStepProps)
   Render the SDK's zero-authorization ("store a card without charging") UI. Call
   onPaymentId(id) with the resulting reusable payment reference when authorization
   succeeds. If the SDK exposes a device id for fraud / chargeback protection, obtain it
   and call onDeviceId(id). Pass the provided merchantId and env props to the SDK; do not hardcode them.
   Import the SDK from "@coinflow/react". Import any types from "@contract" using
   \`import type { ... } from "@contract"\` — it exports types only.

2. charge.ts — a backend module that exports:
     export const charge: ChargeFn = async ({ paymentId, deviceId }, { apiBase, merchantId, apiKey, userId }) => { ... }
   Charge the stored card by calling the SDK's HTTP API at \`apiBase\`, referencing the stored
   card via paymentId, and authenticate the request with apiKey and userId as the docs describe. Return one of:
     - { status: "charged", paymentId }               on success
     - { status: "needs_reverification" }             if the stored card can no longer be charged and the customer must re-verify
     - { status: "error", code }                       otherwise
   Import any types from "@contract" using \`import type { ... } from "@contract"\` — it exports types only.

Tool protocol: call write_file({ path, content }) once per file (path is just the filename),
then call submit() when both files are written. Write complete, runnable files.`;

const TASK = `TASK: Implement "store a card now, charge it later" for our checkout.

First store the customer's card WITHOUT charging it (a zero-value authorization) to obtain
a reusable reference, then charge that stored card. If the stored reference can no longer be
used, degrade gracefully by asking the customer to re-verify rather than surfacing a raw
error. Also wire any fraud / chargeback protection the SDK provides.`;

const TOOLS: ToolSpec[] = [
  {
    name: "write_file",
    description: "Write one file into the integration project.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The filename, e.g. frontend.tsx or charge.ts" },
        content: { type: "string", description: "The complete file contents" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "submit",
    description: "Signal that the integration is complete.",
    parameters: { type: "object", properties: {} },
  },
];

export function buildTask(docs: string): AgentTask {
  return {
    system: SYSTEM,
    initialUser: `${TASK}\n\n=== DOCUMENTATION (your only source) ===\n\n${docs}`,
    tools: TOOLS,
  };
}
