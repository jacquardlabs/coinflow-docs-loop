import { loadEnv } from "../runner/env.js";

// The single environment seam. The same integration + harness target mock / sandbox / prod
// purely by env vars — no code change. `mock` needs no keys; `sandbox`/`prod` need a real
// API key and the real @coinflow/react package.

export type CoinflowMode = "mock" | "sandbox" | "prod";

export interface CoinflowEnv {
  mode: CoinflowMode;
  /** Coinflow API base URL. */
  apiBase: string;
  /** The <CoinflowPurchase env=…> value. */
  sdkEnv: "sandbox" | "prod";
  merchantId: string;
  /** Server-side API key for Card-on-File auth. Undefined in mock. */
  apiKey: string | undefined;
  /** false => alias the stub SDK (mock); true => use the real @coinflow/react. */
  useRealSdk: boolean;
}

const DEFAULT_BASE: Record<"sandbox" | "prod", string> = {
  sandbox: "https://api-sandbox.coinflow.cash",
  prod: "https://api.coinflow.cash",
};

export function resolveCoinflowEnv(overrides: Partial<CoinflowEnv> = {}): CoinflowEnv {
  loadEnv();
  const mode = (overrides.mode ?? (process.env.COINFLOW_MODE as CoinflowMode | undefined) ?? "mock") as CoinflowMode;
  const merchantId = overrides.merchantId ?? process.env.COINFLOW_MERCHANT_ID ?? "applied-ai";
  const apiKey = overrides.apiKey ?? process.env.COINFLOW_API_KEY;

  if (mode === "mock") {
    return {
      mode: "mock",
      apiBase: overrides.apiBase ?? process.env.COINFLOW_API_BASE ?? "http://localhost:4000",
      sdkEnv: "sandbox",
      merchantId,
      apiKey,
      useRealSdk: false,
    };
  }

  const sdkEnv = mode === "prod" ? "prod" : "sandbox";
  return {
    mode,
    apiBase: overrides.apiBase ?? process.env.COINFLOW_API_BASE ?? DEFAULT_BASE[sdkEnv],
    sdkEnv,
    merchantId,
    apiKey,
    useRealSdk: true,
  };
}
