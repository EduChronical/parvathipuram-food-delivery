import argon2 from "argon2";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,RoleCode} from "@ppm/database";
import {issueTokens,requireAuth,otpHash,splitRefreshToken} from "./security.js";
import {smsProvider,emailProvider} from "./providers.js";

const loginSchema=z.object({identifier:z.string().min(3),password:z.string().min(8)});
const otpRequestSchema=z.object({destination:z.string().min(8),purpose:z.enum(["SIGNUP","LOGIN","RESET_PASSWORD","CHANGE_PHONE"])});
const otpVerifySchema=z.object({destination:z.string().min(8),purpose:z.enum(["SIGNUP","LOGIN","RESET_PASSWORD","CHANGE_PHONE"]),code:z.string().length(6),name:z.string().min(2).optional()});

export async function authRoutes(app:FastifyInstance){
  app.post("/auth/register",{config:{rateLimit:{max:5,timeWindow:"10 minutes"}}},async(req,reply)=>{
    const body=z.object({name:z.string().min(2).max(120),email:z.string().email(),password:z.string().min(10).max(128)}).parse(req.body);
    const exists=await db.user.findUnique({where:{email:body.email.toLowerCase()}});
    if(exists) return reply.code(409).send({code:"ACCOUNT_EXISTS",message:"An account already exists for this email",requestId:req.id});
    const role=await db.role.findUniqueOrThrow({where:{code:RoleCode.CUSTOMER}});
    const user=await db.user.create({data:{
      email:body.email.toLowerCase(),passwordHash:await argon2.hash(body.password),
      profile:{create:{name:body.name}},wallet:{create:{}},roles:{create:{roleId:role.id}}
    }});
    const code=process.env.DEV_OTP_CODE??String(Math.floor(100000+Math.random()*900000));
    await db.otpChallenge.create({data:{userId:user.id,destination:user.email!,purpose:"SIGNUP",codeHash:otpHash(code),expiresAt:new Date(Date.now()+5*60*1000)}});
    await emailProvider().send(user.email!,"Verify your PPM Bites email","Your PPM Bites verification code is "+code+". It expires in 5 minutes.");
    return {ok:true,verificationRequired:true,developmentCode:process.env.NODE_ENV==="production"?undefined:code};
  });

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
    await db.otpChallenge.create({data:{destination:body.destination,purpose:body.purpose,codeHash:otpHash(code),expiresAt:new Date(Date.now()+5*60*1000)}});
    const text="Your PPM Bites verification code is "+code+". It expires in 5 minutes.";
    if(body.destination.includes("@")) await emailProvider().send(body.destination,"PPM Bites verification code",text);
    else await smsProvider().send(body.destination,text);
    return {ok:true,expiresInSeconds:300,developmentCode:process.env.NODE_ENV==="production"?undefined:code};
  });

  app.post("/auth/otp/verify",{config:{rateLimit:{max:10,timeWindow:"10 minutes"}}},async(req,reply)=>{
    const body=otpVerifySchema.parse(req.body);
    const challenge=await db.otpChallenge.findFirst({where:{destination:body.destination,purpose:body.purpose,consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
    if(!challenge || challenge.codeHash!==otpHash(body.code)){
      if(challenge) await db.otpChallenge.update({where:{id:challenge.id},data:{attempts:{increment:1}}});
      return reply.code(400).send({code:"OTP_INVALID",message:"Invalid or expired OTP",requestId:req.id});
    }
    await db.otpChallenge.update({where:{id:challenge.id},data:{consumedAt:new Date()}});
    const isEmail=body.destination.includes("@");
    let user=isEmail
      ? await db.user.findUnique({where:{email:body.destination.toLowerCase()}})
      : await db.user.findUnique({where:{phone:body.destination}});
    if(!user){
      const role=await db.role.findUniqueOrThrow({where:{code:RoleCode.CUSTOMER}});
      user=await db.user.create({data:{
        ...(isEmail?{email:body.destination.toLowerCase(),emailVerifiedAt:new Date()}:{phone:body.destination,phoneVerifiedAt:new Date()}),
        profile:{create:{name:body.name??"Customer"}},wallet:{create:{}},roles:{create:{roleId:role.id}}
      }});
    }else if(isEmail&&!user.emailVerifiedAt) user=await db.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date()}});
    else if(!isEmail&&!user.phoneVerifiedAt) user=await db.user.update({where:{id:user.id},data:{phoneVerifiedAt:new Date()}});
    return issueTokens(app,user.id,{ip:req.ip,ua:req.headers["user-agent"]});
  });

  app.post("/auth/refresh",async(req,reply)=>{
    const body=z.object({refreshToken:z.string().min(20)}).parse(req.body);
    const parsed=splitRefreshToken(body.refreshToken);
    if(!parsed) return reply.code(401).send({code:"INVALID_REFRESH_TOKEN",message:"Refresh token invalid",requestId:req.id});
    const session=await db.session.findUnique({where:{id:parsed.sessionId}});
    if(!session||session.revokedAt||session.expiresAt<=new Date()||!(await argon2.verify(session.refreshTokenHash,parsed.secret))){
      return reply.code(401).send({code:"INVALID_REFRESH_TOKEN",message:"Refresh token invalid",requestId:req.id});
    }
    await db.session.update({where:{id:session.id},data:{revokedAt:new Date()}});
    return issueTokens(app,session.userId,{ip:req.ip,ua:req.headers["user-agent"]});
  });

  app.post("/auth/logout",async(req)=>{
    const body=z.object({refreshToken:z.string().min(20)}).parse(req.body);
    const parsed=splitRefreshToken(body.refreshToken);
    if(parsed) await db.session.updateMany({where:{id:parsed.sessionId,revokedAt:null},data:{revokedAt:new Date()}});
    return {ok:true};
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
