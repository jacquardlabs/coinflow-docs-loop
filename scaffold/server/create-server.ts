import express from "express";
import type { Express } from "express";
import type { ChargeContext, ChargeFn } from "../src/contract.js";

// Fixed backend shell. Mounts the agent's charge() at POST /charge. If the agent's code
// throws instead of normalizing (e.g. an unhandled 410), the shell surfaces a raw error
// — which is exactly what the graceful-410 line-item is meant to catch.
export function createIntegrationServer(charge: ChargeFn, ctx: ChargeContext): Express {
  const app = express();
  app.use(express.json());

  app.post("/charge", async (req, res) => {
    const body = (req.body ?? {}) as { paymentId?: string; deviceId?: string };
    if (typeof body.paymentId !== "string") {
      res.status(400).json({ status: "error", code: "missing_payment_id" });
      return;
    }
    try {
      res.json(await charge({ paymentId: body.paymentId, deviceId: body.deviceId }, ctx));
    } catch {
      res.json({ status: "error", code: "unhandled_exception" });
    }
  });

  return app;
}
