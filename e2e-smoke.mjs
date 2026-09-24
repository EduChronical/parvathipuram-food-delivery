import assert from "node:assert/strict";

const base=process.env.API_BASE_URL??"http://127.0.0.1:4000";
const demoPassword=process.env.DEMO_PASSWORD??"DemoPass!2026";
const adminEmail=process.env.ADMIN_EMAIL??"admin@ppmbites.local";
const adminPassword=process.env.ADMIN_INITIAL_PASSWORD??"PPMAdmin!2026Change";

async function call(path,{method="GET",token,body,headers={},ok=true}={}){
  const res=await fetch(base+path,{
    method,
    headers:{
      ...(body!==undefined?{"Content-Type":"application/json"}:{}),
      ...(token?{Authorization:"Bearer "+token}:{}),
      ...headers
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const ct=res.headers.get("content-type")??"";
  const data=ct.includes("application/json")?await res.json():Buffer.from(await res.arrayBuffer());
  if(ok&&!res.ok) throw new Error(method+" "+path+" failed "+res.status+": "+(Buffer.isBuffer(data)?data.toString("utf8"):JSON.stringify(data)));
  return {status:res.status,data,headers:res.headers};
}
async function login(identifier,password){
  const r=await call("/auth/login",{method:"POST",body:{identifier,password}});
  assert.ok(r.data.accessToken);
  return r.data.accessToken;
}
async function transition(token,orderId,to){
  const r=await call("/orders/"+orderId+"/transition",{method:"POST",token,body:{to}});
  assert.equal(r.data.status,to);
}
function log(step){console.log("E2E",step)}

log("health");
assert.equal((await call("/health")).data.ok,true);

log("logins");
const customer=await login("customer@ppmbites.local",demoPassword);
const owner=await login("restaurant@ppmbites.local",demoPassword);
const rider1=await login("delivery@ppmbites.local",demoPassword);
const admin=await login(adminEmail,adminPassword);

log("second rider registration and approval");
const rider2Email="rider2-"+Date.now()+"@ci.local";
const reg=await call("/auth/register",{method:"POST",body:{name:"CI Rider Two",email:rider2Email,password:"RiderTwo!2026"}});
assert.ok(reg.data.accessToken);
await call("/onboarding/delivery",{method:"POST",token:reg.data.accessToken,body:{vehicleType:"BIKE",vehicleNumber:"AP39CI0002"}});
const pending=await call("/admin/delivery-partners/pending",{token:admin});
const rider2Pending=pending.data.find(x=>x.user?.email===rider2Email);
assert.ok(rider2Pending);
await call("/admin/delivery-partners/"+rider2Pending.id+"/status",{method:"PATCH",token:admin,body:{status:"APPROVED"}});
const rider2=await login(rider2Email,"RiderTwo!2026");
await call("/delivery/online",{method:"POST",token:rider2,body:{online:true}});
await call("/delivery/location",{method:"POST",token:rider2,body:{latitude:18.7835,longitude:83.4255,accuracyM:5}});
await call("/delivery/online",{method:"POST",token:rider1,body:{online:true}});
await call("/delivery/location",{method:"POST",token:rider1,body:{latitude:18.784,longitude:83.424,accuracyM:5}});

log("catalog favorites cart");
const list=await call("/restaurants?lat=18.783&lng=83.426");
assert.ok(list.data.items.length>0);
const restaurant=list.data.items[0];
const menu=await call("/restaurants/"+restaurant.slug);
const dish=menu.data.categories.flatMap(c=>c.items)[0];
assert.ok(dish);
await call("/favorites/restaurants/"+restaurant.id,{method:"POST",token:customer});
await call("/favorites/dishes/"+dish.id,{method:"POST",token:customer});
const favorites=await call("/favorites",{token:customer});
assert.ok(favorites.data.some(f=>f.restaurantId===restaurant.id));
assert.ok(favorites.data.some(f=>f.menuItemId===dish.id));
const addresses=await call("/me/addresses",{token:customer});
assert.ok(addresses.data.length>0);
const addressId=addresses.data[0].id;
await call("/carts/"+restaurant.id+"/items",{method:"PUT",token:customer,body:{menuItemId:dish.id,quantity:1,addonIds:[]}});

log("idempotent checkout");
const checkoutBody={restaurantId:restaurant.id,addressId,paymentMethod:"UPI"};
const idem="ci-checkout-"+Date.now();
const first=await call("/checkout",{method:"POST",token:customer,headers:{"Idempotency-Key":idem},body:checkoutBody});
const repeated=await call("/checkout",{method:"POST",token:customer,headers:{"Idempotency-Key":idem},body:checkoutBody});
assert.equal(repeated.data.order.id,first.data.order.id);
const orderId=first.data.order.id;

log("payment creation and duplicate webhook");
await call("/payments/"+orderId+"/create",{method:"POST",token:customer});
const event={id:"evt-"+orderId,providerOrderId:"dev_"+orderId,providerPaymentId:"pay-"+orderId,status:"CAPTURED"};
assert.equal((await call("/payments/webhook",{method:"POST",body:event})).data.ok,true);
assert.equal((await call("/payments/webhook",{method:"POST",body:event})).data.duplicate,true);
let order=await call("/orders/"+orderId,{token:customer});
assert.equal(order.data.status,"PLACED");

log("restaurant confirmation and preparation");
await transition(owner,orderId,"RESTAURANT_CONFIRMED");
await transition(owner,orderId,"PREPARING");

log("two-rider acceptance concurrency");
const offer1=(await call("/delivery/offers",{token:rider1})).data.find(x=>x.orderId===orderId);
const offer2=(await call("/delivery/offers",{token:rider2})).data.find(x=>x.orderId===orderId);
assert.ok(offer1&&offer2);
const [accept1,accept2]=await Promise.all([
  call("/delivery/assignments/"+offer1.id+"/respond",{method:"POST",token:rider1,body:{accept:true},ok:false}),
  call("/delivery/assignments/"+offer2.id+"/respond",{method:"POST",token:rider2,body:{accept:true},ok:false})
]);
assert.equal([accept1,accept2].filter(r=>r.status>=200&&r.status<300).length,1);
assert.equal([accept1,accept2].filter(r=>r.status===409).length,1);
const winner=accept1.status<300?rider1:rider2;

log("pickup and delivery lifecycle");
await transition(winner,orderId,"DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT");
await transition(owner,orderId,"READY_FOR_PICKUP");
await transition(winner,orderId,"PICKED_UP");
await transition(winner,orderId,"ON_THE_WAY");
await transition(winner,orderId,"ARRIVED_AT_CUSTOMER");
await transition(winner,orderId,"DELIVERED");
order=await call("/orders/"+orderId,{token:customer});
assert.equal(order.data.status,"DELIVERED");

log("review invoice earnings settlements");
assert.equal((await call("/reviews",{method:"POST",token:customer,body:{orderId,restaurantRating:5,foodRating:5,deliveryRating:5,text:"CI verified delivery"}})).data.restaurantRating,5);
assert.equal((await call("/reviews",{method:"POST",token:customer,body:{orderId,restaurantRating:4},ok:false})).status,409);
const invoice=await call("/orders/"+orderId+"/invoice",{token:customer});
assert.ok((invoice.headers.get("content-type")??"").includes("application/pdf"));
assert.equal(invoice.data.subarray(0,4).toString("ascii"),"%PDF");
assert.ok((await call("/delivery/earnings?days=7",{token:winner})).data.totalPaise>=0);
assert.ok((await call("/partner/settlements",{token:owner})).data.entries.some(x=>x.orderId===orderId));
assert.ok((await call("/partner/reviews",{token:owner})).data.some(x=>x.orderId===orderId));

log("reorder and support");
assert.ok((await call("/orders/"+orderId+"/reorder",{method:"POST",token:customer})).data.cart.items.length>0);
assert.ok((await call("/support/tickets",{method:"POST",token:customer,body:{orderId,category:"delivery issue",subject:"CI support check",message:"Automated support workflow validation"}})).data.id);

log("provider-backed refund and idempotency");
const refundKey="ci-refund-"+Date.now();
const refund=await call("/admin/refunds",{method:"POST",token:admin,body:{orderId,amountPaise:first.data.order.totalPaise,reason:"CI refund verification",idempotencyKey:refundKey}});
assert.equal(refund.data.status,"REFUNDED");
const refundAgain=await call("/admin/refunds",{method:"POST",token:admin,body:{orderId,amountPaise:first.data.order.totalPaise,reason:"CI refund verification",idempotencyKey:refundKey}});
assert.equal(refundAgain.data.id,refund.data.id);
assert.equal((await call("/orders/"+orderId,{token:customer})).data.status,"REFUNDED");

log("analytics and admin KPIs");
await call("/analytics",{method:"POST",token:customer,body:{name:"order_delivered",properties:{source:"ci"}}});
assert.ok(typeof (await call("/admin/kpis",{token:admin})).data.totalOrders==="number");

log("PASS");
