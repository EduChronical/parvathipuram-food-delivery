# Security

Authentication uses short-lived JWT access tokens and server-stored Argon2-hashed refresh tokens. Refresh is rotated. OTP challenges store only hashes, expire quickly and are rate-limited. Passwords use Argon2.

Authorization is server-side. Protected routes check roles plus ownership of orders/restaurants/delivery assignments. Frontend visibility is never treated as an authorization boundary.

Checkout recalculates prices, discounts, fees, stock and serviceability on the server inside a transaction. Important external operations use idempotency keys. Payment webhooks verify HMAC signatures and duplicate event IDs.

Fastify enables secure headers, CORS configuration, request body limits, rate limiting and consistent validation/error envelopes. Stack traces are not sent to clients.

Uploads belong behind the S3 abstraction with MIME/type/size validation before production activation. KYC, addresses, phone numbers and location histories must only be returned to authorized roles.

Administrator bootstrap requires protected runtime variables and is deliberately excluded from public demo credentials. Audit logs capture sensitive administrative and financial actions.

Production checklist: rotate secrets, require HTTPS, use least-privilege DB credentials, configure provider webhook allowlists where supported, run dependency scanning, test backup restore, and review audit logs.
