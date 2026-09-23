# Parvathipuram Bites — PHASE 5 background workers

This package is an additive Phase-5 worker layer for the completed Phase-1 PostgreSQL schema and Phase-2/3/4 application.

## Included

1. PostgreSQL automatic logical backup worker.
2. Unassigned-order timeout worker.
3. Authorized catalog-feed scheduler and queue worker.
4. CSV and JSON authorized-feed adapters.
5. Pause / resume / disable catalog-source controls.
6. One-command manual sync.
7. Exponential retry jobs with configurable attempt limit.
8. Field-level owner-lock enforcement and skip logging.
9. Sync run/event/error logs using the existing Phase-1 tables.
10. Admin system alerts on failed and partially failed syncs.
11. Crontab and Kubernetes CronJob deployment examples.

No scraping implementation is present. There is no CAPTCHA handling, IP rotation, browser automation, or marketplace access-control bypass.

## Runtime requirements

- Node.js 20+
- PostgreSQL 15+
- `pg_dump` and `pg_restore` from a compatible PostgreSQL client release
- Completed Phase-1 migrations
- Existing Phase-2 notification delivery worker for processing rows queued into `app.notifications`

Install:

```sh
npm ci
cp .env.example .env
```

## Worker service identity

Provision a dedicated application user and active `super_admin` role binding using your existing admin/migration process. Put its UUID in `WORKER_SERVICE_USER_ID`.

Phase-5 does not connect the catalog/order workers as a database superuser or BYPASSRLS role. Every transaction validates the service identity through Phase-1 RBAC/RLS.

## Backup

`npm run backup`

The worker:
- creates `app.backup_runs(status='running')`;
- executes `pg_dump -Fc`;
- validates the archive manifest with `pg_restore --list`;
- computes SHA-256;
- writes to local storage or S3;
- marks the run succeeded/failed;
- creates a high-severity `system` alert on failure;
- removes temporary dump files in all cases.

For a complete RLS-protected database backup, use the dedicated read-only `pv_backup` PostgreSQL login described in `deploy/backup-role.sql`.

S3 objects use SSE-S3 by default or SSE-KMS if `BACKUP_S3_KMS_KEY_ID` is set.

## Unassigned order timeout

`npm run unassigned`

The worker selects only orders currently in `accepted` / `rider_search` with no active assignment. It uses row locks plus a process advisory lock, expires outstanding offers, then inserts exactly one recent `assignment_timeout` event.

Existing Phase-1 triggers remain authoritative:
- the event changes the order to `unassigned`;
- the order-status trigger queues customer SMS + in-app notifications;
- the unassigned-event trigger creates the super-admin alert.

## Weekly catalog sync

The scheduler itself runs hourly:

`npm run sync:schedule`

It consults each source's existing `sync_interval_hours`; Phase-1 defaults this to 168 hours (7 days). It creates a scheduled job only if the source is enabled, not paused, due, and has no active/paused job.

The queue drainer:

`npm run sync:drain`

It processes scheduled, manual, and retry jobs. Each feed record is committed independently so valid partial updates survive later record failures. Job counters/logs accurately record inserted, updated, owner-locked, and failed records.

### Owner-lock rule

Owner-edited fields are read from `app.sync_field_locks`. Locked fields are logged as `skipped_locked` and are not included in SQL updates. The database's Phase-1 lock-enforcement triggers remain enabled as defense in depth.

### Controls

```sh
npm run sync:control -- list
npm run sync:control -- pause SOURCE_UUID
npm run sync:control -- resume SOURCE_UUID
npm run sync:control -- disable SOURCE_UUID
npm run sync:control -- run SOURCE_UUID
npm run sync:control -- run SOURCE_UUID --force
```

`--force` permits a one-time manual job to be queued while a source is paused/disabled; it does not permanently change source state.

## Failure and retry behavior

Top-level feed failures are classified into stable codes such as:
- `HTTP_401`
- `HTTP_403`
- `HTTP_429`
- `FEED_TIMEOUT`
- `DNS_FAILURE`
- `CONNECTION_REFUSED`
- `PARSE_ERROR`
- `VALIDATION_ERROR`
- `FEED_TOO_LARGE`
- `HOST_NOT_ALLOWLISTED`

No CAPTCHA/IP-block bypass logic exists because feeds must be explicitly authorized endpoints/files.

Failed top-level jobs create retry jobs with exponential backoff until `CATALOG_SYNC_MAX_ATTEMPTS`. Phase-1's `trg_sync_failure_alert` creates the super-admin alert whenever a job reaches `failed`. A `partial` run explicitly creates a medium-severity `sync_failed` warning.

## Authorized feed networking

HTTPS feed hosts must be explicitly allowlisted in:
- `catalog_sources.configuration.allowed_hosts`, or
- `FEED_ALLOWED_HOSTS`.

Private/reserved IP resolution is blocked by default to reduce SSRF exposure. Local `file://` feeds and private-network feeds are separately opt-in.

See `DATA_FEED_CONTRACT.md`.

## Cron

Use either:
- `cron/production.crontab`, or
- `deploy/k8s/cronjobs.yaml`.

All schedules use Asia/Kolkata.

## Explicitly excluded

- Zomato/Swiggy scraping.
- CAPTCHA bypass.
- IP rotation/evasion.
- Weekly web scraper.
- Test swarm / autonomous patch agents.
- Rider/customer/restaurant dashboard UI.
