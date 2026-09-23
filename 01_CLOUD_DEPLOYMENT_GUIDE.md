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
