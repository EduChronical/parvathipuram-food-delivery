import { healthcheck } from '../db.js';
import { objectBody } from '../http/validation.js';
import { verifyPaymentWebhook } from '../providers/payment-webhook.js';
import { processPaymentEvent } from '../services/payment.service.js';

export function registerInternalRoutes(router) {
  router.add('GET', '/healthz', { auth: 'none' }, async () => ({ ok: true, database: await healthcheck() }));

  router.add('POST', '/v1/internal/payment-events', { auth: 'none', body: true }, async ({ req, body, requestId }) => {
    const b = objectBody(body);
    verifyPaymentWebhook(b, req.headers['x-pb-payment-signature']);
    return processPaymentEvent(requestId, b);
  });
}
