import { config } from '../config.js';
import { withActorTx, withSystemTx } from '../db.js';
import { HttpError } from '../http/errors.js';
import { requireRider } from './authz.service.js';
import { enqueueNotification, queueOrderRecipients } from './notification.service.js';

export async function setAvailability(actorUserId, requestId, { online, latitude, longitude }) {
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    if (online && !rider.is_approved) throw new HttpError(403, 'RIDER_NOT_APPROVED', 'Rider is not approved.');
    if (online && (latitude === undefined || longitude === undefined)) throw new HttpError(422, 'LOCATION_REQUIRED', 'Location is required when going online.');
    const { rows } = await client.query(
      `UPDATE delivery_agents
       SET is_online=$2, latitude=COALESCE($3,latitude), longitude=COALESCE($4,longitude), last_seen_at=now()
       WHERE id=$1
       RETURNING id,user_id,phone::text,vehicle_type,is_online,is_approved,latitude,longitude,last_seen_at`,
      [rider.id, online, latitude ?? null, longitude ?? null]
    );
    return rows[0];
  });
}

export async function heartbeat(actorUserId, requestId, { latitude, longitude }) {
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    const { rows } = await client.query(
      `UPDATE delivery_agents SET latitude=$2,longitude=$3,last_seen_at=now() WHERE id=$1
       RETURNING id,is_online,is_approved,latitude,longitude,last_seen_at`,
      [rider.id, latitude, longitude]
    );
    return rows[0];
  });
}

export async function listOffers(actorUserId, requestId) {
  // Offered orders are intentionally not yet linked through orders.delivery_agent_id,
  // so Phase-1 order RLS cannot expose them directly to a rider. Use the service actor
  // and explicitly constrain every row to the authenticated rider profile.
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    const { rows } = await client.query(
      `SELECT da.id AS assignment_id,da.order_id,da.offered_at,o.restaurant_id,o.delivery_fee_paise,o.tip_paise,o.distance_km,o.status,
              r.shop_name,r.location_text
       FROM delivery_assignments da
       JOIN orders o ON o.id=da.order_id
       JOIN restaurants r ON r.id=o.restaurant_id
       WHERE da.delivery_agent_id=$1 AND da.status='offered'
         AND da.offered_at > now() - ($2::text || ' seconds')::interval
       ORDER BY da.offered_at DESC`, [rider.id, config.riderOfferTtlSeconds]
    );
    return rows;
  });
}

export async function acceptOffer(actorUserId, requestId, assignmentId) {
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    if (!rider.is_online || !rider.is_approved) throw new HttpError(409, 'RIDER_OFFLINE', 'Rider must be online and approved to accept an offer.');

    // Read once to discover order_id, then lock order first and assignment second.
    // This matches restaurant/timeout worker lock ordering and reduces deadlock risk.
    const discovered = (await client.query(`SELECT id,order_id,delivery_agent_id FROM delivery_assignments WHERE id=$1`, [assignmentId])).rows[0];
    if (!discovered || discovered.delivery_agent_id !== rider.id) throw new HttpError(404, 'OFFER_NOT_FOUND', 'Offer not found.');

    const order = (await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [discovered.order_id])).rows[0];
    const offer = (await client.query(`SELECT * FROM delivery_assignments WHERE id=$1 FOR UPDATE`, [assignmentId])).rows[0];
    if (!offer || offer.delivery_agent_id !== rider.id) throw new HttpError(404, 'OFFER_NOT_FOUND', 'Offer not found.');
    if (offer.status !== 'offered') throw new HttpError(409, 'OFFER_CLOSED', `Offer is ${offer.status}.`);
    const ageSeconds = (Date.now() - new Date(offer.offered_at).getTime()) / 1000;
    if (ageSeconds > config.riderOfferTtlSeconds) {
      await client.query(`UPDATE delivery_assignments SET status='expired',responded_at=now() WHERE id=$1`, [assignmentId]);
      throw new HttpError(409, 'OFFER_EXPIRED', 'Offer has expired.');
    }
    if (!order || !['accepted','unassigned'].includes(order.status) || order.delivery_agent_id) throw new HttpError(409, 'ORDER_ALREADY_ASSIGNED', 'Order is no longer available.');

    await client.query(`UPDATE delivery_assignments SET status='accepted',responded_at=now() WHERE id=$1`, [assignmentId]);
    await client.query(`UPDATE delivery_assignments SET status='cancelled',responded_at=COALESCE(responded_at,now()) WHERE order_id=$1 AND id<>$2 AND status='offered'`, [order.id, assignmentId]);
    await client.query(`UPDATE orders SET delivery_agent_id=$2,status='assigned' WHERE id=$1`, [order.id, rider.id]);
    await client.query(
      `INSERT INTO order_events(order_id,actor_user_id,event_type,from_status,to_status,detail)
       VALUES($1,$2,'rider_offer_accepted',$3,'assigned',$4::jsonb)`,
      [order.id, actorUserId, order.status, JSON.stringify({ assignmentId })]
    );
    await queueOrderRecipients(client, order.id, 'order.assigned', { status: 'assigned' }, { customer: true, restaurant: true, rider: true });
    return { assignmentId, orderId: order.id, status: 'assigned' };
  });
}

export async function rejectOffer(actorUserId, requestId, assignmentId, reason) {
  return withSystemTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    const { rows } = await client.query(`SELECT * FROM delivery_assignments WHERE id=$1 FOR UPDATE`, [assignmentId]);
    const offer = rows[0];
    if (!offer || offer.delivery_agent_id !== rider.id) throw new HttpError(404, 'OFFER_NOT_FOUND', 'Offer not found.');
    if (offer.status !== 'offered') throw new HttpError(409, 'OFFER_CLOSED', `Offer is ${offer.status}.`);
    await client.query(`UPDATE delivery_assignments SET status='rejected',responded_at=now(),rejection_reason=$2 WHERE id=$1`, [assignmentId, reason]);
    return { assignmentId, orderId: offer.order_id, status: 'rejected' };
  });
}

export async function getWallet(actorUserId, requestId, limit = 50) {
  return withActorTx(actorUserId, requestId, async client => {
    const rider = await requireRider(client, actorUserId);
    const wallet = (await client.query(`SELECT * FROM wallet_accounts WHERE delivery_agent_id=$1`, [rider.id])).rows[0];
    if (!wallet) throw new HttpError(404, 'WALLET_NOT_FOUND', 'Rider wallet not found.');
    const { rows: entries } = await client.query(
      `SELECT id,order_id,entry_type::text AS entry_type,status::text AS status,amount_paise,reference_key,provider_reference,metadata,created_at
       FROM wallet_ledger WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT $2`, [wallet.id, limit]
    );
    const feeSum = (await client.query(`SELECT COALESCE(sum(gross_fee_paise),0)::bigint AS v FROM delivery_fee_accounting WHERE delivery_agent_id=$1 AND status IN ('earned','paid')`, [rider.id])).rows[0].v;
    const tipSum = (await client.query(`SELECT COALESCE(sum(amount_paise),0)::bigint AS v FROM order_tips WHERE delivery_agent_id=$1 AND status IN ('earned','paid')`, [rider.id])).rows[0].v;
    return {
      wallet: {
        id: wallet.id,
        availableBalancePaise: Number(wallet.available_balance_paise),
        lifetimeEarnedPaise: Number(wallet.lifetime_earned_paise),
        deliveryFeeEarnedPaise: Number(feeSum),
        tipEarnedPaise: Number(tipSum)
      },
      entries
    };
  });
}
