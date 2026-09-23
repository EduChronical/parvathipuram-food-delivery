# Parvathipuram Bites — Complete Final Manual


---

# Parvathipuram Bites — Final Documentation Bundle

This is the Phase-7 documentation package for the Parvathipuram hyperlocal food-delivery application built across Phases 1–6.

## Documents

1. `01_CLOUD_DEPLOYMENT_GUIDE.md` — production-style cloud deployment sequence.
2. `02_ADMIN_PANEL_OPERATION_MANUAL.md` — super-admin operating procedures.
3. `03_CATALOG_SYNC_SETUP_GUIDE.md` — authorized CSV/JSON feed configuration and operations.
4. `04_TEST_SWARM_EXECUTION_GUIDE.md` — simulation swarm, Playwright, k6 and regression-gate usage.
5. `05_FULL_FEATURE_MATRIX.md` — implementation/checklist matrix across all phases.
6. `06_TROUBLESHOOTING_CHECKLIST.md` — common database, API, UI, worker, sync and test failures.
7. `07_PROJECT_REFERENCE_MAP.md` — consolidated SQL/API/worker/test reference.

## Source bundles referenced

- Phase 1: `parvathipuram-phase1-postgres.zip`
- Phase 2: `parvathipuram-phase2-backend.zip`
- Phase 3: `parvathipuram-phase3-dashboards.zip`
- Phase 4: `parvathipuram-phase4-rider-admin.zip`
- Phase 5: `parvathipuram-phase5-workers.zip`
- Phase 6: `parvathipuram-phase6-test-swarm.zip`

## Important pre-production compatibility checkpoint

There are two database-schema generations in the project artifacts:

**Generation A — original downloadable Phase-1 bundle**
- public-schema objects such as `orders`, `restaurants`, `wallet_ledger`, `unassigned_order_logs`;
- application role enum includes `restaurant_owner`;
- uses PostgreSQL group roles `pb_authenticated`, `pb_worker`, `pb_super_service`;
- Phases 2 and 3 were generated against this model.

**Generation B — later app-schema model used while building Phases 4–6**
- namespaced objects such as `app.orders`, `app.restaurants`, `app.wallet_ledger_entries`, `app.unassigned_order_events`;
- uses `app.user_role`, `app.user_role_bindings` and related helper functions/views;
- Phases 4, 5 and the optional Phase-6 database bug sink were generated against this model.

Do not deploy the unmodified Generation-A Phase-2/3 code and Generation-B Phase-4/5 code against one database and assume table names/RLS semantics match.

Before production go-live, standardize on one schema model and update the other phase's SQL references/RLS context accordingly. The deployment and troubleshooting documents identify the affected areas. This is the main remaining integration reconciliation item; it is not a documentation issue and should be treated as a code/schema integration gate before production.

## Validation meaning

Each phase performed static/source validation appropriate to that phase. A complete live production deployment, real SMS/payment-provider integration, and end-to-end execution against one reconciled database were not performed in this artifact environment.

Use the Phase-6 regression gate against a QA environment after schema/API integration and before promoting to production.


---

# 1. Cloud Deployment Guide

This guide is provider-neutral. It works with a typical architecture made of managed PostgreSQL, Node.js application services, static React/Vite frontends, scheduled workers, object storage for backups, SMS/payment providers and HTTPS ingress.

## A. Recommended production topology

Use separate runtime units for:

- PostgreSQL 15+ managed database.
- Phase-2 API service with Phase-3/4 backend route glue merged into it.
- Phase-2 continuous worker process for assignment and notifications.
- Phase-3/4 compiled frontend static assets behind HTTPS.
- Phase-5 scheduled/queue workers.
- Object storage for database backups.
- Reverse proxy/load balancer with TLS.
- Central logging/metrics.
- QA environment for Phase-6 swarm/Playwright/k6.

Do not run destructive load or failure-injection tests directly against production.

## B. Pre-deployment reconciliation gate

Before creating cloud resources, decide which Phase-1 schema generation is canonical.

### Option 1 — keep original Phase-1 public-schema model

This aligns most directly with Phase 2 and Phase 3.

You must adapt Phase-4 and Phase-5 SQL references from their later `app.*` model to the original Phase-1 objects. Examples include:

- `app.orders` → `orders`
- `app.restaurants` → `restaurants`
- `app.app_users` → `app_users`
- `app.fraud_flags` → `fraud_flags`
- `app.notifications` → `notifications`
- `app.unassigned_order_events` → `unassigned_order_logs`
- later wallet naming → original `wallet_accounts` / `wallet_ledger`
- later lock table logic → original `owner_locked_fields` JSONB model.

### Option 2 — standardize on later `app.*` schema model

This aligns with Phase 4 and Phase 5.

You must adapt Phase-2 and Phase-3 SQL/service logic, role naming, order states and wallet/sync table references to the later schema.

Whichever option you choose, run the Phase-6 regression suite after integration. Do not proceed to production until one database model passes all API/UI/worker flows.

## C. Cloud prerequisites

Provision:

- PostgreSQL 15 or newer.
- Node.js 20+ runtime.
- HTTPS domain names such as:
  - `api.example.com`
  - `app.example.com`
- object storage bucket for backups.
- SMS provider credentials.
- payment-provider webhook secret.
- secret manager.
- log/metric collection.
- optional container registry.

Use separate production, staging and QA databases.

## D. Database deployment — original Phase-1 bundle

If using the original Phase-1 bundle, run the numbered SQL in this order:

```text
000_extensions_roles_types.sql
001_identity_catalog.sql
002_orders_finance.sql
003_operations_sync_audit.sql
004_functions_triggers.sql
005_rls_rbac.sql
006_indexes_views.sql
007_invariant_guards.sql
```

Then run:

```text
008_validation_queries.sql
```

Equivalent consolidated file:

```text
ALL_MIGRATIONS.sql
```

Typical command:

```bash
psql "$MIGRATION_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f parvathipuram-phase1-postgres/ALL_MIGRATIONS.sql
```

The migration account must have enough privilege to install required extensions and create PostgreSQL roles.

### Original Phase-1 core roles

- `pb_authenticated` — end-user API transactions.
- `pb_worker` — background-job transactions.
- `pb_super_service` — BYPASSRLS role defined by the schema; never expose this to browsers or normal API requests.

