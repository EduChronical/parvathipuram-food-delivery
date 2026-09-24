import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db} from "@ppm/database";
import {requireAuth,requireRole} from "./security.js";
import {integrationStatus} from "./integrations.js";

const subscriptionSchema=z.object({
  token:z.string().min(20).max(4096),
  platform:z.enum(["web","android","ios"]).default("web")
});

export async function pushRoutes(app:FastifyInstance){
  app.get("/push/subscriptions",async req=>{
    const u=await requireAuth(req);
    return db.pushSubscription.findMany({
      where:{userId:u.id},
      select:{id:true,platform:true,createdAt:true,updatedAt:true},
      orderBy:{updatedAt:"desc"}
    });
  });

  app.post("/push/subscriptions",async(req)=>{
    const u=await requireAuth(req);
    const body=subscriptionSchema.parse(req.body);
    return db.pushSubscription.upsert({
      where:{token:body.token},
      update:{userId:u.id,platform:body.platform,userAgent:req.headers["user-agent"]},
      create:{userId:u.id,token:body.token,platform:body.platform,userAgent:req.headers["user-agent"]}
    });
  });

  app.delete("/push/subscriptions",async(req)=>{
    const u=await requireAuth(req);
    const body=z.object({token:z.string().min(20).max(4096)}).parse(req.body);
    await db.pushSubscription.deleteMany({where:{userId:u.id,token:body.token}});
    return {ok:true};
  });

  app.get("/admin/integrations/status",async req=>{
    requireRole(req,["SUPER_ADMIN"]);
    return integrationStatus();
  });
}
