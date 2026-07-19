// Contract-faithful stub of `@coinflow/react`.
//
// Mock mode aliases `@coinflow/react` to this file (a one-line Vite alias); live mode
// resolves the real npm package. The integration code is byte-identical across modes.
// The stub is deliberately STRICT — it mirrors the real prop/config contract so a doc
// that teaches the wrong API fails here the same way it would in production.
import { useEffect } from "react";
import type { ReactNode } from "react";

function mockBase(): string {
  const g = globalThis as { __COINFLOW_MOCK_BASE__?: string };
  return g.__COINFLOW_MOCK_BASE__ ?? "http://localhost:4000";
}

export interface ZeroAuthorizationConfig {
  disableSavedPaymentMethods?: boolean;
  cardToken?: string;
}

export interface CoinflowPurchaseProps {
  merchantId: string;
  env?: "sandbox" | "prod";
  zeroAuthorizationConfig?: ZeroAuthorizationConfig;
  onSuccess?: (result: { paymentId: string }) => void;
  onError?: (error: { code?: string }) => void;
  // The real SDK also takes wallet/connection etc.; accept and ignore in the stub.
  [key: string]: unknown;
}

interface IframeMessage {
  source?: string;
  type?: "success" | "error";
  paymentId?: string;
  code?: string;
}

export function CoinflowPurchase(props: CoinflowPurchaseProps): ReactNode {
  const { merchantId, zeroAuthorizationConfig, onSuccess, onError } = props;
  const base = mockBase();
  const iframeOrigin = new URL(base).origin;

  useEffect(() => {
    function handle(ev: MessageEvent): void {
      if (ev.origin !== iframeOrigin) return;
      const data = ev.data as IframeMessage | null;
      if (!data || data.source !== "coinflow") return;
      if (data.type === "success" && typeof data.paymentId === "string") {
        onSuccess?.({ paymentId: data.paymentId });
      } else if (data.type === "error") {
        onError?.({ code: data.code });
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [iframeOrigin, onSuccess, onError]);

  // Strict: Zero Authorization requires a config object. A doc that omits it should
  // fail the "ZA renders" line-item, not silently render a plain charge form.
  if (!zeroAuthorizationConfig || typeof zeroAuthorizationConfig !== "object") {
    return <div data-testid="coinflow-error">CoinflowPurchase requires a zeroAuthorizationConfig object.</div>;
  }

  const src = `${base}/__iframe__/card-entry?merchantId=${encodeURIComponent(merchantId)}`;
  return (
    <iframe
      data-testid="coinflow-iframe"
      title="Coinflow card entry"
      src={src}
      style={{ width: "100%", height: 260, border: "1px solid #ccc" }}
    />
  );
}

const DEVICE_ID = "nsure-mock-device-000";

/**
 * The real SDK derives an nSure device fingerprint. The stub returns a deterministic id
 * the integration must forward as the `x-device-id` header on Card-on-File charges.
 */
export async function getCoinflowDeviceId(): Promise<string> {
  return DEVICE_ID;
}

export function CoinflowPurchaseProtection(props: { merchantId: string; children?: ReactNode }): ReactNode {
  // Real component initializes chargeback protection; the stub is a deterministic no-op wrapper.
  return <>{props.children ?? null}</>;
}
