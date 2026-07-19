import type { PaymentRecord, VelocityConfig } from "./types.js";

/**
 * The 410 rule, isolated and pure.
 *
 * A CVV-verified reference may be reused for Card-on-File charges up to `maxMultiple`
 * times. The (maxMultiple + 1)th reuse trips a 410 ("reference no longer usable").
 *
 * Determinism comes from *controlling this config*, not from a test hook: set
 * maxMultiple = 1 and the second charge against a reference is guaranteed to 410.
 * We exercise the real mechanism; we just make it fire on command.
 */
export function isReuseAllowed(record: PaymentRecord, cfg: VelocityConfig): boolean {
  return record.reuseCount < cfg.maxMultiple;
}
