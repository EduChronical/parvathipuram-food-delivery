# Phase-5 database log usage

No new application tables are required.

| Worker / operation | Phase-1 tables used |
|---|---|
| PostgreSQL backup | `app.backup_runs`; failure warning in `app.system_alerts` using `alert_type='system'` |
| Unassigned timeout | inserts `app.unassigned_order_events`; Phase-1 trigger updates `app.orders`; Phase-1 triggers populate `app.notifications` and `app.system_alerts` |
| Sync scheduling / manual trigger / retries | `app.catalog_sources`, `app.sync_jobs` |
| Sync textual run log | `app.sync_job_logs` |
| Field-by-field audit | `app.sync_entity_changes` |
| Owner override protection | reads `app.sync_field_locks`; Phase-1 enforcement triggers remain active |
| Restaurant external mapping | `app.source_restaurant_links` |
| Menu external mapping | `app.source_menu_item_links` |
| Sync failure warnings | Phase-1 `trg_sync_failure_alert` for failed jobs; Phase 5 explicitly adds a medium warning for `partial` jobs |
| SMS / in-app customer unassigned notification | `app.notifications`, populated by Phase-1 order-state trigger |

## Sync source state

The existing schema is used without a Phase-5 migration:

- Disabled: `catalog_sources.enabled=false`.
- Paused: `catalog_sources.configuration.paused=true`.
- Resumed: enabled=true and paused=false.
- Manual run: `sync_jobs.trigger_type='manual'`.
- Scheduled run: `sync_jobs.trigger_type='scheduled'`.
- Retry run: `sync_jobs.trigger_type='retry'`, with `parent_job_id`, `attempt_no`, and `retry_after`.

## RLS

Phase-5 application workers use the normal runtime database login. Each database transaction sets:

- `app.user_id = WORKER_SERVICE_USER_ID`
- `app.user_role = super_admin`
- `app.request_id = generated UUID`

`WORKER_SERVICE_USER_ID` must therefore be a dedicated active `app.app_users` record with an active `super_admin` role binding. The code validates this identity on every transaction.

The backup command is different: a complete logical dump cannot be produced through normal RLS visibility. `deploy/backup-role.sql` creates a dedicated, read-only PostgreSQL backup login with `BYPASSRLS`, not a superuser. Use `BACKUP_DATABASE_URL` only for `pg_dump`.
