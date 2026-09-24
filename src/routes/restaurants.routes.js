import { objectBody, string, uuid } from '../http/validation.js';
import { acceptRestaurantOrder, rejectRestaurantOrder } from '../services/order.service.js';

export function registerRestaurantRoutes(router) {
  router.add('POST', '/v1/restaurants/:restaurantId/orders/:orderId/accept', { auth: 'jwt' }, async ({ actor, params, requestId }) =>
    acceptRestaurantOrder(actor.userId, requestId, uuid(params.restaurantId, 'restaurantId'), uuid(params.orderId, 'orderId'))
  );

  router.add('POST', '/v1/restaurants/:restaurantId/orders/:orderId/reject', { auth: 'jwt', body: true }, async ({ actor, params, body, requestId }) => {
    const b = objectBody(body);
    return rejectRestaurantOrder(
      actor.userId,
      requestId,
      uuid(params.restaurantId, 'restaurantId'),
      uuid(params.orderId, 'orderId'),
      string(b.reasonCode, 'reasonCode', { min: 1, max: 80 }),
      string(b.reasonText, 'reasonText', { min: 1, max: 500 })
    );
  });
}
