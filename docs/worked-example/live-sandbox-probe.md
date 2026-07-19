# Live sandbox probe — pinning the mock to reality

`COINFLOW_MODE=sandbox pnpm probe` against `https://api-sandbox.coinflow.cash`
(merchant `applied-ai`, test PAN `4111…`, no real charge). This is the concrete
"the mock is only as faithful as its contract" mitigation: one live call validated the
Card-on-File contract and discovered the real auth model.

## Confirmed against the real API

- **Endpoint** `POST /api/checkout/card-on-file` exists and is reachable.
- **`originalPaymentId` is the real reference field** — a placeholder id returned
  `410 "Could not locate original payment"`, i.e. the API tried to resolve it.
- **Auth (COF)** = `Authorization: <merchant-api-key>` (raw, **not** `Bearer`) **+**
  `x-coinflow-auth-user-id: <customer>`. A test user id passed auth.
- **410 semantics**: a missing / expired / unusable reference → **410**, message points to
  CVV revalidation via `/api/checkout/card/token`.

## Divergences found → action

| divergence | mock (before) | real | action |
|---|---|---|---|
| missing reference | `404 UNKNOWN_REFERENCE` | `410 "Could not locate original payment"` | **pinned** mock → 410 |
| COF auth | none required | `Authorization: <key>` + `x-coinflow-auth-user-id` | documented; **promotable** to an "auth headers present" line-item |
| ZA **API** auth | none | wallet + blockchain scoped (`x-coinflow-auth-wallet`, then `x-coinflow-auth-blockchain`) | ZA for cards is SDK/iframe-driven; pure-API ZA is crypto-wallet-oriented |

## Raw responses (debugIds retained; no secrets)

```
COF (placeholder ref) -> 410
  {"message":"Validation for this card has expired. Revalidate the CVV ... using
   the /api/checkout/card/token ...","reason":"Could not locate original payment"}

ZA (no wallet)        -> 401 {"details":"Header x-coinflow-auth-wallet is required"}
ZA (wallet, no chain) -> 401 {"details":"Header x-coinflow-auth-blockchain is required"}
```

The offline mock stayed deterministic and CI-safe; one live probe confirmed the COF
mechanics, pinned the missing-reference response 404→410, and surfaced the real auth model
as the next thing to promote into the rubric. That's the discovery→promotion loop, live.
