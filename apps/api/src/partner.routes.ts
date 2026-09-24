import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,OrderStatus,AssignmentStatus,RestaurantStatus,DocumentStatus} from "@ppm/database";
import {haversineKm} from "@ppm/core";
import {requireRole} from "./security.js";
import {publishOrder} from "./realtime.js";

async function restaurantIdsFor(userId:string){
  const [owners,staff]=await Promise.all([
    db.restaurantOwner.findMany({where:{userId},select:{restaurantId:true}}),
    db.restaurantStaff.findMany({where:{userId,active:true},select:{restaurantId:true}})
  ]);
  return [...new Set([...owners,...staff].map(x=>x.restaurantId))];
}

export async function partnerRoutes(app:FastifyInstance){
  app.get("/partner/restaurants",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    if(u.roles.includes("SUPER_ADMIN")) return db.restaurant.findMany({take:100,orderBy:{createdAt:"desc"}});
    return db.restaurant.findMany({where:{id:{in:await restaurantIdsFor(u.id)}}});
  });

  app.get("/partner/orders",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const ids=u.roles.includes("SUPER_ADMIN")?undefined:await restaurantIdsFor(u.id);
    return db.order.findMany({where:{...(ids?{restaurantId:{in:ids}}:{}),status:{notIn:["DELIVERED","CANCELLED","REFUNDED"]}},include:{items:true},orderBy:{createdAt:"asc"},take:100});
  });

  app.patch("/partner/menu/:itemId",async(req,reply)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {itemId}=z.object({itemId:z.string().uuid()}).parse(req.params);
    const body=z.object({pricePaise:z.number().int().positive().optional(),available:z.boolean().optional(),stock:z.number().int().min(0).nullable().optional(),name:z.string().min(2).optional(),description:z.string().optional()}).parse(req.body);
    const item=await db.menuItem.findUnique({where:{id:itemId}});
    if(!item) return reply.code(404).send({code:"ITEM_NOT_FOUND",message:"Item not found",requestId:req.id});
    if(!u.roles.includes("SUPER_ADMIN")&&!(await restaurantIdsFor(u.id)).includes(item.restaurantId)) return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    return db.menuItem.update({where:{id:itemId},data:body});
  });

  app.post("/partner/restaurants/:id/pause",async(req,reply)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const body=z.object({paused:z.boolean()}).parse(req.body);
    if(!u.roles.includes("SUPER_ADMIN")&&!(await restaurantIdsFor(u.id)).includes(id)) return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    return db.restaurant.update({where:{id},data:{isPaused:body.paused}});
  });

  app.post("/delivery/online",async(req)=>{
    const u=requireRole(req,["DELIVERY_PARTNER"]);
    const b=z.object({online:z.boolean()}).parse(req.body);
    return db.deliveryPartner.update({where:{userId:u.id},data:{online:b.online}});
  });

  app.post("/delivery/location",async(req)=>{
    const u=requireRole(req,["DELIVERY_PARTNER"]);
    const b=z.object({latitude:z.number(),longitude:z.number(),accuracyM:z.number().optional()}).parse(req.body);
    const partner=await db.deliveryPartner.findUniqueOrThrow({where:{userId:u.id}});
    return db.deliveryLocation.create({data:{deliveryPartnerId:partner.id,...b}});
  });

  app.get("/delivery/offers",async(req)=>{
    const u=requireRole(req,["DELIVERY_PARTNER"]);
    const partner=await db.deliveryPartner.findUniqueOrThrow({where:{userId:u.id}});
    return db.deliveryAssignment.findMany({where:{deliveryPartnerId:partner.id,status:AssignmentStatus.OFFERED},include:{order:{include:{restaurant:true}}},orderBy:{offeredAt:"asc"}});
  });

  app.get("/delivery/current",async(req)=>{
    const u=requireRole(req,["DELIVERY_PARTNER"]);
    const partner=await db.deliveryPartner.findUniqueOrThrow({where:{userId:u.id}});
    return db.deliveryAssignment.findMany({
      where:{deliveryPartnerId:partner.id,status:{in:[AssignmentStatus.ACCEPTED,AssignmentStatus.PICKED_UP]}},
      include:{order:{include:{restaurant:true}}},
      orderBy:{respondedAt:"desc"}
    });
  });

  app.post("/delivery/assignments/:id/respond",async(req,reply)=>{
    const u=requireRole(req,["DELIVERY_PARTNER"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({accept:z.boolean()}).parse(req.body);
    const partner=await db.deliveryPartner.findUniqueOrThrow({where:{userId:u.id}});
    const assignment=await db.deliveryAssignment.findFirst({where:{id,deliveryPartnerId:partner.id,status:AssignmentStatus.OFFERED}});
    if(!assignment) return reply.code(409).send({code:"OFFER_UNAVAILABLE",message:"Offer is no longer available",requestId:req.id});
    if(!b.accept){
      await db.deliveryAssignment.update({where:{id},data:{status:AssignmentStatus.REJECTED,respondedAt:new Date()}});
      return {ok:true,accepted:false};
    }
    try{
      const accepted=await db.$transaction(async tx=>{
        const competing=await tx.deliveryAssignment.count({where:{orderId:assignment.orderId,status:AssignmentStatus.ACCEPTED}});
        if(competing) throw Object.assign(new Error("Already assigned"),{statusCode:409,code:"ORDER_ALREADY_ASSIGNED"});
        await tx.deliveryAssignment.update({where:{id},data:{status:AssignmentStatus.ACCEPTED,respondedAt:new Date()}});
        await tx.deliveryAssignment.updateMany({where:{orderId:assignment.orderId,id:{not:id},status:AssignmentStatus.OFFERED},data:{status:AssignmentStatus.EXPIRED}});
        await tx.deliveryPartner.update({where:{id:partner.id},data:{activeDeliveries:{increment:1}}});
        const order=await tx.order.findUniqueOrThrow({where:{id:assignment.orderId}});
        if(["RESTAURANT_CONFIRMED","PREPARING","READY_FOR_PICKUP"].includes(order.status)){
          await tx.order.update({where:{id:order.id},data:{status:OrderStatus.DELIVERY_PARTNER_ASSIGNED}});
          await tx.orderStatusHistory.create({data:{orderId:order.id,fromStatus:order.status,toStatus:OrderStatus.DELIVERY_PARTNER_ASSIGNED,actorUserId:u.id}});
        }
        return order;
      },{isolationLevel:"Serializable"});
      await publishOrder(assignment.orderId,{type:"RIDER_ASSIGNED",orderId:assignment.orderId});
      return {ok:true,accepted:true,orderId:accepted.id};
    }catch(e:any){
      return reply.code(e.statusCode??409).send({code:e.code??"ASSIGNMENT_CONFLICT",message:e.message,requestId:req.id});
    }
  });

  app.post("/delivery/dispatch/:orderId",async(req,reply)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    const {orderId}=z.object({orderId:z.string().uuid()}).parse(req.params);
    const order=await db.order.findUnique({where:{id:orderId},include:{restaurant:true}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    const riders=await db.deliveryPartner.findMany({where:{online:true,status:DocumentStatus.APPROVED,activeDeliveries:{lt:2}},include:{locations:{orderBy:{createdAt:"desc"},take:1}}});
    const ranked=riders.map(r=>({r,d:r.locations[0]?haversineKm(Number(order.restaurant.latitude),Number(order.restaurant.longitude),Number(r.locations[0].latitude),Number(r.locations[0].longitude)):999})).filter(x=>x.d<=8).sort((a,b)=>a.d-b.d).slice(0,5);
    if(!ranked.length) return reply.code(409).send({code:"NO_RIDERS_AVAILABLE",message:"No riders available",requestId:req.id});
    await db.deliveryAssignment.createMany({data:ranked.map(x=>({orderId,deliveryPartnerId:x.r.id,status:AssignmentStatus.OFFERED}))});
    return {offers:ranked.length};
  });

  app.post("/onboarding/restaurant",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","CUSTOMER"]);
    const b=z.object({cityId:z.string().uuid(),name:z.string().min(2),phone:z.string().min(8),email:z.string().email().optional(),address:z.string().min(5),latitude:z.number(),longitude:z.number()}).parse(req.body);
    const slug=b.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now().toString(36);
    const r=await db.restaurant.create({data:{...b,slug,status:RestaurantStatus.SUBMITTED,owners:{create:{userId:u.id,isPrimary:true}}}});
    return {id:r.id,status:r.status};
  });

  app.post("/onboarding/delivery",async(req)=>{
    const u=requireRole(req,["CUSTOMER","DELIVERY_PARTNER"]);
    const b=z.object({vehicleType:z.string(),vehicleNumber:z.string().min(4)}).parse(req.body);
    const partner=await db.deliveryPartner.upsert({where:{userId:u.id},update:{...b,status:DocumentStatus.PENDING},create:{userId:u.id,...b,status:DocumentStatus.PENDING}});
    return {id:partner.id,status:partner.status};
  });
}
