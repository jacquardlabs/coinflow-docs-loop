// The fixed contract between the harness shell and the agent's fill.
// The shell (App.tsx, create-server.ts) is Coinflow-agnostic; the agent implements
// ZeroAuthStep + charge() using the docs. Everything here is deliberately generic so a
// failure is attributable to the doc, not to app plumbing.

export interface ChargeInput {
  paymentId: string;
  deviceId?: string;
}

export interface ChargeContext {
  /** Coinflow API base URL (mock or live). */
  apiBase: string;
  merchantId: string;
  /** Server-side API key for Card-on-File auth. Undefined in mock mode. */
  apiKey?: string;
}

export type ChargeResult =
  | { status: "charged"; paymentId: string }
  | { status: "needs_reverification"; reason?: string }
  | { status: "error"; code?: string };

/** Agent-filled backend: call Card-on-File and normalize the outcome. */
export type ChargeFn = (input: ChargeInput, ctx: ChargeContext) => Promise<ChargeResult>;

/** Agent-filled frontend: render Zero Authorization, surface the paymentId + device id. */
export interface ZeroAuthStepProps {
  onPaymentId: (paymentId: string) => void;
  onDeviceId: (deviceId: string) => void;
  /** Provided by the shell — pass to the SDK; do not hardcode. */
  merchantId: string;
  env: "sandbox" | "prod";
}
