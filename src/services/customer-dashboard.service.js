import crypto from 'node:crypto';
import { withActorTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireActiveActor } from './authz.service.js';
import { createOrder } from './order.service.js';

export async function listCustomerOrders(actorUserId, requestId, limit = 50) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const { rows } = await client.query(
      `SELECT o.*,r.shop_name AS restaurant_name,(rv.id IS NOT NULL) AS has_review,
        COALESCE(jsonb_agg(jsonb_build_object('id',oi.id,'menuItemId',oi.menu_item_id,'name',oi.name_snapshot,'unitPricePaise',oi.unit_price_paise,'quantity',oi.quantity,'lineTotalPaise',oi.line_total_paise) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL),'[]'::jsonb) AS items
       FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id
       LEFT JOIN order_items oi ON oi.order_id=o.id
       LEFT JOIN reviews rv ON rv.order_id=o.id
       WHERE o.customer_id=$1 GROUP BY o.id,r.shop_name,rv.id ORDER BY o.created_at DESC LIMIT $2`, [actorUserId,limit]
    );
    return rows;
  });
}

export async function reorderCustomerOrder(actorUserId, requestId, sourceOrderId, input = {}) {
  const seed = await withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const order = (await client.query(`SELECT id,restaurant_id,address_id,tip_paise FROM orders WHERE id=$1 AND customer_id=$2`, [sourceOrderId,actorUserId])).rows[0];
    if (!order) throw new HttpError(404,'ORDER_NOT_FOUND','Source order not found.');
    const items = (await client.query(`SELECT menu_item_id,quantity FROM order_items WHERE order_id=$1 ORDER BY created_at`, [sourceOrderId])).rows;
    if (!items.length || items.some(i => !i.menu_item_id)) throw new HttpError(409,'REORDER_ITEM_UNAVAILABLE','One or more old order items are no longer linked to a current menu item.');
    let addressId = input.addressId || order.address_id;
    const address = (await client.query(`SELECT id FROM saved_addresses WHERE id=$1 AND customer_id=$2`, [addressId,actorUserId])).rows[0];
    if (!address) {
      const fallback = (await client.query(`SELECT id FROM saved_addresses WHERE customer_id=$1 ORDER BY is_default DESC,created_at DESC LIMIT 1`, [actorUserId])).rows[0];
      if (!fallback) throw new HttpError(409,'ADDRESS_REQUIRED','A saved delivery address is required for reorder.');
      addressId = fallback.id;
    }
    return { restaurantId: order.restaurant_id,addressId,items:items.map(i=>({menuItemId:i.menu_item_id,quantity:i.quantity})),tipPaise:input.tipPaise ?? Number(order.tip_paise) };
  });
  return createOrder(actorUserId, requestId, {
    ...seed,
    paymentMethod: input.paymentMethod || 'cod',
    idempotencyKey: input.idempotencyKey || crypto.randomUUID(),
    customerNote: input.customerNote
  });
}

export async function submitReview(actorUserId, requestId, orderId, input) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const order = (await client.query(`SELECT id,restaurant_id,status FROM orders WHERE id=$1 AND customer_id=$2`, [orderId,actorUserId])).rows[0];
    if (!order) throw new HttpError(404,'ORDER_NOT_FOUND','Order not found.');
    if (order.status !== 'delivered') throw new HttpError(409,'REVIEW_NOT_ALLOWED','Review is allowed only after delivery.');
    try {
      return (await client.query(
        `INSERT INTO reviews(order_id,customer_id,restaurant_id,rating,body) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [orderId,actorUserId,order.restaurant_id,input.rating,input.body ?? null]
      )).rows[0];
    } catch (error) {
      if (error.code === '23505') throw new HttpError(409,'REVIEW_ALREADY_EXISTS','A review already exists for this order.');
      throw error;
    }
  });
}
