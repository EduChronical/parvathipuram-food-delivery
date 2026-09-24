import argon2 from "argon2";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db} from "@ppm/database";
import {requireAuth,sha256} from "./security.js";

export async function accountRoutes(app:FastifyInstance){
  app.post("/auth/forgot-password",{config:{rateLimit:{max:5,timeWindow:"15 minutes"}}},async(req)=>{
    const b=z.object({identifier:z.string().min(3)}).parse(req.body);
    const user=await db.user.findFirst({where:{OR:[{email:b.identifier},{phone:b.identifier}]}});
    if(user){
      const code=process.env.DEV_OTP_CODE??String(Math.floor(100000+Math.random()*900000));
      await db.otpChallenge.create({data:{userId:user.id,destination:b.identifier,purpose:"RESET_PASSWORD",codeHash:sha256(code),expiresAt:new Date(Date.now()+5*60*1000)}});
      if(process.env.NODE_ENV!=="production") return {ok:true,developmentCode:code};
    }
    return {ok:true};
  });

  app.post("/auth/reset-password",async(req,reply)=>{
    const b=z.object({identifier:z.string().min(3),code:z.string().length(6),newPassword:z.string().min(10)}).parse(req.body);
    const challenge=await db.otpChallenge.findFirst({where:{destination:b.identifier,purpose:"RESET_PASSWORD",consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
    if(!challenge||challenge.codeHash!==sha256(b.code)) return reply.code(400).send({code:"RESET_INVALID",message:"Invalid or expired reset code",requestId:req.id});
    const user=await db.user.findFirst({where:{OR:[{email:b.identifier},{phone:b.identifier}]}});
    if(!user) return reply.code(400).send({code:"RESET_INVALID",message:"Invalid or expired reset code",requestId:req.id});
    await db.$transaction([
      db.otpChallenge.update({where:{id:challenge.id},data:{consumedAt:new Date()}}),
      db.user.update({where:{id:user.id},data:{passwordHash:await argon2.hash(b.newPassword)}}),
      db.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}})
    ]);
    return {ok:true};
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
