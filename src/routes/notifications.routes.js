import { withActorTx } from '../db.js';
import { requireActiveActor } from '../services/authz.service.js';

export function registerNotificationRoutes(router) {
  router.add('GET', '/v1/notifications', { auth: 'jwt' }, async ({ actor, query, requestId }) => {
    const limit = Math.max(1, Math.min(200, Number(query.limit ?? 50) || 50));
    return withActorTx(actor.userId, requestId, async client => {
      await requireActiveActor(client, actor.userId);
      const { rows } = await client.query(
        `SELECT id,order_id,channel::text AS channel,template_key,payload,status::text AS status,provider_reference,error_message,attempt_count,created_at,sent_at
         FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [actor.userId, limit]
      );
      return rows;
    });
  });
}
