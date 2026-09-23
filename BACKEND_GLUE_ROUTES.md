# PHASE 3 backend glue endpoints

All endpoints use the existing Phase-2 JWT authentication and Phase-1 PostgreSQL RLS context.

## Customer/catalog
- `GET /v1/catalog/restaurants?diet=all|veg|nonveg&minPricePaise=&maxPricePaise=&openNow=true|false&limit=&offset=`
- `GET /v1/catalog/restaurants/:restaurantId/menu`
- `GET /v1/customers/me/addresses`
- `POST /v1/customers/me/addresses`
- `PATCH /v1/customers/me/addresses/:addressId`
- `DELETE /v1/customers/me/addresses/:addressId`
- `GET /v1/customers/me/orders?limit=50`
- `POST /v1/orders/:orderId/reorder`
- `POST /v1/orders/:orderId/review`

Phase-2 endpoints reused directly by customer UI:
- `POST /v1/orders`
- `POST /v1/orders/:orderId/cancel`

## Restaurant owner
- `GET /v1/restaurants/:restaurantId/dashboard`
- `GET /v1/restaurants/:restaurantId/orders?status=&limit=`
- `PATCH /v1/restaurants/:restaurantId/open-state`
- `GET /v1/restaurants/:restaurantId/owner-menu`
- `PATCH /v1/restaurants/:restaurantId/menu/:menuItemId/availability`
- `PATCH /v1/restaurants/:restaurantId/menu/:menuItemId`
- `GET /v1/restaurants/:restaurantId/reviews?limit=100`

Phase-2 endpoints reused directly by restaurant UI:
- `POST /v1/restaurants/:restaurantId/orders/:orderId/accept`
- `POST /v1/restaurants/:restaurantId/orders/:orderId/reject`
- `GET /v1/notifications`

## Core request shapes

Create address:
```json
{"label":"ఇల్లు","addressText":"...","latitude":18.78,"longitude":83.42,"isDefault":true}
```

Reorder:
```json
{"addressId":"uuid","tipPaise":2000,"paymentMethod":"cod","idempotencyKey":"uuid-or-unique-key"}
```

Review:
```json
{"rating":5,"body":"చాలా బాగుంది"}
```

Shop state:
```json
{"isOpen":false}
```

Availability:
```json
{"isAvailable":false}
```

Manual menu patch supports any subset of:
```json
{"name":"Idli","description":"...","pricePaise":5000,"isVeg":true,"category":"Breakfast","imageUrl":null}
```