The Phase-2 connection login must be able to execute:

```sql
SET LOCAL ROLE pb_authenticated;
```

and its worker mode must be able to execute:

```sql
SET LOCAL ROLE pb_worker;
```

Therefore the actual PostgreSQL login used by Phase 2 normally needs membership in the required group roles.

Example DBA pattern:

```sql
CREATE ROLE app_runtime LOGIN PASSWORD 'secret-from-secret-manager';
GRANT pb_authenticated, pb_worker TO app_runtime;
```

Do not hard-code the password in source control.

## E. Seed service/admin identities

Phase 2 requires `SYSTEM_ACTOR_USER_ID`.

Create an active application user whose database/application role is `super_admin`. Put that UUID in the backend secret:

```text
SYSTEM_ACTOR_USER_ID=<uuid>
```

This is an application identity used when Phase-2 service logic performs trusted transactional writes. Do not reuse an employee's personal admin account.

For the later Phase-5 `app.*` worker model, `WORKER_SERVICE_USER_ID` must point to a dedicated active application identity with the expected super-admin binding after schema reconciliation.

## F. Merge backend source

Start with the Phase-2 backend.

Copy Phase-3 backend glue into the Phase-2 `src/` tree and register `registerPhase3Routes(router)`.

Copy Phase-4 backend glue into the same backend only after resolving the schema-generation differences described above. Register `registerPhase4Routes(router)`.

The combined backend should expose:

- Phase-2 core ordering/payment/rider/notification routes.
- Phase-3 customer/catalog/restaurant-owner routes.
- Phase-4 rider-dashboard/super-admin routes.

### Phase-2 required environment

```text
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://...
DB_POOL_MAX=20

JWT_HS256_SECRET=<32+ random bytes>
JWT_ISSUER=parvathipuram-bites
JWT_AUDIENCE=parvathipuram-bites-api
SYSTEM_ACTOR_USER_ID=<super-admin app user uuid>

PAYMENT_WEBHOOK_SECRET=<random secret>
SMS_PROVIDER_URL=<authorized SMS endpoint>
SMS_PROVIDER_API_KEY=<secret>
SMS_SENDER_ID=PVBITES

RIDER_OFFER_TTL_SECONDS=30
RIDER_ONLINE_GRACE_SECONDS=90
ASSIGNMENT_POLL_MS=3000
UNASSIGNED_POLL_MS=10000
NOTIFICATION_POLL_MS=1000
NOTIFICATION_MAX_ATTEMPTS=6
NOTIFICATION_LEASE_SECONDS=60
WORKER_BATCH_SIZE=50
```

Use a secret manager for secrets.

## G. Authentication contract

The Phase-2 backend accepts HS256 bearer JWTs.

Required claims include:

- `sub` — application-user UUID.
- `iss` — must equal `JWT_ISSUER`.
- `aud` — must match `JWT_AUDIENCE`.
- optional `exp` / `nbf`.

Do not trust a JWT role claim. Phase-2 resolves authorization from the database/application user record.

The project does not contain a complete production identity-provider/signup service. Your authentication layer must issue compatible JWTs for already provisioned application users.

## H. Start API and continuous worker

API:

```bash
cd parvathipuram-phase2-backend
npm ci --omit=dev
npm run start
```

Worker:

```bash
npm run worker
```

The worker process covers the Phase-2 assignment dispatcher, unassigned timeout and notification queue logic present in that package.

If Phase 5 becomes the authoritative unassigned-timeout implementation, disable the duplicate Phase-2 timeout loop so two timeout workers do not race. Keep only one owner for each scheduled responsibility.

## I. Frontend build

Phase 3 customer/restaurant UI:

```bash
cd parvathipuram-phase3-dashboards/frontend
npm ci
npm run build
```

Phase 4 rider/admin UI:

```bash
cd parvathipuram-phase4-rider-admin/frontend
npm ci
npm run build
```

You may either:

- merge both React modules into one application shell; or
- host them as separate static bundles under different routes.

Production components should receive the authenticated token/session from your application shell. The demo `localStorage` token entrypoints are development integration harnesses, not the desired production authentication design.

## J. Reverse proxy / ingress

Use HTTPS only.

Recommended routing:

```text
/app/*         -> customer/restaurant frontend
/rider/*       -> rider frontend
/admin/*       -> admin frontend
/v1/*          -> Node API service
/health        -> API health endpoint if retained by integration
```

Prefer same-origin frontend/API routing where practical to avoid accidental CORS configuration problems.

Set sensible request-body limits and proxy timeouts. Do not expose PostgreSQL publicly.

## K. Payment webhook

Expose only the internal payment-event route required by your payment provider:

```text
POST /v1/internal/payment-events
```

The request must carry:

```text
x-pb-payment-signature: sha256=<hex>
```

Phase-2 signs/verifies the canonical event string documented in `API_CONTRACTS.md`.

Use a separate webhook secret from JWT and database secrets.

Zero-commission invariants must remain:

```text
restaurant = 100% food total
rider      = 100% delivery fee + 100% tips
platform   = 0
```

Provider transaction fees/taxes are external costs and must not silently mutate the internal zero-platform-commission ledger invariant.

## L. SMS provider

Set:

```text
SMS_PROVIDER_URL
SMS_PROVIDER_API_KEY
SMS_SENDER_ID
```

The queue worker handles SMS/in-app records.

Before go-live, send test messages using dedicated QA accounts and verify:

- order placed
- restaurant accepted/rejected
- rider assigned
- picked up
- delivered
- unassigned timeout

## M. Phase-5 background workers

Install:

```bash
cd parvathipuram-phase5-workers
npm ci
```

Commands:

```bash
npm run backup
npm run unassigned
npm run sync:schedule
npm run sync:drain
npm run sync:control -- list
```

Cron examples are included in:

```text
cron/production.crontab
```

Kubernetes CronJob examples are included in:

```text
deploy/k8s/cronjobs.yaml
```

Before using these workers, reconcile their `app.*` SQL references with your chosen database schema generation.

## N. Backups

The Phase-5 backup worker:

- records backup run state;
- executes `pg_dump -Fc`;
- validates the archive with `pg_restore --list`;
- computes SHA-256;
- stores to local or S3-style object storage;
- records success/failure;
- creates a failure alert.

