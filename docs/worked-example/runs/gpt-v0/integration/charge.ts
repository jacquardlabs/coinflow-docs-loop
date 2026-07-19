import type { ChargeFn } from '@contract';

export const charge: ChargeFn = async ({ paymentId, deviceId }, { apiBase, merchantId, apiKey, userId }) => {
  try {
    const response = await fetch(`${apiBase}/api/checkout/merchant-initiated-transaction`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': apiKey,
        'x-user-id': userId,
      },
      body: JSON.stringify({
        subtotal: {
          cents: 5000, // Example amount
          currency: 'USD',
        },
        originalPaymentId: paymentId,
        settlementType: 'Bank',
      }),
    });

    if (!response.ok) {
      if (response.status === 400) {
        return { status: 'needs_reverification' };
      }
      const errorData = await response.json();
      return { status: 'error', code: errorData.code || 'unknown_error' };
    }

    const data = await response.json();
    return { status: 'charged', paymentId: data.paymentId };
  } catch (error) {
    return { status: 'error', code: 'network_error' };
  }
};
