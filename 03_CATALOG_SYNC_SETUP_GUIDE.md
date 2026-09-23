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
