# Testing

CI performs dependency installation, Prisma validation, versioned migration generation, strict TypeScript checks, unit tests and production builds.

Run locally:
```bash
npm install
npm run validate
```

Core unit coverage includes order-state transitions, price calculation, coupon caps and delivery-fee thresholds.

Required integration smoke path:
1. migrate empty PostgreSQL database
2. seed demo data
3. login customer
4. search/open restaurant
5. persist cart
6. checkout with Idempotency-Key
7. confirm dev payment
8. restaurant accepts/prepares/readies
9. dispatch rider
10. rider accepts, picks up and delivers
11. verify settlement/earning rows
12. submit review

Concurrency cases to preserve: stock decrement, repeated checkout, rider acceptance, coupon redemption, duplicate payment webhook and duplicate refund key.

Security regression: unauthorized admin route, cross-restaurant order mutation, unrelated rider access, malformed/expired tokens, OTP throttling and invalid webhook signature.

Load tooling should target GET /restaurants, restaurant detail, checkout and SSE connections with a separate QA database. Never load-test production checkout with real payment credentials.
