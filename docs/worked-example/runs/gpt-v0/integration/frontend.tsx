import { CoinflowPurchase } from '@coinflow/react';
import type { ZeroAuthStepProps } from '@contract';

export function ZeroAuthStep({ onPaymentId, onDeviceId, merchantId, env }: ZeroAuthStepProps) {
  return (
    <CoinflowPurchase
      merchantId={merchantId}
      env={env}
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={({ paymentId, deviceId }) => {
        onPaymentId(paymentId);
        if (deviceId) {
          onDeviceId(deviceId);
        }
      }}
    />
  );
}
