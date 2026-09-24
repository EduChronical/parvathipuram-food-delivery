import { bool, integer, number, objectBody, oneOf, string, uuid } from '../http/validation.js';
import { createAddress, deleteAddress, listAddresses, updateAddress } from '../services/address.service.js';
import { listCustomerOrders, reorderCustomerOrder, submitReview } from '../services/customer-dashboard.service.js';

function addressBody(body, partial=false) {
  const b=objectBody(body); const out={};
  if (!partial || b.label!==undefined) out.label=string(b.label,'label',{min:1,max:80});
  if (!partial || b.addressText!==undefined) out.addressText=string(b.addressText,'addressText',{min:1,max:500});
  if (!partial || b.latitude!==undefined) out.latitude=number(b.latitude,'latitude',{min:-90,max:90});
  if (!partial || b.longitude!==undefined) out.longitude=number(b.longitude,'longitude',{min:-180,max:180});
  if (!partial || b.isDefault!==undefined) out.isDefault=bool(b.isDefault,'isDefault');
  return out;
}

export function registerCustomerDashboardRoutes(router) {
  router.add('GET','/v1/customers/me/addresses',{auth:'jwt'},({actor,requestId})=>listAddresses(actor.userId,requestId));
  router.add('POST','/v1/customers/me/addresses',{auth:'jwt',body:true},({actor,body,requestId})=>createAddress(actor.userId,requestId,addressBody(body)));
  router.add('PATCH','/v1/customers/me/addresses/:addressId',{auth:'jwt',body:true},({actor,params,body,requestId})=>updateAddress(actor.userId,requestId,uuid(params.addressId,'addressId'),addressBody(body,true)));
  router.add('DELETE','/v1/customers/me/addresses/:addressId',{auth:'jwt'},({actor,params,requestId})=>deleteAddress(actor.userId,requestId,uuid(params.addressId,'addressId')));
  router.add('GET','/v1/customers/me/orders',{auth:'jwt'},({actor,query,requestId})=>listCustomerOrders(actor.userId,requestId,query.limit===undefined?50:integer(Number(query.limit),'limit',{min:1,max:100})));
  router.add('POST','/v1/orders/:orderId/reorder',{auth:'jwt',body:true},({actor,params,body,requestId})=>{
    const b=objectBody(body); return reorderCustomerOrder(actor.userId,requestId,uuid(params.orderId,'orderId'),{
      addressId:b.addressId===undefined?undefined:uuid(b.addressId,'addressId'),
      tipPaise:b.tipPaise===undefined?undefined:integer(b.tipPaise,'tipPaise',{min:0,max:1_000_000}),
      paymentMethod:b.paymentMethod===undefined?undefined:oneOf(b.paymentMethod,'paymentMethod',['cod','upi','card','netbanking','wallet','other']),
      idempotencyKey:b.idempotencyKey===undefined?undefined:string(b.idempotencyKey,'idempotencyKey',{min:8,max:200}),
      customerNote:b.customerNote===undefined?undefined:string(b.customerNote,'customerNote',{min:1,max:1000})
    });
  });
  router.add('POST','/v1/orders/:orderId/review',{auth:'jwt',body:true},({actor,params,body,requestId})=>{
    const b=objectBody(body); return submitReview(actor.userId,requestId,uuid(params.orderId,'orderId'),{
      rating:integer(b.rating,'rating',{min:1,max:5}),
      body:b.body===null||b.body===undefined?null:string(b.body,'body',{min:1,max:2000})
    });
  });
}
