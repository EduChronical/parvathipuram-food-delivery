import argon2 from "argon2";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db} from "@ppm/database";
import {requireAuth,otpHash} from "./security.js";
import {smsProvider,emailProvider} from "./providers.js";
import {emailReady as emailConfigured,smsReady as smsConfigured} from "./integrations.js";

export async function accountRoutes(app:FastifyInstance){
  app.post("/auth/forgot-password",{config:{rateLimit:{max:5,timeWindow:"15 minutes"}}},async(req,reply)=>{
    const b=z.object({identifier:z.string().min(3)}).parse(req.body);
    const isEmail=b.identifier.includes("@");
    const deliveryReady=isEmail?emailConfigured():smsConfigured();
    if(!deliveryReady) return reply.code(503).send({code:"RECOVERY_UNAVAILABLE",message:"Password recovery delivery is temporarily unavailable.",requestId:req.id});
    const user=await db.user.findFirst({where:{OR:[{email:b.identifier},{phone:b.identifier}]}});
    if(user){
      const code=process.env.DEV_OTP_CODE??String(Math.floor(100000+Math.random()*900000));
      await db.otpChallenge.create({data:{userId:user.id,destination:b.identifier,purpose:"RESET_PASSWORD",codeHash:otpHash(code),expiresAt:new Date(Date.now()+5*60*1000)}});
      const text="Your PPM Bites password reset code is "+code+". It expires in 5 minutes.";
      if(b.identifier.includes("@")) await emailProvider().send(b.identifier,"PPM Bites password reset",text);
      else await smsProvider().send(b.identifier,text);
      if(process.env.NODE_ENV!=="production") return {ok:true,developmentCode:code};
    }
    return {ok:true};
  });

  app.post("/auth/reset-password",async(req,reply)=>{
    const b=z.object({identifier:z.string().min(3),code:z.string().length(6),newPassword:z.string().min(10)}).parse(req.body);
    const challenge=await db.otpChallenge.findFirst({where:{destination:b.identifier,purpose:"RESET_PASSWORD",consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
    if(!challenge||challenge.codeHash!==otpHash(b.code)) return reply.code(400).send({code:"RESET_INVALID",message:"Invalid or expired reset code",requestId:req.id});
    const user=await db.user.findFirst({where:{OR:[{email:b.identifier},{phone:b.identifier}]}});
    if(!user) return reply.code(400).send({code:"RESET_INVALID",message:"Invalid or expired reset code",requestId:req.id});
    await db.$transaction([
      db.otpChallenge.update({where:{id:challenge.id},data:{consumedAt:new Date()}}),
      db.user.update({where:{id:user.id},data:{passwordHash:await argon2.hash(b.newPassword)}}),
      db.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}})
    ]);
    return {ok:true};
  });

  app.patch("/me/profile",async(req)=>{
    const u=await requireAuth(req);
    const b=z.object({
      name:z.string().min(2).max(120).optional(),
      photoUrl:z.string().url().nullable().optional(),
      language:z.string().min(2).max(12).optional(),
      dietaryPreferences:z.record(z.unknown()).nullable().optional(),
      preferences:z.record(z.unknown()).nullable().optional()
    }).parse(req.body);
    return db.profile.upsert({
      where:{userId:u.id},
      update:b as any,
      create:{userId:u.id,name:b.name??"Customer",photoUrl:b.photoUrl??undefined,language:b.language??"en",dietaryPreferences:b.dietaryPreferences as any,preferences:b.preferences as any}
    });
  });

  app.patch("/me/addresses/:id",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const b=z.object({
      label:z.string().min(1).optional(),line1:z.string().min(2).optional(),line2:z.string().nullable().optional(),
      locality:z.string().nullable().optional(),city:z.string().min(2).optional(),postalCode:z.string().nullable().optional(),
      landmark:z.string().nullable().optional(),deliveryInstructions:z.string().max(500).nullable().optional(),
      latitude:z.number().optional(),longitude:z.number().optional(),isDefault:z.boolean().optional()
    }).parse(req.body);
    const address=await db.address.findFirst({where:{id,userId:u.id}});
    if(!address) return reply.code(404).send({code:"ADDRESS_NOT_FOUND",message:"Address not found",requestId:req.id});
    return db.$transaction(async tx=>{
      if(b.isDefault) await tx.address.updateMany({where:{userId:u.id,id:{not:id}},data:{isDefault:false}});
      return tx.address.update({where:{id},data:b as any});
    });
  });

  app.delete("/me/addresses/:id",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const address=await db.address.findFirst({where:{id,userId:u.id}});
    if(!address) return reply.code(404).send({code:"ADDRESS_NOT_FOUND",message:"Address not found",requestId:req.id});
    const referenced=await db.order.count({where:{addressId:id}});
    if(referenced) return reply.code(409).send({code:"ADDRESS_IN_USE",message:"This address is referenced by an order and cannot be deleted; edit it instead.",requestId:req.id});
    await db.address.delete({where:{id}});
    return {ok:true};
  });

  app.get("/me/sessions",async(req)=>{
    const u=await requireAuth(req);
    return db.session.findMany({where:{userId:u.id},select:{id:true,deviceName:true,ipAddress:true,userAgent:true,createdAt:true,expiresAt:true,revokedAt:true},orderBy:{createdAt:"desc"}});
  });

  app.delete("/me/sessions/:id",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const changed=await db.session.updateMany({where:{id,userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});
    if(!changed.count) return reply.code(404).send({code:"SESSION_NOT_FOUND",message:"Session not found",requestId:req.id});
    return {ok:true};
  });

  app.post("/me/change-phone/request",{config:{rateLimit:{max:5,timeWindow:"10 minutes"}}},async(req,reply)=>{
    const u=await requireAuth(req);
    const b=z.object({phone:z.string().min(8).max(20)}).parse(req.body);
    const existing=await db.user.findUnique({where:{phone:b.phone}});
    if(existing&&existing.id!==u.id) return reply.code(409).send({code:"PHONE_IN_USE",message:"Phone number already in use",requestId:req.id});
    const code=process.env.DEV_OTP_CODE??String(Math.floor(100000+Math.random()*900000));
    await db.otpChallenge.create({data:{userId:u.id,destination:b.phone,purpose:"CHANGE_PHONE",codeHash:otpHash(code),expiresAt:new Date(Date.now()+5*60*1000)}});
    await smsProvider().send(b.phone,"Your PPM Bites phone-change code is "+code+". It expires in 5 minutes.");
    return {ok:true,developmentCode:process.env.NODE_ENV==="production"?undefined:code};
  });

  app.post("/me/change-phone/verify",async(req,reply)=>{
    const u=await requireAuth(req);
    const b=z.object({phone:z.string().min(8).max(20),code:z.string().length(6)}).parse(req.body);
    const challenge=await db.otpChallenge.findFirst({where:{userId:u.id,destination:b.phone,purpose:"CHANGE_PHONE",consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
    if(!challenge||challenge.codeHash!==otpHash(b.code)) return reply.code(400).send({code:"OTP_INVALID",message:"Invalid or expired OTP",requestId:req.id});
    await db.$transaction([
      db.otpChallenge.update({where:{id:challenge.id},data:{consumedAt:new Date()}}),
      db.user.update({where:{id:u.id},data:{phone:b.phone,phoneVerifiedAt:new Date()}})
    ]);
    return {ok:true};
  });

  app.get("/me/notification-preferences",async(req)=>{
    const u=await requireAuth(req);
    return db.notificationPreference.upsert({
      where:{userId:u.id},update:{},create:{userId:u.id}
    });
  });

  app.patch("/me/notification-preferences",async(req)=>{
    const u=await requireAuth(req);
    const b=z.object({inApp:z.boolean().optional(),push:z.boolean().optional(),sms:z.boolean().optional(),email:z.boolean().optional(),promotions:z.boolean().optional()}).parse(req.body);
    return db.notificationPreference.upsert({where:{userId:u.id},update:b,create:{userId:u.id,...b}});
  });

  app.get("/me/export",async(req)=>{
    const u=await requireAuth(req);
    const user=await db.user.findUniqueOrThrow({
      where:{id:u.id},
      include:{
        profile:true,addresses:true,favorites:true,
        orders:{include:{items:true,history:true,payments:true,refunds:true}},
        reviews:true,notifications:true,supportTickets:{include:{messages:true}},wallet:{include:{transactions:true}}
      }
    });
    const {passwordHash,...safe}=user;
    return {exportedAt:new Date().toISOString(),data:safe};
  });

  app.delete("/me",async(req)=>{
    const u=await requireAuth(req);
    await db.$transaction(async tx=>{
      await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.user.update({where:{id:u.id},data:{
        status:"DELETION_REQUESTED",
        email:null,phone:null,passwordHash:null,
        profile:{update:{name:"Deleted user",photoUrl:null,preferences:{}}}
      }});
      await tx.auditLog.create({data:{actorUserId:u.id,action:"ACCOUNT_DELETION_REQUESTED",resourceType:"user",resourceId:u.id,requestId:req.id}});
    });
    return {ok:true,status:"DELETION_REQUESTED"};
  });
}
