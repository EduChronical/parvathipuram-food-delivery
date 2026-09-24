import { registerAdminDashboardRoutes } from './routes/admin-dashboard.routes.js';
import { registerRiderDashboardRoutes } from './routes/rider-dashboard.routes.js';

export function registerPhase4Routes(router) {
  registerRiderDashboardRoutes(router);
  registerAdminDashboardRoutes(router);
}
