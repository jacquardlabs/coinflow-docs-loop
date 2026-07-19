import React from "react";
import { CoinflowPurchase } from "@coinflow/react";
import type { ZeroAuthStepProps } from "@contract";

/**
 * Renders Coinflow's zero-authorization ("store a card without charging") UI.
 *
 * Per the docs, the SDK's <CoinflowPurchase> component performs a $0.00
 * authorization when given a `zeroAuthorizationConfig`. On success it invokes
 * `onSuccess({ paymentId })`, where `paymentId` is the reusable reference we can
 * later use as `originalPaymentId` for Card on File / MIT charges.
 *
 * We use `disableSavedPaymentMethods: true` ("Add New Card Mode") so the customer
 * enters a fresh card to store, matching the "store a card now" checkout flow.
 *
 * The success payload may also carry a device id used by the SDK for fraud /
 * chargeback protection. The docs only guarantee `paymentId` in the callback, so
 * we forward a device id only if the SDK actually provides one — we don't invent
 * a prop or field.
 */
export function ZeroAuthStep({
  onPaymentId,
  onDeviceId,
  merchantId,
  env,
}: ZeroAuthStepProps) {
  return (
    <CoinflowPurchase
      merchantId={merchantId}
      env={env}
      zeroAuthorizationConfig={{ disableSavedPaymentMethods: true }}
      onSuccess={(result: any) => {
        // The documented success payload is `{ paymentId }`.
        const paymentId =
          result && typeof result === "object" ? result.paymentId : result;
        if (paymentId) {
          onPaymentId(paymentId);
        }

        // If the SDK surfaces a device id for fraud / chargeback protection,
        // forward it. We defensively check common field names without assuming
        // the SDK guarantees one.
        const deviceId =
          result && typeof result === "object"
            ? result.deviceId ?? result.device_id ?? result.fraudDeviceId
            : undefined;
        if (deviceId) {
          onDeviceId(deviceId);
        }
      }}
    />
  );
}
