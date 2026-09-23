# 7. Consolidated Project Reference Map

## Phase 1 — database

Original downloadable bundle:

```text
parvathipuram-phase1-postgres/
  ALL_MIGRATIONS.sql
  migrations/
    000_extensions_roles_types.sql
    001_identity_catalog.sql
    002_orders_finance.sql
    003_operations_sync_audit.sql
    004_functions_triggers.sql
    005_rls_rbac.sql
    006_indexes_views.sql
    007_invariant_guards.sql
    008_validation_queries.sql
```

Original Phase-1 public-schema core tables:

```text
app_users
restaurants
restaurant_hours
restaurant_media
menu_items
saved_addresses
delivery_agents
app_config
festival_banners
orders
order_items
order_events
order_cancellations
order_rejections
delivery_assignments
unassigned_order_logs
payment_transactions
wallet_accounts
wallet_ledger
order_tips
delivery_fee_accounting
restaurant_settlement_ledger
reviews
notifications
complaints
fraud_flags
sync_job_configs
sync_jobs
sync_job_logs
sync_field_changes
bug_logs
backup_runs
audit_log
```

Views:

```text
restaurant_daily_sales
restaurant_top_selling_dishes
delivery_agent_wallet_summary
platform_zero_commission_reconciliation
```

Later schema generation used by Phases 4–6 uses an `app` namespace and additional/different names such as:

```text
app.app_users
app.user_role_bindings
app.restaurants
app.menu_items
app.delivery_agents
app.delivery_agent_locations
app.delivery_offers
app.orders
app.unassigned_order_events
app.wallet_ledger_entries
app.delivery_agent_payouts
app.sync_field_locks
app.sync_entity_changes
app.system_alerts
app.v_wallet_summary
app.v_live_demand_heatmap
app.v_admin_live_dashboard
```

## Phase 2 — backend

Key files:

```text
src/server.js
src/app.js
src/db.js
src/security/jwt.js
src/services/order.service.js
src/services/payment.service.js
src/services/rider.service.js
src/services/notification.service.js
src/workers/assignment.worker.js
src/workers/unassigned.worker.js
src/workers/notification.worker.js
openapi/openapi.json
API_CONTRACTS.md
```

Core routes:

```text
POST /v1/orders
GET  /v1/orders/:orderId
POST /v1/orders/:orderId/cancel

POST /v1/restaurants/:restaurantId/orders/:orderId/accept
POST /v1/restaurants/:restaurantId/orders/:orderId/reject

PATCH /v1/riders/me/availability
POST  /v1/riders/me/heartbeat
GET   /v1/riders/me/offers
POST  /v1/riders/me/offers/:assignmentId/accept
POST  /v1/riders/me/offers/:assignmentId/reject
POST  /v1/riders/me/orders/:orderId/pickup
POST  /v1/riders/me/orders/:orderId/deliver
GET   /v1/riders/me/wallet

GET  /v1/notifications

POST /v1/internal/payment-events
```

## Phase 3 — customer + restaurant

Backend glue:

```text
backend-glue/src/register-phase3-routes.js
backend-glue/src/routes/catalog.routes.js
backend-glue/src/routes/customer-dashboard.routes.js
backend-glue/src/routes/restaurant-dashboard.routes.js
```

Customer/catalog routes:

```text
GET    /v1/catalog/restaurants
GET    /v1/catalog/restaurants/:restaurantId/menu
GET    /v1/customers/me/addresses
POST   /v1/customers/me/addresses
PATCH  /v1/customers/me/addresses/:addressId
DELETE /v1/customers/me/addresses/:addressId
GET    /v1/customers/me/orders
POST   /v1/orders/:orderId/reorder
POST   /v1/orders/:orderId/review
```

Restaurant routes:

```text
GET   /v1/restaurants/:restaurantId/dashboard
GET   /v1/restaurants/:restaurantId/orders
PATCH /v1/restaurants/:restaurantId/open-state
GET   /v1/restaurants/:restaurantId/owner-menu
PATCH /v1/restaurants/:restaurantId/menu/:menuItemId/availability
PATCH /v1/restaurants/:restaurantId/menu/:menuItemId
GET   /v1/restaurants/:restaurantId/reviews
```

Frontends:

```text
CustomerDashboard
RestaurantOwnerDashboard
RestaurantBrowser
RestaurantFilters
SavedAddresses
TipSelector
CancelOrderDialog
ReviewForm
OrderHistory
```

