import { withActorTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireRestaurantOwner } from './authz.service.js';

export async function getRestaurantDashboard(actorUserId, requestId, restaurantId) {
  return withActorTx(actorUserId, requestId, async client => {
    const restaurant = await requireRestaurantOwner(client, actorUserId, restaurantId);
    const dailySales = (await client.query(`SELECT restaurant_id,sales_date,delivered_orders,food_sales_paise FROM restaurant_daily_sales WHERE restaurant_id=$1 ORDER BY sales_date DESC LIMIT 31`, [restaurantId])).rows;
    const topDishes = (await client.query(`SELECT restaurant_id,name_snapshot,quantity_sold,sales_paise FROM restaurant_top_selling_dishes WHERE restaurant_id=$1 ORDER BY quantity_sold DESC,sales_paise DESC LIMIT 20`, [restaurantId])).rows;
    const counts = (await client.query(`SELECT status::text AS status,count(*)::int AS count FROM orders WHERE restaurant_id=$1 AND created_at>=now()-interval '30 days' GROUP BY status`, [restaurantId])).rows;
    return { restaurant, dailySales, topDishes, orderCounts: Object.fromEntries(counts.map(r=>[r.status,r.count])) };
  });
}

export async function listRestaurantOrders(actorUserId, requestId, restaurantId, { status, limit = 100 } = {}) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    const allowed = ['placed','accepted','assigned','picked_up','delivered','cancelled','rejected','unassigned','payment_failed'];
    if (status && !allowed.includes(status)) throw new HttpError(400,'INVALID_STATUS','Unsupported order status filter.');
    const { rows } = await client.query(
      `SELECT o.*,
        COALESCE(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.name_snapshot,'quantity',oi.quantity,'unitPricePaise',oi.unit_price_paise,'lineTotalPaise',oi.line_total_paise) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL),'[]'::jsonb) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       WHERE o.restaurant_id=$1 AND ($2::text IS NULL OR o.status::text=$2)
       GROUP BY o.id ORDER BY CASE WHEN o.status='placed' THEN 0 ELSE 1 END,o.created_at DESC LIMIT $3`,
      [restaurantId,status ?? null,limit]
    );
    return rows;
  });
}

export async function setRestaurantOpenState(actorUserId, requestId, restaurantId, isOpen) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    return (await client.query(
      `UPDATE restaurants
       SET is_open=$2,owner_locked_fields=COALESCE(owner_locked_fields,'{}'::jsonb)||jsonb_build_object('is_open',true),updated_at=now()
       WHERE id=$1 RETURNING id,shop_name,is_open,is_active,owner_locked_fields`, [restaurantId,isOpen]
    )).rows[0];
  });
}

export async function listOwnerMenu(actorUserId, requestId, restaurantId) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    return (await client.query(`SELECT id,restaurant_id,name,description,price_paise,is_veg,is_available,category,image_url,owner_locked_fields,updated_at FROM menu_items WHERE restaurant_id=$1 ORDER BY category NULLS LAST,name`, [restaurantId])).rows;
  });
}

export async function setMenuAvailability(actorUserId, requestId, restaurantId, menuItemId, isAvailable) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    const updated = (await client.query(
      `UPDATE menu_items SET is_available=$3,owner_locked_fields=COALESCE(owner_locked_fields,'{}'::jsonb)||jsonb_build_object('is_available',true),updated_at=now()
       WHERE id=$2 AND restaurant_id=$1 RETURNING *`, [restaurantId,menuItemId,isAvailable]
    )).rows[0];
    if (!updated) throw new HttpError(404,'MENU_ITEM_NOT_FOUND','Menu item not found.');
    return updated;
  });
}

const editableMenuFields = {
  name: { column: 'name' },
  description: { column: 'description' },
  pricePaise: { column: 'price_paise' },
  isVeg: { column: 'is_veg' },
  category: { column: 'category' },
  imageUrl: { column: 'image_url' }
};

export async function editMenuItem(actorUserId, requestId, restaurantId, menuItemId, patch) {
  const entries = Object.entries(editableMenuFields).filter(([key]) => Object.prototype.hasOwnProperty.call(patch,key));
  if (!entries.length) throw new HttpError(400,'EMPTY_PATCH','At least one editable menu field is required.');
  return withActorTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    const params = [restaurantId,menuItemId];
    const sets = [];
    const lock = {};
    for (const [key,{column}] of entries) {
      params.push(patch[key]);
      sets.push(`${column}=$${params.length}`);
      lock[column] = true;
    }
    params.push(JSON.stringify(lock));
    sets.push(`owner_locked_fields=COALESCE(owner_locked_fields,'{}'::jsonb)||$${params.length}::jsonb`);
    sets.push('updated_at=now()');
    const updated = (await client.query(`UPDATE menu_items SET ${sets.join(',')} WHERE restaurant_id=$1 AND id=$2 RETURNING *`,params)).rows[0];
    if (!updated) throw new HttpError(404,'MENU_ITEM_NOT_FOUND','Menu item not found.');
    return updated;
  });
}

export async function listRestaurantReviews(actorUserId, requestId, restaurantId, limit = 100) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireRestaurantOwner(client, actorUserId, restaurantId);
    return (await client.query(
      `SELECT rv.id,rv.order_id,rv.rating,rv.body,rv.created_at
       FROM reviews rv
       WHERE rv.restaurant_id=$1 ORDER BY rv.created_at DESC LIMIT $2`, [restaurantId,limit]
    )).rows;
  });
}
