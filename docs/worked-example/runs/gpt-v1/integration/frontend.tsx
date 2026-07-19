import React from 'react';
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from '@coinflow/react';
import type { ZeroAuthStepProps } from '@contract';

export function ZeroAuthStep({ onPaymentId, onDeviceId, merchantId, env }: ZeroAuthStepProps) {
  React.useEffect(() => {
    async function fetchDeviceId() {
      const deviceId = await getCoinflowDeviceId();
      onDeviceId(deviceId);
    }
    fetchDeviceId();
  }, [onDeviceId]);

  return (
    <CoinflowPurchaseProtection merchantId={merchantId}>
      <CoinflowPurchase
        merchantId={merchantId}
        env={env}
        zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
        onSuccess={({ paymentId }) => {
          onPaymentId(paymentId);
        }}
      />
    </CoinflowPurchaseProtection>
  );
}