import test from "node:test";
import assert from "node:assert/strict";
import {assertTransition,calculatePricing,couponDiscount,deliveryFeePaise} from "./index.js";

test("valid and invalid order transitions",()=>{
  assert.doesNotThrow(()=>assertTransition("PLACED","RESTAURANT_CONFIRMED"));
  assert.doesNotThrow(()=>assertTransition("READY_FOR_PICKUP","DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT"));
  assert.doesNotThrow(()=>assertTransition("DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT","READY_FOR_PICKUP"));
  assert.throws(()=>assertTransition("DELIVERED","PREPARING"));
});
test("pricing is deterministic",()=>{
  assert.equal(calculatePricing({itemsPaise:50000,taxRateBps:500,deliveryFeePaise:3000,discountPaise:5000}).totalPaise,50500);
});
test("coupon caps discount",()=>{
  assert.equal(couponDiscount({kind:"PERCENT",value:50,maxDiscountPaise:10000},50000,0),10000);
});
test("free delivery threshold",()=>{
  assert.equal(deliveryFeePaise(4,2500,800,69900,70000),0);
});
