import React from "react";
import {
  CoinflowPurchase,
  CoinflowPurchaseProtection,
  getCoinflowDeviceId,
} from "@coinflow/react";
import type { ZeroAuthStepProps } from "@contract";

export function ZeroAuthStep({
  onPaymentId,
  onDeviceId,
  merchantId,
  env,
}: ZeroAuthStepProps) {
  return (
    <CoinflowPurchaseProtection merchantId={merchantId}>
      <CoinflowPurchase
        merchantId={merchantId}
        env={env}
        zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
        onSuccess={async ({ paymentId }: { paymentId: string }) => {
          // Reusable reference for future Card-on-File / MIT charges.
          onPaymentId(paymentId);

          // Obtain the nSure device id for chargeback protection.
          try {
            const deviceId = await getCoinflowDeviceId();
            if (deviceId) {
              onDeviceId(deviceId);
            }
          } catch {
            // Device id is best-effort; ignore failures obtaining it.
          }
        }}
      />
    </CoinflowPurchaseProtection>
  );
}
