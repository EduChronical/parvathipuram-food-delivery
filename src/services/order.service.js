import { withActorTx, withSystemTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireActiveActor, requireRestaurantOwner, requireRider } from './authz.service.js';
import { assertInsideZone, calculateDeliveryFee, haversineKm, loadPricingConfig } from './pricing.service.js';
import { buildZeroCommissionSplit } from '../domain/finance.js';
import { enqueueNotification, queueOrderRecipients } from './notification.service.js';

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new HttpError(400, 'INVALID_ITEMS', 'Order must contain 1-100 items.');
  const seen = new Set();
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'INVALID_ITEMS', `items[${index}] must be an object.`);
    const menuItemId = String(item.menuItemId ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(menuItemId)) throw new HttpError(400, 'INVALID_ITEMS', `items[${index}].menuItemId is invalid.`);
    if (seen.has(menuItemId)) throw new HttpError(400, 'DUPLICATE_MENU_ITEM', 'Duplicate menu item IDs are not allowed.');
    seen.add(menuItemId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new HttpError(400, 'INVALID_ITEMS', `items[${index}].quantity must be 1-100.`);
    return { menuItemId, quantity };
  });
}

async function appendActorEvent(client, { orderId, actorUserId, eventType, fromStatus = null, toStatus = null, detail = {} }) {
  await client.query(
    `INSERT INTO order_events(order_id,actor_user_id,event_type,from_status,to_status,detail)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [orderId, actorUserId, eventType, fromStatus, toStatus, JSON.stringify(detail)]
  );
}

async function cancelAccounting(client, orderId) {
  await client.query(`UPDATE order_tips SET status='cancelled',updated_at=now() WHERE order_id=$1 AND status IN ('pending_assignment','assigned')`, [orderId]);
  await client.query(`UPDATE delivery_fee_accounting SET status='cancelled',updated_at=now() WHERE order_id=$1 AND status IN ('pending_assignment','assigned')`, [orderId]);
  await client.query(`UPDATE restaurant_settlement_ledger SET status='reversed',updated_at=now() WHERE order_id=$1 AND status='pending'`, [orderId]);
}

// Used by both checkout quotes and placement; all prices come from the database.
export async function priceOrder(client, actorUserId, input) {
  const items = normalizeItems(input.items);
  const tipPaise = input.tipPaise ?? 0;
  if (!Number.isSafeInteger(tipPaise) || tipPaise < 0 || tipPaise > 1_000_000) throw new HttpError(400, 'INVALID_TIP', 'tipPaise must be a non-negative integer.');
    const restaurantResult = await client.query(
      `SELECT id,owner_user_id,shop_name,is_active,is_open,latitude,longitude FROM restaurants WHERE id=$1 FOR SHARE`, [input.restaurantId]
    );
    const restaurant = restaurantResult.rows[0];
    if (!restaurant || !restaurant.is_active) throw new HttpError(404, 'RESTAURANT_NOT_FOUND', 'Active restaurant not found.');
    if (!restaurant.is_open) throw new HttpError(409, 'RESTAURANT_CLOSED', 'Restaurant is currently closed.');

    const addressResult = await client.query(
      `SELECT id,customer_id,latitude,longitude FROM saved_addresses WHERE id=$1 FOR SHARE`, [input.addressId]
    );
    const address = addressResult.rows[0];
    if (!address || address.customer_id !== actorUserId) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Saved address not found.');

    const ids = items.map(i => i.menuItemId);
    const menuResult = await client.query(
      `SELECT id,restaurant_id,name,price_paise,is_available FROM menu_items WHERE id=ANY($1::uuid[]) FOR SHARE`, [ids]
    );
    if (menuResult.rows.length !== ids.length) throw new HttpError(422, 'MENU_ITEM_NOT_FOUND', 'One or more menu items do not exist.');
    const menuMap = new Map(menuResult.rows.map(row => [row.id, row]));
    let foodTotalPaise = 0;
    const snapshots = items.map(item => {
      const menu = menuMap.get(item.menuItemId);
      if (menu.restaurant_id !== restaurant.id) throw new HttpError(422, 'MENU_RESTAURANT_MISMATCH', 'All items must belong to the selected restaurant.');
      if (!menu.is_available) throw new HttpError(409, 'ITEM_UNAVAILABLE', `${menu.name} is currently unavailable.`);
      const line = Number(menu.price_paise) * item.quantity;
      if (!Number.isSafeInteger(line)) throw new HttpError(422, 'ORDER_TOO_LARGE', 'Order value is too large.');
      foodTotalPaise += line;
      return { ...item, name: menu.name, unitPricePaise: Number(menu.price_paise) };
    });
    if (!Number.isSafeInteger(foodTotalPaise)) throw new HttpError(422, 'ORDER_TOO_LARGE', 'Order value is too large.');

    const pricing = await loadPricingConfig(client);
    if (restaurant.latitude === null || restaurant.longitude === null || address.latitude === null || address.longitude === null) {
      throw new HttpError(422, 'LOCATION_REQUIRED', 'Restaurant and delivery address require coordinates.');
    }
    assertInsideZone(address.latitude, address.longitude, pricing);
    assertInsideZone(restaurant.latitude, restaurant.longitude, pricing);
    const distanceKm = haversineKm(restaurant.latitude, restaurant.longitude, address.latitude, address.longitude);
    const deliveryFeePaise = calculateDeliveryFee(distanceKm, pricing.ratePerKmPaise, pricing.minimumFeePaise);
    const totalPaise = foodTotalPaise + deliveryFeePaise + tipPaise;
    if (!Number.isSafeInteger(totalPaise)) throw new HttpError(422, 'ORDER_TOO_LARGE', 'Order value is too large.');
    return { restaurant, address, snapshots, foodTotalPaise, subtotalPaise: foodTotalPaise, deliveryFeePaise, tipPaise, totalPaise, distanceKm };
}

export async function quoteOrder(actorUserId, requestId, input) {
  return withSystemTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const { subtotalPaise, deliveryFeePaise, tipPaise, totalPaise, distanceKm } = await priceOrder(client, actorUserId, input);
    return { subtotalPaise, deliveryFeePaise, tipPaise, totalPaise, distanceKm, platformFeePaise: 0, paymentMethods: ['cod'] };
  });
}

export async function createOrder(actorUserId, requestId, input) {
  const paymentMethod = input.paymentMethod ?? 'cod';
  // A webhook verifier is not a payment initiation adapter. Enable other methods
  // only when actual provider checkout and verified reconciliation are implemented.
  if (paymentMethod !== 'cod') throw new HttpError(422, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payments are unavailable. Choose cash on delivery.');
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'idempotencyKey length must be 8-200.');
  return withSystemTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const existing = await client.query(`SELECT * FROM orders WHERE customer_id=$1 AND idempotency_key=$2`, [actorUserId, input.idempotencyKey]);
    if (existing.rows[0]) return { order: existing.rows[0], idempotentReplay: true, split: buildZeroCommissionSplit(existing.rows[0]) };
    const { restaurant, address, snapshots, foodTotalPaise, deliveryFeePaise, tipPaise, distanceKm } = await priceOrder(client, actorUserId, input);
    const paymentStatus = 'cod_due';

    const inserted = await client.query(
      `INSERT INTO orders(customer_id,restaurant_id,address_id,status,payment_status,payment_method,food_total_paise,delivery_fee_paise,tip_paise,platform_fee_paise,distance_km,customer_note,idempotency_key)
       VALUES($1,$2,$3,'placed',$4,$5,$6,$7,$8,0,$9,$10,$11)
       ON CONFLICT (customer_id,idempotency_key) DO NOTHING
       RETURNING *`,
      [actorUserId, restaurant.id, address.id, paymentStatus, paymentMethod, foodTotalPaise, deliveryFeePaise, tipPaise, Number(distanceKm.toFixed(3)), input.customerNote ?? null, input.idempotencyKey]
    );
    if (!inserted.rows[0]) {
      const replay = (await client.query(`SELECT * FROM orders WHERE customer_id=$1 AND idempotency_key=$2`, [actorUserId, input.idempotencyKey])).rows[0];
      return { order: replay, idempotentReplay: true, split: buildZeroCommissionSplit(replay) };
    }
    const order = inserted.rows[0];
    for (const item of snapshots) {
      await client.query(
        `INSERT INTO order_items(order_id,menu_item_id,name_snapshot,unit_price_paise,quantity)
         VALUES($1,$2,$3,$4,$5)`, [order.id, item.menuItemId, item.name, item.unitPricePaise, item.quantity]
      );
    }
    await client.query(`SELECT validate_order_financials($1)`, [order.id]);
    await appendActorEvent(client, { orderId: order.id, actorUserId, eventType: 'customer_order_placed', toStatus: 'placed' });
    await enqueueNotification(client, { userId: actorUserId, orderId: order.id, templateKey: 'order.placed', payload: { orderId: order.id, status: 'placed' } });
    await enqueueNotification(client, { userId: restaurant.owner_user_id, orderId: order.id, templateKey: 'order.new_restaurant', payload: { orderId: order.id, status: 'placed' } });
    return { order, idempotentReplay: false, split: buildZeroCommissionSplit(order) };
  });
}

export async function getOrder(actorUserId, requestId, orderId) {
  return withActorTx(actorUserId, requestId, async client => {
    const actor = await requireActiveActor(client, actorUserId);
    const { rows } = await client.query(
      `SELECT o.*,
        COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,'unitPricePaise',i.unit_price_paise,'quantity',i.quantity,'lineTotalPaise',i.line_total_paise) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
       FROM orders o LEFT JOIN order_items i ON i.order_id=o.id WHERE o.id=$1
       AND ($3 IN ('admin','super_admin') OR ($3='customer' AND o.customer_id=$2)
         OR ($3='restaurant_owner' AND EXISTS (SELECT 1 FROM restaurants r WHERE r.id=o.restaurant_id AND r.owner_user_id=$2))
         OR ($3='delivery_agent' AND EXISTS (SELECT 1 FROM delivery_agents d WHERE d.id=o.delivery_agent_id AND d.user_id=$2)))
       GROUP BY o.id`, [orderId, actorUserId, actor.role]
    );
    if (!rows[0]) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    return rows[0];
  });
}

export async function cancelOrder(actorUserId, requestId, orderId, reasonCode, reasonText) {
  return withSystemTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId, 'customer');
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order || order.customer_id !== actorUserId) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (order.status !== 'placed') throw new HttpError(409, 'CANCELLATION_WINDOW_CLOSED', 'Cancellation is allowed only before restaurant acceptance.');
    await client.query(
      `INSERT INTO order_cancellations(order_id,cancelled_by_user_id,reason_code,reason_text,status_before)
       VALUES($1,$2,$3,$4,'placed')`, [orderId, actorUserId, reasonCode, reasonText]
    );
    await client.query(`UPDATE orders SET status='cancelled' WHERE id=$1`, [orderId]);
    await cancelAccounting(client, orderId);
    await appendActorEvent(client, { orderId, actorUserId, eventType: 'customer_cancelled', fromStatus: 'placed', toStatus: 'cancelled', detail: { reasonCode, reasonText } });
    await queueOrderRecipients(client, orderId, 'order.cancelled', { status: 'cancelled', reason: reasonText }, { customer: true, restaurant: true });
    return { orderId, status: 'cancelled' };
  });
}

export async function acceptRestaurantOrder(actorUserId, requestId, restaurantId, orderId) {
  return withSystemTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`, [orderId, restaurantId]);
    const order = rows[0];
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (order.status !== 'placed') throw new HttpError(409, 'INVALID_ORDER_STATE', `Cannot accept order from ${order.status}.`);
    await client.query(`SELECT validate_order_financials($1)`, [orderId]);
    await client.query(`UPDATE orders SET status='accepted' WHERE id=$1`, [orderId]);
    await appendActorEvent(client, { orderId, actorUserId, eventType: 'restaurant_accepted', fromStatus: 'placed', toStatus: 'accepted' });
    await queueOrderRecipients(client, orderId, 'order.accepted', { status: 'accepted' }, { customer: true, restaurant: false });
    return { orderId, status: 'accepted' };
  });
}

