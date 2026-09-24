import argon2 from "argon2";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,RoleCode} from "@ppm/database";
import {issueTokens,requireAuth,sha256} from "./security.js";
import {smsProvider,emailProvider} from "./providers.js";

const loginSchema=z.object({identifier:z.string().min(3),password:z.string().min(8)});
const otpRequestSchema=z.object({destination:z.string().min(8),purpose:z.enum(["SIGNUP","LOGIN","RESET_PASSWORD","CHANGE_PHONE"])});
const otpVerifySchema=z.object({destination:z.string().min(8),purpose:z.enum(["SIGNUP","LOGIN","RESET_PASSWORD","CHANGE_PHONE"]),code:z.string().length(6),name:z.string().min(2).optional()});

export async function authRoutes(app:FastifyInstance){
  app.post("/auth/login",{config:{rateLimit:{max:10,timeWindow:"1 minute"}}},async(req,reply)=>{
    const body=loginSchema.parse(req.body);
    const user=await db.user.findFirst({where:{OR:[{email:body.identifier},{phone:body.identifier}]}});
    if(!user?.passwordHash || !(await argon2.verify(user.passwordHash,body.password))){
      return reply.code(401).send({code:"INVALID_CREDENTIALS",message:"Invalid credentials",requestId:req.id});
    }
    return issueTokens(app,user.id,{ip:req.ip,ua:req.headers["user-agent"]});
  });

  app.post("/auth/otp/request",{config:{rateLimit:{max:5,timeWindow:"10 minutes"}}},async(req)=>{
    const body=otpRequestSchema.parse(req.body);
    const code=process.env.DEV_OTP_CODE??String(Math.floor(100000+Math.random()*900000));
    await db.otpChallenge.create({data:{destination:body.destination,purpose:body.purpose,codeHash:sha256(code),expiresAt:new Date(Date.now()+5*60*1000)}});
    const text="Your PPM Bites verification code is "+code+". It expires in 5 minutes.";
    if(body.destination.includes("@")) await emailProvider().send(body.destination,"PPM Bites verification code",text);
    else await smsProvider().send(body.destination,text);
    return {ok:true,expiresInSeconds:300,developmentCode:process.env.NODE_ENV==="production"?undefined:code};
  });

  app.post("/auth/otp/verify",{config:{rateLimit:{max:10,timeWindow:"10 minutes"}}},async(req,reply)=>{
    const body=otpVerifySchema.parse(req.body);
    const challenge=await db.otpChallenge.findFirst({where:{destination:body.destination,purpose:body.purpose,consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
    if(!challenge || challenge.codeHash!==sha256(body.code)){
      if(challenge) await db.otpChallenge.update({where:{id:challenge.id},data:{attempts:{increment:1}}});
      return reply.code(400).send({code:"OTP_INVALID",message:"Invalid or expired OTP",requestId:req.id});
    }
    await db.otpChallenge.update({where:{id:challenge.id},data:{consumedAt:new Date()}});
    let user=await db.user.findFirst({where:{phone:body.destination}});
    if(!user){
      const role=await db.role.findUniqueOrThrow({where:{code:RoleCode.CUSTOMER}});
      user=await db.user.create({data:{phone:body.destination,phoneVerifiedAt:new Date(),profile:{create:{name:body.name??"Customer"}},wallet:{create:{}},roles:{create:{roleId:role.id}}}});
    }else if(!user.phoneVerifiedAt) user=await db.user.update({where:{id:user.id},data:{phoneVerifiedAt:new Date()}});
    return issueTokens(app,user.id,{ip:req.ip,ua:req.headers["user-agent"]});
  });

  app.post("/auth/refresh",async(req,reply)=>{
    const body=z.object({refreshToken:z.string().min(20)}).parse(req.body);
    const sessions=await db.session.findMany({where:{revokedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"},take:20});
    for(const session of sessions){
      if(await argon2.verify(session.refreshTokenHash,body.refreshToken)){
        await db.session.update({where:{id:session.id},data:{revokedAt:new Date()}});
        return issueTokens(app,session.userId,{ip:req.ip,ua:req.headers["user-agent"]});
      }
    }
    return reply.code(401).send({code:"INVALID_REFRESH_TOKEN",message:"Refresh token invalid",requestId:req.id});
  });

  app.post("/auth/logout-all",async(req)=>{
    const u=await requireAuth(req);
    await db.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});
    return {ok:true};
  });

  app.post("/auth/password",async(req)=>{
    const u=await requireAuth(req);
    const body=z.object({currentPassword:z.string().min(8),newPassword:z.string().min(10)}).parse(req.body);
    const user=await db.user.findUniqueOrThrow({where:{id:u.id}});
    if(!user.passwordHash || !(await argon2.verify(user.passwordHash,body.currentPassword))) throw Object.assign(new Error("Current password invalid"),{statusCode:400,code:"INVALID_PASSWORD"});
    await db.user.update({where:{id:u.id},data:{passwordHash:await argon2.hash(body.newPassword)}});
    await db.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});
    return {ok:true};
  });
}