For RLS-protected full logical backups, the Phase-5 package includes `deploy/backup-role.sql` for a dedicated read-only backup login with `BYPASSRLS`.

Never use a database superuser for the web/API service.

Test restore procedures periodically. A backup that was never restored is not a proven recovery strategy.

## O. Catalog feeds

Configure only authorized CSV/JSON feeds. See `03_CATALOG_SYNC_SETUP_GUIDE.md`.

Do not configure marketplace scraping, CAPTCHA bypass, IP rotation or access-control evasion.

## P. QA and release gate

Populate Phase-6 `.env` with QA URLs, JWTs and fixture IDs.

Run:

```bash
npm run test:unit
npm run swarm:smoke
npm run test:e2e
npm run test:load
npm run regression
```

Do not promote a build when:

- unit/E2E/regression gate fails;
- unresolved critical/high Phase-6 defects remain;
- zero-commission reconciliation fails;
- role-boundary tests fail;
- backup restore has not been tested;
- schema-generation reconciliation is incomplete.

## Q. Go-live checklist

Verify:

- migrations applied successfully;
- one canonical schema generation is in use;
- API health works;
- RLS blocks cross-role access;
- payment signature validation works;
- cancellation works only before acceptance;
- restaurant rejection requires a reason;
- online rider can accept an offer;
- offline rider does not receive offers;
- rider wallet shows delivery fee/tip earnings;
- customer/restaurant/rider SMS arrives;
- admin CSV export works;
- fraud flags appear;
- unassigned timeout creates a log/alert;
- catalog locked fields remain unchanged;
- scheduled backup succeeds;
- Phase-6 regression passes.

## R. Rollback approach

Use immutable application versions.

If a deployment fails:

1. Stop new traffic or put the application in maintenance mode.
2. Roll back API/frontend/worker images to the last known good version.
3. Do not automatically roll back database migrations by deleting data.
4. Restore a database only for a confirmed data-corruption/disaster case.
5. Preserve failed logs and Phase-6 traces for diagnosis.
6. Re-run smoke/regression tests before reopening traffic.


---

# 2. Super-Admin Panel Operation Manual

Phase 4 provides the core super-admin operational panel.

## Access control

Admin endpoints require an authenticated account with the Phase-1 super-admin role appropriate to the canonical schema.

Never share one admin credential between staff members. Use separate accounts and audit changes.

## Dashboard sections

### A. Live Operations

Endpoint:

```text
GET /v1/admin-dashboard/live
```

Displays:

- online/offline rider status;
- heartbeat freshness;
- active restaurants;
- current/live orders;
- active deliveries;
- unassigned-order count.

Operational use:

1. Open the live dashboard.
2. Check riders marked online but stale.
3. Check unassigned orders.
4. Confirm active restaurants expected to be accepting orders.
5. Investigate unusual growth in live orders before it becomes a backlog.

A rider should be treated as effectively offline when the last heartbeat exceeds the configured grace window even if an old online flag remains.

### B. Operational Logs

Endpoint:

```text
GET /v1/admin-dashboard/logs?type=all|cancelled|rejected|unassigned
```

Use the filters:

- `cancelled` — customer cancellation records/reasons;
- `rejected` — restaurant rejection records/reasons;
- `unassigned` — orders that exceeded rider-assignment timeout;
- `all` — combined operational exception view.

When reviewing an issue, capture:

- order ID/order number;
- status;
- reason code;
- reason text;
- timestamp;
- restaurant;
- customer/rider context where authorized;
- related notification/payment events.

Do not manually rewrite historical reason logs.

### C. Fraud-risk Flags

Endpoints:

```text
GET  /v1/admin-dashboard/fraud-flags
POST /v1/admin-dashboard/fraud/scan/:orderId
POST /v1/admin-dashboard/fraud-flags/:flagId/resolve
```

Implemented rules include:

- high order value;
- unusually large total item quantity;
- rapid order velocity;
- repeated cancellations;
- repeated payment failures.

A fraud flag is a risk signal, not proof of wrongdoing.

Recommended workflow:

1. Open the flag.
2. Review order/payment/cancellation history.
3. Check whether the activity can be explained by normal customer behavior.
4. Use manual scan if the order needs fresh evaluation.
5. Resolve only after documenting the operational basis for closure.

Avoid punitive account action based solely on one automated score.

### D. CSV Order Reports

Endpoint:

```text
GET /v1/admin-dashboard/reports/orders.csv?period=daily|weekly|monthly&date=YYYY-MM-DD
```

Available periods:

- daily;
- weekly;
- monthly.

Report boundaries are intended to use Asia/Kolkata calendar dates.

The Phase-4 CSV logic includes spreadsheet formula-injection protection.

Recommended controls:

- download from an authenticated admin session only;
- store reports in approved company storage;
- avoid emailing raw customer data unnecessarily;
- delete stale exports according to your retention policy.

### E. Rider Operations

The live panel shows rider state. Rider self-registration is handled by the Phase-4 rider dashboard/API.

Key rider signals:

- approved/account status;
- online flag;
- latest heartbeat;
- current delivery;
- assignment state.

If a rider says they are online but receives no orders:

1. verify role/account state;
2. verify heartbeat is fresh;
3. verify GPS coordinates are valid;
4. verify no current active delivery prevents assignment;
5. inspect active offers/order assignment logs.

### F. Restaurant Operations

The admin live view shows active restaurant status.

Restaurant owners can themselves manage:

- open/closed state;
- item availability;
- manual menu edits;
- order acceptance/rejection.

Do not overwrite owner-controlled fields during catalog sync. See the catalog-sync manual.

## Incident procedures

### Unassigned-order spike

1. Open live operations.
2. Filter unassigned logs.
3. Check whether enough riders are online with fresh heartbeat.
4. Check assignment dispatcher/timeout worker logs.
5. Verify notification queue.
6. If the issue is systemic, temporarily stop accepting new orders only through an approved operational procedure; do not alter historical orders manually.

### Payment failures spike

1. Check payment-provider health.
2. Verify webhook secret/configuration.
3. Review failed payment events and fraud flags.
4. Verify no deployment changed amount/split calculations.
5. Run zero-commission reconciliation queries.
6. Re-run Phase-6 payment-failure/regression tests in QA.

