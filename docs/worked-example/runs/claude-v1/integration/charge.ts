import type { ChargeFn } from "@contract";

export const charge: ChargeFn = async (
  { paymentId, deviceId },
  { apiBase, merchantId, apiKey, userId }
) => {
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      // Raw merchant API key, NOT a Bearer token.
      authorization: apiKey,
      // Identify the customer.
      "x-coinflow-auth-user-id": userId,
    };

    // Include the nSure device id for chargeback protection when available.
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }

    const res = await fetch(`${apiBase}/api/checkout/card-on-file`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        originalPaymentId: paymentId,
        subtotal: {
          cents: 2500,
          currency: "USD",
        },
      }),
    });

    // 410 Gone: stored reference hit its velocity limit or expired.
    // Degrade gracefully by asking the customer to re-verify.
    if (res.status === 410) {
      return { status: "needs_reverification" };
    }

    if (!res.ok) {
      return { status: "error", code: String(res.status) };
    }

    const data = (await res.json()) as { paymentId?: string };

    return { status: "charged", paymentId: data.paymentId ?? paymentId };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    return { status: "error", code };
  }
};
