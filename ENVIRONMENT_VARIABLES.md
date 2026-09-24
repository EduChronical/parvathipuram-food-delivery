# Environment variables

PPM Bites ships with two safe templates:

- `.env.example` for local development.
- `.env.production.example` for production secret-manager/Railway setup.

Every credential slot uses an `example-placeholder-*` value. The API deliberately treats those values as **not configured**, so copying a template cannot accidentally activate a provider with dummy credentials.

## Core

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | development, test or production |
| `PORT` | API port, normally 4000 |
| `DATABASE_URL` | PostgreSQL connection URL |
| `JWT_SECRET` | access-token signing secret, 32+ random characters |
| `REFRESH_TOKEN_SECRET` | reserved refresh-token secret |
| `APP_ORIGIN` | comma-separated allowed browser origins |
| `NEXT_PUBLIC_API_URL` | public HTTPS API URL compiled into web portals |
| `LOG_LEVEL` | runtime log level |

## Razorpay

Set `PAYMENT_PROVIDER=razorpay` and replace:

- `PAYMENT_API_KEY`
- `PAYMENT_API_SECRET`
- `PAYMENT_WEBHOOK_SECRET`
- `NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay`

Webhook route: `POST /payments/webhook`.

Until all required server values are real, `/platform/capabilities` reports online payments as unavailable and checkout remains COD-only.

## Twilio SMS

Set `SMS_PROVIDER=twilio` and replace:

- `SMS_API_KEY` — Account SID
- `SMS_API_SECRET` — Auth Token
- `SMS_FROM` — approved sender/number

SMS OTP and SMS notifications remain disabled while any value is missing or still a placeholder.

## Resend email

Set `EMAIL_PROVIDER=resend` and replace:

- `EMAIL_API_KEY`
- `EMAIL_FROM` — verified sender

Email OTP, password recovery and transactional email automatically activate when both values are real.

## Google Maps / Mapbox

Set `MAP_PROVIDER=google` or `MAP_PROVIDER=mapbox`, then replace `MAP_API_KEY`.

Routes:

- `GET /maps/geocode?q=...`
- `GET /maps/reverse?lat=...&lng=...`

## Cloudflare R2 / S3-compatible storage

Replace:

- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_PUBLIC_URL`

The upload layer is S3-compatible, so the same variables can point to R2, MinIO or another compatible provider.

## Upstash Redis / Redis

Replace `REDIS_URL` with a real Redis/Upstash connection URL. Placeholder URLs are ignored.

Without Redis, a single API instance continues to use its in-process realtime fallback. With Redis, order SSE fan-out and the BullMQ worker can operate across instances.

## Firebase Cloud Messaging

Server credentials:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

Customer PWA build-time configuration:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

The PWA uses Firebase's current Installation-ID registration flow. The API stores only the FCM installation target, not service-account credentials, and sends through the FCM HTTP v1 API.

After changing any `NEXT_PUBLIC_*` Firebase variable, rebuild the customer web app because Next.js embeds those values at build time.

## Admin and QA

- `ADMIN_EMAIL`
- `ADMIN_INITIAL_PASSWORD`
- `DEMO_PASSWORD`
- `DEV_OTP_CODE`

The admin bootstrap rejects placeholder credentials and preserves the password of an already-existing administrator. Never use a predictable `DEV_OTP_CODE` in production.

## Runtime status

Authenticated super-admins can inspect configuration readiness without exposing secret values:

`GET /admin/integrations/status`

Public feature availability is exposed at:

`GET /platform/capabilities`
