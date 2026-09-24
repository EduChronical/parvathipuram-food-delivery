import crypto from "node:crypto";
import argon2 from "argon2";
import type {FastifyInstance,FastifyRequest} from "fastify";
import {db} from "@ppm/database";
import type {RoleCode} from "@ppm/core";

export const sha256=(v:string)=>crypto.createHash("sha256").update(v).digest("hex");
export const randomToken=()=>crypto.randomBytes(48).toString("base64url");

export async function registerSecurity(app:FastifyInstance){
  app.decorateRequest("authUser",undefined);
  app.addHook("preHandler",async(req)=>{
    if(!req.headers.authorization?.startsWith("Bearer ")) return;
    try{
      const payload=await req.jwtVerify<{sub:string;roles:RoleCode[]}>();
      req.authUser={id:payload.sub,roles:payload.roles};
    }catch{}
  });
}

export async function issueTokens(app:FastifyInstance,userId:string,meta:{ip?:string;ua?:string;device?:string}={}){
  const user=await db.user.findUniqueOrThrow({
    where:{id:userId},
    include:{roles:{include:{role:true}}}
  });
  const roles=user.roles.map(r=>r.role.code) as RoleCode[];
  const accessToken=app.jwt.sign({sub:user.id,roles},{expiresIn:"15m"});
  const refreshToken=randomToken();
  await db.session.create({data:{
    userId:user.id,refreshTokenHash:await argon2.hash(refreshToken),
    ipAddress:meta.ip,userAgent:meta.ua,deviceName:meta.device,
    expiresAt:new Date(Date.now()+30*24*60*60*1000)
  }});
  return {accessToken,refreshToken,user:{id:user.id,email:user.email,phone:user.phone,roles}};
}

export async function requireAuth(req:FastifyRequest){
  if(!req.authUser) throw Object.assign(new Error("Authentication required"),{statusCode:401,code:"AUTH_REQUIRED"});
  return req.authUser;
}
export function requireRole(req:FastifyRequest, allowed:RoleCode[]){
  const u=req.authUser;
  if(!u) throw Object.assign(new Error("Authentication required"),{statusCode:401,code:"AUTH_REQUIRED"});
  if(!u.roles.some(r=>allowed.includes(r))) throw Object.assign(new Error("Forbidden"),{statusCode:403,code:"FORBIDDEN"});
  return u;
}
