import express from "express";
import type { Express, Request, Response } from "express";
import { DEFAULT_CONFIG, MockStore } from "./store.js";
import type { Result } from "./store.js";
import { renderCardEntryPage } from "../iframe/page.js";
import type {
  CardChargeBody,
  CardOnFileBody,
  OracleConfig,
  ReferenceField,
  TokenizeBody,
  ZeroAuthBody,
} from "./types.js";

export interface MockServer {
  app: Express;
  store: MockStore;
}

function hasDeviceId(req: Request): boolean {
  const v = req.header("x-device-id");
  return typeof v === "string" && v.length > 0;
}

/**
 * Two faces:
 *  - the real Coinflow surface `/api/checkout/*` + the hosted iframe `/__iframe__/*`
 *    — the only things the integration sees;
 *  - a verifier-only control plane `/__mock__/*` — reset state, set the velocity config,
 *    read the request log. The integration must never touch `/__mock__`.
 */
export function createMockServer(config: OracleConfig = DEFAULT_CONFIG): MockServer {
  const store = new MockStore(config);
  const app = express();

  // Permissive CORS — this is a local test oracle. Real ZA calls are same-origin
  // (the iframe is mock-served); this just removes friction for any client-side call.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "content-type, x-device-id");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json());

  function send(
    req: Request,
    res: Response,
    matchedRoute: string | null,
    result: Result<unknown>,
    referenceField: ReferenceField = "none",
  ): void {
    store.log.push({
      n: store.log.length + 1,
      method: req.method,
      path: req.path,
      matchedRoute,
      deviceIdHeaderPresent: hasDeviceId(req),
      authHeaderPresent: (req.header("authorization")?.length ?? 0) > 0,
      userIdHeaderPresent: (req.header("x-coinflow-auth-user-id")?.length ?? 0) > 0,
      referenceField,
      status: result.ok ? 200 : result.status,
      code: result.ok ? null : result.code,
    });
    if (result.ok) {
      res.status(200).json(result.value);
    } else {
      res.status(result.status).json({ error: result.code, message: result.message });
    }
  }

  // --- Real Coinflow surface ---
  app.post("/api/checkout/zero-authorization/:merchantId", (req, res) => {
    const merchantId = req.params.merchantId ?? "";
    send(req, res, "zero-authorization", store.zeroAuth(merchantId, (req.body ?? {}) as ZeroAuthBody));
  });

  app.post("/api/checkout/token/:merchantId", (req, res) => {
    const merchantId = req.params.merchantId ?? "";
    send(req, res, "token", store.tokenize(merchantId, (req.body ?? {}) as TokenizeBody));
  });

  app.post("/api/checkout/card/:merchantId", (req, res) => {
    const merchantId = req.params.merchantId ?? "";
    send(req, res, "card", store.cardCharge(merchantId, (req.body ?? {}) as CardChargeBody));
  });

  app.post("/api/checkout/card-on-file", (req, res) => {
    const body = (req.body ?? {}) as CardOnFileBody;
    send(req, res, "card-on-file", store.cardOnFile(body, hasDeviceId(req)), store.classifyReferenceField(body));
  });

  // --- Mock-served hosted card-entry iframe (the "Coinflow origin") ---
  app.get("/__iframe__/card-entry", (req, res) => {
    const merchantId = typeof req.query.merchantId === "string" ? req.query.merchantId : "";
    res.type("html").send(renderCardEntryPage(merchantId));
  });

  // --- Verifier-only control plane ---
  app.get("/__mock__/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/__mock__/reset", (req, res) => {
    const cfg = (req.body?.config as OracleConfig | undefined) ?? DEFAULT_CONFIG;
    store.reset(cfg);
    res.json({ ok: true, config: store.config });
  });

  app.post("/__mock__/config", (req, res) => {
    store.setConfig((req.body ?? {}) as Partial<OracleConfig>);
    res.json({ ok: true, config: store.config });
  });

  app.get("/__mock__/log", (_req, res) => {
    res.json(store.getLog());
  });

  // --- Anything else under /api is an endpoint that does not exist → hallucinated_endpoint ---
  app.all("/api/*", (req, res) => {
    send(req, res, null, {
      ok: false,
      status: 404,
      code: "UNKNOWN_ENDPOINT",
      message: `No such Coinflow endpoint: ${req.method} ${req.path}`,
    });
  });

  return { app, store };
}
