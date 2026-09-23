# PHASE 2 — Backend API Contracts

All money values are integer paise. All authenticated routes require `Authorization: Bearer <JWT>`.
The JWT role claim, if present, is ignored. Authorization uses the `app_users.role` record from Phase 1.

## Order state machine

Allowed transitions used by Phase 2:

- `placed -> accepted`
- `placed -> cancelled` (customer only; cancellation record must be inserted first)
- `placed -> rejected` (restaurant owner; rejection record first)
- `placed -> payment_failed`
- `accepted -> assigned`
- `accepted -> unassigned` (timeout job)
- `accepted -> rejected`
- `accepted -> payment_failed`
- `unassigned -> assigned`
- `assigned -> picked_up`
- `picked_up -> delivered`

No API route can skip an intermediate state.

## Zero-commission invariant

For every order:

- restaurant amount = `food_total_paise`
- rider amount = `delivery_fee_paise + tip_paise`
- platform amount = `0`
- order total = restaurant amount + rider amount

The payment-event endpoint refuses a `split_settled` event unless these values match exactly.

## Public/authenticated routes

| Method | Route | Actor | Purpose |
|---|---|---|---|
| POST | `/v1/orders` | customer | Create idempotent order; server prices menu and delivery |
| GET | `/v1/orders/:orderId` | visible participant/admin | Read order under Phase-1 RLS |
| POST | `/v1/orders/:orderId/cancel` | customer | Cancel only while `placed`; mandatory reason |
| POST | `/v1/restaurants/:restaurantId/orders/:orderId/accept` | restaurant owner | Accept `placed` order |
| POST | `/v1/restaurants/:restaurantId/orders/:orderId/reject` | restaurant owner | Reject `placed`/`accepted`; mandatory reason |
| PATCH | `/v1/riders/me/availability` | delivery agent | Online/offline toggle; online requires coordinates |
| POST | `/v1/riders/me/heartbeat` | delivery agent | Refresh location/last-seen |
| GET | `/v1/riders/me/offers` | delivery agent | Active, non-expired offers |
| POST | `/v1/riders/me/offers/:assignmentId/accept` | delivery agent | Atomically claim available order |
| POST | `/v1/riders/me/offers/:assignmentId/reject` | delivery agent | Reject offer with reason |
| POST | `/v1/riders/me/orders/:orderId/pickup` | assigned delivery agent | `assigned -> picked_up` |
| POST | `/v1/riders/me/orders/:orderId/deliver` | assigned delivery agent | `picked_up -> delivered` and COD capture |
| GET | `/v1/riders/me/wallet` | delivery agent | Wallet totals and append-only ledger history |
| GET | `/v1/notifications` | any authenticated user | Own notification history |

## Internal route

`POST /v1/internal/payment-events`

Requires `x-pb-payment-signature: sha256=<hex>` where the HMAC message is:

`eventId|provider|providerReference|orderId|kind|amountPaise|restaurantAmountPaise|riderAmountPaise|platformAmountPaise`

Supported kinds:

- `authorized`
- `paid`
- `failed`
- `refunded`
- `split_settled`

`split_settled` requires exact zero-commission component amounts and transfer references.

## Background jobs

### Assignment dispatcher

Runs every `ASSIGNMENT_POLL_MS`:

1. Expire stale offers older than `RIDER_OFFER_TTL_SECONDS`.
2. Select `accepted`/`unassigned` orders without a rider using row locks + `SKIP LOCKED`.
3. Consider only approved, online riders with fresh heartbeats.
4. Exclude riders already servicing an active assigned/picked-up order.
5. Exclude riders who already rejected/expired/cancelled the same order.
6. Offer to the nearest eligible rider and enqueue SMS + in-app notification.

### Unassigned timeout

Runs every `UNASSIGNED_POLL_MS`:

1. Reads `app_config.unassigned_timeout_seconds`.
2. Locks accepted orders older than timeout with no assigned rider.
3. Transitions to `unassigned`.
4. Inserts `unassigned_order_logs` with timeout and available rider count.
5. Expires outstanding offers.
6. Queues customer, restaurant-owner, and super-admin notifications.

### Notification queue worker

Runs every `NOTIFICATION_POLL_MS` and uses `FOR UPDATE SKIP LOCKED` leasing:

- `in_app`: mark sent; the row itself is the in-app notification.
- `sms`: render Telugu order-status message and submit to configured SMS provider.
- failed sends: exponential retry up to `NOTIFICATION_MAX_ATTEMPTS`.
- `sending` rows are reclaimable after the lease timeout.
