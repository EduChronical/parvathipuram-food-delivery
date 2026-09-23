# Parvathipuram Bites — Phase 4

Phase 4 is an additive source-code package for the completed Phase-1 PostgreSQL schema and Phase-2/Phase-3 application.

## Scope included

### Delivery Rider Dashboard
- Self-registration from an already authenticated active `app.app_users` account.
- No document-upload flow.
- Admin suspension/revocation cannot be undone by rider self-registration.
- Online/offline toggle with location requirement when going online.
- Periodic GPS heartbeat and location history insertion.
- Incoming delivery offers with accept/reject actions.
- Phase-1 trigger remains authoritative for atomic assignment and competing-offer withdrawal.
- Current delivery card and pickup/deliver actions through existing Phase-2 order workflow endpoints.
- One-tap Google Maps directions for restaurant pickup and customer delivery coordinates.
- Wallet totals from `app.v_wallet_summary`.
- Separate delivery-fee income and tip-income totals.
- Full append-only wallet ledger history plus actual rider payout history from `app.delivery_agent_payouts`.
- Parvathipuram demand heatmap from `app.v_live_demand_heatmap` using aggregate order buckets only.
- SMS + in-app offer-notification hook. The Phase-1 order-status trigger already queues rider SMS/in-app notifications when an order becomes `assigned`.

### Super Admin Core
- Live counts from `app.v_admin_live_dashboard`.
- Online/offline rider list with heartbeat-based effective-online state, stale-session indication, rider last-seen state and active-delivery indicator.
- Active restaurant list and live-order counts.
- Live incoming/order-in-progress view.
- Daily, weekly and monthly CSV order exports using Asia/Kolkata calendar boundaries.
- CSV formula-injection protection for spreadsheet safety.
- Fraud-risk rules and persisted `app.fraud_flags`.
- Fraud flag list, manual scan and resolve actions.
- Cancelled/rejected/unassigned log viewer with stored reasons.

## Fraud rules

The Phase-4 service can create unresolved flags for:
- High-value order (`FRAUD_BULK_VALUE_PAISE`, default 500000 paise / ₹5,000).
- Large total item quantity (`FRAUD_BULK_ITEM_QTY`, default 25).
- Four or more orders by one customer within 30 minutes.
- Three or more cancellations within 24 hours.
- Three or more failed payment attempts within 6 hours.

`backend-glue/FRAUD_AND_SMS_HOOKS.md` shows the two integration hooks: fraud evaluation after order creation/payment failure, and rider SMS/in-app notification after a delivery offer is created.

## Backend integration

Copy `backend-glue/src/` into the existing Phase-2/Phase-3 backend `src/` tree.

In `src/app.js`:

```js
import { registerPhase4Routes } from './register-phase4-routes.js';
registerPhase4Routes(router);
```

No new backend package dependency is required beyond the Phase-2 backend dependencies.

The Phase-4 database wrapper sets all three Phase-1 request GUCs:
- `app.user_id`
- `app.user_role`
- `app.request_id`

Every rider/admin route revalidates the matching active Phase-1 role binding. The database RLS/triggers remain authoritative.

## Frontend integration

`frontend/` can run as a small Vite host for Phase-4 screens, or its modules can be merged into the Phase-3 frontend.

Exports:

```js
export { RiderDashboard } from './rider/RiderDashboard.jsx';
export { SuperAdminDashboard } from './admin/SuperAdminDashboard.jsx';
```

The standalone host selects `?mode=rider` or `?mode=admin`. In the integrated application, pass the authenticated access token through props rather than depending on the demo entrypoint.

## Existing Phase-2 endpoints reused

The rider active-delivery UI intentionally reuses:
- `POST /v1/riders/me/orders/:orderId/pickup`
- `POST /v1/riders/me/orders/:orderId/deliver`

Phase 4 does not duplicate the Phase-2 order-state machine.

## Phase-4 backend routes

See `BACKEND_GLUE_ROUTES.md`. There are 16 new Phase-4 routes: 10 rider-dashboard routes and 6 super-admin routes.

## Explicitly excluded

- Weekly catalog synchronization worker.
- Zomato/Swiggy/catalog scraping implementation.
- Test-swarm/self-patching agents.
- Customer dashboard changes.
- Restaurant-owner dashboard changes.

## Validation

See `VALIDATION.txt`. Static source validation is complete. A live PostgreSQL execution test still requires deployment credentials and a running database containing the completed Phase-1 migrations.
