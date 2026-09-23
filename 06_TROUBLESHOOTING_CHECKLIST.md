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
