# Architecture

PPM Bites V3 is a TypeScript monorepo.

## Runtime
Customer, restaurant, delivery and admin portals are Next.js applications. The API is Fastify. PostgreSQL is the source of truth through Prisma. Redis is used for event fan-out and BullMQ jobs. S3-compatible storage is used for uploaded media/documents. External providers are behind adapters.

## Trust boundaries
Browsers never calculate authoritative totals or decide permissions. The API authenticates JWTs, resolves server-side roles and checks resource ownership. Checkout runs in a serializable database transaction and snapshots prices/items. Payment callbacks are signature-checked and idempotent. Rider acceptance uses serializable assignment logic.

## Realtime
Order changes publish to Redis channels. Customer tracking consumes an authenticated SSE stream, avoiding continuous database polling.

## Services
- customer-web: discovery, menu, cart, checkout, orders
- restaurant-portal: queue and kitchen operations
- delivery-portal: availability, GPS, assignment offers
- admin-portal: approvals, support, flags, operations
- api: REST, auth, payment webhooks, SSE
- worker: BullMQ notification processor

## Extension points
PaymentProvider, SmsProvider, EmailProvider and S3-compatible storage are isolated from business logic. Search starts in PostgreSQL and can later move to a dedicated search engine. ETA/recommendations use deterministic rules and can be replaced by ML services without changing order truth.