### SMS failures

1. Check queued/failed notification counts.
2. Confirm SMS provider credentials.
3. Check rate limits.
4. Confirm recipient phone format.
5. Retry through the notification worker rather than manually changing order status.

### Catalog-sync failures

1. Open sync failure warning/log.
2. Identify source and last job.
3. Read `failure_code`.
4. Confirm authorized feed URL/credentials.
5. Fix feed/configuration.
6. trigger one manual run.
7. Resume the schedule only after success.

## Admin route reference

```text
GET  /v1/admin-dashboard/live
GET  /v1/admin-dashboard/logs
GET  /v1/admin-dashboard/fraud-flags
POST /v1/admin-dashboard/fraud-flags/:flagId/resolve
POST /v1/admin-dashboard/fraud/scan/:orderId
GET  /v1/admin-dashboard/reports/orders.csv
```

## Data sources

Depending on the canonical schema generation, the panel reads the corresponding:

- users;
- restaurants;
- delivery agents;
- orders;
- cancellation records;
- rejection records;
- unassigned records;
- fraud flags;
- payment attempts/transactions;
- wallet and payout information;
- notifications;
- system alerts.

See `07_PROJECT_REFERENCE_MAP.md` for schema-generation-specific names.


---

# 3. Catalog-Sync Adapter Setup Guide

Phase 5 implements an authorized-feed catalog synchronization system.

It is intentionally designed for CSV/JSON or other licensed/authorized data feeds. It does not include marketplace scraping, CAPTCHA bypass, IP rotation or access-control evasion.

## Components

Phase-5 source:

```text
src/workers/catalog-scheduler.worker.js
src/workers/catalog-sync.worker.js
src/sync/catalog-sync.service.js
src/sync/sync-control.service.js
src/sync/adapters/csv.js
src/sync/adapters/json.js
src/sync/safe-feed-fetch.js
src/sync/normalize.js
src/cli/sync-control.js
```

## Before configuration

Resolve the Phase-1 schema-generation compatibility checkpoint.

The generated Phase-5 worker uses the later `app.*` schema model and fields/tables such as:

- `app.catalog_sources`
- `app.sync_jobs`
- `app.sync_job_logs`
- `app.sync_field_locks`
- `app.sync_entity_changes`
- `app.source_restaurant_links`
- `app.source_menu_item_links`
- `app.system_alerts`

The original Phase-1 downloadable bundle instead has:

- `sync_job_configs`
- `sync_jobs`
- `sync_job_logs`
- `sync_field_changes`
- `owner_locked_fields` JSONB columns
- different table/role naming.

Adapt the worker to the canonical schema before production.

## Authorized source configuration

Example:

```json
{
  "provider_key": "authorized_local_partner",
  "display_name": "Authorized Parvathipuram Partner Feed",
  "source_type": "authorized_feed",
  "enabled": true,
  "sync_interval_hours": 168,
  "configuration": {
    "adapter": "csv",
    "paused": false,
    "restaurant_feed": "https://feeds.example.com/parvathipuram/restaurants.csv",
    "menu_feed": "https://feeds.example.com/parvathipuram/menu.csv",
    "allowed_hosts": ["feeds.example.com"],
    "auth_env_key": "VENDOR_FEED_TOKEN",
    "auth_scheme": "bearer",
    "default_owner_user_id": "UUID"
  }
}
```

Never store the actual API token inside database JSON configuration. Store only the environment-variable name.

Environment:

```text
VENDOR_FEED_TOKEN=<secret>
FEED_ALLOWED_HOSTS=feeds.example.com
ALLOW_PRIVATE_FEED_HOSTS=false
ALLOW_LOCAL_FEEDS=false
FEED_MAX_BYTES=15728640
CATALOG_SYNC_FETCH_TIMEOUT_MS=20000
CATALOG_SYNC_MAX_ATTEMPTS=3
CATALOG_SYNC_RETRY_BASE_SECONDS=300
```

## CSV restaurant feed

Headers:

```text
external_restaurant_id
shop_name
owner_name
phone_e164
location_text
latitude
longitude
cuisine_tags
primary_category
street_food_or_tiffin
default_eta_minutes
cover_image_url
```

`cuisine_tags` uses `|` as separator in the Phase-5 adapter.

For a new restaurant, at least the fields required by the canonical schema must be present.

In the later schema model, new feed-created restaurants use `default_owner_user_id` and remain subject to normal activation/compliance controls.

## CSV menu feed

Headers:

```text
external_menu_item_id
external_restaurant_id
name_en
name_te
description_en
description_te
price_paise
is_veg
is_available
preparation_minutes
primary_image_url
```

New menu items require the mandatory name/price/veg fields expected by the worker/schema.

## JSON adapter

Example source configuration:

```json
{
  "adapter": "json",
  "endpoint": "https://api.example.com/v1/parvathipuram/catalog",
  "allowed_hosts": ["api.example.com"],
  "auth_env_key": "VENDOR_FEED_TOKEN",
  "auth_scheme": "x-api-key",
  "default_owner_user_id": "UUID"
}
```

Expected structure:

```json
{
  "restaurants": [],
  "menu_items": []
}
```

## Network safety

The feed fetcher:

- requires HTTPS by default;
- requires explicit hostname allowlisting;
- rejects unexpectedly private/reserved IP resolution unless private feeds are explicitly enabled;
- limits response size;
- applies request timeouts;
- rejects redirects;
- supports bearer token or `X-API-Key` patterns.

## Owner-field locks

The required business rule is:

> An owner-modified field must never be overwritten by automated catalog sync.

Phase-3 owner UI records manual changes using the lock mechanism associated with its schema generation.

Phase-5 checks locks before update and records skipped changes.

Typical owner-controlled fields include:

Restaurant:
- shop name;
- phone/location;
- open state;
- cuisine/category;
- ETA;
- cover image.

Menu item:
- name;
- description;
- price;
- vegetarian classification;
- availability;
- preparation time;
- image.

A feed row containing a different value for a locked field must result in a skip/audit entry, not an overwrite.

## Scheduling

The scheduler command:

```bash
npm run sync:schedule
```

