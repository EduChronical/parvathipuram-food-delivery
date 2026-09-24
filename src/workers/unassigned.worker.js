import { config } from '../config.js';
import { withSystemTx } from '../db.js';
import { queueOrderRecipients } from '../services/notification.service.js';

export async function runUnassignedTimeoutPass() {
  const requestId = `worker:unassigned:${Date.now()}`;
  return withSystemTx(null, requestId, async client => {
    const timeoutRow = (await client.query(`SELECT value FROM app_config WHERE key='unassigned_timeout_seconds'`)).rows[0];
    const timeoutSeconds = Number(timeoutRow?.value ?? 180);
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) throw new Error('Invalid unassigned_timeout_seconds configuration');

    const { rows: orders } = await client.query(
      `SELECT id FROM orders
       WHERE status='accepted' AND delivery_agent_id IS NULL
         AND accepted_at IS NOT NULL
         AND accepted_at <= now() - ($1::text || ' seconds')::interval
       ORDER BY accepted_at
       FOR UPDATE SKIP LOCKED LIMIT $2`, [timeoutSeconds, config.workerBatchSize]
    );
    let transitioned = 0;
    for (const row of orders) {
      const available = Number((await client.query(
        `SELECT count(*)::int AS c FROM delivery_agents d JOIN app_users u ON u.id=d.user_id
         WHERE d.is_online=true AND d.is_approved=true AND u.status='active'
           AND d.last_seen_at >= now() - ($1::text || ' seconds')::interval`, [config.riderOnlineGraceSeconds]
      )).rows[0].c);
      await client.query(`UPDATE orders SET status='unassigned' WHERE id=$1`, [row.id]);
      await client.query(
        `INSERT INTO unassigned_order_logs(order_id,reason_code,reason_text,timeout_seconds,available_agents)
         VALUES($1,'rider_acceptance_timeout','No rider accepted before the configured timeout',$2,$3)`,
        [row.id, timeoutSeconds, available]
      );
      await client.query(`UPDATE delivery_assignments SET status='expired',responded_at=COALESCE(responded_at,now()) WHERE order_id=$1 AND status='offered'`, [row.id]);
      await queueOrderRecipients(client, row.id, 'order.unassigned', { status: 'unassigned', timeoutSeconds }, { customer: true, restaurant: true });
      await queueOrderRecipients(client, row.id, 'admin.order_unassigned', { status: 'unassigned', timeoutSeconds, availableAgents: available }, { customer: false, restaurant: false, admins: true });
      transitioned++;
    }
    return { transitioned };
  });
}
