// First real end-to-end drive: boot the oracle + the integration app, drive the
// mock-served iframe headless, and prove onSuccess fired with a paymentId the oracle
// actually issued. This is the seed of the verifier (step 3).
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { chromium } from "playwright";
import { createMockServer } from "../mock/api/server.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const scaffoldRoot = path.resolve(dir, "../../scaffold");

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (!cond) failures += 1;
  const suffix = !cond && detail !== undefined ? ` — ${JSON.stringify(detail)}` : "";
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${name}${suffix}`);
}

// 1. Boot the oracle.
const { app: mockApp, store } = createMockServer();
const mockServer = mockApp.listen(0);
const mockBase = `http://127.0.0.1:${(mockServer.address() as AddressInfo).port}`;

// 2. Boot the integration app (Vite dev server), aliasing @coinflow/react → stub.
process.env.VITE_COINFLOW_MOCK_BASE = mockBase;
// Plugins + the @coinflow/react alias come from scaffold/vite.config.ts (auto-loaded).
// Re-adding react() here would double-inject Fast Refresh and break the transform.
const vite = await createViteServer({
  root: scaffoldRoot,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "warn",
});
await vite.listen();
const appUrl = vite.resolvedUrls?.local[0];

console.log("Drive ZA end-to-end:");
console.log(`  mock = ${mockBase}`);
console.log(`  app  = ${appUrl}\n`);

// 3. Drive it headless.
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(appUrl ?? "");

const frame = page.frameLocator('[data-testid="coinflow-iframe"]');
await frame.locator('[data-testid="card-number"]').fill("4111111111111111");
await frame.locator('[data-testid="card-exp-month"]').fill("12");
await frame.locator('[data-testid="card-exp-year"]').fill("2030");
await frame.locator('[data-testid="card-cvv"]').fill("123");
await frame.locator('[data-testid="card-submit"]').click();

let paymentId = "";
try {
  const el = page.locator('[data-testid="za-payment-id"]');
  await el.waitFor({ state: "visible", timeout: 8000 });
  paymentId = (await el.textContent())?.trim() ?? "";
} catch {
  // handled by the assertion below
}

check("onSuccess fired with a UUID paymentId", /^[0-9a-f-]{36}$/i.test(paymentId), paymentId);
check("oracle logged a successful ZA (paymentId is real, not fabricated)", store.getLog().some((e) => e.matchedRoute === "zero-authorization" && e.status === 200));
check("no hallucinated endpoints were hit", !store.getLog().some((e) => e.matchedRoute === null));

await browser.close();
await vite.close();
mockServer.close();

console.log(`\n${failures === 0 ? "ZA end-to-end PASSED ✔" : `${failures} assertion(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
