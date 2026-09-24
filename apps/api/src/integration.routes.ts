import crypto from "node:crypto";
import path from "node:path";
import type {FastifyInstance} from "fastify";
import multipart from "@fastify/multipart";
import {z} from "zod";
import {db,DocumentStatus} from "@ppm/database";
import {putObject} from "./providers.js";
import {mapsProvider} from "./maps.js";
import {requireAuth,requireRole} from "./security.js";

const IMAGE_MIME=new Set(["image/jpeg","image/png","image/webp"]);
const DOC_MIME=new Set([...IMAGE_MIME,"application/pdf"]);
const MAX_FILE=5*1024*1024;

function storageReady(){
  return !!process.env.STORAGE_BUCKET&&!!process.env.STORAGE_ACCESS_KEY&&!!process.env.STORAGE_SECRET_KEY;
}
function extFor(filename:string,mime:string){
  const ext=path.extname(filename).toLowerCase();
  if(ext&&ext.length<=8) return ext;
  if(mime==="image/jpeg") return ".jpg";
  if(mime==="image/png") return ".png";
  if(mime==="image/webp") return ".webp";
  if(mime==="application/pdf") return ".pdf";
  return "";
}
async function readUpload(req:any,allowed:Set<string>){
  if(!storageReady()) throw Object.assign(new Error("Object storage is not configured"),{statusCode:503,code:"STORAGE_UNAVAILABLE"});
  const file=await req.file({limits:{fileSize:MAX_FILE,files:1}});
  if(!file) throw Object.assign(new Error("A file is required"),{statusCode:400,code:"FILE_REQUIRED"});
  if(!allowed.has(file.mimetype)) throw Object.assign(new Error("Unsupported file type"),{statusCode:415,code:"FILE_TYPE_UNSUPPORTED"});
  const body=await file.toBuffer();
  if(!body.length||body.length>MAX_FILE) throw Object.assign(new Error("File exceeds 5 MB limit"),{statusCode:413,code:"FILE_TOO_LARGE"});
  return {body,mimetype:file.mimetype,filename:file.filename};
}

export async function integrationRoutes(app:FastifyInstance){
  await app.register(multipart,{limits:{fileSize:MAX_FILE,files:1}});

  app.get("/maps/geocode",async(req,reply)=>{
    const q=z.object({q:z.string().min(3).max(300)}).parse(req.query);
    const provider=mapsProvider();
    if(!provider) return reply.code(503).send({code:"MAPS_UNAVAILABLE",message:"Map geocoding is not configured",requestId:req.id});
    return provider.geocode(q.q);
  });

  app.get("/maps/reverse",async(req,reply)=>{
    const q=z.object({lat:z.coerce.number().min(-90).max(90),lng:z.coerce.number().min(-180).max(180)}).parse(req.query);
    const provider=mapsProvider();
    if(!provider) return reply.code(503).send({code:"MAPS_UNAVAILABLE",message:"Map geocoding is not configured",requestId:req.id});
    return provider.reverse(q.lat,q.lng);
  });

  app.post("/me/profile/photo",async(req)=>{
    const u=await requireAuth(req);
    const file=await readUpload(req,IMAGE_MIME);
    const key="profiles/"+u.id+"/"+crypto.randomUUID()+extFor(file.filename,file.mimetype);
    const url=await putObject(key,file.body,file.mimetype);
    await db.profile.update({where:{userId:u.id},data:{photoUrl:url}});
    return {url};
  });

  app.post("/partner/restaurants/:id/images",async(req,reply)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN","CONTENT_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    if(!u.roles.some(r=>["SUPER_ADMIN","CONTENT_ADMIN"].includes(r))){
      const allowed=!!(await db.restaurantOwner.findFirst({where:{restaurantId:id,userId:u.id}}))
        ||!!(await db.restaurantStaff.findFirst({where:{restaurantId:id,userId:u.id,active:true}}));
      if(!allowed) return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    }
    const file=await readUpload(req,IMAGE_MIME);
    const key="restaurants/"+id+"/images/"+crypto.randomUUID()+extFor(file.filename,file.mimetype);
    const url=await putObject(key,file.body,file.mimetype);
    return db.restaurantImage.create({data:{restaurantId:id,url}});
  });

  app.post("/partner/restaurants/:id/documents",async(req,reply)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const type=z.string().min(2).max(80).parse((req.query as any).type);
    if(!u.roles.includes("SUPER_ADMIN")){
      const allowed=!!(await db.restaurantOwner.findFirst({where:{restaurantId:id,userId:u.id}}))
        ||!!(await db.restaurantStaff.findFirst({where:{restaurantId:id,userId:u.id,active:true}}));
      if(!allowed) return reply.code(403).send({code:"FORBIDDEN",message:"Forbidden",requestId:req.id});
    }
    const file=await readUpload(req,DOC_MIME);
    const key="restaurants/"+id+"/documents/"+crypto.randomUUID()+extFor(file.filename,file.mimetype);
    await putObject(key,file.body,file.mimetype);
    return db.restaurantDocument.create({data:{restaurantId:id,type,storageKey:key,status:DocumentStatus.PENDING}});
  });

  app.post("/delivery/documents",async(req)=>{
    const u=requireRole(req,["DELIVERY_PARTNER"]);
    const type=z.string().min(2).max(80).parse((req.query as any).type);
    const partner=await db.deliveryPartner.findUniqueOrThrow({where:{userId:u.id}});
    const file=await readUpload(req,DOC_MIME);
    const key="delivery/"+partner.id+"/documents/"+crypto.randomUUID()+extFor(file.filename,file.mimetype);
    await putObject(key,file.body,file.mimetype);
    return db.deliveryPartnerDocument.create({data:{deliveryPartnerId:partner.id,type,storageKey:key,status:DocumentStatus.PENDING}});
  });

  app.post("/reviews/:id/images",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const review=await db.review.findFirst({where:{id,userId:u.id}});
    if(!review) return reply.code(404).send({code:"REVIEW_NOT_FOUND",message:"Review not found",requestId:req.id});
    const file=await readUpload(req,IMAGE_MIME);
    const key="reviews/"+id+"/"+crypto.randomUUID()+extFor(file.filename,file.mimetype);
    const url=await putObject(key,file.body,file.mimetype);
    return db.reviewImage.create({data:{reviewId:id,url}});
  });
}
