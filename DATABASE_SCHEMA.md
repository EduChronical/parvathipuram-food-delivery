# Database schema

The canonical schema is packages/database/prisma/schema.prisma and migrations are under packages/database/prisma/migrations.

Major domains:
- Identity: users, profiles, sessions, roles, permissions, user_roles
- Geography: addresses, cities, service_zones
- Restaurant: restaurants, owners, staff, hours, documents, images, cuisines
- Catalog: categories, items, variants, addon groups, addons
- Commerce: carts, cart_items, orders, order_items, status history
- Money: payments, payment attempts, refunds, restaurant settlements, rider earnings, wallets
- Delivery: delivery partners, documents, locations, assignments
- Growth: coupons, rules, redemptions, promotions, referrals
- Trust: reviews, review images, support tickets/messages, notifications, audit logs, feature flags, settings
- Platform: OTP challenges, idempotency keys, analytics events

Indexes are present on the highest-volume ownership/status/time access paths. Uniqueness protects role bindings, restaurant slugs, coupon codes, payment provider IDs, review-per-order and idempotency keys.

Critical flows use Prisma transactions with serializable isolation where contention matters. The database—not the browser—is authoritative for stock, totals, payment state, delivery assignment and order lifecycle.
