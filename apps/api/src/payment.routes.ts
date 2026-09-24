import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,PaymentStatus,OrderStatus} from "@ppm/database";
import {paymentProvider} from "./providers.js";
import {requireAuth} from "./security.js";
import {publishOrder} from "./realtime.js";

export async function paymentRoutes(app:FastifyInstance){
  app.post("/payments/:orderId/create",async(req,reply)=>{
    const u=await requireAuth(req);
    const {orderId}=z.object({orderId:z.string().uuid()}).parse(req.params);
    const order=await db.order.findFirst({where:{id:orderId,userId:u.id},include:{payments:true}});
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    const payment=order.payments[0];
    if(!payment) return reply.code(409).send({code:"PAYMENT_NOT_FOUND",message:"Payment record missing",requestId:req.id});
    if(payment.status===PaymentStatus.CAPTURED) return {alreadyPaid:true};
    const provider=paymentProvider();
    const created=await provider.createPayment({orderId,amountPaise:order.totalPaise,currency:"INR"});
    await db.payment.update({where:{id:payment.id},data:{providerOrderId:created.providerOrderId,status:PaymentStatus.PENDING}});
    return created.checkout;
  });

  app.post("/payments/webhook",{config:{rawBody:true}},async(req,reply)=>{
    const raw=(req as any).rawBody?.toString("utf8")??JSON.stringify(req.body??{});
    const signature=String(req.headers["x-razorpay-signature"]??req.headers["x-payment-signature"]??"");
    const provider=paymentProvider();
    if(!provider.verifyWebhook(raw,signature)) return reply.code(401).send({code:"INVALID_WEBHOOK_SIGNATURE",message:"Invalid webhook signature",requestId:req.id});
    const body:any=req.body??{};
    const eventId=String(body.id??body.event_id??body.payload?.payment?.entity?.id??"");
    if(!eventId) return reply.code(400).send({code:"WEBHOOK_ID_REQUIRED",message:"Webhook id missing",requestId:req.id});
    const existing=await db.paymentAttempt.findUnique({where:{idempotencyKey:"webhook:"+eventId}});
    if(existing) return {ok:true,duplicate:true};

    const providerOrderId=body.payload?.payment?.entity?.order_id??body.providerOrderId;
    const providerPaymentId=body.payload?.payment?.entity?.id??body.providerPaymentId;
    const captured=body.event==="payment.captured"||body.status==="captured"||body.status==="CAPTURED";
    const failed=body.event==="payment.failed"||body.status==="failed"||body.status==="FAILED";
    const payment=providerOrderId?await db.payment.findFirst({where:{providerOrderId}}):null;
    if(!payment){
      await db.auditLog.create({data:{
        action:"PAYMENT_WEBHOOK_UNMATCHED",resourceType:"payment_webhook",resourceId:eventId,
        newValues:{providerOrderId,providerPaymentId,event:body.event??body.status},requestId:req.id
      }});
      return reply.code(202).send({ok:true,matched:false});
    }
    await db.$transaction(async tx=>{
      await tx.paymentAttempt.create({data:{paymentId:payment.id,idempotencyKey:"webhook:"+eventId,status:captured?"CAPTURED":failed?"FAILED":"IGNORED",providerResponse:body}});
      if(captured){
        await tx.payment.update({where:{id:payment.id},data:{providerPaymentId,status:PaymentStatus.CAPTURED}});
        const order=await tx.order.findUniqueOrThrow({where:{id:payment.orderId}});
        if(order.status===OrderStatus.PAYMENT_PENDING){
          await tx.order.update({where:{id:order.id},data:{paymentStatus:PaymentStatus.CAPTURED,status:OrderStatus.PLACED}});
          await tx.orderStatusHistory.create({data:{orderId:order.id,fromStatus:order.status,toStatus:OrderStatus.PLACED,note:"Payment captured"}});
        }
      }else if(failed){
        await tx.payment.update({where:{id:payment.id},data:{providerPaymentId,status:PaymentStatus.FAILED}});
        await tx.order.update({where:{id:payment.orderId},data:{paymentStatus:PaymentStatus.FAILED}});
      }
    });
    await publishOrder(payment.orderId,{type:captured?"PAYMENT_CAPTURED":"PAYMENT_UPDATED",orderId:payment.orderId});
    return {ok:true};
  });
}
