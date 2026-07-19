import { useEffect } from "react";
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";
import type { ZeroAuthStepProps } from "../../scaffold/src/contract";

// A CORRECT integration, hand-written from the ideal docs. Scores ≈1.0.
// Uses the shell-provided merchantId + env, so it is environment-portable.
export function ZeroAuthStep({ onPaymentId, onDeviceId, merchantId, env }: ZeroAuthStepProps) {
  useEffect(() => {
    void getCoinflowDeviceId().then(onDeviceId);
  }, [onDeviceId]);

  return (
    <CoinflowPurchaseProtection merchantId={merchantId}>
      <CoinflowPurchase
        merchantId={merchantId}
        env={env}
        zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
        onSuccess={({ paymentId }) => onPaymentId(paymentId)}
      />
    </CoinflowPurchaseProtection>
  );
}
