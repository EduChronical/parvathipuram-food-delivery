# Parvathipuram delivery site — handoff status

Updated 2026-09-24. The verified implementation is pushed to GitHub `main` at commit `5b37384854c4a4f9e0f216d5e09a5cfa466acea5`. A successful Render deployment and production health check have not been verified; live ordering is not confirmed.

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

- Render service access is unavailable here, so deployment status and environment settings could not be inspected. The GitHub `render.yaml` declares web and worker services with auto-deploy enabled; verify Render build/deploy status and `/health` before launch.
- Set valid Render database, JWT, system-actor, and payment-webhook secrets; run migrations against the production database; verify `/health` returns 200.
- Grant the Render runtime DB role membership in `pb_authenticated`, `pb_worker`, and `pb_auth_service`; leave `PAYMENT_ALLOWED_PROVIDERS` empty until a real provider is integrated.
- Add verified restaurants, menus, delivery areas, and operator accounts. The recovered database artifacts contain no usable merchant seed data, so the customer catalog will be empty until operators provision it.
- Online payments are not enabled; checkout currently supports cash on delivery only.

No public deployment URL or successful production health check is available to report. Do not send customers to the app until the deployment and merchant setup above are complete.
