import { bool, integer, number, objectBody, oneOf, string, uuid } from '../http/validation.js';
import {
  acceptRiderOffer,getCurrentDelivery,getDemandHeatmap,getRiderProfile,getRiderWalletDashboard,
  listRiderOffers,registerRider,rejectRiderOffer,riderHeartbeat,setRiderAvailability
} from '../services/rider-dashboard.service.js';

export function registerRiderDashboardRoutes(router) {
  router.add('POST','/v1/rider-dashboard/register',{auth:'jwt',body:true},async ({actor,body,requestId}) => {
    const b=objectBody(body);
    return registerRider(actor.userId,requestId,{
      vehicleType:oneOf(b.vehicleType,'vehicleType',['bicycle','motorcycle','scooter','auto','car','other']),
      vehicleLabel:string(b.vehicleLabel,'vehicleLabel',{min:1,max:120,optional:true})
    });
  });
  router.add('GET','/v1/rider-dashboard/me',{auth:'jwt'},({actor,requestId}) => getRiderProfile(actor.userId,requestId));
  router.add('PATCH','/v1/rider-dashboard/me/availability',{auth:'jwt',body:true},async ({actor,body,requestId}) => {
    const b=objectBody(body);
    return setRiderAvailability(actor.userId,requestId,{
      online:bool(b.online,'online'),
      latitude:number(b.latitude,'latitude',{min:-90,max:90,optional:true}),
      longitude:number(b.longitude,'longitude',{min:-180,max:180,optional:true}),
      accuracyMeters:number(b.accuracyMeters,'accuracyMeters',{min:0,max:10000,optional:true})
    });
  });
  router.add('POST','/v1/rider-dashboard/me/heartbeat',{auth:'jwt',body:true},async ({actor,body,requestId}) => {
    const b=objectBody(body);
    return riderHeartbeat(actor.userId,requestId,{
      latitude:number(b.latitude,'latitude',{min:-90,max:90}),longitude:number(b.longitude,'longitude',{min:-180,max:180}),
      accuracyMeters:number(b.accuracyMeters,'accuracyMeters',{min:0,max:10000,optional:true})
    });
  });
  router.add('GET','/v1/rider-dashboard/me/offers',{auth:'jwt'},({actor,query,requestId}) => listRiderOffers(actor.userId,requestId,query.limit?integer(Number(query.limit),'limit',{min:1,max:200}):50));
  router.add('POST','/v1/rider-dashboard/me/offers/:offerId/accept',{auth:'jwt'},({actor,params,requestId}) => acceptRiderOffer(actor.userId,requestId,uuid(params.offerId,'offerId')));
  router.add('POST','/v1/rider-dashboard/me/offers/:offerId/reject',{auth:'jwt',body:true},async ({actor,params,body,requestId}) => {
    const b=objectBody(body);
    return rejectRiderOffer(actor.userId,requestId,uuid(params.offerId,'offerId'),string(b.reason,'reason',{min:2,max:500}));
  });
  router.add('GET','/v1/rider-dashboard/me/current-delivery',{auth:'jwt'},({actor,requestId}) => getCurrentDelivery(actor.userId,requestId));
  router.add('GET','/v1/rider-dashboard/me/wallet',{auth:'jwt'},({actor,query,requestId}) => getRiderWalletDashboard(actor.userId,requestId,query.limit?integer(Number(query.limit),'limit',{min:1,max:500}):100));
  router.add('GET','/v1/rider-dashboard/me/demand-heatmap',{auth:'jwt'},({actor,requestId}) => getDemandHeatmap(actor.userId,requestId));
}
