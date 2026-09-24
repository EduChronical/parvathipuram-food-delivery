import { Router } from './http/router.js';
import { registerInternalRoutes } from './routes/internal.routes.js';
import { registerNotificationRoutes } from './routes/notifications.routes.js';
import { registerOrderRoutes } from './routes/orders.routes.js';
import { registerRestaurantRoutes } from './routes/restaurants.routes.js';
import { registerRiderRoutes } from './routes/riders.routes.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerPhase3Routes } from './register-phase3-routes.js';
import { registerPhase4Routes } from './register-phase4-routes.js';
import { healthcheck } from './db.js';
import { HttpError } from './http/errors.js';

export function createApp() {
  const router = new Router();
  router.add('GET', '/health', { auth: 'none' }, async () => {
    try { await healthcheck(); }
    catch { throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.'); }
    return { body: { ok: true, service: 'parvathipuram-bites-api', at: new Date().toISOString() } };
  });
  registerAuthRoutes(router);
  registerInternalRoutes(router);
  registerOrderRoutes(router);
  registerRestaurantRoutes(router);
  registerRiderRoutes(router);
  registerNotificationRoutes(router);
  registerPhase3Routes(router);
  registerPhase4Routes(router);
  return router;
}
