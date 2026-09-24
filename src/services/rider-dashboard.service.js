import { config } from '../config.js';
import { withActorTx, withSystemTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireActiveActor, requireRider } from './authz.service.js';
import { acceptOffer, rejectOffer, setAvailability, heartbeat, listOffers, getWallet } from './rider.service.js';

function profile(row) {
  return { ...row, phone_e164: row.phone, approved: row.is_approved,
    current_latitude: row.latitude, current_longitude: row.longitude };
}

export function registerRider(userId, requestId, input) {
  return withSystemTx(userId, requestId, async client => {
    const actor = await requireActiveActor(client, userId, 'delivery_agent');
    await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [userId]);
    const existing = (await client.query('SELECT * FROM delivery_agents WHERE user_id=$1', [userId])).rows[0];
    if (existing) return { ...profile(existing), registered: false };
    const row = (await client.query(`INSERT INTO delivery_agents(user_id,phone,vehicle_type,is_approved,is_online)
      VALUES($1,$2,$3,false,false) RETURNING *`, [userId,actor.phone,input.vehicleType])).rows[0];
    return { ...profile(row), registered: true, approvalRequired: true };
  });
}

export function getRiderProfile(userId, requestId) {
  return withActorTx(userId, requestId, async client => profile(await requireRider(client, userId)));
}
export async function setRiderAvailability(userId, requestId, input) { return profile(await setAvailability(userId,requestId,input)); }
export async function riderHeartbeat(userId, requestId, input) { return profile(await heartbeat(userId,requestId,input)); }
export async function listRiderOffers(userId, requestId, limit = 50) {
  return (await listOffers(userId, requestId)).slice(0,limit).map(row => ({...row,
    offer_id:row.assignment_id, order_number:row.order_id, order_status:row.status,
    distance_meters:Number(row.distance_km)*1000,
    expires_at:new Date(new Date(row.offered_at).getTime()+config.riderOfferTtlSeconds*1000).toISOString()
  }));
}
export const acceptRiderOffer = acceptOffer;
export const rejectRiderOffer = rejectOffer;

export function getCurrentDelivery(userId, requestId) {
  // Only the assigned rider may access delivery address/contact information.
  return withSystemTx(userId, requestId, async client => {
    const rider = await requireRider(client,userId);
    return (await client.query(`SELECT o.id,o.id AS order_number,o.status,o.delivery_fee_paise,o.tip_paise,
      o.distance_km*1000 AS distance_meters,r.eta_minutes AS estimated_delivery_minutes,
      a.address_text AS delivery_address_text,a.latitude AS delivery_latitude,a.longitude AS delivery_longitude,
      u.full_name AS delivery_recipient_name,u.phone AS delivery_recipient_phone,
      r.shop_name,r.location_text AS restaurant_location,r.latitude AS restaurant_latitude,r.longitude AS restaurant_longitude
      FROM orders o JOIN restaurants r ON r.id=o.restaurant_id JOIN saved_addresses a ON a.id=o.address_id
      JOIN app_users u ON u.id=o.customer_id
      WHERE o.delivery_agent_id=$1 AND o.status IN ('assigned','picked_up') ORDER BY o.assigned_at LIMIT 1`, [rider.id])).rows[0] ?? null;
  });
}

export async function getRiderWalletDashboard(userId, requestId, limit=100) {
  const data = await getWallet(userId,requestId,limit);
  return {
    wallet:{...data.wallet, earned_balance_paise:data.wallet.availableBalancePaise,
      delivery_fee_income_paise:data.wallet.deliveryFeeEarnedPaise,tip_income_paise:data.wallet.tipEarnedPaise,
      pending_balance_paise:null},
    history:data.entries.map(row=>({...row,order_number:row.order_id,
      direction:Number(row.amount_paise)<0?'debit':'credit',amount_paise:Math.abs(Number(row.amount_paise))})),
    payouts:data.entries.filter(row=>row.entry_type==='payout').map(row=>({...row,
      requested_at:row.created_at,amount_paise:Math.abs(Number(row.amount_paise))})),
    capabilities:{pendingBalance:false,bankPayoutInitiation:false}
  };
}

export function getDemandHeatmap(userId, requestId) {
  return withSystemTx(userId,requestId,async client=>{
    await requireRider(client,userId);
    const rows=(await client.query(`SELECT round(r.latitude,2) AS latitude,round(r.longitude,2) AS longitude,
      count(*)::int AS "openOrderCount",min(o.created_at) AS "oldestOrderAt"
      FROM orders o JOIN restaurants r ON r.id=o.restaurant_id
      WHERE o.status IN ('accepted','unassigned') AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      GROUP BY round(r.latitude,2),round(r.longitude,2) ORDER BY count(*) DESC LIMIT 250`)).rows;
    return rows.map(row=>({...row,latitude:Number(row.latitude),longitude:Number(row.longitude)}));
  });
}
