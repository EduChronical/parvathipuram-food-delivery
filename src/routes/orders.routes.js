import { objectBody, oneOf, string, uuid, integer } from '../http/validation.js';
import { createOrder, quoteOrder, getOrder, cancelOrder, markPickedUp, markDelivered } from '../services/order.service.js';

export function registerOrderRoutes(router) {
  router.add('POST', '/v1/orders/quote', { auth: 'jwt', body: true }, async ({ actor, body, requestId }) => {
    const b = objectBody(body);
    return quoteOrder(actor.userId, requestId, {
      restaurantId: uuid(b.restaurantId, 'restaurantId'),
      addressId: uuid(b.addressId, 'addressId'),
      items: b.items,
      tipPaise: integer(b.tipPaise ?? 0, 'tipPaise', { min: 0, max: 1_000_000 })
    });
  });
  router.add('POST', '/v1/orders', { auth: 'jwt', body: true }, async ({ actor, body, requestId }) => {
    const b = objectBody(body);
    const result = await createOrder(actor.userId, requestId, {
      restaurantId: uuid(b.restaurantId, 'restaurantId'),
      addressId: uuid(b.addressId, 'addressId'),
      items: b.items,
      tipPaise: integer(b.tipPaise ?? 0, 'tipPaise', { min: 0, max: 1_000_000 }),
      paymentMethod: oneOf(b.paymentMethod ?? 'cod', 'paymentMethod', ['cod','upi','card','netbanking','wallet','other']),
      idempotencyKey: string(b.idempotencyKey, 'idempotencyKey', { min: 8, max: 200 }),
      customerNote: string(b.customerNote, 'customerNote', { min: 1, max: 1000, optional: true })
    });
    return { statusCode: result.idempotentReplay ? 200 : 201, body: result };
  });

  router.add('GET', '/v1/orders/:orderId', { auth: 'jwt' }, async ({ actor, params, requestId }) =>
    getOrder(actor.userId, requestId, uuid(params.orderId, 'orderId'))
  );

  router.add('POST', '/v1/orders/:orderId/cancel', { auth: 'jwt', body: true }, async ({ actor, params, body, requestId }) => {
    const b = objectBody(body);
    return cancelOrder(
      actor.userId,
      requestId,
      uuid(params.orderId, 'orderId'),
      string(b.reasonCode, 'reasonCode', { min: 1, max: 80 }),
      string(b.reasonText, 'reasonText', { min: 1, max: 500 })
    );
  });

  router.add('POST', '/v1/riders/me/orders/:orderId/pickup', { auth: 'jwt' }, async ({ actor, params, requestId }) =>
    markPickedUp(actor.userId, requestId, uuid(params.orderId, 'orderId'))
  );

  router.add('POST', '/v1/riders/me/orders/:orderId/deliver', { auth: 'jwt' }, async ({ actor, params, requestId }) =>
    markDelivered(actor.userId, requestId, uuid(params.orderId, 'orderId'))
  );
}
