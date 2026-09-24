import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,RestaurantStatus} from "@ppm/database";
import {haversineKm} from "@ppm/core";
import {requireAuth} from "./security.js";

export async function catalogRoutes(app:FastifyInstance){
  app.get("/restaurants",async(req)=>{
    const q=z.object({
      search:z.string().optional(),veg:z.coerce.boolean().optional(),open:z.coerce.boolean().optional(),
      minRating:z.coerce.number().min(0).max(5).optional(),maxCost:z.coerce.number().optional(),
      lat:z.coerce.number().optional(),lng:z.coerce.number().optional(),sort:z.enum(["relevance","rating","deliveryTime","costLow","costHigh","distance","popularity"]).optional(),
      page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)
    }).parse(req.query);
    const restaurants=await db.restaurant.findMany({
      where:{
        status:RestaurantStatus.APPROVED,isPaused:false,
        ...(q.open?{isOpen:true}:{}),
        ...(q.veg?{vegOnly:true}:{}),
        ...(q.minRating?{avgRating:{gte:q.minRating}}:{}),
        ...(q.maxCost?{avgCostForTwoPaise:{lte:Math.round(q.maxCost*100)} }:{}),
        ...(q.search?{OR:[
          {name:{contains:q.search,mode:"insensitive"}},
          {description:{contains:q.search,mode:"insensitive"}},
          {menuItems:{some:{name:{contains:q.search,mode:"insensitive"}}}},
          {cuisines:{some:{cuisine:{name:{contains:q.search,mode:"insensitive"}}}}}
        ]}:{})
      },
      include:{cuisines:{include:{cuisine:true}},menuItems:{where:{available:true,archivedAt:null},take:3}},
      skip:(q.page-1)*q.limit,take:q.limit
    });
    const enriched=restaurants.map(r=>{
      const distanceKm=q.lat!=null&&q.lng!=null?haversineKm(q.lat,q.lng,Number(r.latitude),Number(r.longitude)):null;
      return {...r,distanceKm,estimatedDeliveryMinutes:distanceKm==null?null:Math.ceil(r.prepMinutes+distanceKm*4.5+3)};
    });
    const sorted=[...enriched].sort((a,b)=>{
      if(q.sort==="rating") return Number(b.avgRating)-Number(a.avgRating);
      if(q.sort==="costLow") return a.avgCostForTwoPaise-b.avgCostForTwoPaise;
      if(q.sort==="costHigh") return b.avgCostForTwoPaise-a.avgCostForTwoPaise;
      if(q.sort==="distance") return (a.distanceKm??999)-(b.distanceKm??999);
      if(q.sort==="deliveryTime") return (a.estimatedDeliveryMinutes??999)-(b.estimatedDeliveryMinutes??999);
      if(q.sort==="popularity") return b.ratingCount-a.ratingCount;
      return 0;
    });
    return {items:sorted,page:q.page,limit:q.limit};
  });

  app.get("/restaurants/:slug",async(req,reply)=>{
    const {slug}=z.object({slug:z.string()}).parse(req.params);
    const restaurant=await db.restaurant.findFirst({
      where:{slug,status:RestaurantStatus.APPROVED},
      include:{
        cuisines:{include:{cuisine:true}},hours:true,images:true,
        categories:{where:{active:true},orderBy:{sortOrder:"asc"},include:{items:{
          where:{archivedAt:null},orderBy:{name:"asc"},
          include:{variants:true,addonLinks:{include:{group:{include:{addons:true}}}}}
        }}},
        reviews:{where:{status:"PUBLISHED"},orderBy:{createdAt:"desc"},take:20}
      }
    });
    if(!restaurant) return reply.code(404).send({code:"RESTAURANT_NOT_FOUND",message:"Restaurant not found",requestId:req.id});
    return restaurant;
  });

  app.get("/me/addresses",async(req)=>{
    const u=await requireAuth(req);
    return db.address.findMany({where:{userId:u.id},orderBy:[{isDefault:"desc"},{label:"asc"}]});
  });

  app.post("/me/addresses",async(req)=>{
    const u=await requireAuth(req);
    const b=z.object({
      label:z.string().min(1),line1:z.string().min(2),line2:z.string().optional(),locality:z.string().optional(),
      city:z.string().min(2),postalCode:z.string().optional(),landmark:z.string().optional(),
      deliveryInstructions:z.string().max(500).optional(),latitude:z.number(),longitude:z.number(),isDefault:z.boolean().default(false)
    }).parse(req.body);
    if(b.isDefault) await db.address.updateMany({where:{userId:u.id},data:{isDefault:false}});
    return db.address.create({data:{...b,userId:u.id}});
  });
}