The Phase-5 worker evaluates sources periodically. A source's `sync_interval_hours` controls whether it is due.

Default weekly interval:

```text
168 hours
```

Queue-drainer command:

```bash
npm run sync:drain
```

## Source controls

List:

```bash
npm run sync:control -- list
```

Pause:

```bash
npm run sync:control -- pause SOURCE_UUID
```

Resume:

```bash
npm run sync:control -- resume SOURCE_UUID
```

Disable:

```bash
npm run sync:control -- disable SOURCE_UUID
```

Manual one-time run:

```bash
npm run sync:control -- run SOURCE_UUID
```

One-time forced run:

```bash
npm run sync:control -- run SOURCE_UUID --force
```

A forced run is intended as an explicit operational override for that one job; it should not silently convert a disabled source back to scheduled operation.

## Retry behavior

Top-level feed failures are classified using stable codes such as:

```text
HTTP_401
HTTP_403
HTTP_429
FEED_TIMEOUT
DNS_FAILURE
CONNECTION_REFUSED
PARSE_ERROR
VALIDATION_ERROR
FEED_TOO_LARGE
HOST_NOT_ALLOWLISTED
```

Retry jobs use exponential backoff until `CATALOG_SYNC_MAX_ATTEMPTS`.

A failed job should produce an admin warning/alert. Partial record failures should also remain visible to admin operations.

## Logs to inspect

Use the canonical equivalents of:

- sync job table;
- sync job textual log;
- field/change audit;
- owner-lock records;
- source/restaurant mapping;
- source/menu mapping;
- admin/system alerts.

The Phase-5 later-schema names are documented in `DATABASE_LOG_USAGE.md`.

## Operational checklist before enabling weekly sync

- source is contractually/technically authorized;
- host is allowlisted;
- credentials are in secret manager;
- feed samples validate;
- external IDs are stable;
- owner-lock behavior has been tested;
- new listings remain inactive/pending where required;
- no missing-feed row causes automatic destructive deletion;
- manual run succeeds;
- partial failures create visible warnings;
- retry limit works;
- admin can pause/disable the source.

## What the adapter deliberately does not do

- scrape Zomato/Swiggy pages;
- solve or bypass CAPTCHA;
- rotate IPs to evade blocking;
- bypass authentication;
- automatically delete local records merely because a feed omitted them.


---

# 4. Test-Swarm / Simulation Execution Guide

Phase 6 is a local/cloud QA test suite. It does not run continuously outside an environment where you explicitly start it, and it does not self-patch application source.

## Test-agent types

Implemented:

- customer bots;
- restaurant bots;
- rider bots;
- failure-injection bots;
- load-test bots.

## Simulation scenarios

Implemented scenario families:

- full order lifecycle;
- cancellation before restaurant acceptance;
- restaurant rejection;
- payment failure;
- idempotency/duplicate-order protection;
- role-boundary/RBAC checks;
- fault injection;
- concurrent orders.

## Install

```bash
cd parvathipuram-phase6-test-swarm
npm ci
cp .env.example .env
```

Install Playwright browser binaries when required by your environment:

```bash
npx playwright install chromium
```

Install k6 separately and ensure `k6` is on PATH.

## Environment

Important settings:

```text
PB_API_BASE_URL
PB_CUSTOMER_WEB_URL
PB_RESTAURANT_WEB_URL
PB_RIDER_WEB_URL
PB_ADMIN_WEB_URL

PB_CUSTOMER_TOKENS
PB_RESTAURANT_TOKENS
PB_RIDER_TOKENS
PB_ADMIN_TOKEN

PB_FIXTURE_RESTAURANT_ID
PB_FIXTURE_MENU_ITEM_ID
PB_FIXTURE_ADDRESS_ID

PB_PAYMENT_WEBHOOK_SECRET

PB_SWARM_SEED
PB_SWARM_ITERATIONS
PB_SWARM_CONCURRENCY
PB_OFFER_WAIT_MS
PB_REQUEST_TIMEOUT_MS
```

Use dedicated QA accounts, not production customer/rider/admin credentials.

## Why tokens are pre-provisioned

The earlier phases define application APIs and JWT verification but not a complete production signup/login identity provider.

Therefore the Phase-6 suite uses test JWTs supplied via environment variables.

## Unit tests

Run:

```bash
npm run test:unit
```

Covers:

- defect fingerprint normalization;
- adaptive strategy weighting.

## Smoke swarm

```bash
npm run swarm:smoke
```

Runs a minimal swarm using one iteration and low concurrency.

Use this immediately after API startup.

## Full swarm

```bash
npm run swarm
```

Control intensity:

```text
PB_SWARM_ITERATIONS=100
PB_SWARM_CONCURRENCY=16
```

Start small and increase gradually in QA.

## Deterministic reproduction

The swarm uses a seed:

```text
PB_SWARM_SEED=20260923
```

If a failure occurs, rerun with the same seed and relevant fixture state to improve reproducibility.

## Adaptive/self-improving strategy

The suite stores:

```text
artifacts/strategy-state.json
```

Behavior:

1. defects are fingerprinted;
2. duplicate defects collapse to the same fingerprint;
3. critical/high defects raise the weight of related scenario families;
4. later runs spend more test iterations around previously fragile areas;
5. weights slowly decay toward baseline.

This is adaptive test selection, not automatic production code modification.

## Bug artifacts

Primary files:

```text
artifacts/bugs.jsonl
artifacts/bugs.summary.json
artifacts/swarm-run.json
artifacts/traces/<run>/<agent>.json
```

Bug log fields include:

- fingerprint;
- title;
- component;
- severity;
- scenario;
- agent type;
- expected/actual behavior;
- evidence;
- reproduction seed/iteration;
- tags.

Template:

```text
templates/bug-log-template.json
```

## Optional database bug sink

Phase 6 can optionally persist test defects to the QA database.

Important: the generated optional sink uses the later `app.bug_logs` schema generation.

If your canonical database uses the original Phase-1 `bug_logs` model, adapt the sink first or leave `PB_TEST_DATABASE_URL` unset and use file-based artifacts.

Never point the test bug sink at production simply for convenience.

## Playwright E2E

Run all:

```bash
npm run test:e2e
```

Mobile-focused:

