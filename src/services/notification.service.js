import { HttpError } from '../http/errors.js';

const te = {
  'order.placed': p => `మీ ఆర్డర్ ${p.orderId} నమోదైంది. రెస్టారెంట్ అంగీకారం కోసం వేచి ఉంది.`,
  'order.new_restaurant': p => `కొత్త ఆర్డర్ ${p.orderId} వచ్చింది. దయచేసి అంగీకరించండి లేదా కారణంతో తిరస్కరించండి.`,
  'order.accepted': p => `మీ ఆర్డర్ ${p.orderId} రెస్టారెంట్ అంగీకరించింది.`,
  'order.rejected': p => `మీ ఆర్డర్ ${p.orderId} తిరస్కరించబడింది. కారణం: ${p.reason ?? 'అందుబాటులో లేదు'}.`,
  'order.cancelled': p => `ఆర్డర్ ${p.orderId} రద్దు చేయబడింది.`,
  'order.rider_offer': p => `కొత్త డెలివరీ ఆర్డర్ ${p.orderId} అందుబాటులో ఉంది.`,
  'order.assigned': p => `ఆర్డర్ ${p.orderId} కు డెలివరీ భాగస్వామి కేటాయించబడ్డారు.`,
  'order.picked_up': p => `ఆర్డర్ ${p.orderId} రెస్టారెంట్ నుండి తీసుకున్నారు.`,
  'order.delivered': p => `ఆర్డర్ ${p.orderId} డెలివర్ అయింది. ధన్యవాదాలు.`,
  'order.unassigned': p => `ఆర్డర్ ${p.orderId} కు ఇంకా డెలివరీ భాగస్వామి దొరకలేదు. మేము ప్రయత్నిస్తున్నాము.`,
  'order.payment_failed': p => `ఆర్డర్ ${p.orderId} చెల్లింపు విఫలమైంది.`,
  'admin.order_unassigned': p => `Order ${p.orderId} timed out without rider assignment.`
};

export function renderSms(templateKey, payload) {
  const renderer = te[templateKey];
  return renderer ? renderer(payload) : `Parvathipuram Bites: ${templateKey} - ${payload.orderId ?? ''}`;
}

export async function enqueueNotification(client, { userId, orderId = null, templateKey, payload = {}, channels = ['in_app','sms'] }) {
  if (!userId) throw new HttpError(500, 'NOTIFICATION_RECIPIENT_REQUIRED', 'Notification recipient missing.');
  const rows = [];
  for (const channel of channels) {
    const result = await client.query(
      `INSERT INTO notifications(user_id,order_id,channel,template_key,payload,status,next_attempt_at)
       VALUES($1,$2,$3,$4,$5::jsonb,'queued',now()) RETURNING id`,
      [userId, orderId, channel, templateKey, JSON.stringify(payload)]
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function queueOrderRecipients(client, orderId, templateKey, payload = {}, { customer = true, restaurant = false, rider = false, admins = false } = {}) {
  const { rows } = await client.query(
    `SELECT o.id,o.customer_id,r.owner_user_id AS restaurant_owner_user_id,d.user_id AS rider_user_id
     FROM orders o
     JOIN restaurants r ON r.id=o.restaurant_id
     LEFT JOIN delivery_agents d ON d.id=o.delivery_agent_id
     WHERE o.id=$1`, [orderId]
  );
  const order = rows[0];
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const base = { orderId, ...payload };
  if (customer) await enqueueNotification(client, { userId: order.customer_id, orderId, templateKey, payload: base });
  if (restaurant) await enqueueNotification(client, { userId: order.restaurant_owner_user_id, orderId, templateKey, payload: base });
  if (rider && order.rider_user_id) await enqueueNotification(client, { userId: order.rider_user_id, orderId, templateKey, payload: base });
  if (admins) {
    const { rows: adminRows } = await client.query(`SELECT id FROM app_users WHERE role='super_admin' AND status='active'`);
    for (const admin of adminRows) await enqueueNotification(client, { userId: admin.id, orderId, templateKey, payload: base });
  }
}
