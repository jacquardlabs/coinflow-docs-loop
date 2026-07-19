// The verifier. Boots the oracle + the integration's backend + frontend, drives the
// whole UI headless, and turns observed behavior + the oracle's request log into a
// structured scorecard. Everything checkable here is deterministic; no LLM involved.
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { createMockServer } from "../mock/api/server.js";
import type { RequestLogEntry } from "../mock/api/types.js";
import { createIntegrationServer } from "../../scaffold/server/create-server.js";
import type { ChargeFn } from "../../scaffold/src/contract.js";
import { LINE_ITEMS, score } from "../rubric/rubric.js";
import type { LineItemId, LineItemResult, Scorecard } from "../rubric/rubric.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const scaffoldRoot = path.resolve(dir, "../../scaffold");
const MERCHANT_ID = "applied-ai";
const TEST_PAN = "4111111111111111";

export interface VerifyResult {
  fixture: string;
  scorecard: Scorecard;
  log: RequestLogEntry[];
}

async function visible(page: Page, selector: string, timeout: number): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

function lastCof(log: RequestLogEntry[]): RequestLogEntry | undefined {
  return [...log].reverse().find((e) => e.matchedRoute === "card-on-file");
}

function classifyCofFailure(log: RequestLogEntry[]): string {
  const checkout = log.filter((e) => e.path.startsWith("/api/checkout"));
  const cof = lastCof(log);
  if (!cof && checkout.some((e) => e.matchedRoute === null)) return "hallucinated_endpoint";
  if (!cof) return "cof_not_called";
  if (cof.referenceField === "other") return "wrong_reference_field";
  if (cof.referenceField === "none") return "missing_reference";
  return `cof_failed_${cof.status}`;
}

export async function verify(fixtureDir: string): Promise<VerifyResult> {
  const results = new Map<LineItemId, LineItemResult>();
  for (const s of LINE_ITEMS) results.set(s.id, { id: s.id, passed: false, reason: "not_reached" });
  const pass = (id: LineItemId): void => {
    results.set(id, { id, passed: true, reason: null });
  };
  const fail = (id: LineItemId, reason: string): void => {
    results.set(id, { id, passed: false, reason });
  };

  // 1. Oracle — maxMultiple=1 so the 2nd COF against a reference deterministically 410s.
  const { app: mockApp, store } = createMockServer();
  store.reset({
    velocity: { maxMultiple: 1, maxCount: 5, period: 86_400, expiration: 2_592_000, maxZeroAuthAmount: 0 },
    requireDeviceId: false,
  });
  const mockServer = mockApp.listen(0);
  const mockBase = `http://127.0.0.1:${(mockServer.address() as AddressInfo).port}`;

  // 2. Integration backend (agent-filled charge()).
  const chargeMod = (await import(pathToFileURL(path.join(fixtureDir, "charge.ts")).href)) as { charge: ChargeFn };
  const backend = createIntegrationServer(chargeMod.charge, { apiBase: mockBase, merchantId: MERCHANT_ID });
  const backendServer = backend.listen(0);
  const backendPort = (backendServer.address() as AddressInfo).port;

  // 3. Integration frontend (Vite dev; aliases come from scaffold/vite.config.ts via env).
  process.env.VITE_COINFLOW_MOCK_BASE = mockBase;
  process.env.INTEGRATION_DIR = fixtureDir;
  process.env.COINFLOW_MODE = "mock";
  const vite = await createViteServer({
    root: scaffoldRoot,
    server: { host: "127.0.0.1", port: 0, proxy: { "/charge": `http://127.0.0.1:${backendPort}` } },
    logLevel: "warn",
  });
  await vite.listen();
  const appUrl = vite.resolvedUrls?.local[0] ?? "";

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    try {
      await page.goto(appUrl, { timeout: 15_000 });
      pass("boots");
    } catch {
      fail("boots", "boot_failed");
    }

    if (results.get("boots")?.passed) {
      const zaRendered = await visible(page, '[data-testid="coinflow-iframe"]', 8_000);
      if (zaRendered) pass("za_renders");
      else fail("za_renders", "za_did_not_render");

      if (zaRendered) {
        const frame = page.frameLocator('[data-testid="coinflow-iframe"]');
        await frame.locator('[data-testid="card-number"]').fill(TEST_PAN);
        await frame.locator('[data-testid="card-exp-month"]').fill("12");
        await frame.locator('[data-testid="card-exp-year"]').fill("2030");
        await frame.locator('[data-testid="card-cvv"]').fill("123");
        await frame.locator('[data-testid="card-submit"]').click();

        const gotId = await visible(page, '[data-testid="za-payment-id"]', 8_000);
        const paymentId = gotId ? ((await page.locator('[data-testid="za-payment-id"]').textContent())?.trim() ?? "") : "";
        if (/^[0-9a-f-]{36}$/i.test(paymentId)) pass("onsuccess_payment_id");
        else fail("onsuccess_payment_id", gotId ? "no_payment_id" : "onsuccess_not_wired");
      }

      if (results.get("onsuccess_payment_id")?.passed) {
        // Charge #1 — happy path (covers cof_correct_ref + device_id).
        await page.locator('[data-testid="charge-button"]').click();
        await visible(page, '[data-testid="charge-success"], [data-testid="charge-error"], [data-testid="charge-reverify"]', 8_000);

        const cof1 = lastCof(store.getLog());
        if ((await visible(page, '[data-testid="charge-success"]', 500)) && cof1?.status === 200 && cof1.referenceField === "originalPaymentId") {
          pass("cof_correct_ref");
        } else {
          fail("cof_correct_ref", classifyCofFailure(store.getLog()));
        }
        if (cof1?.deviceIdHeaderPresent) pass("device_id");
        else fail("device_id", "missing_nsure_device_id");

        // Charge #2 — trips the velocity 410 (covers graceful_410). Wait on the #2
        // outcome specifically (reverify|error), not the lingering #1 success state.
        await page.locator('[data-testid="charge-button"]').click();
        await visible(page, '[data-testid="charge-reverify"], [data-testid="charge-error"]', 8_000);
        if (await visible(page, '[data-testid="charge-reverify"]', 500)) pass("graceful_410");
        else fail("graceful_410", "unhandled_410");
      }
    }

    return { fixture: path.basename(fixtureDir), scorecard: score([...results.values()]), log: store.getLog() };
  } finally {
    await browser.close();
    await vite.close();
    backendServer.close();
    mockServer.close();
  }
}
