import type { ChargeFn } from "../../scaffold/src/contract.js";

// Broken: references the ZA paymentId in the WRONG field (`paymentId` instead of
// `originalPaymentId`). Device id is forwarded and 410 is handled correctly — only the
// reference field is wrong. Demonstrates the gating veto: a non-trivial roll-up, but
// full_pass=false because the core chain is broken.
export const charge: ChargeFn = async ({ paymentId, deviceId }, { apiBase }) => {
  const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
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
