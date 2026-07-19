import type { ChargeFn } from "../../scaffold/src/contract.js";

// Broken: references the ZA paymentId in the WRONG field (`paymentId` instead of
// `originalPaymentId`). Auth, device id, and 410 handling are all correct — only the reference
// field is wrong. Demonstrates the gating veto: a non-trivial roll-up, but full_pass=false.
export const charge: ChargeFn = async ({ paymentId, deviceId }, { apiBase, apiKey, userId }) => {
  const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: apiKey } : {}),
      ...(userId ? { "x-coinflow-auth-user-id": userId } : {}),
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
    body: JSON.stringify({
      subtotal: { cents: 2500, currency: "USD" },
      paymentId, // ← WRONG: should be originalPaymentId
    }),
  });

  if (res.status === 410) {
    return { status: "needs_reverification" };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: "error", code: data.error ?? `http_${res.status}` };
  }
  const data = (await res.json()) as { paymentId: string };
  return { status: "charged", paymentId: data.paymentId };
};
