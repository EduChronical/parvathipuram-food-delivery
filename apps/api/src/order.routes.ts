import crypto from "node:crypto";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,OrderStatus,PaymentStatus,CouponType} from "@ppm/database";
import {assertTransition,calculatePricing,couponDiscount,deliveryFeePaise,etaMinutes,haversineKm} from "@ppm/core";
import {requireAuth,requireRole} from "./security.js";
import {publishOrder} from "./realtime.js";
import {notifyUser,notifyRestaurantUsers,notifyDeliveryPartners,orderStatusCopy} from "./notifications.js";

const checkoutSchema=z.object({
  restaurantId:z.string().uuid(),addressId:z.string().uuid(),paymentMethod:z.enum(["UPI","CARD","NETBANKING","WALLET","COD"]),
  couponCode:z.string().optional(),deliveryInstructions:z.string().max(500).optional()
});

export async function orderRoutes(app:FastifyInstance){
  app.post("/checkout",async(req,reply)=>{
    const u=await requireAuth(req);
    const idem=String(req.headers["idempotency-key"]??"");
    if(idem.length<8) return reply.code(400).send({code:"IDEMPOTENCY_KEY_REQUIRED",message:"Idempotency-Key header required",requestId:req.id});
    const body=checkoutSchema.parse(req.body);
    const onlinePaymentReady=process.env.PAYMENT_PROVIDER==="razorpay"&&!!process.env.PAYMENT_API_KEY&&!!process.env.PAYMENT_API_SECRET;
    if(process.env.NODE_ENV==="production"&&body.paymentMethod!=="COD"&&!onlinePaymentReady){
      return reply.code(503).send({code:"ONLINE_PAYMENTS_UNAVAILABLE",message:"Online payments are temporarily unavailable. Please use cash on delivery.",requestId:req.id});
    }
    const hash=crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const existing=await db.idempotencyKey.findUnique({where:{userId_scope_key:{userId:u.id,scope:"checkout",key:idem}}});
    if(existing){
      if(existing.requestHash!==hash) return reply.code(409).send({code:"IDEMPOTENCY_CONFLICT",message:"Key was used with different request",requestId:req.id});
      return reply.code(existing.responseStatus??200).send(existing.responseBody??{});
    }

    try{
      const result=await db.$transaction(async tx=>{
        const cart=await tx.cart.findUnique({
          where:{userId_restaurantId:{userId:u.id,restaurantId:body.restaurantId}},
          include:{items:{include:{menuItem:true,variant:true,addons:{include:{addon:true}}}},restaurant:true}
        });
        if(!cart||!cart.items.length) throw Object.assign(new Error("Cart empty"),{statusCode:409,code:"CART_EMPTY"});
        if(!cart.restaurant.isOpen||cart.restaurant.isPaused||cart.restaurant.status!=="APPROVED") throw Object.assign(new Error("Restaurant unavailable"),{statusCode:409,code:"RESTAURANT_UNAVAILABLE"});
        const address=await tx.address.findFirst({where:{id:body.addressId,userId:u.id}});
        if(!address) throw Object.assign(new Error("Address not found"),{statusCode:404,code:"ADDRESS_NOT_FOUND"});
        const distance=haversineKm(Number(cart.restaurant.latitude),Number(cart.restaurant.longitude),Number(address.latitude),Number(address.longitude));
        if(distance>Number(cart.restaurant.deliveryRadiusKm)) throw Object.assign(new Error("Address outside delivery range"),{statusCode:409,code:"OUTSIDE_DELIVERY_RANGE"});

        let itemsPaise=0,addonPaise=0;
        const snapshots=[];
        for(const ci of cart.items){
          if(!ci.menuItem.available||ci.menuItem.archivedAt) throw Object.assign(new Error("Item unavailable"),{statusCode:409,code:"ITEM_UNAVAILABLE"});
          if(ci.menuItem.stock!==null&&ci.menuItem.stock<ci.quantity) throw Object.assign(new Error("Insufficient stock"),{statusCode:409,code:"ITEM_STOCK_CHANGED"});
          const base=ci.menuItem.discountedPricePaise??ci.menuItem.pricePaise;
          const variantDelta=ci.variant?.priceDeltaPaise??0;
          itemsPaise+=(base+variantDelta)*ci.quantity;
          const addons=ci.addons.map(a=>({addonId:a.addonId,name:a.addon.name,unitPricePaise:a.addon.pricePaise,quantity:a.quantity}));
          addonPaise+=addons.reduce((s,a)=>s+a.unitPricePaise*a.quantity*ci.quantity,0);
          snapshots.push({ci,unitPricePaise:base+variantDelta,addons});
        }
        const delivery=deliveryFeePaise(distance,2500,800,69900,itemsPaise+addonPaise);
        let discount=0;
        if(body.couponCode){
          const coupon=await tx.coupon.findFirst({where:{code:body.couponCode,active:true,startsAt:{lte:new Date()},expiresAt:{gt:new Date()},OR:[{restaurantId:null},{restaurantId:body.restaurantId}]}});
          if(!coupon) throw Object.assign(new Error("Coupon invalid"),{statusCode:409,code:"COUPON_INVALID"});
          const used=await tx.couponRedemption.count({where:{couponId:coupon.id,userId:u.id}});
          if(used>=coupon.perCustomerLimit) throw Object.assign(new Error("Coupon usage limit reached"),{statusCode:409,code:"COUPON_LIMIT"});
          discount=couponDiscount({kind:coupon.type as CouponType,value:coupon.value,maxDiscountPaise:15000,minOrderPaise:29900},itemsPaise+addonPaise,delivery);
        }
        const pricing=calculatePricing({itemsPaise,addonPaise,taxRateBps:500,deliveryFeePaise:delivery,packagingPaise:1500,platformFeePaise:0,discountPaise:discount});
        const status=body.paymentMethod==="COD"?OrderStatus.PLACED:OrderStatus.PAYMENT_PENDING;
        const paymentStatus=body.paymentMethod==="COD"?PaymentStatus.PENDING:PaymentStatus.CREATED;
        const order=await tx.order.create({data:{
          orderNumber:"PPM"+Date.now().toString(36).toUpperCase()+crypto.randomBytes(2).toString("hex").toUpperCase(),
          userId:u.id,restaurantId:body.restaurantId,addressId:address.id,status,paymentStatus,
          ...pricing,couponCode:body.couponCode,deliveryInstructions:body.deliveryInstructions,
          addressSnapshot:{label:address.label,line1:address.line1,line2:address.line2,locality:address.locality,city:address.city,postalCode:address.postalCode,landmark:address.landmark,latitude:String(address.latitude),longitude:String(address.longitude)},
          etaMinutes:etaMinutes(cart.restaurant.prepMinutes,distance,true,1),
          items:{create:snapshots.map(s=>({
            menuItemId:s.ci.menuItemId,variantId:s.ci.variantId,nameSnapshot:s.ci.menuItem.name,unitPricePaise:s.unitPricePaise,quantity:s.ci.quantity,note:s.ci.note,
            addons:{create:s.addons.map(a=>({addonId:a.addonId,nameSnapshot:a.name,unitPricePaise:a.unitPricePaise,quantity:a.quantity}))}
          }))},
          history:{create:{toStatus:status,actorUserId:u.id}}
        }});
        for(const s of snapshots){
          if(s.ci.menuItem.stock!==null){
            const changed=await tx.menuItem.updateMany({where:{id:s.ci.menuItemId,stock:{gte:s.ci.quantity}},data:{stock:{decrement:s.ci.quantity}}});
            if(changed.count!==1) throw Object.assign(new Error("Stock changed during checkout"),{statusCode:409,code:"ITEM_STOCK_CHANGED"});
          }
        }
        const payment=await tx.payment.create({data:{orderId:order.id,provider:process.env.PAYMENT_PROVIDER??"dev",amountPaise:pricing.totalPaise,method:body.paymentMethod,status:paymentStatus}});
        if(body.couponCode){
          const c=await tx.coupon.findUnique({where:{code:body.couponCode}});
          if(c) await tx.couponRedemption.create({data:{couponId:c.id,userId:u.id,orderId:order.id,discountPaise:discount}});
        }
        await tx.cart.delete({where:{id:cart.id}});
        return {order,payment,paymentRequired:body.paymentMethod!=="COD"};
      },{isolationLevel:"Serializable"});

      await db.idempotencyKey.create({data:{userId:u.id,scope:"checkout",key:idem,requestHash:hash,responseStatus:201,responseBody:result,expiresAt:new Date(Date.now()+24*60*60*1000)}});
      if(result.order.status===OrderStatus.PLACED){
        const copy=orderStatusCopy("PLACED");
        await Promise.all([
          notifyUser(u.id,"ORDER_PLACED",copy.title,copy.body,{orderId:result.order.id,orderNumber:result.order.orderNumber}),
          notifyRestaurantUsers(result.order.restaurantId,"NEW_ORDER","New order received","A new PPM Bites order is ready for acceptance.",{orderId:result.order.id,orderNumber:result.order.orderNumber})
        ]);
      }
      return reply.code(201).send(result);
    }catch(e:any){
      const status=e.statusCode??500;
      return reply.code(status).send({code:e.code??"CHECKOUT_FAILED",message:status===500?"Checkout failed":e.message,requestId:req.id});
    }
  });

  app.post("/payments/:orderId/dev-confirm",async(req,reply)=>{
    const u=await requireAuth(req);
    if(process.env.NODE_ENV==="production"||(process.env.PAYMENT_PROVIDER??"dev")!=="dev") return reply.code(404).send({code:"NOT_FOUND",message:"Not found",requestId:req.id});
    const {orderId}=z.object({orderId:z.string().uuid()}).parse(req.params);
    const order=await db.order.findFirst({where:{id:orderId,userId:u.id},include:{payments:true}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    if(order.paymentStatus===PaymentStatus.CAPTURED) return {ok:true,orderId};
    await db.$transaction(async tx=>{
      await tx.payment.updateMany({where:{orderId},data:{status:PaymentStatus.CAPTURED,providerPaymentId:"dev_"+crypto.randomUUID()}});
      await tx.order.update({where:{id:orderId},data:{paymentStatus:PaymentStatus.CAPTURED,status:OrderStatus.PLACED}});
      await tx.orderStatusHistory.create({data:{orderId,fromStatus:order.status,toStatus:OrderStatus.PLACED,actorUserId:u.id,note:"Development payment captured"}});
    });
    return {ok:true,orderId};
  });

  app.get("/orders",async(req)=>{
    const u=await requireAuth(req);
    return db.order.findMany({where:{userId:u.id},include:{restaurant:true,items:true},orderBy:{createdAt:"desc"},take:50});
  });

  app.get("/orders/:id",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const order=await db.order.findUnique({where:{id},include:{restaurant:true,items:{include:{addons:true}},history:{orderBy:{createdAt:"asc"}},assignments:{include:{partner:{include:{locations:{orderBy:{createdAt:"desc"},take:1}}}}},payments:true,refunds:true}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    const isOwner=order.userId===u.id;
    const privileged=u.roles.some(r=>["SUPER_ADMIN","SUPPORT_AGENT","CITY_MANAGER"].includes(r));
    let restaurantAllowed=false,riderAllowed=false;
    if(u.roles.some(r=>["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF"].includes(r))) restaurantAllowed=!!(await db.restaurantOwner.findFirst({where:{restaurantId:order.restaurantId,userId:u.id}}))||!!(await db.restaurantStaff.findFirst({where:{restaurantId:order.restaurantId,userId:u.id,active:true}}));
    if(u.roles.includes("DELIVERY_PARTNER")) riderAllowed=!!(await db.deliveryAssignment.findFirst({where:{orderId:id,partner:{userId:u.id},status:{in:["OFFERED","ACCEPTED","PICKED_UP"]}}}));
    if(!isOwner&&!privileged&&!restaurantAllowed&&!riderAllowed) return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    return order;
  });

  app.post("/orders/:id/cancel",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({reason:z.string().min(3).max(300)}).parse(req.body);
    const order=await db.order.findFirst({where:{id,userId:u.id}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    if(!["CREATED","PAYMENT_PENDING","PAYMENT_CONFIRMED","PLACED"].includes(order.status)) return reply.code(409).send({code:"CANCELLATION_NOT_ALLOWED",message:"Cancellation requires support at this stage",requestId:req.id});
    await db.$transaction([
      db.order.update({where:{id},data:{status:OrderStatus.CANCELLED,cancellationReason:b.reason}}),
      db.orderStatusHistory.create({data:{orderId:id,fromStatus:order.status,toStatus:OrderStatus.CANCELLED,actorUserId:u.id,note:b.reason}})
    ]);
    return {ok:true};
  });

  app.post("/orders/:id/transition",async(req,reply)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","DELIVERY_PARTNER","SUPPORT_AGENT","CITY_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({to:z.nativeEnum(OrderStatus),note:z.string().max(500).optional()}).parse(req.body);
    const order=await db.order.findUnique({where:{id}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});

    const privileged=u.roles.some(r=>["SUPER_ADMIN","SUPPORT_AGENT","CITY_MANAGER"].includes(r));
    if(!privileged){
      const restaurantRole=u.roles.some(r=>["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF"].includes(r));
      const riderRole=u.roles.includes("DELIVERY_PARTNER");
      if(restaurantRole){
        const owns=!!(await db.restaurantOwner.findFirst({where:{restaurantId:order.restaurantId,userId:u.id}}))||
          !!(await db.restaurantStaff.findFirst({where:{restaurantId:order.restaurantId,userId:u.id,active:true}}));
        const restaurantTargets=["RESTAURANT_CONFIRMED","PREPARING","READY_FOR_PICKUP","CANCELLED"];
        if(!owns||!restaurantTargets.includes(b.to)) return reply.code(403).send({code:"FORBIDDEN",message:"Restaurant cannot update this order",requestId:req.id});
      }else if(riderRole){
        const assigned=await db.deliveryAssignment.findFirst({where:{orderId:id,partner:{userId:u.id},status:{in:["ACCEPTED","PICKED_UP"]}}});
        const riderTargets=["DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT","PICKED_UP","ON_THE_WAY","ARRIVED_AT_CUSTOMER","DELIVERED"];
        if(!assigned||!riderTargets.includes(b.to)) return reply.code(403).send({code:"FORBIDDEN",message:"Delivery partner cannot update this order",requestId:req.id});
      }else return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    }

    assertTransition(order.status as any,b.to as any);
    await db.$transaction(async tx=>{
      await tx.order.update({where:{id},data:{status:b.to}});
      await tx.orderStatusHistory.create({data:{orderId:id,fromStatus:order.status,toStatus:b.to,actorUserId:u.id,note:b.note}});
      if(b.to===OrderStatus.PICKED_UP){
        await tx.deliveryAssignment.updateMany({where:{orderId:id,status:"ACCEPTED"},data:{status:"PICKED_UP",pickedUpAt:new Date()}});
      }
      if(b.to===OrderStatus.DELIVERED){
        const assignment=await tx.deliveryAssignment.findFirst({where:{orderId:id,status:{in:["ACCEPTED","PICKED_UP"]}}});
        if(assignment){
          await tx.deliveryAssignment.update({where:{id:assignment.id},data:{status:"DELIVERED",deliveredAt:new Date()}});
          await tx.deliveryPartner.update({where:{id:assignment.deliveryPartnerId},data:{activeDeliveries:{decrement:1}}});
          await tx.deliveryEarning.create({data:{deliveryPartnerId:assignment.deliveryPartnerId,orderId:id,basePayPaise:order.deliveryFeePaise,totalPaise:order.deliveryFeePaise}});
        }
        await tx.restaurantSettlement.upsert({where:{orderId:id},update:{orderValuePaise:order.itemSubtotalPaise,payoutPaise:order.itemSubtotalPaise},create:{restaurantId:order.restaurantId,orderId:id,orderValuePaise:order.itemSubtotalPaise,payoutPaise:order.itemSubtotalPaise}});
      }
    });
    await publishOrder(id,{type:"ORDER_STATUS",orderId:id,status:b.to});
    const copy=orderStatusCopy(b.to);
    await notifyUser(order.userId,"ORDER_STATUS",copy.title,copy.body,{orderId:id,status:b.to});

    if(b.to===OrderStatus.RESTAURANT_CONFIRMED||b.to===OrderStatus.PREPARING||b.to===OrderStatus.READY_FOR_PICKUP){
      const already=await db.deliveryAssignment.count({where:{orderId:id,status:{in:["OFFERED","ACCEPTED","PICKED_UP"]}}});
      if(!already){
        const full=await db.order.findUnique({where:{id},include:{restaurant:true}});
        const riders=await db.deliveryPartner.findMany({
          where:{online:true,status:"APPROVED",activeDeliveries:{lt:2}},
          include:{locations:{orderBy:{createdAt:"desc"},take:1}}
        });
        const ranked=riders
          .map(r=>({r,d:r.locations[0]?haversineKm(Number(full!.restaurant.latitude),Number(full!.restaurant.longitude),Number(r.locations[0].latitude),Number(r.locations[0].longitude)):999}))
          .filter(x=>x.d<=8).sort((a,b)=>a.d-b.d).slice(0,5);
        if(ranked.length){
          await db.deliveryAssignment.createMany({data:ranked.map(x=>({orderId:id,deliveryPartnerId:x.r.id,status:"OFFERED"}))});
          await notifyDeliveryPartners(ranked.map(x=>x.r.id),"DELIVERY_OFFER","New delivery request","A nearby order is available for delivery.",{orderId:id});
        }
      }
    }
    return {ok:true,status:b.to};
  });
}
