import { useEffect } from "react";
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";
import type { ZeroAuthStepProps } from "../../scaffold/src/contract";

// Frontend is correct (device id wired, ZA rendered). Only the backend reference field is
// wrong — isolates the wrong_reference_field signal and the gating veto.
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
