# Phase 6 test-swarm suite

This package contains test/simulation source only. It does not alter application source and it does not run indefinitely unless you explicitly start the local file watcher.

## What the swarm exercises

- Customer order creation.
- End-to-end restaurant acceptance → rider offer → pickup → delivery.
- Customer cancellation before acceptance.
- Restaurant rejection with reason.
- Signed payment-failure webhook simulation and invalid-signature rejection.
- Order idempotency.
- Customer attempts to cross customer/restaurant/rider/admin role boundaries.
- Invalid GPS input.
- Concurrent customer order creation.
- Catalog-read bursts.

## Test identities

Earlier phases do not define login/signup APIs. Therefore the suite intentionally uses pre-provisioned test JWTs from environment variables rather than fabricating an authentication contract.

Use only dedicated QA/test accounts and test data.

## Self-improving strategy

`src/strategy/strategy-engine.js` persists `artifacts/strategy-state.json`.

After a run:
1. New defects are fingerprinted and deduplicated.
2. Critical/high defects raise the weights of related scenario families.
3. Later swarm runs spend more iterations on those families.
4. Weights slowly decay toward baseline so historical bugs do not monopolize testing.

This is adaptive test selection only. It does not patch production code.

## Bug logging

Primary files:
- `artifacts/bugs.jsonl`
- `artifacts/bugs.summary.json`
- `artifacts/traces/<run>/<agent>.json`

Optional QA database sink writes compatible records into the Phase-1 `app.bug_logs` table when `PB_TEST_DATABASE_URL` and `PB_TEST_DB_SERVICE_USER_ID` are configured.

## Playwright

The Playwright suite covers customer, restaurant-owner, rider, and super-admin surfaces plus mobile Telugu layout checks:
- no horizontal overflow at 360 px width;
- Telugu content remains visible;
- visible buttons meet the 44×44 CSS-pixel touch target;
- dark-mode control is interactive;
- rider demand heatmap and operational panels render.

The generated Phase-3/4 demo hosts use `localStorage['pb-access-token']`; Playwright injects the dedicated test token before page scripts run.

## k6

`load/k6-concurrent-users.js` runs:
- ramping concurrent catalog browsing;
- constant-arrival-rate create/cancel order traffic.

Thresholds fail the run for excessive request errors or latency.

## Regression gate

`npm run regression` runs:
1. Phase-6 unit tests.
2. Swarm scenarios.
3. Full Playwright E2E.
4. k6 only when `PB_RUN_K6_IN_REGRESSION=true`.

The gate fails on any failed step or any unresolved critical/high defect in the generated bug summary.

For local “run after code changes” behavior:

`npm run watch:regression -- ../your-app/src`

The watcher only invokes the regression gate. It never edits application files.
