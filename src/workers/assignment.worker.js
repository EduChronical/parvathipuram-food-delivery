import { config } from '../config.js';
import { withSystemTx } from '../db.js';
import { haversineKm } from '../services/pricing.service.js';
import { enqueueNotification } from '../services/notification.service.js';

export async function runAssignmentPass() {
  const requestId = `worker:assignment:${Date.now()}`;
  return withSystemTx(null, requestId, async client => {
    await client.query(
      `UPDATE delivery_assignments SET status='expired',responded_at=COALESCE(responded_at,now())
       WHERE status='offered' AND offered_at <= now() - ($1::text || ' seconds')::interval`,
      [config.riderOfferTtlSeconds]
    );

    const { rows: orders } = await client.query(
      `SELECT o.id,o.status,o.restaurant_id,r.latitude AS restaurant_latitude,r.longitude AS restaurant_longitude
       FROM orders o JOIN restaurants r ON r.id=o.restaurant_id
       WHERE o.status IN ('accepted','unassigned') AND o.delivery_agent_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM delivery_assignments da
           WHERE da.order_id=o.id AND da.status='offered'
             AND da.offered_at > now() - ($1::text || ' seconds')::interval
         )
       ORDER BY COALESCE(o.accepted_at,o.created_at)
       FOR UPDATE OF o SKIP LOCKED LIMIT $2`, [config.riderOfferTtlSeconds, config.workerBatchSize]
    );

    let offered = 0;
    for (const order of orders) {
      if (order.restaurant_latitude === null || order.restaurant_longitude === null) continue;
      const { rows: riders } = await client.query(
        `SELECT d.id,d.user_id,d.latitude,d.longitude
         FROM delivery_agents d
         JOIN app_users u ON u.id=d.user_id AND u.status='active'
         WHERE d.is_online=true AND d.is_approved=true
           AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
           AND d.last_seen_at >= now() - ($2::text || ' seconds')::interval
           AND NOT EXISTS (SELECT 1 FROM orders active WHERE active.delivery_agent_id=d.id AND active.status IN ('assigned','picked_up'))
           AND NOT EXISTS (SELECT 1 FROM delivery_assignments prior WHERE prior.order_id=$1 AND prior.delivery_agent_id=d.id AND prior.status IN ('rejected','expired','cancelled','accepted'))
         LIMIT 100`, [order.id, config.riderOnlineGraceSeconds]
      );
      riders.sort((a,b) =>
        haversineKm(order.restaurant_latitude, order.restaurant_longitude, a.latitude, a.longitude) -
        haversineKm(order.restaurant_latitude, order.restaurant_longitude, b.latitude, b.longitude)
      );
      const rider = riders[0];
      if (!rider) continue;
      const assignment = await client.query(
        `INSERT INTO delivery_assignments(order_id,delivery_agent_id,status) VALUES($1,$2,'offered') RETURNING id,offered_at`, [order.id, rider.id]
      );
      await enqueueNotification(client, {
        userId: rider.user_id,
        orderId: order.id,
        templateKey: 'order.rider_offer',
        payload: { orderId: order.id, assignmentId: assignment.rows[0].id, offeredAt: assignment.rows[0].offered_at }
      });
      offered++;
    }
    return { scanned: orders.length, offered };
  });
}
