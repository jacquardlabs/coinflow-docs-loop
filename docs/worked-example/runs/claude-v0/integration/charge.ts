import type { ChargeFn } from "@contract";

/**
 * Charges a card previously stored via Zero Authorization.
 *
 * Per the docs, we charge the stored card using the Card on File endpoint,
 * passing the zero-auth `paymentId` as `originalPaymentId`:
 *
 *   POST {apiBase}/api/checkout/card-on-file
 *   Authorization: your-merchant-api-key
 *   x-user-id: customer-123
 *   { "subtotal": { "cents", "currency" }, "originalPaymentId": ... }
 *
 * If the stored reference can no longer be charged (e.g. the card/token is no
 * longer valid or requires 3DS re-verification), we degrade gracefully by asking
 * the customer to re-verify instead of surfacing a raw error.
 */
export const charge: ChargeFn = async (
  { paymentId, deviceId },
  { apiBase, merchantId, apiKey, userId }
) => {
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      // Docs authenticate merchant-initiated charges with the merchant API key
      // in the Authorization header and the customer in x-user-id.
      Authorization: apiKey,
      "x-user-id": userId,
    };

    // Forward the fraud / chargeback protection device id if we captured one.
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }

    const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        subtotal: {
          cents: 2500,
          currency: "USD",
        },
        originalPaymentId: paymentId,
      }),
    });

    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      return { status: "charged", paymentId: data.paymentId ?? paymentId };
    }

    // Parse the error body to decide whether the stored reference is unusable.
    const body: any = await res.json().catch(() => ({}));
    const message = String(
      body?.error ?? body?.message ?? ""
    ).toLowerCase();

    // The stored card can no longer be charged and the customer must re-verify:
    // e.g. the issuer now requires 3DS, or the stored card/token is invalid.
    const needsReverification =
      message.includes("3ds") ||
      message.includes("3d secure") ||
      message.includes("re-verif") ||
      message.includes("reverif") ||
      message.includes("challenge required") ||
      message.includes("invalid card") ||
      message.includes("invalid token") ||
      res.status === 401 ||
      res.status === 403;

    if (needsReverification) {
      return { status: "needs_reverification" };
    }

    return { status: "error", code: body?.code ?? String(res.status) };
  } catch (err: any) {
    return { status: "error", code: err?.code ?? "network_error" };
  }
};
