import { HttpError } from '../http/errors.js';

export async function requireActiveActor(client, actorUserId, expectedRole = undefined) {
  const { rows } = await client.query(`SELECT id, role::text AS role, status::text AS status, full_name, phone::text AS phone FROM app_users WHERE id=$1`, [actorUserId]);
  const actor = rows[0];
  if (!actor || actor.status !== 'active') throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Active account required.');
  if (expectedRole && actor.role !== expectedRole) throw new HttpError(403, 'ROLE_REQUIRED', `${expectedRole} role required.`);
  return actor;
}

export async function requireRestaurantOwner(client, actorUserId, restaurantId) {
  await requireActiveActor(client, actorUserId, 'restaurant_owner');
  const { rows } = await client.query(`SELECT id, owner_user_id, shop_name, is_active, is_open FROM restaurants WHERE id=$1`, [restaurantId]);
  const restaurant = rows[0];
  if (!restaurant || restaurant.owner_user_id !== actorUserId) throw new HttpError(403, 'NOT_RESTAURANT_OWNER', 'Restaurant ownership required.');
  return restaurant;
}

export async function requireRider(client, actorUserId) {
  await requireActiveActor(client, actorUserId, 'delivery_agent');
  const { rows } = await client.query(`SELECT d.* FROM delivery_agents d WHERE d.user_id=$1`, [actorUserId]);
  const rider = rows[0];
  if (!rider) throw new HttpError(403, 'RIDER_PROFILE_REQUIRED', 'Delivery-agent profile required.');
  return rider;
}
