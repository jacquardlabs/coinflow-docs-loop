// Validate the mock's contract against the REAL Coinflow API. Requires COINFLOW_MODE=sandbox
// (or prod) + COINFLOW_API_KEY. Prints the real responses so we can PIN the stub to reality —
// the concrete mitigation for "the mock is only as faithful as its encoded contract".
//
// Best-effort by design: the exact auth scheme and body shapes come from the live docs.
// Override the auth header via COINFLOW_AUTH_HEADER / COINFLOW_AUTH_PREFIX. Never prints the key.
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
const authPrefix = process.env.COINFLOW_AUTH_PREFIX ?? "Bearer ";
const auth: Record<string, string> = { [authHeader]: `${authPrefix}${cf.apiKey}` };

async function call(name: string, apiPath: string, body: unknown): Promise<{ status: number; json: any }> {
  try {
    const res = await fetch(`${cf.apiBase}${apiPath}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
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

console.log(`Live probe: mode=${cf.mode}  base=${cf.apiBase}  merchant=${cf.merchantId}`);

const za = await call("ZA", `/api/checkout/zero-authorization/${encodeURIComponent(cf.merchantId)}`, {
  card: { number: TEST_PAN, expiryMonth: "12", expiryYear: "2030", cvv: "123" },
});
const paymentId: unknown = za.json?.paymentId;
console.log(`\n[contract] ZA returns a paymentId: ${typeof paymentId === "string" ? "YES" : "NO"}`);

if (typeof paymentId === "string") {
  const cof = await call("COF", `/api/checkout/card-on-file`, {
    subtotal: { cents: 2500, currency: "USD" },
    originalPaymentId: paymentId,
  });
  const cofOk = cof.status >= 200 && cof.status < 300;
  console.log(`\n[contract] COF accepts originalPaymentId: ${cofOk ? "YES" : `NO (status ${cof.status})`}`);

  let saw410 = cof.status === 410;
  for (let i = 0; i < 6 && !saw410; i += 1) {
    const r = await call(`COF reuse #${i + 2}`, `/api/checkout/card-on-file`, {
      subtotal: { cents: 2500, currency: "USD" },
      originalPaymentId: paymentId,
    });
    if (r.status === 410) saw410 = true;
  }
  console.log(`\n[contract] reuse eventually 410s (velocity): ${saw410 ? "YES" : "not observed in 6 tries"}`);
}

console.log("\nCompare the above to the mock's assumptions in src/mock/api/store.ts — divergences are what to pin.");
process.exit(0);