```bash
npm run test:e2e:mobile
```

Coverage includes:

Customer:
- Telugu dashboard render;
- restaurant filters;
- dark mode;
- saved addresses/order history.

Restaurant:
- new orders;
- shop status;
- menu management;
- reviews.

Rider:
- dashboard;
- online/offline state;
- wallet;
- demand heatmap.

Admin:
- live operations;
- CSV reports;
- fraud flags;
- operational logs.

Mobile:
- 360px horizontal overflow;
- Telugu visibility;
- 44×44 touch targets.

## k6 load test

Run:

```bash
npm run test:load
```

Main scenarios:

- ramping restaurant/catalog browsing;
- constant-arrival-rate create/cancel order traffic.

Useful variables:

```text
PB_K6_BROWSE_VUS
PB_K6_ORDER_RATE
PB_K6_DURATION
```

Default thresholds include:

- request error rate under 1%;
- browse p95 under 1000 ms;
- concurrent order p95 under 1500 ms;
- checks over 99%.

Tune thresholds only from an intentional performance SLO decision; do not loosen them merely to make a failing build green.

## Regression gate

Run:

```bash
npm run regression
```

The gate executes:

1. unit tests;
2. swarm scenarios;
3. Playwright E2E;
4. optional k6 when enabled.

Enable k6 in the gate:

```text
PB_RUN_K6_IN_REGRESSION=true
```

The gate should fail if a required step fails or unresolved critical/high defects are present.

## Run after local code changes

```bash
npm run watch:regression -- ../your-app/src
```

The file watcher triggers the regression suite after changes.

It does not edit the source tree.

## Safe load-testing rules

- use staging/QA;
- start with low concurrency;
- use dedicated test users;
- isolate SMS/payment providers or use test mode;
- cap test duration;
- monitor DB connections/CPU/latency;
- never run uncontrolled infinite loops;
- stop when the target is unhealthy.

## Suggested release sequence

```text
unit tests
→ API smoke swarm
→ Playwright
→ regression swarm
→ targeted k6
→ review bug summary
→ promote build
```

Re-run the entire regression gate after any schema, state-machine, payment, authorization or worker change.


---

# 5. Full Project Feature-Matrix Checklist

Legend:

- **Implemented source** — source code was generated in the specified phase.
- **Static validated** — syntax/contract/static validation was performed in the artifact environment.
- **Provider/runtime config** — requires real credentials/infrastructure.
- **Integration reconciliation** — cross-phase schema alignment is still required before one production deployment.

| Area | Feature | Phase | Status / notes |
|---|---|---:|---|
| Database | PostgreSQL schema/migrations | 1 | Implemented source; numbered migrations + consolidated SQL |
| Database | Constraints/indexes/triggers | 1 | Implemented source |
| Security | PostgreSQL RLS/RBAC | 1 | Implemented source |
| Security | Customer/restaurant/rider/super-admin isolation | 1–4 | Implemented source; must pass live regression after schema reconciliation |
| Finance | Platform fee = zero | 1–2 | Database/business invariant implemented |
| Finance | 100% food amount to restaurant | 1–2 | Implemented |
| Finance | 100% delivery fee to rider | 1–2 | Implemented |
| Finance | 100% tips to rider | 1–2 | Implemented |
| Finance | Rider wallet/ledger | 1,2,4 | Implemented |
| Finance | Restaurant settlement ledger | 1–2 | Implemented |
| Orders | Idempotent order creation | 1–2 | Implemented |
| Orders | State machine | 1–2 | Implemented |
| Orders | Customer cancellation before acceptance only | 1–3 | Implemented |
| Orders | Mandatory cancellation reason | 1–3 | Implemented |
| Orders | Restaurant accept/reject | 2–3 | Implemented |
| Orders | Mandatory rejection reason | 1–3 | Implemented |
| Rider | Online/offline state | 2,4 | Implemented |
| Rider | GPS heartbeat | 2,4 | Implemented |
| Rider | Assignment offer accept/reject | 2,4 | Implemented |
| Rider | Pickup/deliver actions | 2,4 | Implemented |
| Rider | One-tap Google Maps navigation | 4 | Implemented UI integration |
| Rider | Demand heatmap | 4 | Implemented |
| Rider | Wallet payment history | 4 | Implemented |
| Notifications | SMS queue | 1–2 | Implemented; real provider config required |
| Notifications | In-app queue | 1–2 | Implemented |
| Notifications | Rider new-order/assignment hooks | 2,4 | Implemented |
| Customer UI | Telugu-first dashboard | 3 | Implemented |
| Customer UI | Veg/non-veg filters | 3 | Implemented |
| Customer UI | Price/open-now filters | 3 | Implemented |
| Customer UI | Saved addresses | 3 | Implemented |
| Customer UI | One-click reorder | 3 | Implemented |
| Customer UI | Tip selector | 3 | Implemented |
| Customer UI | Cancellation UI | 3 | Implemented |
| Customer UI | Review submission | 3 | Implemented |
| Customer UI | Skeleton loading | 3 | Implemented |
| Customer UI | Dark mode | 3 | Implemented |
| Restaurant UI | New-order queue/alerts | 3 | Implemented |
| Restaurant UI | Accept/reject controls | 3 | Implemented |
| Restaurant UI | Open/closed toggle | 3 | Implemented |
| Restaurant UI | Out-of-stock toggle | 3 | Implemented |
| Restaurant UI | Manual menu edit | 3 | Implemented |
| Restaurant UI | Owner field locking | 3,5 | Business rule implemented; schema-generation reconciliation required |
| Restaurant UI | Sales analytics | 3 | Implemented |
| Restaurant UI | Customer reviews | 3 | Implemented |
| Admin | Live riders/restaurants/orders | 4 | Implemented |
| Admin | Daily/weekly/monthly CSV reports | 4 | Implemented |
| Admin | CSV formula-injection protection | 4 | Implemented |
| Admin | Fraud flags | 4 | Implemented |
| Admin | Cancel/reject/unassigned log viewer | 4 | Implemented |
| Background | Assignment dispatcher | 2 | Implemented |
| Background | Notification worker | 2 | Implemented |
| Background | Unassigned timeout | 2 and 5 | Two implementations exist; choose one authoritative deployment |
| Background | PostgreSQL automatic backup | 5 | Implemented; DB/object-storage config required |
| Background | Backup verification/checksum | 5 | Implemented |
| Catalog | Authorized CSV adapter | 5 | Implemented |
| Catalog | Authorized JSON adapter | 5 | Implemented |
| Catalog | Pause/resume/disable | 5 | Implemented |
| Catalog | Manual trigger | 5 | Implemented |
| Catalog | Retry/backoff | 5 | Implemented |
| Catalog | Sync job logs | 1,5 | Implemented; schema-generation reconciliation required |
| Catalog | Owner fields never overwritten | 3,5 | Implemented concept/code in both generations; unify storage model before production |
| Catalog | Admin failure alerts | 5 | Implemented |
| Catalog | Marketplace CAPTCHA/IP bypass | — | Intentionally not implemented |
| QA | Customer bot | 6 | Implemented |
| QA | Restaurant bot | 6 | Implemented |
| QA | Rider bot | 6 | Implemented |
| QA | Failure-injection bot | 6 | Implemented |
| QA | Load-test bot | 6 | Implemented |
| QA | Full lifecycle simulation | 6 | Implemented source |
| QA | Cancellation/rejection simulations | 6 | Implemented source |
| QA | Payment failure simulation | 6 | Implemented source |
| QA | Concurrency simulation | 6 | Implemented source |
| QA | Defect fingerprinting | 6 | Implemented |
| QA | JSONL bug log | 6 | Implemented |
| QA | Adaptive scenario weighting | 6 | Implemented |
| QA | Playwright E2E | 6 | Implemented source; requires running QA apps |
| QA | Mobile/Telugu layout checks | 6 | Implemented |
| QA | k6 load tests | 6 | Implemented source; requires QA target |
| QA | Regression gate | 6 | Implemented |
| QA | Automatic production self-patching | — | Intentionally not implemented |
| Deployment | Cloud runtime instructions | 7 | Documented |
| Operations | Admin manual | 7 | Documented |
| Operations | Troubleshooting | 7 | Documented |

