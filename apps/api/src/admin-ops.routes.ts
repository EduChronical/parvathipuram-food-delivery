import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,OrderStatus,PaymentStatus,RestaurantStatus,DocumentStatus} from "@ppm/database";
import {requireRole} from "./security.js";

export async function adminOpsRoutes(app:FastifyInstance){
  app.get("/admin/orders",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER","SUPPORT_AGENT","FINANCE_ADMIN"]);
    const q=z.object({
      status:z.nativeEnum(OrderStatus).optional(),search:z.string().optional(),
      page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(50)
    }).parse(req.query);
    return db.order.findMany({
      where:{
        ...(q.status?{status:q.status}:{}),
        ...(q.search?{OR:[
          {orderNumber:{contains:q.search,mode:"insensitive"}},
          {restaurant:{name:{contains:q.search,mode:"insensitive"}}},
          {user:{profile:{name:{contains:q.search,mode:"insensitive"}}}}
        ]}:{})
      },
      include:{restaurant:true,user:{include:{profile:true}},payments:true,assignments:{include:{partner:{include:{user:{include:{profile:true}}}}}}},
      orderBy:{createdAt:"desc"},skip:(q.page-1)*q.limit,take:q.limit
    });
  });

  app.get("/admin/customers",async(req)=>{
    requireRole(req,["SUPER_ADMIN","SUPPORT_AGENT","CITY_MANAGER"]);
    const q=z.object({search:z.string().optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(req.query);
    return db.user.findMany({
      where:{
        roles:{some:{role:{code:"CUSTOMER"}}},
        ...(q.search?{OR:[
          {email:{contains:q.search,mode:"insensitive"}},
          {phone:{contains:q.search}},
          {profile:{name:{contains:q.search,mode:"insensitive"}}}
        ]}:{})
      },
      select:{id:true,email:true,phone:true,status:true,createdAt:true,profile:true,wallet:true,_count:{select:{orders:true,reviews:true}}},
      orderBy:{createdAt:"desc"},take:q.limit
    });
  });

  app.patch("/admin/customers/:id/status",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","SUPPORT_AGENT"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({status:z.enum(["ACTIVE","SUSPENDED","REVIEW"]),reason:z.string().min(3).max(500)}).parse(req.body);
    const old=await db.user.findUniqueOrThrow({where:{id}});
    const updated=await db.user.update({where:{id},data:{status:b.status}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"USER_STATUS_CHANGED",resourceType:"user",resourceId:id,oldValues:{status:old.status},newValues:{status:b.status,reason:b.reason},requestId:req.id}});
    return updated;
  });

  app.get("/admin/restaurants",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER","CONTENT_ADMIN","FINANCE_ADMIN"]);
    const q=z.object({status:z.nativeEnum(RestaurantStatus).optional(),search:z.string().optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(req.query);
    return db.restaurant.findMany({
      where:{...(q.status?{status:q.status}:{}),...(q.search?{name:{contains:q.search,mode:"insensitive"}}:{})},
      include:{city:true,owners:{include:{user:{include:{profile:true}}}},_count:{select:{orders:true,menuItems:true,reviews:true}}},
      orderBy:{createdAt:"desc"},take:q.limit
    });
  });

  app.get("/admin/delivery-partners",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER","FINANCE_ADMIN"]);
    const q=z.object({status:z.nativeEnum(DocumentStatus).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(req.query);
    return db.deliveryPartner.findMany({
      where:q.status?{status:q.status}:{},
      include:{user:{include:{profile:true}},serviceZone:true,_count:{select:{assignments:true,earnings:true}}},
      orderBy:{user:{createdAt:"desc"}},take:q.limit
    });
  });

  app.get("/admin/payments",async(req)=>{
    requireRole(req,["SUPER_ADMIN","FINANCE_ADMIN","SUPPORT_AGENT"]);
    const q=z.object({status:z.nativeEnum(PaymentStatus).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(req.query);
    return db.payment.findMany({
      where:q.status?{status:q.status}:{},
      include:{order:{include:{restaurant:true,user:{include:{profile:true}}}},refunds:true},
      orderBy:{createdAt:"desc"},take:q.limit
    });
  });

  app.get("/admin/refunds",async(req)=>{
    requireRole(req,["SUPER_ADMIN","FINANCE_ADMIN","SUPPORT_AGENT"]);
    return db.refund.findMany({include:{order:{include:{restaurant:true}},payment:true},orderBy:{createdAt:"desc"},take:200});
  });

  app.get("/admin/reviews",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CONTENT_ADMIN","SUPPORT_AGENT"]);
    return db.review.findMany({include:{restaurant:true,user:{include:{profile:true}},order:true},orderBy:{createdAt:"desc"},take:200});
  });

  app.patch("/admin/reviews/:id/status",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CONTENT_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({status:z.enum(["PUBLISHED","PENDING","HIDDEN","REJECTED"]),reason:z.string().optional()}).parse(req.body);
    const old=await db.review.findUniqueOrThrow({where:{id}});
    const review=await db.review.update({where:{id},data:{status:b.status}});
    const aggregate=await db.review.aggregate({where:{restaurantId:old.restaurantId,status:"PUBLISHED"},_avg:{restaurantRating:true},_count:{restaurantRating:true}});
    await db.restaurant.update({where:{id:old.restaurantId},data:{avgRating:aggregate._avg.restaurantRating??0,ratingCount:aggregate._count.restaurantRating}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"REVIEW_MODERATED",resourceType:"review",resourceId:id,oldValues:{status:old.status},newValues:{status:b.status,reason:b.reason},requestId:req.id}});
    return review;
  });

  app.get("/admin/finance",async(req)=>{
    requireRole(req,["SUPER_ADMIN","FINANCE_ADMIN"]);
    const [restaurantSettlements,riderEarnings,payments,refunds]=await Promise.all([
      db.restaurantSettlement.findMany({include:{restaurant:true,order:true},orderBy:{createdAt:"desc"},take:200}),
      db.deliveryEarning.findMany({include:{partner:{include:{user:{include:{profile:true}}}}},orderBy:{createdAt:"desc"},take:200}),
      db.payment.aggregate({where:{status:PaymentStatus.CAPTURED},_sum:{amountPaise:true},_count:{id:true}}),
      db.refund.aggregate({_sum:{amountPaise:true},_count:{id:true}})
    ]);
    return {
      capturedPaymentsPaise:payments._sum.amountPaise??0,capturedPaymentCount:payments._count.id,
      refundsPaise:refunds._sum.amountPaise??0,refundCount:refunds._count.id,
      restaurantSettlements,riderEarnings
    };
  });

  app.get("/admin/cities",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    return db.city.findMany({include:{zones:true,_count:{select:{restaurants:true}}},orderBy:{name:"asc"}});
  });

  app.post("/admin/cities",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN"]);
    const b=z.object({name:z.string().min(2),state:z.string().min(2),country:z.string().min(2).default("India")}).parse(req.body);
    const city=await db.city.create({data:b});
    await db.auditLog.create({data:{actorUserId:u.id,action:"CITY_CREATED",resourceType:"city",resourceId:city.id,newValues:b,requestId:req.id}});
    return city;
  });

  app.post("/admin/cities/:cityId/zones",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    const {cityId}=z.object({cityId:z.string().uuid()}).parse(req.params);
    const b=z.object({name:z.string().min(2),centerLat:z.number(),centerLng:z.number(),radiusKm:z.number().positive().max(200)}).parse(req.body);
    const zone=await db.serviceZone.create({data:{cityId,...b}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"SERVICE_ZONE_CREATED",resourceType:"service_zone",resourceId:zone.id,newValues:b,requestId:req.id}});
    return zone;
  });

  app.patch("/admin/service-zones/:id",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({name:z.string().min(2).optional(),radiusKm:z.number().positive().max(200).optional(),active:z.boolean().optional(),geoBoundary:z.any().optional()}).parse(req.body);
    const zone=await db.serviceZone.update({where:{id},data:b});
    await db.auditLog.create({data:{actorUserId:u.id,action:"SERVICE_ZONE_CHANGED",resourceType:"service_zone",resourceId:id,newValues:b,requestId:req.id}});
    return zone;
  });

  app.get("/admin/settings",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER"]);
    const settings=await db.systemSetting.findMany({where:{sensitive:false},orderBy:{key:"asc"}});
    return settings;
  });

  app.put("/admin/settings/:key",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN"]);
    const {key}=z.object({key:z.string().min(2).max(100)}).parse(req.params);
    const b=z.object({value:z.unknown()}).parse(req.body);
    const setting=await db.systemSetting.upsert({where:{key},update:{value:b.value as any},create:{key,value:b.value as any,sensitive:false}});
    await db.auditLog.create({data:{actorUserId:u.id,action:"SYSTEM_SETTING_CHANGED",resourceType:"system_setting",resourceId:setting.id,newValues:{key,value:b.value as any},requestId:req.id}});
    return setting;
  });

  app.get("/admin/analytics/events",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CITY_MANAGER","CONTENT_ADMIN"]);
    const q=z.object({days:z.coerce.number().int().min(1).max(90).default(7)}).parse(req.query);
    const since=new Date(Date.now()-q.days*24*60*60*1000);
    const events=await db.analyticsEvent.groupBy({by:["name"],where:{createdAt:{gte:since}},_count:{name:true}});
    return {days:q.days,events:events.map(e=>({name:e.name,count:e._count.name}))};
  });

  app.get("/admin/promotions",async(req)=>{
    requireRole(req,["SUPER_ADMIN","CONTENT_ADMIN","CITY_MANAGER"]);
    return db.promotion.findMany({include:{restaurant:true},orderBy:{startsAt:"desc"},take:200});
  });

  app.post("/admin/promotions",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CONTENT_ADMIN"]);
    const b=z.object({
      restaurantId:z.string().uuid().optional(),title:z.string().min(2).max(160),description:z.string().max(1000).optional(),
      kind:z.string().min(2).max(50),startsAt:z.coerce.date(),endsAt:z.coerce.date(),active:z.boolean().default(true),sponsored:z.boolean().default(false)
    }).parse(req.body);
    const p=await db.promotion.create({data:b});
    await db.auditLog.create({data:{actorUserId:u.id,action:"PROMOTION_CREATED",resourceType:"promotion",resourceId:p.id,newValues:{title:b.title,kind:b.kind,sponsored:b.sponsored},requestId:req.id}});
    return p;
  });

  app.patch("/admin/promotions/:id",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CONTENT_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({title:z.string().min(2).optional(),description:z.string().nullable().optional(),active:z.boolean().optional(),sponsored:z.boolean().optional(),endsAt:z.coerce.date().optional()}).parse(req.body);
    const p=await db.promotion.update({where:{id},data:b});
    await db.auditLog.create({data:{actorUserId:u.id,action:"PROMOTION_CHANGED",resourceType:"promotion",resourceId:id,newValues:b as any,requestId:req.id}});
    return p;
  });

  app.post("/admin/notifications/in-app",async(req)=>{
    const u=requireRole(req,["SUPER_ADMIN","CONTENT_ADMIN","SUPPORT_AGENT"]);
    const b=z.object({
      userIds:z.array(z.string().uuid()).max(500).optional(),role:z.enum(["CUSTOMER","RESTAURANT_OWNER","DELIVERY_PARTNER"]).optional(),
      title:z.string().min(2).max(160),body:z.string().min(2).max(1000),type:z.string().min(2).max(80).default("CAMPAIGN")
    }).refine(x=>!!x.userIds?.length||!!x.role,{message:"userIds or role is required"}).parse(req.body);
    let ids=b.userIds??[];
    if(b.role){
      const users=await db.userRole.findMany({where:{role:{code:b.role}},select:{userId:true}});
      ids=[...new Set([...ids,...users.map(x=>x.userId)])];
    }
    if(ids.length) await db.notification.createMany({data:ids.map(userId=>({userId,channel:"IN_APP",type:b.type,title:b.title,body:b.body,sentAt:new Date()}))});
    await db.auditLog.create({data:{actorUserId:u.id,action:"IN_APP_CAMPAIGN_SENT",resourceType:"notification_campaign",newValues:{audience:ids.length,title:b.title,type:b.type},requestId:req.id}});
    return {ok:true,recipients:ids.length};
  });
}
