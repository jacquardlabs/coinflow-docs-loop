import { CoinflowPurchase } from "@coinflow/react";
import type { ZeroAuthStepProps } from "../../scaffold/src/contract";

// v0-doc-representative frontend: the ZA page teaches the happy path but never mentions the
// nSure device id, so an agent reading it alone omits CoinflowPurchaseProtection /
// getCoinflowDeviceId — onDeviceId is never called.
export function ZeroAuthStep({ onPaymentId, merchantId, env }: ZeroAuthStepProps) {
  return (
    <CoinflowPurchase
      merchantId={merchantId}
      env={env}
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={({ paymentId }) => onPaymentId(paymentId)}
    />
  );
}