export async function rejectRestaurantOrder(actorUserId, requestId, restaurantId, orderId, reasonCode, reasonText) {
  return withSystemTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`, [orderId, restaurantId]);
    const order = rows[0];
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (!['placed','accepted'].includes(order.status)) throw new HttpError(409, 'INVALID_ORDER_STATE', `Cannot reject order from ${order.status}.`);
    await client.query(
      `INSERT INTO order_rejections(order_id,restaurant_id,rejected_by_user_id,reason_code,reason_text)
       VALUES($1,$2,$3,$4,$5)`, [orderId, restaurantId, actorUserId, reasonCode, reasonText]
    );
    await client.query(`UPDATE orders SET status='rejected' WHERE id=$1`, [orderId]);
    await client.query(`UPDATE delivery_assignments SET status='cancelled',responded_at=COALESCE(responded_at,now()) WHERE order_id=$1 AND status='offered'`, [orderId]);
    await cancelAccounting(client, orderId);
    await appendActorEvent(client, { orderId, actorUserId, eventType: 'restaurant_rejected', fromStatus: order.status, toStatus: 'rejected', detail: { reasonCode, reasonText } });
    await queueOrderRecipients(client, orderId, 'order.rejected', { status: 'rejected', reason: reasonText }, { customer: true, restaurant: false });
    return { orderId, status: 'rejected' };
  });
}

export async function markPickedUp(actorUserId, requestId, orderId) {
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order || order.delivery_agent_id !== rider.id) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Assigned order not found.');
    if (order.status !== 'assigned') throw new HttpError(409, 'INVALID_ORDER_STATE', `Cannot pick up order from ${order.status}.`);
    await client.query(`UPDATE orders SET status='picked_up' WHERE id=$1`, [orderId]);
    await appendActorEvent(client, { orderId, actorUserId, eventType: 'rider_picked_up', fromStatus: 'assigned', toStatus: 'picked_up' });
    await queueOrderRecipients(client, orderId, 'order.picked_up', { status: 'picked_up' }, { customer: true, restaurant: true });
    return { orderId, status: 'picked_up' };
  });
}

export async function markDelivered(actorUserId, requestId, orderId) {
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order || order.delivery_agent_id !== rider.id) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Assigned order not found.');
    if (order.status !== 'picked_up') throw new HttpError(409, 'INVALID_ORDER_STATE', `Cannot deliver order from ${order.status}.`);
    if (order.payment_method !== 'cod' && order.payment_status !== 'paid') throw new HttpError(409, 'PAYMENT_NOT_SETTLED', 'Online payment must be paid before delivery completion.');
    if (order.payment_method === 'cod') {
      await client.query(`UPDATE orders SET status='delivered',payment_status='paid' WHERE id=$1`, [orderId]);
      await client.query(
        `INSERT INTO payment_transactions(order_id,transaction_type,amount_paise,status,provider,provider_reference,raw_meta)
         VALUES($1,'charge',$2,'paid','cod',NULL,$3::jsonb)`, [orderId, Number(order.total_paise), JSON.stringify({ collectedByDeliveryAgentId: rider.id })]
      );
    } else {
      await client.query(`UPDATE orders SET status='delivered' WHERE id=$1`, [orderId]);
    }
    await client.query(`SELECT validate_order_financials($1)`, [orderId]);
    await appendActorEvent(client, { orderId, actorUserId, eventType: 'rider_delivered', fromStatus: 'picked_up', toStatus: 'delivered' });
    await queueOrderRecipients(client, orderId, 'order.delivered', { status: 'delivered' }, { customer: true, restaurant: true, rider: true });
    const refreshed = (await client.query(`SELECT * FROM orders WHERE id=$1`, [orderId])).rows[0];
    return { order: refreshed, split: buildZeroCommissionSplit(refreshed) };
  });
}
