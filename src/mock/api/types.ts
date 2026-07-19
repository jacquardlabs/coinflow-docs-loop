// Shared contract for the mock Coinflow oracle.
//
// This is pinned to Coinflow's *actual* surface (PDF spec + the real .md docs +,
// later, a live-validation pass) and is deliberately INDEPENDENT of the docs page
// under optimization. The oracle is the fixed ground truth; the docs are the mutable
// artifact. If either derived from the other, the loss function would be circular.

export type Currency = "USD";

export interface Subtotal {
  cents: number;
  currency: Currency;
}

export interface Card {
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

export interface VelocityConfig {
  /** Max times a single CVV-verified reference may be reused for Card-on-File charges. */
  maxMultiple: number;
  /** Max charge count within `period` (carried; not enforced in v1). */
  maxCount: number;
  /** Rolling window, seconds (carried; not enforced in v1). */
  period: number;
  /** Reference lifetime, seconds (carried; time-based expiry not enforced in v1 for determinism). */
  expiration: number;
  /** Max zero-auth amount, cents (carried). */
  maxZeroAuthAmount: number;
}

export interface OracleConfig {
  velocity: VelocityConfig;
  /** When true, Card-on-File requires the `x-device-id` header (chargeback protection on). Off in rubric v1. */
  requireDeviceId: boolean;
}

export interface PaymentRecord {
  paymentId: string;
  merchantId: string;
  cvvVerified: boolean;
  cardFingerprint: string;
  type: "zero-auth" | "card-charge" | "card-on-file";
  /** Times this payment has been used as a Card-on-File reference. */
  reuseCount: number;
  /** Monotonic sequence for "most recent" resolution — no wall clock, so runs stay deterministic. */
  createdAtSeq: number;
}

export interface ZeroAuthBody {
  card?: Card;
  token?: string;
  [key: string]: unknown;
}

export interface CardOnFileBody {
  subtotal?: Subtotal;
  originalPaymentId?: string;
  token?: string;
  [key: string]: unknown;
}

export interface TokenizeBody {
  card?: Card;
  [key: string]: unknown;
}

export interface CardChargeBody {
  card?: Card;
  subtotal?: Subtotal;
  [key: string]: unknown;
}

export type ReferenceField = "originalPaymentId" | "token" | "other" | "none";

/** One row of the oracle's request log — the verifier's deterministic observability surface. */
export interface RequestLogEntry {
  n: number;
  method: string;
  path: string;
  /** null => the integration called an endpoint that does not exist (hallucinated_endpoint). */
  matchedRoute: string | null;
  deviceIdHeaderPresent: boolean;
  referenceField: ReferenceField;
  status: number;
  code: string | null;
}
