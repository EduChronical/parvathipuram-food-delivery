import { uuid } from '../http/validation.js';
import { listCatalogMenu, listCatalogRestaurants } from '../services/catalog.service.js';

export function registerCatalogRoutes(router) {
  router.add('GET','/v1/catalog/restaurants',{auth:'jwt'},({actor,query,requestId}) => listCatalogRestaurants(actor.userId,requestId,query));
  router.add('GET','/v1/catalog/restaurants/:restaurantId/menu',{auth:'jwt'},({actor,params,requestId}) => listCatalogMenu(actor.userId,requestId,uuid(params.restaurantId,'restaurantId')));
}
