import { withSystemTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { buildZeroCommissionSplit } from '../domain/finance.js';
import { queueOrderRecipients } from './notification.service.js';
import { config } from '../config.js';

function requiredEventFields(event) {
  for (const key of ['eventId','provider','providerReference','orderId','kind']) {
    if (typeof event[key] !== 'string' || !event[key].trim()) throw new HttpError(400, 'INVALID_PAYMENT_EVENT', `${key} is required.`);
  }
  if (!Number.isSafeInteger(event.amountPaise) || event.amountPaise < 0) throw new HttpError(400, 'INVALID_PAYMENT_EVENT', 'amountPaise must be non-negative integer paise.');
  if (!['authorized','paid','failed','refunded','split_settled'].includes(event.kind)) throw new HttpError(400, 'INVALID_PAYMENT_EVENT', 'Unsupported payment event kind.');
}

async function lockEvent(client, eventId) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`payment-event:${eventId}`]);
  const existing = await client.query(`SELECT id,raw_meta FROM payment_transactions WHERE raw_meta->>'eventId'=$1 LIMIT 1`, [eventId]);
  return existing.rows[0] ?? null;
}

async function reverseDeliveredRiderEarnings(client, order) {
  if (!order.delivery_agent_id) return;
  const wallet = (await client.query(`SELECT id FROM wallet_accounts WHERE delivery_agent_id=$1`, [order.delivery_agent_id])).rows[0];
  if (!wallet) throw new HttpError(500, 'WALLET_NOT_FOUND', 'Rider wallet missing for refund reversal.');
  const components = [
    ['delivery_fee', Number(order.delivery_fee_paise)],
    ['tip', Number(order.tip_paise)]
  ];
  for (const [component, amount] of components) {
    if (amount <= 0) continue;
    const referenceKey = `order:${order.id}:refund:${component}`;
    await client.query(
      `INSERT INTO wallet_ledger(wallet_id,order_id,entry_type,status,amount_paise,reference_key,metadata)
       VALUES($1,$2,'adjustment_debit','posted',$3,$4,$5::jsonb)
       ON CONFLICT(reference_key) DO NOTHING`,
      [wallet.id, order.id, -amount, referenceKey, JSON.stringify({ reason: 'order_refund', component })]
    );
  }
}

export function validatePaymentEventForOrder(event, order, allowedProviders = config.paymentAllowedProviders) {
  if (!allowedProviders.includes(event.provider)) throw new HttpError(403, 'PAYMENT_PROVIDER_NOT_ALLOWED', 'Payment provider is not enabled.');
  if (event.kind !== 'split_settled' && order.payment_method === 'cod') {
    throw new HttpError(409, 'COD_PAYMENT_EVENT_NOT_ALLOWED', 'Payment events cannot change a cash-on-delivery order.');
  }
  const state = order.payment_status;
  if (event.kind === 'authorized' && !['pending', 'authorized'].includes(state)) throw new HttpError(409, 'INVALID_PAYMENT_TRANSITION', 'This order cannot be authorized from its current payment state.');
  if (event.kind === 'paid' && !['pending', 'authorized'].includes(state)) throw new HttpError(409, 'INVALID_PAYMENT_TRANSITION', 'This order cannot be marked paid from its current payment state.');
  if (event.kind === 'failed' && !['pending', 'authorized'].includes(state)) throw new HttpError(409, 'INVALID_PAYMENT_TRANSITION', 'This order cannot be marked failed from its current payment state.');
  if (event.kind === 'refunded' && state !== 'paid') throw new HttpError(409, 'INVALID_PAYMENT_TRANSITION', 'Only a paid order can be refunded.');
}

