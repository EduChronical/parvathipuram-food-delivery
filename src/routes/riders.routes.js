import { bool, integer, number, objectBody, string, uuid } from '../http/validation.js';
import { acceptOffer, getWallet, heartbeat, listOffers, rejectOffer, setAvailability } from '../services/rider.service.js';

export function registerRiderRoutes(router) {
  router.add('PATCH', '/v1/riders/me/availability', { auth: 'jwt', body: true }, async ({ actor, body, requestId }) => {
    const b = objectBody(body);
    return setAvailability(actor.userId, requestId, {
      online: bool(b.online, 'online'),
      latitude: number(b.latitude, 'latitude', { min: -90, max: 90, optional: true }),
      longitude: number(b.longitude, 'longitude', { min: -180, max: 180, optional: true })
    });
  });

  router.add('POST', '/v1/riders/me/heartbeat', { auth: 'jwt', body: true }, async ({ actor, body, requestId }) => {
    const b = objectBody(body);
    return heartbeat(actor.userId, requestId, {
      latitude: number(b.latitude, 'latitude', { min: -90, max: 90 }),
      longitude: number(b.longitude, 'longitude', { min: -180, max: 180 })
    });
  });

  router.add('GET', '/v1/riders/me/offers', { auth: 'jwt' }, async ({ actor, requestId }) => listOffers(actor.userId, requestId));
  router.add('POST', '/v1/riders/me/offers/:assignmentId/accept', { auth: 'jwt' }, async ({ actor, params, requestId }) =>
    acceptOffer(actor.userId, requestId, uuid(params.assignmentId, 'assignmentId'))
  );
  router.add('POST', '/v1/riders/me/offers/:assignmentId/reject', { auth: 'jwt', body: true }, async ({ actor, params, body, requestId }) => {
    const b = objectBody(body);
    return rejectOffer(actor.userId, requestId, uuid(params.assignmentId, 'assignmentId'), string(b.reason, 'reason', { min: 1, max: 500 }));
  });
  router.add('GET', '/v1/riders/me/wallet', { auth: 'jwt' }, async ({ actor, query, requestId }) => {
    const limit = query.limit ? integer(Number(query.limit), 'limit', { min: 1, max: 200 }) : 50;
    return getWallet(actor.userId, requestId, limit);
  });
}
