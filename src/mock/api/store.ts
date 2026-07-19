import { randomUUID } from "node:crypto";
import type {
  Card,
  CardChargeBody,
  CardOnFileBody,
  OracleConfig,
  PaymentRecord,
  ReferenceField,
  RequestLogEntry,
  TokenizeBody,
  VelocityConfig,
  ZeroAuthBody,
} from "./types.js";
import { isReuseAllowed } from "./velocity.js";

export const TEST_PAN = "4111111111111111";

export const DEFAULT_VELOCITY: VelocityConfig = {
  maxMultiple: 3,
  maxCount: 5,
  period: 86_400,
  expiration: 2_592_000,
  maxZeroAuthAmount: 0,
};

export const DEFAULT_CONFIG: OracleConfig = {
  velocity: DEFAULT_VELOCITY,
  requireDeviceId: false,
};

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; status: number; code: string; message: string };
export type Result<T> = Ok<T> | Err;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const fail = (status: number, code: string, message: string): Err => ({ ok: false, status, code, message });

function cardFingerprint(card?: Card, token?: string): string {
  if (token) return `tok_${token}`;
  if (card?.number) return `pan_${card.number.slice(-4)}`;
  return "unknown";
}

interface ReferenceResolution {
  kind: "originalPaymentId" | "token" | "missing" | "misplaced" | "unknown";
  record?: PaymentRecord;
}

/**
 * The oracle's brain. In-memory and ephemeral: a fresh store per verifier run keeps
 * N=3 runs independent and reproducible. It is a STATEFUL oracle, not an echo — it
 * remembers which paymentIds it issued so it can tell a correct reference from a
 * hallucinated one, which is the only thing that makes the COF-correct-ref line-item mean anything.
 */
export class MockStore {
  private payments = new Map<string, PaymentRecord>();
  private tokens = new Map<string, { cardFingerprint: string; seq: number }>();
  private seq = 0;
  log: RequestLogEntry[] = [];
  config: OracleConfig;

  constructor(config: OracleConfig = DEFAULT_CONFIG) {
    this.config = structuredClone(config);
  }

  reset(config: OracleConfig = DEFAULT_CONFIG): void {
    this.payments.clear();
    this.tokens.clear();
    this.log = [];
    this.seq = 0;
    this.config = structuredClone(config);
  }

  setConfig(partial: Partial<OracleConfig>): void {
    this.config = {
      velocity: { ...this.config.velocity, ...(partial.velocity ?? {}) },
      requireDeviceId: partial.requireDeviceId ?? this.config.requireDeviceId,
    };
  }

  private nextSeq(): number {
    return (this.seq += 1);
  }

  private newPayment(
    merchantId: string,
    cvvVerified: boolean,
    fingerprint: string,
    type: PaymentRecord["type"],
  ): PaymentRecord {
    const record: PaymentRecord = {
      paymentId: randomUUID(),
      merchantId,
      cvvVerified,
      cardFingerprint: fingerprint,
      type,
      reuseCount: 0,
      createdAtSeq: this.nextSeq(),
    };
    this.payments.set(record.paymentId, record);
    return record;
  }

  isKnownPaymentId(value: unknown): boolean {
    return typeof value === "string" && this.payments.has(value);
  }

  /** For the request log: where did the caller put the saved-card reference? */
  classifyReferenceField(body: CardOnFileBody): ReferenceField {
    if (typeof body.originalPaymentId === "string") return "originalPaymentId";
    if (typeof body.token === "string") return "token";
    for (const value of Object.values(body)) {
      if (this.isKnownPaymentId(value)) return "other";
    }
    return "none";
  }

