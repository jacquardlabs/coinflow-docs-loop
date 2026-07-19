import type { ChargeFn } from "../../scaffold/src/contract.js";

// Correct Card-on-File: right endpoint, paymentId in `originalPaymentId`, device id
// forwarded as x-device-id, and a 410 caught and normalized to needs_reverification.
export const charge: ChargeFn = async ({ paymentId, deviceId }, { apiBase }) => {
  const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
    body: JSON.stringify({
      subtotal: { cents: 2500, currency: "USD" },
      originalPaymentId: paymentId,
    }),
  });

  if (res.status === 410) {
    return { status: "needs_reverification", reason: "reference_no_longer_usable" };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: "error", code: data.error ?? `http_${res.status}` };
  }
  const data = (await res.json()) as { paymentId: string };
  return { status: "charged", paymentId: data.paymentId };
};
