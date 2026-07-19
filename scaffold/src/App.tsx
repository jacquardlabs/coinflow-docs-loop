import { useState } from "react";
import { ZeroAuthStep } from "@integration/frontend";
import type { ChargeResult } from "./contract";

// Fixed shell. Owns the UI chrome, the Charge button, and the result states — all on
// stable data-testids the verifier keys on. The agent cannot break these; it only
// supplies ZeroAuthStep (the ZA wiring) and the backend charge() behind /charge.
export function App() {
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ChargeResult | null>(null);
  const [charging, setCharging] = useState(false);

  async function onCharge() {
    if (!paymentId) return;
    setCharging(true);
    try {
      const res = await fetch("/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId, deviceId }),
      });
      setResult((await res.json()) as ChargeResult);
    } catch {
      setResult({ status: "error", code: "network" });
    } finally {
      setCharging(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "24px auto" }}>
      <h2>Store a card, then charge it</h2>

      <section>
        <h3>1 · Zero Authorization</h3>
        <ZeroAuthStep onPaymentId={setPaymentId} onDeviceId={setDeviceId} />
        {paymentId && <p data-testid="za-payment-id">{paymentId}</p>}
      </section>

      <section>
        <h3>2 · Card on File</h3>
        <button data-testid="charge-button" disabled={!paymentId || charging} onClick={onCharge}>
          Charge $25
        </button>
        {result?.status === "charged" && <p data-testid="charge-success">charged: {result.paymentId}</p>}
        {result?.status === "needs_reverification" && (
          <p data-testid="charge-reverify">Please re-verify your card to continue.</p>
        )}
        {result?.status === "error" && <p data-testid="charge-error">error: {result.code ?? "unknown"}</p>}
      </section>
    </main>
  );
}
