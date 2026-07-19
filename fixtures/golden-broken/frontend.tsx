import { useEffect } from "react";
import { CoinflowPurchase, CoinflowPurchaseProtection, getCoinflowDeviceId } from "@coinflow/react";
import type { ZeroAuthStepProps } from "../../scaffold/src/contract";

// Frontend is correct (device id wired, ZA rendered). Only the backend reference field is
// wrong (see charge.ts) — isolates the wrong_reference_field signal and the gating veto.
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
