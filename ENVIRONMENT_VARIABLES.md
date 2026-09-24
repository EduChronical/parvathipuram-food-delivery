# Environment variables

Copy .env.example and set real secrets only in the runtime secret store.

Required production:
- DATABASE_URL
- JWT_SECRET
- APP_ORIGIN

Auth/bootstrap:
- ADMIN_EMAIL
- ADMIN_INITIAL_PASSWORD
- DEV_OTP_CODE must not be set to a predictable value in production

Infrastructure:
- REDIS_URL
- STORAGE_ENDPOINT
- STORAGE_REGION
- STORAGE_BUCKET
- STORAGE_ACCESS_KEY
- STORAGE_SECRET_KEY
- STORAGE_PUBLIC_URL

Payment:
- PAYMENT_PROVIDER=dev or razorpay
- PAYMENT_API_KEY
- PAYMENT_API_SECRET
- PAYMENT_WEBHOOK_SECRET
- NEXT_PUBLIC_PAYMENT_PROVIDER
- NEXT_PUBLIC_API_URL

Messaging:
- SMS_PROVIDER / SMS_API_KEY / SMS_API_SECRET
- EMAIL_PROVIDER / EMAIL_API_KEY
- FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY

Maps:
- MAP_PROVIDER
- MAP_API_KEY

DEMO_PASSWORD is development/QA-only. Never expose server credentials through NEXT_PUBLIC_ variables.
