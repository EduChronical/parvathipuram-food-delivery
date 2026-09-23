# Phase-4 automatic integration hooks

## 1. Fraud evaluation after order creation

In the existing order-creation transaction, after the order and its `app.order_items` are inserted:

```js
import { evaluateOrderFraud } from './services/fraud-risk.service.js';
await evaluateOrderFraud(client, order.id);
```

Run the same function after a failed payment attempt is persisted so the `payment_failures_6h` rule can create/update the appropriate risk signal.

The fraud evaluator only writes `app.fraud_flags`; the Phase-1 `trg_fraud_alert` trigger creates the corresponding super-admin system alert.

## 2. Rider SMS + in-app alert when an offer is created

Immediately after the privileged assignment dispatcher inserts into `app.delivery_offers`:

```js
import { queueRiderOfferSms } from './services/rider-dashboard.service.js';
await queueRiderOfferSms(client, offer.id);
```

The hook inserts deduplicated `sms` and `in_app` rows into `app.notifications`. The existing Phase-2 notification worker/provider is responsible for delivery.

## 3. Assigned-order SMS hook is already database-authoritative

No second Phase-4 `order.assigned` notification should be inserted manually.

When Phase-1 changes `app.orders.status` to `assigned`, `app.record_order_status_and_notifications()` automatically queues both SMS and in-app status notifications for the assigned rider. This prevents duplicate rider SMS messages and keeps notification behavior consistent with other order-state transitions.
