# API documentation

Base URL defaults to http://localhost:4000. Production uses HTTPS.

Authentication: Bearer access token. Refresh tokens are rotated and stored hashed server-side.

Key routes:
- POST /auth/login
- POST /auth/otp/request
- POST /auth/otp/verify
- POST /auth/refresh
- POST /auth/logout-all
- POST /auth/password
- GET /restaurants
- GET /restaurants/:slug
- GET, POST /me/addresses
- GET /carts/:restaurantId
- PUT /carts/:restaurantId/items
- POST /checkout
- POST /payments/:orderId/create
- POST /payments/webhook
- GET /orders
- GET /orders/:id
- GET /orders/:id/events
- POST /orders/:id/cancel
- POST /orders/:id/transition
- GET /partner/orders
- PATCH /partner/menu/:itemId
- POST /delivery/online
- POST /delivery/location
- GET /delivery/offers
- POST /delivery/assignments/:id/respond
- POST /delivery/dispatch/:orderId
- POST /onboarding/restaurant
- POST /onboarding/delivery
- GET /admin/kpis
- PATCH /admin/restaurants/:id/status
- POST /admin/refunds
- GET /admin/audit
- GET/PATCH /admin/feature-flags
- POST /reviews
- GET/POST /support/tickets
- POST /support/tickets/:id/messages
- GET /notifications
- POST /analytics
- GET /health

Error envelope:
```json
{"code":"ITEM_UNAVAILABLE","message":"Item unavailable","requestId":"..."}
```

Checkout requires an Idempotency-Key header. Payment provider callbacks require the provider signature header.
