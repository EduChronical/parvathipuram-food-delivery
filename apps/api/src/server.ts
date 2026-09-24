import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import rawBody from "fastify-raw-body";
import fastifyStatic from "@fastify/static";
import {existsSync} from "node:fs";
import path from "node:path";
import {Redis} from "ioredis";
import {z,ZodError} from "zod";
import {db} from "@ppm/database";
import {authRoutes} from "./auth.routes.js";
import {catalogRoutes} from "./catalog.routes.js";
import {cartRoutes} from "./cart.routes.js";
import {orderRoutes} from "./order.routes.js";
import {partnerRoutes} from "./partner.routes.js";
import {adminRoutes} from "./admin.routes.js";
import {supportRoutes} from "./support.routes.js";
import {paymentRoutes} from "./payment.routes.js";
import {accountRoutes} from "./account.routes.js";
import {registerSecurity,requireAuth} from "./security.js";
import {subscribeLocalOrder} from "./realtime.js";

const env=z.object({
  NODE_ENV:z.enum(["development","test","production"]).default("development"),
  PORT:z.coerce.number().default(4000),
  DATABASE_URL:z.string().min(1),
  JWT_SECRET:z.string().min(32),
  APP_ORIGIN:z.string().default("http://localhost:3000"),
  REDIS_URL:z.string().optional()
}).parse(process.env);

const app=Fastify({logger:true,trustProxy:true,bodyLimit:1024*1024});
await app.register(helmet,{contentSecurityPolicy:false});
await app.register(cors,{origin:env.NODE_ENV==="production"?env.APP_ORIGIN.split(","):true,credentials:true});
await app.register(rateLimit,{max:120,timeWindow:"1 minute"});
await app.register(jwt,{secret:env.JWT_SECRET});
await app.register(rawBody,{field:"rawBody",global:false,encoding:false,runFirst:true});
await registerSecurity(app);

app.setErrorHandler((err,req,reply)=>{
  if(err instanceof ZodError) return reply.code(400).send({code:"VALIDATION_ERROR",message:"Request validation failed",details:err.issues.map(i=>({path:i.path.join("."),message:i.message})),requestId:req.id});
  const status=(err as any).statusCode??500;
  req.log.error({err,requestId:req.id});
  return reply.code(status).send({code:(err as any).code??"INTERNAL_ERROR",message:status>=500?"Internal server error":(err instanceof Error?err.message:"Request failed"),requestId:req.id});
});

app.get("/health",async()=>{
  const dbStart=Date.now();
  await db.$queryRawUnsafe("SELECT 1");
  let redis="disabled";
  if(env.REDIS_URL){
    const r=new Redis(env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1});
    try{await r.connect();redis=await r.ping()}finally{r.disconnect()}
  }
  return {ok:true,database:{ok:true,latencyMs:Date.now()-dbStart},redis,node:process.version,time:new Date().toISOString()};
});

app.get("/me",async req=>{
  const u=await requireAuth(req);
  return db.user.findUnique({where:{id:u.id},include:{profile:true,roles:{include:{role:true}},wallet:true}});
});

app.get("/orders/:id/events",async(req,reply)=>{
  const u=await requireAuth(req);
  const id=(req.params as any).id as string;
  const order=await db.order.findUnique({where:{id}});
  if(!order||order.userId!==u.id) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
  reply.hijack();
  reply.raw.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});
  reply.raw.write("event: connected\ndata: {}\n\n");
  let cleanup=()=>{};
  if(env.REDIS_URL){
    const sub=new Redis(env.REDIS_URL);
    await sub.subscribe("order:"+id);
    sub.on("message",(_,message)=>reply.raw.write("event: order\ndata: "+message+"\n\n"));
    cleanup=()=>sub.disconnect();
  }else{
    cleanup=subscribeLocalOrder(id,message=>reply.raw.write("event: order\ndata: "+message+"\n\n"));
  }
  const heartbeat=setInterval(()=>reply.raw.write(": keepalive\n\n"),25000);
  req.raw.on("close",()=>{clearInterval(heartbeat);cleanup()});
});

await app.register(authRoutes);
await app.register(accountRoutes);
await app.register(catalogRoutes);
await app.register(cartRoutes);
await app.register(orderRoutes);
await app.register(partnerRoutes);
await app.register(adminRoutes);
await app.register(supportRoutes);
await app.register(paymentRoutes);

const customerOut=path.join(process.cwd(),"apps/customer-web/out");
if(existsSync(customerOut)){
  await app.register(fastifyStatic,{root:customerOut,prefix:"/",index:["index.html"]});
}

await app.listen({host:"0.0.0.0",port:env.PORT});
