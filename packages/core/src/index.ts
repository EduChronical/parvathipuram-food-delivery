export const ROLES = [
  "CUSTOMER","RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF",
  "DELIVERY_PARTNER","SUPPORT_AGENT","CITY_MANAGER","FINANCE_ADMIN","CONTENT_ADMIN","SUPER_ADMIN"
] as const;
export type RoleCode = typeof ROLES[number];

export const ORDER_STATES = [
  "CREATED","PAYMENT_PENDING","PAYMENT_CONFIRMED","PLACED","RESTAURANT_CONFIRMED",
  "PREPARING","READY_FOR_PICKUP","DELIVERY_PARTNER_ASSIGNED","DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT",
  "PICKED_UP","ON_THE_WAY","ARRIVED_AT_CUSTOMER","DELIVERED","CANCELLED","REFUND_PENDING","REFUNDED"
] as const;
export type OrderStatus = typeof ORDER_STATES[number];

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  CREATED:["PAYMENT_PENDING","PLACED","CANCELLED"],
  PAYMENT_PENDING:["PAYMENT_CONFIRMED","CANCELLED"],
  PAYMENT_CONFIRMED:["PLACED","REFUND_PENDING"],
  PLACED:["RESTAURANT_CONFIRMED","CANCELLED","REFUND_PENDING"],
  RESTAURANT_CONFIRMED:["PREPARING","DELIVERY_PARTNER_ASSIGNED","CANCELLED","REFUND_PENDING"],
  PREPARING:["READY_FOR_PICKUP","DELIVERY_PARTNER_ASSIGNED","CANCELLED","REFUND_PENDING"],
  READY_FOR_PICKUP:["DELIVERY_PARTNER_ASSIGNED","DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT","PICKED_UP","CANCELLED","REFUND_PENDING"],
  DELIVERY_PARTNER_ASSIGNED:["DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT","READY_FOR_PICKUP","CANCELLED"],
  DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT:["READY_FOR_PICKUP","PICKED_UP","CANCELLED"],
  PICKED_UP:["ON_THE_WAY"],
  ON_THE_WAY:["ARRIVED_AT_CUSTOMER"],
  ARRIVED_AT_CUSTOMER:["DELIVERED"],
  DELIVERED:["REFUND_PENDING"],
  CANCELLED:["REFUND_PENDING","REFUNDED"],
  REFUND_PENDING:["REFUNDED"],
  REFUNDED:[]
};

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!ORDER_TRANSITIONS[from]?.includes(to)) throw new Error("INVALID_ORDER_TRANSITION:"+from+"->"+to);
}

export type PricingInput = {
  itemsPaise:number; addonPaise?:number; taxRateBps?:number; deliveryFeePaise?:number;
  packagingPaise?:number; platformFeePaise?:number; discountPaise?:number; walletPaise?:number;
};
export function calculatePricing(i:PricingInput) {
  const itemSubtotal=Math.max(0,Math.trunc(i.itemsPaise));
  const addons=Math.max(0,Math.trunc(i.addonPaise??0));
  const taxable=itemSubtotal+addons;
  const tax=Math.round(taxable*Math.max(0,i.taxRateBps??0)/10000);
  const delivery=Math.max(0,Math.trunc(i.deliveryFeePaise??0));
  const packaging=Math.max(0,Math.trunc(i.packagingPaise??0));
  const platform=Math.max(0,Math.trunc(i.platformFeePaise??0));
  const gross=taxable+tax+delivery+packaging+platform;
  const discount=Math.min(gross,Math.max(0,Math.trunc(i.discountPaise??0)));
  const afterDiscount=gross-discount;
  const wallet=Math.min(afterDiscount,Math.max(0,Math.trunc(i.walletPaise??0)));
  return {itemSubtotalPaise:itemSubtotal,addonPaise:addons,taxPaise:tax,deliveryFeePaise:delivery,packagingPaise:packaging,platformFeePaise:platform,discountPaise:discount,walletPaise:wallet,totalPaise:afterDiscount-wallet};
}

export type CouponInput={kind:"PERCENT"|"FLAT"|"FREE_DELIVERY";value:number;maxDiscountPaise?:number;minOrderPaise?:number};
export function couponDiscount(c:CouponInput, subtotalPaise:number, deliveryPaise:number){
  if(subtotalPaise<(c.minOrderPaise??0)) return 0;
  if(c.kind==="FREE_DELIVERY") return Math.max(0,deliveryPaise);
  const raw=c.kind==="FLAT"?c.value:Math.round(subtotalPaise*c.value/100);
  return Math.max(0,Math.min(raw,c.maxDiscountPaise??raw));
}

export function haversineKm(lat1:number,lon1:number,lat2:number,lon2:number){
  const r=6371,toRad=(d:number)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*r*Math.asin(Math.sqrt(a));
}

export function deliveryFeePaise(distanceKm:number, base=2500, perKm=800, freeAbovePaise=69900, orderPaise=0){
  if(orderPaise>=freeAbovePaise) return 0;
  return Math.max(base, Math.round(base+Math.max(0,distanceKm-2)*perKm));
}

export function etaMinutes(prep:number,distanceKm:number,riderAvailable=true,loadFactor=1){
  const travel=Math.ceil(distanceKm*4.5),riderWait=riderAvailable?3:10;
  return Math.max(10,Math.ceil(prep*Math.max(1,loadFactor)+travel+riderWait));
}

export function safeCsvCell(value:unknown){
  const raw=String(value??"");
  const hardened=/^[=+\-@]/.test(raw)?"'"+raw:raw;
  return '"'+hardened.replaceAll('"','""')+'"';
}
