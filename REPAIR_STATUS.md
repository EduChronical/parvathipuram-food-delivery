# Parvathipuram delivery site — handoff status

Updated 2026-09-24. Local implementation is complete and verified, but is **not deployed** and cannot accept live orders yet.

## Implemented

- Customer signup/login, catalog and checkout UI, plus customer, restaurant, rider and admin dashboards.
- Same-origin frontend serving from the backend, auth/API route integration, order quote flow, and cash-on-delivery checkout.
- JWT expiry enforcement, salted password hashes, explicit CORS allowlist, safer webhook signature verification, and order access checks.
- A Render background worker for dispatch, timeout, and notification jobs; payment events now require an allowlisted provider and cannot alter COD orders.
- Canonical public-schema migrations 000–010. Migration 010 fixes manual restaurant/menu-item uniqueness and adds a rider-capacity invariant.

## Verified locally

- Backend: `npm run check` and `npm test` — 11 tests pass.
- Frontend: `npm --prefix frontend test` — 3 tests pass; `npm --prefix frontend run build` succeeds.
- PostgreSQL migrations 000–010 all apply in the embedded PostgreSQL check.
- `git diff --check` passes.

## Still required for a live launch

- Push the reviewed commit to the GitHub repository and deploy through Render. The Render sign-in attempt was blocked when automatic approval review hit a usage limit; authenticated access was not available. No alternate credential path was used.
- Set valid Render database, JWT, system-actor, and payment-webhook secrets; run migrations against the production database; verify `/health` returns 200.
- Grant the Render runtime DB role membership in `pb_authenticated`, `pb_worker`, and `pb_auth_service`; leave `PAYMENT_ALLOWED_PROVIDERS` empty until a real provider is integrated.
- Add verified restaurants, menus, delivery areas, and operator accounts. The recovered database artifacts contain no usable merchant seed data, so the customer catalog will be empty until operators provision it.
- Online payments are not enabled; checkout currently supports cash on delivery only.

No public deployment URL or successful production health check is available to report. Do not send customers to the app until the deployment and merchant setup above are complete.
