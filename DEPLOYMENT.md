# Deployment

## Validation

Run:

```bash
npm install
npm run validate
```

CI validates the Prisma schema, TypeScript, unit tests, all production web builds and PostgreSQL-backed end-to-end order flows.

## Database

Provision PostgreSQL 16+. For a new database:

```bash
npm run db:migrate
npm run db:seed
npm run bootstrap:admin -w @ppm/database
```

Migrations include the push-subscription table used by Firebase Cloud Messaging.

## API

Build:

```bash
npm run build -w @ppm/core
npm run db:generate
npm run build -w @ppm/database
npm run build -w @ppm/api
```

Start:

```bash
npm run start -w @ppm/api
```

Health path: `/health`.

## Web portals

Set `NEXT_PUBLIC_API_URL` before building each portal:

```bash
npm run build -w @ppm/customer-web
npm run build -w @ppm/restaurant-portal
npm run build -w @ppm/delivery-portal
npm run build -w @ppm/admin-portal
```

The customer PWA also requires the `NEXT_PUBLIC_FIREBASE_*` values at build time when browser push is enabled.

## Worker

With a real `REDIS_URL`, run the notification worker separately:

```bash
node apps/api/dist/worker.js
```

If `REDIS_URL` is absent or still an `example-placeholder-*` value, the worker exits cleanly instead of attempting a bogus connection.

## Docker

Local infrastructure is available through:

```bash
docker compose -f docker-compose.v3.yml up --build
```

It includes PostgreSQL, Redis and MinIO for local development.

## Railway topology

The repository supports the existing topology:

- Customer PWA + API service
- Restaurant portal service
- Delivery portal service
- Admin portal service
- PostgreSQL service
- Optional external Redis/Upstash when the Railway project cannot provision another service

Use `.env.production.example` as the variable checklist. Put real secrets in Railway Variables; do not commit a populated `.env`.

Server-only variables belong on the API service. `NEXT_PUBLIC_API_URL` belongs on every web service. `NEXT_PUBLIC_FIREBASE_*` values belong on the customer-web build/service.

## Provider activation order

1. Replace PostgreSQL/core security placeholders.
2. Razorpay: set live key, secret and webhook secret; set provider to `razorpay`.
3. Twilio: replace SID/token/sender; set provider to `twilio`.
4. Resend: replace API key/sender; set provider to `resend`.
5. Maps: replace key; set provider to `google` or `mapbox`.
6. R2: replace endpoint, bucket, access key, secret and public URL.
7. Redis: replace `REDIS_URL`.
8. Firebase: replace server service-account variables and customer `NEXT_PUBLIC_FIREBASE_*` values, then rebuild customer web.

No application source change is required when real credentials are supplied later.

## Verification

Check:

- `GET /health`
- `GET /platform/capabilities`
- super-admin `GET /admin/integrations/status`
- password signup/login
- OTP only after SMS/email is configured
- COD checkout at all times
- online payment only after Razorpay is ready
- map geocode/reverse only after map provider is ready
- image/document upload only after storage is ready
- browser push registration only after both server and public Firebase settings are ready

## Rollback

Keep the prior application deployment available until health, auth and order smoke tests pass. Roll back application code first. Roll back a database only using a tested backward migration or point-in-time restore.

## Backup

Use automated PostgreSQL snapshots plus periodic restore drills. Apply retention/versioning to object storage. Keep all real credentials in the cloud secret store.