## Phase 4 — rider + super admin

Rider routes:

```text
POST  /v1/rider-dashboard/register
GET   /v1/rider-dashboard/me
PATCH /v1/rider-dashboard/me/availability
POST  /v1/rider-dashboard/me/heartbeat
GET   /v1/rider-dashboard/me/offers
POST  /v1/rider-dashboard/me/offers/:offerId/accept
POST  /v1/rider-dashboard/me/offers/:offerId/reject
GET   /v1/rider-dashboard/me/current-delivery
GET   /v1/rider-dashboard/me/wallet
GET   /v1/rider-dashboard/me/demand-heatmap
```

Admin routes:

```text
GET  /v1/admin-dashboard/live
GET  /v1/admin-dashboard/logs
GET  /v1/admin-dashboard/fraud-flags
POST /v1/admin-dashboard/fraud-flags/:flagId/resolve
POST /v1/admin-dashboard/fraud/scan/:orderId
GET  /v1/admin-dashboard/reports/orders.csv
```

Frontend modules:

```text
RiderDashboard
RiderRegistration
RiderWallet
IncomingOffers
ActiveDelivery
DemandHeatmap

SuperAdminDashboard
LiveOperations
OrderReportExport
FraudFlags
OperationalLogs
```

## Phase 5 — background services

Commands:

```text
npm run backup
npm run unassigned
npm run sync:schedule
npm run sync:drain
npm run sync:control -- list
npm run sync:control -- pause SOURCE_UUID
npm run sync:control -- resume SOURCE_UUID
npm run sync:control -- disable SOURCE_UUID
npm run sync:control -- run SOURCE_UUID
```

Worker files:

```text
src/workers/backup.worker.js
src/workers/unassigned-order.worker.js
src/workers/catalog-scheduler.worker.js
src/workers/catalog-sync.worker.js
```

Sync:

```text
src/sync/catalog-sync.service.js
src/sync/sync-control.service.js
src/sync/adapters/csv.js
src/sync/adapters/json.js
src/sync/safe-feed-fetch.js
src/sync/normalize.js
```

Schedules:

```text
cron/production.crontab
deploy/k8s/cronjobs.yaml
```

Backup role:

```text
deploy/backup-role.sql
```

## Phase 6 — QA/test swarm

Commands:

```text
npm run swarm
npm run swarm:smoke
npm run test:unit
npm run test:e2e
npm run test:e2e:mobile
npm run test:load
npm run bugs:summary
npm run regression
npm run watch:regression -- <source-dir>
```

Agents:

```text
customer-bot
restaurant-bot
rider-bot
failure-injection-bot
load-test-bot
```

Scenarios:

```text
fullLifecycle
cancellation
restaurantRejection
paymentFailure
idempotency
roleBoundary
faultInjection
concurrentOrders
```

Artifacts:

```text
artifacts/bugs.jsonl
artifacts/bugs.summary.json
artifacts/swarm-run.json
artifacts/strategy-state.json
artifacts/traces/
artifacts/k6-summary.json
artifacts/regression-gate.json
```

Playwright:

```text
e2e/customer.spec.js
e2e/restaurant.spec.js
e2e/rider.spec.js
e2e/admin.spec.js
e2e/mobile-ui.spec.js
```

k6:

```text
load/k6-concurrent-users.js
```

## Financial invariants to preserve everywhere

```text
platform_fee = 0
restaurant food settlement = 100% food total
rider delivery income = 100% delivery fee
rider tip income = 100% tip
```

## Order lifecycle reference

The exact enum/state names differ slightly between schema generations. The common business sequence is:

```text
placed
→ accepted
→ rider assigned
→ picked up
→ delivered
```

Alternative terminal/exception flows:

```text
placed → cancelled
placed/accepted → rejected
accepted/rider-search → unassigned
payment attempt → payment_failed where applicable
```

Never bypass required dedicated cancellation/rejection/unassigned records.

## Ownership of major responsibilities

```text
Database integrity/RLS              Phase 1
Core business APIs                  Phase 2
Customer + restaurant UX            Phase 3
Rider + super-admin UX              Phase 4
Backup + timeout + catalog workers  Phase 5
QA simulations/regression           Phase 6
Operations documentation            Phase 7
```
