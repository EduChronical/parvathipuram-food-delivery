# Parvathipuram Bites — PHASE 2 Backend Only

This package contains only backend API contracts, route definitions, service-layer business logic, background order/notification jobs, and provider adapters. It contains no frontend code and no swarm-agent/test-bot code.

## Phase-1 dependency

Target schema: the Phase-1 PostgreSQL bundle produced immediately before this package (`app_users`, `orders`, `wallet_ledger`, `order_tips`, `delivery_fee_accounting`, `restaurant_settlement_ledger`, `notifications`, cancellation/rejection records, RLS/RBAC roles and triggers).

Phase 2 intentionally does not add or alter database tables.

## Runtime

- Node.js 20+
- PostgreSQL with Phase-1 migrations already applied
- npm package: `pg`
- Separate API and worker processes are recommended

Install and run:

```bash
npm install
cp .env.example .env
npm start
```

Worker process:

```bash
npm run worker
```

Syntax validation:

```bash
npm run check
```

## Database runtime role setup

The login used by `DATABASE_URL` must be allowed to `SET ROLE` to the Phase-1 roles:

```sql
GRANT pb_authenticated, pb_worker TO app_runtime;
```

Do not grant `pb_super_service` to the web/API login.

`SYSTEM_ACTOR_USER_ID` must refer to an active Phase-1 `app_users` row with role `super_admin`. Phase-1 status/audit triggers insert into tables whose RLS write policy is admin-only, so transactional service writes run under this database-side service actor. The backend independently verifies the real JWT actor's role and ownership inside the same transaction before changing business data, and request IDs are annotated with the real actor ID for audit correlation.

JWT role claims are never trusted.

## Security properties

- Parameterized SQL only.
- HS256 JWT validation checks signature, issuer, audience, expiry and not-before.
- Application role is loaded from PostgreSQL.
- Order write services re-check actor role and resource ownership inside locked transactions.
- Customer order prices come only from `menu_items`; client prices are ignored.
- Delivery fee comes only from database configuration and server-calculated Haversine distance.
- Customer order creation is idempotent using Phase-1 `(customer_id,idempotency_key)` uniqueness.
- Cancellation/rejection reason rows are inserted before status transitions, matching Phase-1 triggers.
- Rider offer acceptance locks both assignment and order, preventing double assignment.
- Offline/stale riders are excluded from dispatch.
- Wallet ledger remains append-only; refunds create reversing `adjustment_debit` entries.
- Payment webhooks use HMAC-SHA256 and event-level advisory locking.
- Zero platform deduction is checked both in service code and by Phase-1 database constraints.

## Settlement behavior

`buildZeroCommissionSplit()` defines the single financial split used by the backend:

```text
restaurant = food_total_paise
rider      = delivery_fee_paise + tip_paise
platform   = 0
```

Delivery completion causes the existing Phase-1 database trigger to post the delivery fee and tip into the rider wallet ledger. Restaurant food settlement stays in `restaurant_settlement_ledger` and becomes `paid` only when a signed provider `split_settled` event confirms the direct transfer.

For COD, delivery completion records a paid COD transaction and the restaurant settlement remains `processing` until the settlement rail confirms transfer/remittance. The backend never creates a platform-revenue ledger entry.

## Files

- `openapi/openapi.json` — API contract
- `API_CONTRACTS.md` — route/state/job contract summary
- `src/domain/finance.js` — zero-commission split invariant
- `src/services/order.service.js` — create/cancel/accept/reject/pickup/deliver logic
- `src/services/rider.service.js` — availability/offers/wallet logic
- `src/services/payment.service.js` — payment and pass-through settlement event logic
- `src/services/notification.service.js` — SMS/in-app enqueue logic
- `src/workers/assignment.worker.js` — online-rider offer dispatcher
- `src/workers/unassigned.worker.js` — configurable unassigned timeout handling
- `src/workers/notification.worker.js` — notification queue consumer
- `src/providers/sms.provider.js` — configurable SMS HTTP adapter
- `src/providers/payment-webhook.js` — HMAC verification
- `src/routes/*` — route definitions

No frontend, UI, or autonomous swarm code is included.
