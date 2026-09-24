import { config } from '../config.js';
import { withSystemTx, withWorkerTx } from '../db.js';
import { SmsProvider } from '../providers/sms.provider.js';
import { renderSms } from '../services/notification.service.js';

const sms = new SmsProvider();

async function claimNotifications() {
  return withWorkerTx(`worker:notify:claim:${Date.now()}`, async client => {
    const { rows } = await client.query(
      `WITH candidates AS (
         SELECT n.id
         FROM notifications n
         WHERE (
           (n.status IN ('queued','failed') AND COALESCE(n.next_attempt_at,n.created_at) <= now())
           OR (n.status='sending' AND n.next_attempt_at <= now())
         )
           AND n.attempt_count < $1
         ORDER BY n.created_at
         FOR UPDATE SKIP LOCKED LIMIT $2
       )
       UPDATE notifications n
       SET status='sending',attempt_count=n.attempt_count+1,
           next_attempt_at=now()+($3::text || ' seconds')::interval,error_message=NULL
       FROM candidates c WHERE n.id=c.id
       RETURNING n.*`, [config.notificationMaxAttempts, config.workerBatchSize, config.notificationLeaseSeconds]
    );
    return rows;
  });
}

async function finalizeSuccess(notification, providerReference) {
  return withWorkerTx(`worker:notify:success:${notification.id}`, client => client.query(
    `UPDATE notifications SET status='sent',provider_reference=$2,sent_at=now(),next_attempt_at=NULL,error_message=NULL WHERE id=$1`,
    [notification.id, providerReference ?? null]
  ));
}

async function finalizeFailure(notification, error) {
  const backoffSeconds = Math.min(3600, 2 ** Math.min(notification.attempt_count, 10) * 5);
  return withWorkerTx(`worker:notify:failure:${notification.id}`, client => client.query(
    `UPDATE notifications
     SET status=CASE WHEN attempt_count >= $2 THEN 'failed' ELSE 'failed' END,
         error_message=$3,next_attempt_at=now()+($4::text || ' seconds')::interval
     WHERE id=$1`, [notification.id, config.notificationMaxAttempts, String(error?.message ?? error).slice(0, 2000), backoffSeconds]
  ));
}

export async function runNotificationPass() {
  const notifications = await claimNotifications();
  for (const notification of notifications) {
    try {
      if (notification.channel === 'in_app') {
        await finalizeSuccess(notification, null);
        continue;
      }
      const recipient = await withSystemTx(null, `worker:notify:recipient:${notification.id}`, async client => {
        const result = await client.query(`SELECT phone::text AS phone FROM app_users WHERE id=$1 AND status='active'`, [notification.user_id]);
        return result.rows[0];
      });
      if (!recipient?.phone) throw new Error('SMS recipient phone unavailable to worker role');
      const result = await sms.send({
        to: recipient.phone,
        text: renderSms(notification.template_key, notification.payload ?? {}),
        templateKey: notification.template_key,
        metadata: { notificationId: notification.id, idempotencyKey: `notification:${notification.id}` }
      });
      await finalizeSuccess(notification, result.providerReference);
    } catch (error) {
      await finalizeFailure(notification, error);
    }
  }
  return { processed: notifications.length };
}
