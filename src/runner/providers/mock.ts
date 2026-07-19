import { randomUUID } from "node:crypto";
import type { ChatRequest, ChatResponse, ModelProvider, ToolCall } from "../provider.js";

// A deterministic, docs-sensitive stand-in for a real model. Its output is a function of
// what the docs contain — so the whole loop (including the editor's before/after) runs
// offline and in CI with zero keys. It is NOT the source of truth on whether docs improved
// (the verifier is). It proves the machinery; real models at debrief prove generalization.

interface DocSignals {
  correctRef: boolean;
  handle410: boolean;
  deviceId: boolean;
}

// Signals must come from the DOCS PAGE only — not the system/contract prompt, which
// necessarily mentions concepts like "device id" as generic app requirements. Reading
// those would leak signal the docs never taught.
function extractDocs(req: ChatRequest): string {
  const user = req.messages.find((m) => m.role === "user");
  const content = user?.content ?? "";
  const marker = "=== DOCUMENTATION";
  const i = content.indexOf(marker);
  return (i >= 0 ? content.slice(i) : content).toLowerCase();
}

function readSignals(req: ChatRequest): DocSignals {
  const text = extractDocs(req);
  return {
    correctRef: text.includes("originalpaymentid"),
    handle410: /\b410\b/.test(text) || text.includes("velocity"),
    // deliberately NOT matching "nsure" — it is a substring of "ensure"
    deviceId:
      text.includes("purchaseprotection") ||
      text.includes("device-id") ||
      text.includes("x-device-id") ||
      text.includes("getcoinflowdeviceid") ||
      text.includes("device id"),
  };
}

function frontendFile(s: DocSignals): string {
  if (s.deviceId) {
    return `import { useEffect } from "react";
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";
import type { ZeroAuthStepProps } from "@contract";

export function ZeroAuthStep({ onPaymentId, onDeviceId }: ZeroAuthStepProps) {
  useEffect(() => {
    void getCoinflowDeviceId().then(onDeviceId);
  }, [onDeviceId]);

  return (
    <CoinflowPurchaseProtection merchantId="applied-ai">
      <CoinflowPurchase
        merchantId="applied-ai"
        env="sandbox"
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

export function ZeroAuthStep({ onPaymentId }: ZeroAuthStepProps) {
  return (
    <CoinflowPurchase
      merchantId="applied-ai"
      env="sandbox"
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={({ paymentId }) => onPaymentId(paymentId)}
    />
  );
}
`;
}

function chargeFile(s: DocSignals): string {
  const refField = s.correctRef ? "originalPaymentId" : "paymentId";
  const param = s.deviceId ? "{ paymentId, deviceId }" : "{ paymentId }";
  const deviceHeader = s.deviceId ? `\n      ...(deviceId ? { "x-device-id": deviceId } : {}),` : "";
  const handle410 = s.handle410
    ? `  if (res.status === 410) {\n    return { status: "needs_reverification", reason: "reference_no_longer_usable" };\n  }\n`
    : "";
  return `import type { ChargeFn } from "@contract";

export const charge: ChargeFn = async (${param}, { apiBase }) => {
  const res = await fetch(\`\${apiBase}/api/checkout/card-on-file\`, {
    method: "POST",
    headers: {
      "content-type": "application/json",${deviceHeader}
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

export function mockProvider(): ModelProvider {
  return {
    id: "mock",
    async complete(req: ChatRequest): Promise<ChatResponse> {
      const s = readSignals(req);
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
