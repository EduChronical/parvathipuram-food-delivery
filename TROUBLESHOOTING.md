# Troubleshooting

API will not start: check DATABASE_URL and JWT_SECRET length, then GET /health.

Database migration fails: run Prisma validation first and verify the target database is reachable and empty/at the expected migration version.

No restaurants: confirm seed ran, restaurant status is APPROVED, isOpen=true and isPaused=false.

Login fails: confirm demo seed ran or administrator bootstrap was executed; do not use demo credentials for admin.

Checkout fails: inspect the returned error code. Common causes are empty cart, item/stock changes, closed restaurant, invalid coupon, address outside delivery radius or missing Idempotency-Key.

Payment stuck: verify provider credentials, webhook URL/signature secret and payment-attempt records. Duplicate webhooks should return success without applying state twice.

No rider offers: verify approved riders are online with recent locations and within the dispatch radius.

Live tracking unavailable: verify REDIS_URL and Redis health. The order page still supports manual refresh.

Build failure: use GitHub Actions logs; fix schema/type/build errors before deployment.

Rollback: redeploy the previous application revision. Do not reverse database changes without a tested backward migration or backup restore.
