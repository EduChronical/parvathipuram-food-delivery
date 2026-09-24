import { withActorTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireActiveActor } from './authz.service.js';

function asInt(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new HttpError(400, 'INVALID_FILTER', 'Invalid numeric catalog filter.');
  return n;
}

export async function listCatalogRestaurants(actorUserId, requestId, query = {}) {
  const diet = query.diet || 'all';
  if (!['all','veg','nonveg'].includes(diet)) throw new HttpError(400, 'INVALID_FILTER', 'diet must be all, veg, or nonveg.');
  const minPricePaise = asInt(query.minPricePaise, null, 0, 10_000_000);
  const maxPricePaise = asInt(query.maxPricePaise, null, 0, 10_000_000);
  if (minPricePaise !== null && maxPricePaise !== null && minPricePaise > maxPricePaise) throw new HttpError(400, 'INVALID_FILTER', 'minPricePaise cannot exceed maxPricePaise.');
  const openNowOnly = String(query.openNow ?? 'false') === 'true';
  const limit = asInt(query.limit, 100, 1, 200);
  const offset = asInt(query.offset, 0, 0, 10_000);

  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId);
    const { rows } = await client.query(
      `WITH candidate AS (
         SELECT r.*,
                EXISTS(SELECT 1 FROM menu_items mi WHERE mi.restaurant_id=r.id AND mi.is_available AND mi.is_veg) AS has_veg,
                EXISTS(SELECT 1 FROM menu_items mi WHERE mi.restaurant_id=r.id AND mi.is_available AND NOT mi.is_veg) AS has_nonveg,
                COALESCE((
                  SELECT CASE
                    WHEN rh.is_closed THEN false
                    WHEN rh.opens_at IS NULL OR rh.closes_at IS NULL THEN r.is_open
                    WHEN rh.closes_at >= rh.opens_at THEN (now() AT TIME ZONE 'Asia/Kolkata')::time >= rh.opens_at AND (now() AT TIME ZONE 'Asia/Kolkata')::time < rh.closes_at
                    ELSE (now() AT TIME ZONE 'Asia/Kolkata')::time >= rh.opens_at OR (now() AT TIME ZONE 'Asia/Kolkata')::time < rh.closes_at
                  END
                  FROM restaurant_hours rh
                  WHERE rh.restaurant_id=r.id AND rh.weekday=EXTRACT(DOW FROM now() AT TIME ZONE 'Asia/Kolkata')::int
                  LIMIT 1
                ), r.is_open) AND r.is_open AS open_now,
                (SELECT rm.url FROM restaurant_media rm WHERE rm.restaurant_id=r.id AND rm.media_type='cover' ORDER BY rm.sort_order,rm.created_at LIMIT 1) AS cover_url
         FROM restaurants r
         WHERE r.is_active
       )
       SELECT id,shop_name,location_text,mandal,category,is_street_food,is_open,avg_rating,rating_count,eta_minutes,has_veg,has_nonveg,open_now,cover_url
       FROM candidate c
       WHERE ($1='all' OR ($1='veg' AND c.has_veg) OR ($1='nonveg' AND c.has_nonveg))
         AND (NOT $2::boolean OR c.open_now)
         AND EXISTS (
           SELECT 1 FROM menu_items mi
           WHERE mi.restaurant_id=c.id AND mi.is_available
             AND ($3::int IS NULL OR mi.price_paise >= $3)
             AND ($4::int IS NULL OR mi.price_paise <= $4)
         )
       ORDER BY c.open_now DESC,c.avg_rating DESC,c.shop_name
       LIMIT $5 OFFSET $6`,
      [diet, openNowOnly, minPricePaise, maxPricePaise, limit, offset]
    );
    return rows;
  });
}

export async function listCatalogMenu(actorUserId, requestId, restaurantId) {
  return withActorTx(actorUserId, requestId, async client => {
    await requireActiveActor(client, actorUserId);
    const restaurant = (await client.query(`SELECT id,shop_name,is_active,is_open FROM restaurants WHERE id=$1`, [restaurantId])).rows[0];
    if (!restaurant || !restaurant.is_active) throw new HttpError(404, 'RESTAURANT_NOT_FOUND', 'Active restaurant not found.');
    const { rows } = await client.query(
      `SELECT id,restaurant_id,name,description,price_paise,is_veg,is_available,category,image_url
       FROM menu_items WHERE restaurant_id=$1 ORDER BY category NULLS LAST,name`, [restaurantId]
    );
    return rows;
  });
}
