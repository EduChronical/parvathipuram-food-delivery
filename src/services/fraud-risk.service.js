import { HttpError } from '../http/errors.js';
import { withPhase4ActorTx } from './phase4-db.service.js';

const BULK_VALUE_PAISE = Number(process.env.FRAUD_BULK_VALUE_PAISE || 500000);
const BULK_ITEM_QTY = Number(process.env.FRAUD_BULK_ITEM_QTY || 25);

async function insertFlag(client, { orderId, customerId, ruleKey, score, detail }) {
  const existing = (await client.query(
    `SELECT id FROM public.fraud_flags
      WHERE order_id IS NOT DISTINCT FROM $1 AND customer_id IS NOT DISTINCT FROM $2
        AND rule_key=$3 AND is_reviewed=false LIMIT 1`,
    [orderId ?? null,customerId ?? null,ruleKey]
  )).rows[0];
  if (existing) return null;
  return (await client.query(
    `INSERT INTO public.fraud_flags(order_id,customer_id,rule_key,score,detail)
     VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [orderId ?? null,customerId ?? null,ruleKey,score,JSON.stringify(detail || {})]
  )).rows[0];
}

export async function evaluateOrderFraud(client, orderId) {
  // Serialize repeated scans so a concurrent request cannot create duplicate flags.
  await client.query('SELECT id FROM public.orders WHERE id=$1 FOR UPDATE', [orderId]);
  const order = (await client.query(
    `SELECT o.id,o.customer_id,o.total_paise AS grand_total_paise,o.created_at,o.payment_status::text AS payment_status,
            COALESCE(sum(oi.quantity),0)::int AS total_item_qty
       FROM public.orders o
       LEFT JOIN public.order_items oi ON oi.order_id=o.id
      WHERE o.id=$1 GROUP BY o.id`,
    [orderId]
  )).rows[0];
  if (!order) throw new HttpError(404,'ORDER_NOT_FOUND','Order not found.');

  const velocity = (await client.query(
    `SELECT count(*)::int AS count,COALESCE(sum(total_paise),0)::bigint AS value_paise
       FROM public.orders
      WHERE customer_id=$1 AND created_at>=now()-interval '30 minutes'`,
    [order.customer_id]
  )).rows[0];
  const cancellations = (await client.query(
    `SELECT count(*)::int AS count
       FROM public.order_cancellations c JOIN public.orders o ON o.id=c.order_id
      WHERE o.customer_id=$1 AND c.created_at>=now()-interval '24 hours'`,
    [order.customer_id]
  )).rows[0].count;
  const paymentFails = (await client.query(
    `SELECT count(*)::int AS count
       FROM public.payment_transactions p JOIN public.orders o ON o.id=p.order_id
      WHERE o.customer_id=$1 AND p.status='failed' AND p.created_at>=now()-interval '6 hours'`,
    [order.customer_id]
  )).rows[0].count;

  const created = [];
  if (Number(order.grand_total_paise) >= BULK_VALUE_PAISE) created.push(await insertFlag(client,{orderId,customerId:order.customer_id,ruleKey:'bulk_high_value',score:350,detail:{grandTotalPaise:Number(order.grand_total_paise),thresholdPaise:BULK_VALUE_PAISE}}));
  if (Number(order.total_item_qty) >= BULK_ITEM_QTY) created.push(await insertFlag(client,{orderId,customerId:order.customer_id,ruleKey:'bulk_item_quantity',score:300,detail:{itemQuantity:Number(order.total_item_qty),threshold:BULK_ITEM_QTY}}));
  if (Number(velocity.count) >= 4) created.push(await insertFlag(client,{orderId,customerId:order.customer_id,ruleKey:'order_velocity_30m',score:Math.min(600,250+Number(velocity.count)*50),detail:{orderCount:Number(velocity.count),valuePaise:Number(velocity.value_paise)}}));
  if (Number(cancellations) >= 3) created.push(await insertFlag(client,{orderId,customerId:order.customer_id,ruleKey:'cancellation_velocity_24h',score:300,detail:{cancellationCount:Number(cancellations)}}));
  if (Number(paymentFails) >= 3) created.push(await insertFlag(client,{orderId,customerId:order.customer_id,ruleKey:'payment_failures_6h',score:400,detail:{failedAttempts:Number(paymentFails)}}));
  return created.filter(Boolean);
}

export async function scanOrderFraud(actorUserId, requestId, orderId) {
  return withPhase4ActorTx(actorUserId,'super_admin',requestId,client => evaluateOrderFraud(client,orderId));
}

export async function listFraudFlags(actorUserId, requestId, { unresolvedOnly = true, limit = 100 } = {}) {
  return withPhase4ActorTx(actorUserId,'super_admin',requestId,async client => {
    const { rows } = await client.query(
      `SELECT f.id,f.order_id,f.customer_id,f.rule_key,f.score,f.detail,f.is_reviewed AS resolved,f.reviewed_at AS resolved_at,f.created_at,o.id AS order_number
         FROM public.fraud_flags f LEFT JOIN public.orders o ON o.id=f.order_id
        WHERE ($1::boolean=false OR f.is_reviewed=false)
        ORDER BY f.is_reviewed ASC,f.score DESC,f.created_at DESC LIMIT $2`,
      [unresolvedOnly,limit]
    );
    return rows;
  });
}

export async function resolveFraudFlag(actorUserId, requestId, flagId) {
  return withPhase4ActorTx(actorUserId,'super_admin',requestId,async client => {
    const row = (await client.query(
      `UPDATE public.fraud_flags SET is_reviewed=true,reviewed_by=$2,reviewed_at=now()
        WHERE id=$1 RETURNING *`,
      [flagId,actorUserId]
    )).rows[0];
    if (!row) throw new HttpError(404,'FRAUD_FLAG_NOT_FOUND','Fraud flag not found.');
    return row;
  });
}
