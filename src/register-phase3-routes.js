import { registerCatalogRoutes } from './routes/catalog.routes.js';
import { registerCustomerDashboardRoutes } from './routes/customer-dashboard.routes.js';
import { registerRestaurantDashboardRoutes } from './routes/restaurant-dashboard.routes.js';

export function registerPhase3Routes(router) {
  registerCatalogRoutes(router);
  registerCustomerDashboardRoutes(router);
  registerRestaurantDashboardRoutes(router);
}
