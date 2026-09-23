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
