import type { ChargeFn } from '@contract';

export const charge: ChargeFn = async ({ paymentId, deviceId }, { apiBase, merchantId, apiKey, userId }) => {
  try {
    const response = await fetch(`${apiBase}/api/checkout/merchant-initiated-transaction`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': apiKey, // raw merchant key, not Bearer
        'x-user-id': userId,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({
        subtotal: {
          cents: 5000, // Example amount, adjust as needed
          currency: 'USD',
        },
        originalPaymentId: paymentId,
        settlementType: 'Bank',
      }),
    });

    if (response.status === 410) {
      return { status: 'needs_reverification' };
    }

    if (!response.ok) {
      const errorData = await response.json();
      return { status: 'error', code: errorData.code };
    }

    return { status: 'charged', paymentId };
  } catch (error) {
    return { status: 'error', code: 'network_error' };
  }
};