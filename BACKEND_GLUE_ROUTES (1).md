# Phase 4 backend glue routes

## Rider dashboard

- `POST /v1/rider-dashboard/register`
- `GET /v1/rider-dashboard/me`
- `PATCH /v1/rider-dashboard/me/availability`
- `POST /v1/rider-dashboard/me/heartbeat`
- `GET /v1/rider-dashboard/me/offers`
- `POST /v1/rider-dashboard/me/offers/:offerId/accept`
- `POST /v1/rider-dashboard/me/offers/:offerId/reject`
- `GET /v1/rider-dashboard/me/current-delivery`
- `GET /v1/rider-dashboard/me/wallet`
- `GET /v1/rider-dashboard/me/demand-heatmap`

## Super-admin core

- `GET /v1/admin-dashboard/live`
- `GET /v1/admin-dashboard/logs?type=all|cancelled|rejected|unassigned`
- `GET /v1/admin-dashboard/fraud-flags`
- `POST /v1/admin-dashboard/fraud-flags/:flagId/resolve`
- `POST /v1/admin-dashboard/fraud/scan/:orderId`
- `GET /v1/admin-dashboard/reports/orders.csv?period=daily|weekly|monthly&date=YYYY-MM-DD`

All admin routes require the authenticated account to have the Phase-1 `super_admin` role binding. Rider routes require `delivery_agent` after registration.
