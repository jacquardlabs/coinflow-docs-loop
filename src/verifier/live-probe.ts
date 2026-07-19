// Validate the mock's contract against the REAL Coinflow API. Requires COINFLOW_MODE=sandbox
// (or prod) + COINFLOW_API_KEY. Prints real responses so we can PIN the stub to reality —
// the concrete mitigation for "the mock is only as faithful as its encoded contract". Never
// prints the key.
//
// Findings from the live sandbox (2026-07): auth is `Authorization: <merchant-api-key>` (raw,
// no "Bearer"); the Card-on-File API is merchant-key-authed; the Zero-Authorization API is
// wallet-scoped (`x-coinflow-auth-wallet`), which the SDK/iframe supplies. Override the auth
// header/prefix via COINFLOW_AUTH_HEADER / COINFLOW_AUTH_PREFIX; supply COINFLOW_AUTH_WALLET
// to probe the ZA API directly.
import { randomUUID } from "node:crypto";
import { resolveCoinflowEnv } from "../config/coinflow-env.js";

const TEST_PAN = "4111111111111111";
const cf = resolveCoinflowEnv();

if (!cf.useRealSdk) {
  console.error(`Set COINFLOW_MODE=sandbox (or prod) to probe a live environment (current: ${cf.mode}).`);
  process.exit(2);
}
if (!cf.apiKey) {
  console.error(`COINFLOW_API_KEY is required to probe ${cf.mode}.`);
  process.exit(2);
}

const authHeader = process.env.COINFLOW_AUTH_HEADER ?? "authorization";
const authPrefix = process.env.COINFLOW_AUTH_PREFIX ?? ""; // raw key by default (docs: `Authorization: <key>`)
const authWallet = process.env.COINFLOW_AUTH_WALLET; // ZA API is wallet-scoped
const authUserId = process.env.COINFLOW_AUTH_USER_ID; // COF API is customer-scoped
const authHeaders: Record<string, string> = { [authHeader]: `${authPrefix}${cf.apiKey}` };

async function call(name: string, apiPath: string, body: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  try {
    const res = await fetch(`${cf.apiBase}${apiPath}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders, ...extra },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    const shown = typeof json === "string" ? json.slice(0, 300) : JSON.stringify(json).slice(0, 400);
    console.log(`\n[${name}] POST ${apiPath} -> ${res.status}\n  ${shown}`);
    return { status: res.status, json };
  } catch (e) {
    console.log(`\n[${name}] POST ${apiPath} -> ERROR ${(e as Error).message}`);
    return { status: 0, json: null };
  }
}

const isAuthErr = (s: number): boolean => s === 401 || s === 403;
console.log(`Live probe: mode=${cf.mode}  base=${cf.apiBase}  merchant=${cf.merchantId}`);

// 1. Card-on-File — merchant-key-authed. A placeholder reference validates auth + endpoint +
//    field independently of ZA: auth should pass and the reference should be rejected on its merits.
const cof = await call(
  "COF (placeholder ref)",
  "/api/checkout/card-on-file",
  { subtotal: { cents: 2500, currency: "USD" }, originalPaymentId: randomUUID() },
  authUserId ? { "x-coinflow-auth-user-id": authUserId } : {},
);
console.log(`\n[contract] COF auth accepted (Authorization: <key>): ${isAuthErr(cof.status) ? "NO — auth scheme/key wrong" : "YES"}`);
console.log(`[contract] COF endpoint reachable + originalPaymentId is the recognized field: ${!isAuthErr(cof.status) && cof.status >= 400 && cof.status < 500 ? "YES (reference rejected on its merits)" : cof.status < 400 ? "YES (2xx)" : "unclear — see body above"}`);

// 2. Zero-Authorization — wallet-scoped. Supply COINFLOW_AUTH_WALLET to exercise it via pure API.
const za = await call(
  "ZA",
  `/api/checkout/zero-authorization/${encodeURIComponent(cf.merchantId)}`,
  { card: { number: TEST_PAN, expiryMonth: "12", expiryYear: "2030", cvv: "123" } },
  authWallet ? { "x-coinflow-auth-wallet": authWallet } : {},
);
if (!authWallet && isAuthErr(za.status)) {
  console.log("\n[finding] ZA API is wallet-scoped (needs x-coinflow-auth-wallet). The SDK/iframe supplies this; set COINFLOW_AUTH_WALLET to probe ZA via pure API.");
} else {
  console.log(`\n[contract] ZA returns a paymentId: ${typeof za.json?.paymentId === "string" ? "YES" : "NO"}`);
}

console.log(
  "\nLive findings: COF auth = `Authorization: <merchant-api-key>` (raw) + `x-coinflow-auth-user-id`; " +
    "a missing reference returns 410 ('Could not locate original payment'); the ZA API is wallet/blockchain-scoped " +
    "(the SDK supplies it). The mock omits auth by design (offline determinism); its missing-reference response is pinned to 410 to match.",
);
process.exit(0);
