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