## Remaining production gates

The source feature set is broad, but these items are still prerequisites for a real production release:

1. reconcile the two schema generations across Phases 1–6;
2. connect a real authentication/identity provider that issues compatible JWTs;
3. connect/test actual SMS provider;
4. connect/test payment provider webhook in test mode;
5. choose one unassigned-timeout worker implementation;
6. deploy one canonical catalog-lock storage implementation;
7. run Phase-6 against a live reconciled QA stack;
8. perform backup restore test;
9. configure monitoring/alerts/secrets/TLS;
10. complete any legally/operationally required food-business onboarding/compliance process applicable to deployment.


---

# 6. Troubleshooting Checklist

Use this document from the top down. Preserve logs before restarting or modifying state.

## A. Application will not start

Check:

- Node.js 20+.
- `DATABASE_URL`.
- database reachable from application network.
- required environment variables.
- Phase-1 migrations applied.
- connection pool not exhausted.
- application login has correct PostgreSQL role membership.
- no schema-generation mismatch.

Useful commands:

```bash
node --check src/server.js
npm run check
psql "$DATABASE_URL" -c "select now();"
```

## B. `relation does not exist`

Most likely causes:

- migrations not applied;
- wrong database;
- wrong schema/search path;
- Phase-4/5 `app.*` code pointed at original public-schema Phase 1;
- Phase-2/3 public-table code pointed at later `app.*` Phase 1.

Fix the schema-generation integration first. Do not create random duplicate tables merely to silence the error.

## C. `permission denied`, RLS rejection or unexpected 403

Original Phase-1/Phase-2 model:

- verify runtime login is a member of `pb_authenticated`;
- worker login/process needs `pb_worker`;
- confirm `app.user_id` is set inside transaction;
- confirm requested user is active;
- confirm database role in `app_users` matches the intended actor.

Later `app.*` model:

- verify expected role binding is active;
- verify `app.user_id`;
- verify `app.user_role`;
- verify `app.request_id`;
- verify helper function confirms active identity.

Do not solve RLS errors by granting database superuser to the web service.

## D. All API requests return 401

Check JWT:

- `Authorization: Bearer ...`;
- HS256 algorithm;
- secret matches `JWT_HS256_SECRET`;
- `sub` is a valid application-user UUID;
- issuer equals `JWT_ISSUER`;
- audience equals `JWT_AUDIENCE`;
- token is not expired;
- system clock is correct.

## E. Browser UI loads but API calls fail

Check:

- API base URL;
- reverse proxy;
- HTTPS mixed-content errors;
- token injection;
- browser console;
- network tab;
- CORS if frontend/API are cross-origin.

Prefer same-origin ingress paths when practical.

## F. Customer cannot create order

Check:

- restaurant active/open;
- menu item available;
- saved address exists;
- coordinates/delivery zone are valid;
- idempotency key format;
- Phase-1 pricing/order triggers;
- RLS customer identity.

Inspect API response error code before retrying.

## G. Duplicate orders appear

Check:

- every create/reorder request sends an idempotency key;
- frontend does not generate a new key for an automatic retry of the same submission;
- unique/idempotency constraint exists;
- load balancer/retry policy is not replaying POST with a changed key.

Run the Phase-6 `idempotency` scenario.

## H. Cancellation succeeds after restaurant acceptance

This is a serious state-machine regression.

Expected behavior:

- customer cancellation allowed only while `placed`;
- mandatory reason;
- after restaurant acceptance, cancellation endpoint should return conflict/validation failure.

Check Phase-1 guard trigger and Phase-2 cancellation service.

Run Phase-6 cancellation and failure-injection scenarios before reopening traffic.

## I. Restaurant rejection has no reason

Expected:

- rejection record must be inserted;
- reason code/text retained;
- order transitions through the dedicated rejection workflow.

Check restaurant endpoint/service and DB trigger/constraint.

## J. Rider says "online" but receives no orders

Check:

- rider account active/approved;
- online flag;
- fresh heartbeat;
- valid latitude/longitude;
- rider not already on active delivery;
- order is accepted/unassigned and eligible;
- assignment dispatcher running;
- offer TTL;
- previous rejection/expiry exclusion;
- SMS queue/provider.

