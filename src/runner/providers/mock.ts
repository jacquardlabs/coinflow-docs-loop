import { randomUUID } from "node:crypto";
import type { ChatRequest, ChatResponse, ModelProvider, ToolCall } from "../provider.js";

// A deterministic, docs-sensitive stand-in for a real model. Its output is a function of
// what the docs contain — so the whole loop (including the editor's before/after) runs
// offline and in CI with zero keys. It is NOT the source of truth on whether docs improved
// (the verifier is). It proves the machinery; real models at debrief prove generalization.
//
// Graded variants model "how explicitly must the docs state something before this reader
// picks it up." A signal's doc "strength" is 0 (absent), 1 (mentioned in prose), or 2
// (shown in a fenced code example). A variant with threshold t picks up the signal iff
// strength >= t. Stricter readers need code examples, not just prose — a realistic proxy
// for how much hand-holding a weaker vs stronger model needs.

export interface MockThresholds {
  correctRef: number;
  handle410: number;
  deviceId: number;
  auth: number;
}
export interface MockConfig {
  id: string;
  thresholds: MockThresholds;
}

interface DocSignals {
  correctRef: boolean;
  handle410: boolean;
  deviceId: boolean;
  auth: boolean;
}

function extractDocs(req: ChatRequest): string {
  const user = req.messages.find((m) => m.role === "user");
  const content = user?.content ?? "";
  const marker = "=== DOCUMENTATION";
  const i = content.indexOf(marker);
  return i >= 0 ? content.slice(i) : content;
}

function codeText(docs: string): string {
  return (docs.match(/```[\s\S]*?```/g) ?? []).join("\n");
}

/** 0 = absent, 1 = mentioned in prose, 2 = shown in a fenced code example. */
function strength(docsLower: string, codeLower: string, keywords: string[]): number {
  if (keywords.some((k) => codeLower.includes(k))) return 2;
  if (keywords.some((k) => docsLower.includes(k))) return 1;
  return 0;
}

function readSignals(req: ChatRequest, t: MockThresholds): DocSignals {
  const docs = extractDocs(req);
  const docsLower = docs.toLowerCase();
  const codeLower = codeText(docs).toLowerCase();
  const ref = strength(docsLower, codeLower, ["originalpaymentid"]);
  const h410 = strength(docsLower, codeLower, ["410", "velocity"]);
  // deliberately NOT matching "nsure" — it is a substring of "ensure"
  const dev = strength(docsLower, codeLower, [
    "purchaseprotection",
    "x-device-id",
    "getcoinflowdeviceid",
    "device-id",
    "device id",
  ]);
  const auth = strength(docsLower, codeLower, ["x-coinflow-auth-user-id", "auth-user-id"]);
  return {
    correctRef: ref >= t.correctRef,
    handle410: h410 >= t.handle410,
    deviceId: dev >= t.deviceId,
    auth: auth >= t.auth,
  };
}

function frontendFile(s: DocSignals): string {
  if (s.deviceId) {
    return `import { useEffect } from "react";
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";
import type { ZeroAuthStepProps } from "@contract";

export function ZeroAuthStep({ onPaymentId, onDeviceId, merchantId, env }: ZeroAuthStepProps) {
  useEffect(() => {
    void getCoinflowDeviceId().then(onDeviceId);
  }, [onDeviceId]);

  return (
    <CoinflowPurchaseProtection merchantId={merchantId}>
      <CoinflowPurchase
        merchantId={merchantId}
        env={env}
        zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
        onSuccess={({ paymentId }) => onPaymentId(paymentId)}
      />
    </CoinflowPurchaseProtection>
  );
}
`;
  }
  return `import { CoinflowPurchase } from "@coinflow/react";
import type { ZeroAuthStepProps } from "@contract";

export function ZeroAuthStep({ onPaymentId, merchantId, env }: ZeroAuthStepProps) {
  return (
    <CoinflowPurchase
      merchantId={merchantId}
      env={env}
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={({ paymentId }) => onPaymentId(paymentId)}
    />
  );
}
`;
}

function chargeFile(s: DocSignals): string {
  const refField = s.correctRef ? "originalPaymentId" : "paymentId";
  const inputParam = s.deviceId ? "{ paymentId, deviceId }" : "{ paymentId }";
  const ctxParam = s.auth ? "{ apiBase, apiKey, userId }" : "{ apiBase }";
  const authHeaders = s.auth
    ? `\n      ...(apiKey ? { authorization: apiKey } : {}),\n      ...(userId ? { "x-coinflow-auth-user-id": userId } : {}),`
    : "";
  const deviceHeader = s.deviceId ? `\n      ...(deviceId ? { "x-device-id": deviceId } : {}),` : "";
  const handle410 = s.handle410
    ? `  if (res.status === 410) {\n    return { status: "needs_reverification", reason: "reference_no_longer_usable" };\n  }\n`
    : "";
  return `import type { ChargeFn } from "@contract";

export const charge: ChargeFn = async (${inputParam}, ${ctxParam}) => {
  const res = await fetch(\`\${apiBase}/api/checkout/card-on-file\`, {
    method: "POST",
    headers: {
      "content-type": "application/json",${authHeaders}${deviceHeader}
    },
    body: JSON.stringify({
      subtotal: { cents: 2500, currency: "USD" },
      ${refField}: paymentId,
    }),
  });
${handle410}  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: "error", code: data.error ?? \`http_\${res.status}\` };
  }
  const data = (await res.json()) as { paymentId: string };
  return { status: "charged", paymentId: data.paymentId };
};
`;
}

function writesSoFar(req: ChatRequest): number {
  return req.messages.filter((m) => m.role === "tool" && m.content.startsWith("wrote ")).length;
}

export function mockProvider(cfg: MockConfig): ModelProvider {
  return {
    id: cfg.id,
    async complete(req: ChatRequest): Promise<ChatResponse> {
      const s = readSignals(req, cfg.thresholds);
      const n = writesSoFar(req);
      const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: randomUUID(), name, arguments: args });

      let text: string;
      let toolCalls: ToolCall[];
      if (n === 0) {
        text = "Writing the Zero Authorization frontend from the docs.";
        toolCalls = [call("write_file", { path: "frontend.tsx", content: frontendFile(s) })];
      } else if (n === 1) {
        text = "Writing the Card-on-File backend from the docs.";
        toolCalls = [call("write_file", { path: "charge.ts", content: chargeFile(s) })];
      } else {
        text = "Integration complete.";
        toolCalls = [call("submit", {})];
      }

      const outputTokens = Math.ceil(toolCalls.reduce((a, c) => a + JSON.stringify(c.arguments).length, 0) / 4) + 8;
      return {
        text,
        toolCalls,
        usage: { inputTokens: Math.ceil(JSON.stringify(req.messages).length / 4), outputTokens },
        stop: "tool_use",
      };
    },
  };
}