export async function processPaymentEvent(requestId, event) {
  requiredEventFields(event);
  return withSystemTx(null, requestId, async client => {
    const duplicate = await lockEvent(client, event.eventId);
    if (duplicate) return { duplicate: true, transactionId: duplicate.id };

    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [event.orderId]);
    const order = rows[0];
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    validatePaymentEventForOrder(event, order);
    const split = buildZeroCommissionSplit(order);
    if (event.amountPaise !== split.totalPaise) throw new HttpError(422, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount must equal exact order total.');

    if (event.kind === 'split_settled') {
      const restaurantAmount = event.restaurantAmountPaise;
      const riderAmount = event.riderAmountPaise;
      const platformAmount = event.platformAmountPaise;
      if (restaurantAmount !== split.restaurantAmountPaise || riderAmount !== split.riderAmountPaise || platformAmount !== 0) {
        throw new HttpError(422, 'ZERO_COMMISSION_SPLIT_MISMATCH', 'Settlement must route 100% food to restaurant, 100% delivery fee + tip to rider, and ₹0 to platform.');
      }
      if (order.status !== 'delivered') throw new HttpError(409, 'ORDER_NOT_DELIVERED', 'Split settlement can be finalized only after delivery.');
      if (order.payment_status !== 'paid') throw new HttpError(409, 'PAYMENT_NOT_PAID', 'Order payment must be paid before final split settlement.');
      if (typeof event.restaurantTransferReference !== 'string' || !event.restaurantTransferReference.trim()) throw new HttpError(422, 'RESTAURANT_TRANSFER_REQUIRED', 'restaurantTransferReference is required.');
      if (split.riderAmountPaise > 0 && (typeof event.riderTransferReference !== 'string' || !event.riderTransferReference.trim())) throw new HttpError(422, 'RIDER_TRANSFER_REQUIRED', 'riderTransferReference is required.');

      const ledger = (await client.query(`SELECT status::text AS status,provider_reference FROM restaurant_settlement_ledger WHERE order_id=$1 FOR UPDATE`, [order.id])).rows[0];
      if (!ledger || ledger.status !== 'pending') {
        const previous = (await client.query(
          `SELECT id FROM payment_transactions WHERE order_id=$1 AND raw_meta->>'kind'='split_settled'
             AND raw_meta->>'restaurantTransferReference'=$2
             AND COALESCE(raw_meta->>'riderTransferReference','')=COALESCE($3,'') LIMIT 1`,
          [order.id, event.restaurantTransferReference, event.riderTransferReference ?? null]
        )).rows[0];
        if (previous) return { duplicate: true, transactionId: previous.id };
        throw new HttpError(409, 'SETTLEMENT_ALREADY_FINALIZED', 'This order settlement was already finalized with different transfer references.');
      }

      await client.query(
        `UPDATE restaurant_settlement_ledger SET status='paid',provider_reference=$2,paid_at=now(),updated_at=now()
         WHERE order_id=$1 AND platform_deduction_paise=0`, [order.id, event.restaurantTransferReference]
      );
      await client.query(`UPDATE delivery_fee_accounting SET status='paid',updated_at=now() WHERE order_id=$1 AND platform_deduction_paise=0`, [order.id]);
      await client.query(`UPDATE order_tips SET status='paid',updated_at=now() WHERE order_id=$1 AND platform_deduction_paise=0`, [order.id]);
    }

    let txType = 'charge';
    let status = event.kind;
    if (event.kind === 'split_settled') status = 'paid';
    if (event.kind === 'refunded') txType = 'refund';
    const allowedStatuses = new Set(['authorized','paid','failed','refunded']);
    if (!allowedStatuses.has(status)) throw new HttpError(422, 'INVALID_PAYMENT_STATUS', 'Payment event status unsupported by Phase-1 schema.');

    const tx = await client.query(
      `INSERT INTO payment_transactions(order_id,transaction_type,amount_paise,status,provider,provider_reference,failure_code,failure_message,raw_meta)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
      [order.id, txType, event.amountPaise, status, event.provider, event.providerReference, event.failureCode ?? null, event.failureMessage ?? null, JSON.stringify(event)]
    );

    if (event.kind === 'authorized') {
      await client.query(`UPDATE orders SET payment_status='authorized' WHERE id=$1`, [order.id]);
    } else if (event.kind === 'paid') {
      await client.query(`UPDATE orders SET payment_status='paid' WHERE id=$1`, [order.id]);
    } else if (event.kind === 'failed') {
      await client.query(`UPDATE orders SET payment_status='failed' WHERE id=$1`, [order.id]);
      if (['placed','accepted'].includes(order.status)) {
        await client.query(`UPDATE orders SET status='payment_failed' WHERE id=$1`, [order.id]);
        await queueOrderRecipients(client, order.id, 'order.payment_failed', { status: 'payment_failed' }, { customer: true, restaurant: true });
      }
    } else if (event.kind === 'refunded') {
      await client.query(`UPDATE orders SET payment_status='refunded' WHERE id=$1`, [order.id]);
      await client.query(`UPDATE restaurant_settlement_ledger SET status='reversed',updated_at=now() WHERE order_id=$1`, [order.id]);
      await client.query(`UPDATE delivery_fee_accounting SET status='refunded',updated_at=now() WHERE order_id=$1`, [order.id]);
      await client.query(`UPDATE order_tips SET status='refunded',updated_at=now() WHERE order_id=$1`, [order.id]);
      if (order.status === 'delivered') await reverseDeliveredRiderEarnings(client, order);
    }

    return { duplicate: false, transactionId: tx.rows[0].id, orderId: order.id, kind: event.kind, split };
  });
}
