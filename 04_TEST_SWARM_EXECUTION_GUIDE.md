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