  private resolveReference(body: CardOnFileBody): ReferenceResolution {
    if (typeof body.originalPaymentId === "string") {
      const record = this.payments.get(body.originalPaymentId);
      return record ? { kind: "originalPaymentId", record } : { kind: "unknown" };
    }
    if (typeof body.token === "string") {
      const t = this.tokens.get(body.token);
      if (!t) return { kind: "unknown" };
      const record = this.mostRecentCvvVerified(t.cardFingerprint);
      return record ? { kind: "token", record } : { kind: "unknown" };
    }
    // No reference in a documented field. Did they put a real paymentId somewhere else?
    for (const value of Object.values(body)) {
      if (this.isKnownPaymentId(value)) return { kind: "misplaced" };
    }
    return { kind: "missing" };
  }

  private mostRecentCvvVerified(fingerprint: string): PaymentRecord | undefined {
    let best: PaymentRecord | undefined;
    for (const p of this.payments.values()) {
      if (p.cvvVerified && p.cardFingerprint === fingerprint && (!best || p.createdAtSeq > best.createdAtSeq)) {
        best = p;
      }
    }
    return best;
  }

  /** Zero Authorization: a $0, CVV-verified tokenization that returns a reusable paymentId. */
  zeroAuth(merchantId: string, body: ZeroAuthBody): Result<{ paymentId: string }> {
    if (!body.card && !body.token) {
      return fail(400, "MISSING_CARD", "Provide either `card` or `token` for zero authorization.");
    }
    if (body.card && !body.card.cvv) {
      return fail(400, "MISSING_CVV", "Zero authorization requires the card CVV.");
    }
    if (body.token && !this.tokens.has(body.token)) {
      return fail(400, "UNKNOWN_TOKEN", "The provided card token is not recognized.");
    }
    const record = this.newPayment(merchantId, true, cardFingerprint(body.card, body.token), "zero-auth");
    return ok({ paymentId: record.paymentId });
  }

  tokenize(_merchantId: string, body: TokenizeBody): Result<{ token: string }> {
    if (!body.card?.number) {
      return fail(400, "MISSING_CARD", "Provide `card` to tokenize.");
    }
    const token = `tok_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.tokens.set(token, { cardFingerprint: cardFingerprint(body.card), seq: this.nextSeq() });
    return ok({ token });
  }

  cardCharge(merchantId: string, body: CardChargeBody): Result<{ paymentId: string }> {
    if (!body.card?.number) {
      return fail(400, "MISSING_CARD", "Provide `card` to charge.");
    }
    if (!body.card.cvv) {
      return fail(400, "MISSING_CVV", "A customer-present card charge requires the CVV.");
    }
    const record = this.newPayment(merchantId, true, cardFingerprint(body.card), "card-charge");
    return ok({ paymentId: record.paymentId });
  }

  cardOnFile(body: CardOnFileBody, deviceIdPresent: boolean): Result<{ paymentId: string }> {
    if (this.config.requireDeviceId && !deviceIdPresent) {
      return fail(400, "MISSING_DEVICE_ID", "Chargeback protection is enabled; the x-device-id header is required.");
    }
    const ref = this.resolveReference(body);
    if (ref.kind === "missing") {
      return fail(400, "MISSING_REFERENCE", "Provide `originalPaymentId` or `token` to identify the saved card.");
    }
    if (ref.kind === "misplaced") {
      return fail(400, "REFERENCE_IN_WRONG_FIELD", "A known paymentId was supplied, but not in the `originalPaymentId` field.");
    }
    if (ref.kind === "unknown" || !ref.record) {
      return fail(404, "UNKNOWN_REFERENCE", "The referenced payment does not exist.");
    }
    const record = ref.record;
    if (!record.cvvVerified) {
      return fail(400, "NOT_CVV_VERIFIED", "The referenced payment is not CVV-verified.");
    }
    if (!isReuseAllowed(record, this.config.velocity)) {
      return fail(410, "REFERENCE_NO_LONGER_USABLE", "The original payment reference can no longer be used (velocity limit exceeded).");
    }
    record.reuseCount += 1;
    const charge = this.newPayment(record.merchantId, false, record.cardFingerprint, "card-on-file");
    return ok({ paymentId: charge.paymentId });
  }

  getLog(): RequestLogEntry[] {
    return this.log;
  }
}
