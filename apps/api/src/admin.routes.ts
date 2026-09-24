import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,RestaurantStatus,DocumentStatus,PaymentStatus} from "@ppm/database";
import {requireRole} from "./security.js";

export async function adminRoutes(app:FastifyInstance){
  app.get("/admin/kpis",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER","FINANCE_ADMIN","SUPPORT_AGENT"]);
    const since=new Date(Date.now()-24*60*60*1000);
    const [orders,customers,restaurants,riders,refunds]=await Promise.all([
      db.order.findMany({where:{createdAt:{gte:since}},select:{status:true,totalPaise:true,createdAt:true}}),
      db.user.count(),db.restaurant.count({where:{status:RestaurantStatus.APPROVED}}),
      db.deliveryPartner.count({where:{online:true,status:DocumentStatus.APPROVED}}),
      db.refund.aggregate({where:{createdAt:{gte:since}},_sum:{amountPaise:true}})
    ]);
    const successful=orders.filter(o=>o.status==="DELIVERED");
    return {
      window:"24h",gmvPaise:successful.reduce((s,o)=>s+o.totalPaise,0),totalOrders:orders.length,
      successfulOrders:successful.length,cancellations:orders.filter(o=>o.status==="CANCELLED").length,
      refundsPaise:refunds._sum.amountPaise??0,averageOrderValuePaise:successful.length?Math.round(successful.reduce((s,o)=>s+o.totalPaise,0)/successful.length):0,
      activeCustomers:customers,activeRestaurants:restaurants,activeRiders:riders
    };
  });

  app.get("/admin/restaurants/pending",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    return db.restaurant.findMany({where:{status:{in:[RestaurantStatus.SUBMITTED,RestaurantStatus.UNDER_REVIEW]}},orderBy:{createdAt:"asc"}});
  });

  app.patch("/admin/restaurants/:id/status",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({status:z.nativeEnum(RestaurantStatus),note:z.string().optional()}).parse(req.body);
    const old=await db.restaurant.findUniqueOrThrow({where:{id}});
    const updated=await db.restaurant.update({where:{id},data:{status:b.status}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"RESTAURANT_STATUS_CHANGED",resourceType:"restaurant",resourceId:id,oldValues:{status:old.status},newValues:{status:b.status,note:b.note},ipAddress:req.ip,userAgent:req.headers["user-agent"],requestId:req.id}});
    return updated;
  });

  app.get("/admin/delivery-partners/pending",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    return db.deliveryPartner.findMany({
      where:{status:DocumentStatus.PENDING},
      include:{user:{include:{profile:true}}},
      orderBy:{user:{createdAt:"asc"}}
    });
  });

  app.patch("/admin/delivery-partners/:id/status",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({status:z.nativeEnum(DocumentStatus)}).parse(req.body);
    const old=await db.deliveryPartner.findUniqueOrThrow({where:{id}});
    const updated=await db.deliveryPartner.update({where:{id},data:{status:b.status}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"DELIVERY_PARTNER_STATUS_CHANGED",resourceType:"delivery_partner",resourceId:id,oldValues:{status:old.status},newValues:{status:b.status},requestId:req.id}});
    return updated;
  });

  app.post("/admin/refunds",async(req,reply)=>{
    const u=requireRole(req,["SUPER_ADMIN","FINANCE_ADMIN","SUPPORT_AGENT"]);
    const b=z.object({orderId:z.string().uuid(),amountPaise:z.number().int().positive(),reason:z.string().min(3),idempotencyKey:z.string().min(8)}).parse(req.body);
    const existing=await db.refund.findUnique({where:{idempotencyKey:b.idempotencyKey}});
    if(existing) return existing;
    const order=await db.order.findUnique({where:{id:b.orderId},include:{payments:{where:{status:PaymentStatus.CAPTURED},take:1}}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    if(b.amountPaise>order.totalPaise) return reply.code(400).send({code:"REFUND_TOO_LARGE",message:"Refund exceeds order total",requestId:req.id});
    const refund=await db.refund.create({data:{orderId:b.orderId,paymentId:order.payments[0]?.id,amountPaise:b.amountPaise,reason:b.reason,initiatorUserId:u.id,idempotencyKey:b.idempotencyKey,status:PaymentStatus.REFUND_PENDING}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"REFUND_INITIATED",resourceType:"refund",resourceId:refund.id,newValues:{orderId:b.orderId,amountPaise:b.amountPaise,reason:b.reason},requestId:req.id}});
    return reply.code(201).send(refund);
  });

  app.get("/admin/audit",async(req)=>{
    requireRole(req,["SUPER_ADMIN"]);
    return db.auditLog.findMany({orderBy:{createdAt:"desc"},take:200});
  });

  app.get("/admin/feature-flags",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    return db.featureFlag.findMany({orderBy:{key:"asc"}});
  });

  app.patch("/admin/feature-flags/:key",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN"]);
    const {key}=z.object({key:z.string()}).parse(req.params);
    const b=z.object({enabled:z.boolean(),config:z.any().optional()}).parse(req.body);
    const flag=await db.featureFlag.upsert({where:{key},update:b,create:{key,...b}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"FEATURE_FLAG_CHANGED",resourceType:"feature_flag",resourceId:flag.id,newValues:{key,enabled:b.enabled,config:b.config},requestId:req.id}});
    return flag;
  });
}
