// Browser-free proof that the oracle's deterministic core behaves. This is the
// evidence that the mock is trustworthy BEFORE any browser or LLM enters the loop.
import type { AddressInfo } from "node:net";
import { createMockServer } from "./server.js";
import { TEST_PAN } from "./store.js";

const { app, store } = createMockServer();
// Trip the velocity limit on the 2nd reuse of a reference.
store.reset({
  velocity: { maxMultiple: 1, maxCount: 5, period: 86_400, expiration: 2_592_000, maxZeroAuthAmount: 0 },
  requireDeviceId: false,
});

const server = app.listen(0);
const { port } = server.address() as AddressInfo;
const base = `http://localhost:${port}`;

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (!cond) failures += 1;
  const suffix = !cond && detail !== undefined ? ` — ${JSON.stringify(detail)}` : "";
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}${suffix}`);
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json };
}

console.log("Oracle smoke test (velocity maxMultiple=1):\n");

// 1. Zero Authorization → a real paymentId
const za = await post("/api/checkout/zero-authorization/applied-ai", {
  card: { number: TEST_PAN, expiryMonth: "12", expiryYear: "2030", cvv: "123" },
});
check("ZA → 200 with paymentId", za.status === 200 && typeof za.json.paymentId === "string", za);
const paymentId: string = za.json.paymentId;

// 2. COF with the correct originalPaymentId → success
const cof1 = await post("/api/checkout/card-on-file", { subtotal: { cents: 2500, currency: "USD" }, originalPaymentId: paymentId });
check("COF #1 correct ref → 200", cof1.status === 200 && typeof cof1.json.paymentId === "string", cof1);

// 3. Reuse beyond maxMultiple → deterministic 410
const cof2 = await post("/api/checkout/card-on-file", { subtotal: { cents: 2500, currency: "USD" }, originalPaymentId: paymentId });
check("COF #2 velocity exceeded → 410 REFERENCE_NO_LONGER_USABLE", cof2.status === 410 && cof2.json.error === "REFERENCE_NO_LONGER_USABLE", cof2);

// 4. paymentId placed in the WRONG field → 400 (catches wrong_reference_field)
const cofWrong = await post("/api/checkout/card-on-file", { subtotal: { cents: 2500, currency: "USD" }, paymentId });
check("COF wrong field → 400 REFERENCE_IN_WRONG_FIELD", cofWrong.status === 400 && cofWrong.json.error === "REFERENCE_IN_WRONG_FIELD", cofWrong);

// 5. No reference at all → 400
const cofMissing = await post("/api/checkout/card-on-file", { subtotal: { cents: 2500, currency: "USD" } });
check("COF missing ref → 400 MISSING_REFERENCE", cofMissing.status === 400 && cofMissing.json.error === "MISSING_REFERENCE", cofMissing);

// 6. An endpoint that does not exist → 404 (catches hallucinated_endpoint)
const bogus = await post("/api/checkout/charge-it-now", { amount: 100 });
check("Hallucinated endpoint → 404 UNKNOWN_ENDPOINT", bogus.status === 404 && bogus.json.error === "UNKNOWN_ENDPOINT", bogus);

// 7. The request log is the verifier's observability surface
const log = (await (await fetch(base + "/__mock__/log")).json()) as any[];
check("Request log captured all 6 /api calls", Array.isArray(log) && log.length === 6, log.length);
check("wrong-field call logged (referenceField=other, 400)", log.some((e) => e.matchedRoute === "card-on-file" && e.referenceField === "other" && e.status === 400));
check("hallucinated call logged (matchedRoute=null, 404)", log.some((e) => e.matchedRoute === null && e.status === 404));

server.close();
console.log(`\n${failures === 0 ? "All oracle assertions passed ✔" : `${failures} assertion(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
