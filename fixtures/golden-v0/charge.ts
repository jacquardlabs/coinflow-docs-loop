import type { ChargeFn } from "../../scaffold/src/contract.js";

// v0-doc-representative backend: correct endpoint + reference field, but the ZA page never
// mentions the 410 / velocity path, so this treats every non-2xx as a generic error
// instead of re-verifying — and it forwards no device id (the page never mentions it).
export const charge: ChargeFn = async ({ paymentId }, { apiBase }) => {
  const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subtotal: { cents: 2500, currency: "USD" },
      originalPaymentId: paymentId,
    }),
  });
  if (!res.ok) {
    return { status: "error", code: `http_${res.status}` };
  }
  const data = (await res.json()) as { paymentId: string };
  return { status: "charged", paymentId: data.paymentId };
};