## K. Rider accepted the same order twice / multiple riders assigned

Check:

- database unique/active assignment constraint;
- row locking;
- `SKIP LOCKED`;
- offer acceptance transaction;
- assignment state trigger.

Treat as high severity and run concurrent Phase-6 scenarios.

## L. Rider wallet amount is wrong

Verify invariant:

```text
rider earning = delivery_fee + tip
platform deduction = 0
```

Inspect:

- order delivery fee;
- order tip;
- delivery-fee accounting;
- tip accounting;
- wallet ledger;
- payout state;
- reversal/refund records.

Use zero-commission reconciliation view/query for the canonical schema.

## M. Restaurant settlement is wrong

Verify:

```text
restaurant receivable = food total
platform fee = 0
```

Do not include delivery fee/tip in restaurant food settlement.

## N. Payment webhook rejected

Check:

- correct route;
- HMAC secret;
- exact canonical signed string;
- header name:
  `x-pb-payment-signature`;
- event amount;
- order ID;
- duplicate provider reference/idempotency behavior.

For `split_settled`, amounts must exactly match the zero-commission components.

## O. Payment failures suddenly rise

Check:

- payment provider status;
- webhook signature;
- network/TLS;
- request schema;
- recent releases;
- fraud flags;
- customer retry behavior.

Run Phase-6 payment-failure scenario in QA.

## P. SMS notifications stuck

Inspect notification rows/status:

```text
queued
sending
sent
failed
cancelled
```

Check:

- notification worker running;
- lease timeout;
- attempt count;
- next attempt time;
- SMS provider URL/API key;
- sender ID;
- provider rate limits;
- phone-number format.

Do not fix by changing order state solely to resend an SMS.

## Q. Customer receives duplicate SMS

Possible causes:

- both Phase-2 and Phase-5 unassigned workers active for the same responsibility;
- duplicate event insertion;
- dedupe key missing/different;
- app + DB both emitting the same event.

Choose one authoritative worker/event producer.

## R. Admin live dashboard is empty

Check:

- user is true super-admin;
- Phase-4 routes registered;
- canonical DB views/tables exist;
- schema-generation mismatch;
- service DB context;
- data actually exists.

## S. CSV report downloads but Excel shows formula warnings

Phase-4 export logic should neutralize formula-like cell prefixes.

Confirm the deployed CSV service is the generated hardened version.

## T. Fraud flags do not appear

Check:

- fraud hook called after order creation/payment failure;
- thresholds;
- canonical fraud table;
- Phase-4 route registration;
- role/RLS;
- admin query filters.

Remember: flags are signals, not determinations.

## U. Catalog scheduler creates no job

Check:

- source enabled;
- source not paused;
- `sync_interval_hours`;
- last success time;
- no queued/running/paused job already exists;
- scheduler process/cron;
- canonical schema names.

## V. Catalog feed returns 401/403

Check:

- `auth_env_key`;
- environment secret exists;
- auth scheme matches provider;
- provider access is authorized;
- endpoint URL.

Do not add CAPTCHA/IP bypass behavior.

## W. Catalog feed host is blocked

Expected behavior when:

- hostname is not allowlisted;
- DNS resolves to private/reserved IP and private feeds are disabled;
- URL is not HTTPS;
- redirect is attempted.

Update allowlist only for a known authorized source.

## X. Owner menu value gets overwritten by sync

This is a critical catalog-sync invariant failure.

Check:

- owner edit created/updated the lock in the canonical lock model;
- sync worker reads that same lock model;
- schema-generation mismatch between Phase 3 and Phase 5;
- no bypass flag/override is enabled;
- change log should show `skipped_locked`.

Do not enable recurring sync until this passes a QA test.

## Y. Sync job remains queued

Check:

- sync drainer running;
- retry time not in future;
- source enabled/paused state;
- queue worker advisory lock;
- DB RLS/service identity;
- previous process not stuck.

## Z. Sync job fails repeatedly

Read:

- job failure code;
- job logs;
- record-level changes/errors;
- retry count.

Typical codes:

```text
HTTP_401
HTTP_403
HTTP_429
FEED_TIMEOUT
DNS_FAILURE
CONNECTION_REFUSED
PARSE_ERROR
VALIDATION_ERROR
FEED_TOO_LARGE
HOST_NOT_ALLOWLISTED
```

Pause the source when the failure is not transient.

## AA. PostgreSQL backup fails

Check:

- `pg_dump` installed;
- client/server compatibility;
- `BACKUP_DATABASE_URL`;
- backup account permissions;
- free disk/temp space;
- object-storage credentials;
- S3 bucket/region/KMS key;
- network access.

Read backup-run log and admin alert.

## AB. Backup says success but restore fails

Do not consider backup proven.

The worker validates the archive manifest, but still perform periodic full restore tests to an isolated database.

## AC. Phase-6 swarm fails immediately

Check:

- QA API URL;
- customer/restaurant/rider tokens;
- fixture restaurant/menu/address IDs;
- database seeded appropriately;
- restaurant open;
- rider account approved;
- QA payment secret.

Start with:

```bash
npm run swarm:smoke
```

## AD. Playwright cannot find Telugu text

Check:

- correct frontend URL;
- token injected before page load;
- Phase-3/4 screens are the deployed versions;
- correct route/mode;
- API returned data;
- font/layout not hidden by loading error.

Use Playwright trace/screenshot artifacts.

## AE. k6 creates too many test orders

Stop the test.

Lower:

```text
PB_K6_ORDER_RATE
PB_K6_DURATION
PB_K6_BROWSE_VUS
```

Use isolated QA data and cleanup workflows.

## AF. Regression gate blocks release

Read:

```text
artifacts/regression-gate.json
artifacts/bugs.summary.json
artifacts/bugs.jsonl
artifacts/traces/
```

Fix or explicitly triage the defect. Do not simply remove the failing test unless the documented product behavior changed intentionally.

## AG. Highest-priority unresolved integration issue

If you see inconsistent table names such as:

```text
orders vs app.orders
unassigned_order_logs vs app.unassigned_order_events
wallet_ledger vs app.wallet_ledger_entries
restaurant_owner vs restaurant
```

you are mixing the two schema generations.

Stop deployment and reconcile the schema/service code first.


---

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
