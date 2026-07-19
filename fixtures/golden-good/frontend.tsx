import { useEffect } from "react";
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";
import type { ZeroAuthStepProps } from "../../scaffold/src/contract";

// A CORRECT integration, hand-written from the ideal docs. Scores ≈1.0.
// It's what a v0-doc-fed agent should eventually converge toward.
export function ZeroAuthStep({ onPaymentId, onDeviceId }: ZeroAuthStepProps) {
  useEffect(() => {
    void getCoinflowDeviceId().then(onDeviceId);
  }, [onDeviceId]);

  return (
    <CoinflowPurchaseProtection merchantId="applied-ai">
      <CoinflowPurchase
        merchantId="applied-ai"
        env="sandbox"
        zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
        onSuccess={({ paymentId }) => onPaymentId(paymentId)}
      />
    </CoinflowPurchaseProtection>
  );
}
