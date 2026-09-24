import { bool, integer, objectBody, string, uuid } from '../http/validation.js';
import { editMenuItem, getRestaurantDashboard, listOwnerMenu, listRestaurantOrders, listRestaurantReviews, setMenuAvailability, setRestaurantOpenState } from '../services/restaurant-dashboard.service.js';

export function registerRestaurantDashboardRoutes(router) {
  router.add('GET','/v1/restaurants/:restaurantId/dashboard',{auth:'jwt'},({actor,params,requestId})=>getRestaurantDashboard(actor.userId,requestId,uuid(params.restaurantId,'restaurantId')));
  router.add('GET','/v1/restaurants/:restaurantId/orders',{auth:'jwt'},({actor,params,query,requestId})=>listRestaurantOrders(actor.userId,requestId,uuid(params.restaurantId,'restaurantId'),{status:query.status||undefined,limit:query.limit===undefined?100:integer(Number(query.limit),'limit',{min:1,max:200})}));
  router.add('PATCH','/v1/restaurants/:restaurantId/open-state',{auth:'jwt',body:true},({actor,params,body,requestId})=>{const b=objectBody(body);return setRestaurantOpenState(actor.userId,requestId,uuid(params.restaurantId,'restaurantId'),bool(b.isOpen,'isOpen'));});
  router.add('GET','/v1/restaurants/:restaurantId/owner-menu',{auth:'jwt'},({actor,params,requestId})=>listOwnerMenu(actor.userId,requestId,uuid(params.restaurantId,'restaurantId')));
  router.add('PATCH','/v1/restaurants/:restaurantId/menu/:menuItemId/availability',{auth:'jwt',body:true},({actor,params,body,requestId})=>{const b=objectBody(body);return setMenuAvailability(actor.userId,requestId,uuid(params.restaurantId,'restaurantId'),uuid(params.menuItemId,'menuItemId'),bool(b.isAvailable,'isAvailable'));});
  router.add('PATCH','/v1/restaurants/:restaurantId/menu/:menuItemId',{auth:'jwt',body:true},({actor,params,body,requestId})=>{
    const b=objectBody(body); const patch={};
    if(b.name!==undefined)patch.name=string(b.name,'name',{min:1,max:180});
    if(b.description!==undefined)patch.description=b.description===null?null:string(b.description,'description',{min:1,max:2000});
    if(b.pricePaise!==undefined)patch.pricePaise=integer(b.pricePaise,'pricePaise',{min:0,max:10_000_000});
    if(b.isVeg!==undefined)patch.isVeg=bool(b.isVeg,'isVeg');
    if(b.category!==undefined)patch.category=b.category===null?null:string(b.category,'category',{min:1,max:120});
    if(b.imageUrl!==undefined)patch.imageUrl=b.imageUrl===null?null:string(b.imageUrl,'imageUrl',{min:1,max:2048});
    return editMenuItem(actor.userId,requestId,uuid(params.restaurantId,'restaurantId'),uuid(params.menuItemId,'menuItemId'),patch);
  });
  router.add('GET','/v1/restaurants/:restaurantId/reviews',{auth:'jwt'},({actor,params,query,requestId})=>listRestaurantReviews(actor.userId,requestId,uuid(params.restaurantId,'restaurantId'),query.limit===undefined?100:integer(Number(query.limit),'limit',{min:1,max:200})));
}
