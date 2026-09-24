# Security changes

JWTs must contain a finite numeric `exp` later than the current time. HS256 signature, issuer, audience and subject remain mandatory. Malformed JSON claim types and noncanonical base64url segments return HTTP 401 instead of uncaught errors.

Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of exact frontend origins, for example `https://ordering.example`. Do not include a trailing slash, path or wildcard. An empty list permits only requests with no Origin header. Include the served frontend origin even if frontend and API share a hostname. Origin-bearing requests outside the allowlist receive HTTP 403 before a handler runs. OPTIONS validates the route method and requested headers without requiring login. Allowed headers: Authorization, Content-Type, Idempotency-Key and X-Request-ID. CORS is not a replacement for authentication.

## Payment adapter contract v2 — breaking change

The old pipe-separated signing format is no longer accepted. Update the trusted payment adapter at the same time as the backend. Use the exported `canonicalPaymentEvent(body)` helper from `src/providers/payment-webhook.js` when both sides use JavaScript.

HMAC input is UTF-8 bytes of the literal `pb-payment-v2`, a newline, then canonical JSON of the entire parsed event object. Sort each object's keys using JavaScript default `.sort()` ordering; serialize keys and string values using JSON.stringify; keep array order and JSON primitive types. Do not add whitespace. Numbers use JSON.stringify representation. Sign every submitted field, including restaurantTransferReference, riderTransferReference, failureCode, failureMessage and any metadata. Absence, null, empty string and numeric/string values are distinct. For non-JavaScript adapters, match JavaScript number and string serialization exactly or constrain inputs to common interoperable values.

Header stays `X-PB-Payment-Signature: sha256=<64 hex characters>` and uses HMAC-SHA256 with PAYMENT_WEBHOOK_SECRET. Payment events are backend-to-backend; this signature header is deliberately not allowed in browser CORS preflight. Do not embed this secret in the frontend.

The webhook rejects providers absent from the `PAYMENT_ALLOWED_PROVIDERS` comma-separated server-side allowlist (empty disables payment events). Charge/authorization/failure/refund events cannot modify COD orders, and payment status transitions cannot move a paid order back to failed. Split settlement events are idempotent by order and transfer references.

Run `node --test test/security.test.js` for JWT validation, field tampering, ambiguous delimiter regression, and real HTTP CORS/preflight tests.
