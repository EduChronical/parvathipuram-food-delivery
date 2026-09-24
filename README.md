# PPM Bites

PPM Bites is an original multi-role food-delivery platform for Parvathipuram. V3 is a TypeScript monorepo with a customer PWA, restaurant portal, delivery-partner portal, admin/support portal, Fastify API, PostgreSQL/Prisma, Redis realtime/queues and provider abstractions for payments, SMS, email, maps and S3-compatible storage.

## Workspaces

- apps/customer-web — responsive customer PWA
- apps/restaurant-portal — restaurant order/menu operations
- apps/delivery-portal — rider availability, GPS and delivery offers
- apps/admin-portal — administration, approvals, support and configuration
- apps/api — REST API, auth, checkout, payments, realtime and workers
- packages/core — order state machine, pricing, coupons, ETA and shared rules
- packages/database — Prisma schema, migrations, seed and secure admin bootstrap
- packages/ui — shared original design system

## Requirements

Node 22, PostgreSQL 16+, Redis 7+, and optional S3-compatible object storage.

## Install

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run bootstrap:admin -w @ppm/database
```

Admin bootstrap only runs when ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are supplied through a protected environment.

## Development

```bash
npm run dev -w @ppm/api
npm run dev -w @ppm/customer-web
npm run dev -w @ppm/restaurant-portal
npm run dev -w @ppm/delivery-portal
npm run dev -w @ppm/admin-portal
```

Default ports: customer 3000, restaurant 3001, delivery 3002, admin 3003, API 4000.

## Docker

```bash
docker compose -f docker-compose.v3.yml up --build
```

Then run migrations/seed inside the API container or from the host:

```bash
npm run db:migrate
npm run db:seed
```

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run validate
```

GitHub Actions repeats schema validation, TypeScript checks, unit tests and production builds on every V3 push.

## Demo QA accounts

The seed creates non-admin demo users using DEMO_PASSWORD:
- customer@ppmbites.local
- restaurant@ppmbites.local
- delivery@ppmbites.local

The administrator is never assigned the public demo password; bootstrap it through protected environment variables.

## Production providers

Set PAYMENT_PROVIDER=razorpay and provider credentials to activate Razorpay order/webhook flows. Development payment mode remains available for QA. SMS/email/storage use provider interfaces; credentials belong only in server-side environment configuration.

See ARCHITECTURE.md, DATABASE_SCHEMA.md, API_DOCUMENTATION.md, DEPLOYMENT.md, ENVIRONMENT_VARIABLES.md, SECURITY.md, TESTING.md and the role manuals.
