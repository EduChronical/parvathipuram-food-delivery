import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,Prisma,TicketStatus} from "@ppm/database";
import {requireAuth,requireRole} from "./security.js";

export async function supportRoutes(app:FastifyInstance){
  app.post("/reviews",async(req,reply)=>{
    const u=await requireAuth(req);
    const b=z.object({orderId:z.string().uuid(),restaurantRating:z.number().int().min(1).max(5),foodRating:z.number().int().min(1).max(5).optional(),deliveryRating:z.number().int().min(1).max(5).optional(),text:z.string().max(1500).optional()}).parse(req.body);
    const order=await db.order.findFirst({where:{id:b.orderId,userId:u.id,status:"DELIVERED"}});
    if(!order) return reply.code(409).send({code:"REVIEW_NOT_ELIGIBLE",message:"Only completed orders can be reviewed",requestId:req.id});
    try{
      return await db.$transaction(async tx=>{
        const review=await tx.review.create({data:{...b,userId:u.id,restaurantId:order.restaurantId}});
        const aggregate=await tx.review.aggregate({where:{restaurantId:order.restaurantId,status:"PUBLISHED"},_avg:{restaurantRating:true},_count:{restaurantRating:true}});
        await tx.restaurant.update({where:{id:order.restaurantId},data:{avgRating:aggregate._avg.restaurantRating??0,ratingCount:aggregate._count.restaurantRating}});
        return review;
      });
    }catch{
      return reply.code(409).send({code:"REVIEW_EXISTS",message:"This order was already reviewed",requestId:req.id});
    }
  });

  app.post("/support/tickets",async(req)=>{
    const u=await requireAuth(req);
    const b=z.object({orderId:z.string().uuid().optional(),category:z.string().min(2),subject:z.string().min(3),message:z.string().min(3)}).parse(req.body);
    const ticket=await db.supportTicket.create({data:{customerId:u.id,orderId:b.orderId,category:b.category,subject:b.subject,messages:{create:{authorUserId:u.id,body:b.message}}}});
    return ticket;
  });

  app.get("/support/tickets",async(req)=>{
    const u=await requireAuth(req);
    if(u.roles.some(r=>["SUPPORT_AGENT","SUPER_ADMIN"].includes(r))) return db.supportTicket.findMany({include:{messages:true,order:{include:{restaurant:true,payments:true,refunds:true}},customer:{include:{profile:true}}},orderBy:{createdAt:"desc"},take:100});
    return db.supportTicket.findMany({where:{customerId:u.id},include:{messages:{where:{internal:false}}},orderBy:{createdAt:"desc"}});
  });

  app.patch("/support/tickets/:id",async(req,reply)=>{
    const u=requireRole(req,["SUPPORT_AGENT","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({
      status:z.nativeEnum(TicketStatus).optional(),
      priority:z.enum(["LOW","NORMAL","HIGH","URGENT"]).optional(),
      assignedToUserId:z.string().uuid().nullable().optional(),
      assignToSelf:z.boolean().optional()
    }).parse(req.body);
    const ticket=await db.supportTicket.findUnique({where:{id}});
    if(!ticket) return reply.code(404).send({code:"TICKET_NOT_FOUND",message:"Ticket not found",requestId:req.id});
    const assignedToUserId=b.assignToSelf?u.id:b.assignedToUserId;
    const updated=await db.supportTicket.update({
      where:{id},
      data:{
        status:b.status,priority:b.priority,
        ...(assignedToUserId!==undefined?{assignedToUserId}: {})
      }
    });
    await db.auditLog.create({data:{
      actorUserId:u.id,action:"SUPPORT_TICKET_UPDATED",resourceType:"support_ticket",resourceId:id,
      oldValues:{status:ticket.status,priority:ticket.priority,assignedToUserId:ticket.assignedToUserId},
      newValues:{status:updated.status,priority:updated.priority,assignedToUserId:updated.assignedToUserId},requestId:req.id
    }});
    return updated;
  });

  app.post("/support/tickets/:id/messages",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({body:z.string().min(1),internal:z.boolean().default(false)}).parse(req.body);
    const ticket=await db.supportTicket.findUnique({where:{id}});
    if(!ticket) return reply.code(404).send({code:"TICKET_NOT_FOUND",message:"Ticket not found",requestId:req.id});
    const agent=u.roles.some(r=>["SUPPORT_AGENT","SUPER_ADMIN"].includes(r));
    if(ticket.customerId!==u.id&&!agent) return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    if(b.internal&&!agent) return reply.code(403).send({code:"FORBIDDEN",message:"Internal notes require support role",requestId:req.id});
    return db.supportMessage.create({data:{ticketId:id,authorUserId:u.id,body:b.body,internal:b.internal}});
  });

  app.get("/notifications",async(req)=>{
    const u=await requireAuth(req);
    return db.notification.findMany({where:{userId:u.id},orderBy:{createdAt:"desc"},take:100});
  });

  app.patch("/notifications/:id/read",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const changed=await db.notification.updateMany({where:{id,userId:u.id},data:{readAt:new Date()}});
    if(!changed.count) return reply.code(404).send({code:"NOTIFICATION_NOT_FOUND",message:"Notification not found",requestId:req.id});
    return {ok:true};
  });

  app.post("/notifications/read-all",async(req)=>{
    const u=await requireAuth(req);
    const result=await db.notification.updateMany({where:{userId:u.id,readAt:null},data:{readAt:new Date()}});
    return {ok:true,count:result.count};
  });

  app.post("/analytics",async(req,reply)=>{
    const u=req.authUser;
    const b=z.object({name:z.enum(["restaurant_view","dish_view","search","filter_used","add_to_cart","remove_from_cart","checkout_started","coupon_applied","payment_started","payment_success","payment_failure","order_created","order_delivered","order_cancelled","review_submitted"]),properties:z.record(z.unknown()).optional(),sessionId:z.string().optional()}).parse(req.body);
    await db.analyticsEvent.create({data:{userId:u?.id,sessionId:b.sessionId,name:b.name,properties:b.properties as Prisma.InputJsonValue|undefined}});
    return reply.code(202).send({ok:true});
  });
}
