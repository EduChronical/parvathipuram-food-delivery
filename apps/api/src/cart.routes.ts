import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db} from "@ppm/database";
import {requireAuth} from "./security.js";

async function cartView(userId:string,restaurantId:string){
  return db.cart.findUnique({
    where:{userId_restaurantId:{userId,restaurantId}},
    include:{restaurant:true,items:{include:{menuItem:true,variant:true,addons:{include:{addon:true}}}}}
  });
}

export async function cartRoutes(app:FastifyInstance){
  app.get("/carts/:restaurantId",async(req)=>{
    const u=await requireAuth(req);
    const {restaurantId}=z.object({restaurantId:z.string().uuid()}).parse(req.params);
    return (await cartView(u.id,restaurantId))??{restaurantId,items:[]};
  });

  app.put("/carts/:restaurantId/items",async(req,reply)=>{
    const u=await requireAuth(req);
    const {restaurantId}=z.object({restaurantId:z.string().uuid()}).parse(req.params);
    const b=z.object({
      menuItemId:z.string().uuid(),variantId:z.string().uuid().optional(),quantity:z.number().int().min(0).max(25),
      note:z.string().max(300).optional(),addonIds:z.array(z.string().uuid()).default([])
    }).parse(req.body);
    const item=await db.menuItem.findFirst({where:{id:b.menuItemId,restaurantId,available:true,archivedAt:null},include:{variants:true}});
    if(!item) return reply.code(409).send({code:"ITEM_UNAVAILABLE",message:"Item unavailable",requestId:req.id});
    if(b.variantId&&!item.variants.some(v=>v.id===b.variantId&&v.available)) return reply.code(409).send({code:"VARIANT_UNAVAILABLE",message:"Variant unavailable",requestId:req.id});
    const cart=await db.cart.upsert({where:{userId_restaurantId:{userId:u.id,restaurantId}},update:{},create:{userId:u.id,restaurantId}});
    const existing=await db.cartItem.findFirst({where:{cartId:cart.id,menuItemId:b.menuItemId,variantId:b.variantId??null}});
    if(b.quantity===0){
      if(existing) await db.cartItem.delete({where:{id:existing.id}});
      return cartView(u.id,restaurantId);
    }
    const ci=existing
      ? await db.cartItem.update({where:{id:existing.id},data:{quantity:b.quantity,note:b.note}})
      : await db.cartItem.create({data:{cartId:cart.id,menuItemId:b.menuItemId,variantId:b.variantId,quantity:b.quantity,note:b.note}});
    await db.cartItemAddon.deleteMany({where:{cartItemId:ci.id}});
    if(b.addonIds.length){
      const valid=await db.addon.findMany({where:{id:{in:b.addonIds},available:true}});
      if(valid.length!==new Set(b.addonIds).size) return reply.code(409).send({code:"ADDON_UNAVAILABLE",message:"One or more add-ons are unavailable",requestId:req.id});
      await db.cartItemAddon.createMany({data:valid.map(a=>({cartItemId:ci.id,addonId:a.id}))});
    }
    return cartView(u.id,restaurantId);
  });

  app.delete("/carts/:restaurantId",async(req)=>{
    const u=await requireAuth(req);
    const {restaurantId}=z.object({restaurantId:z.string().uuid()}).parse(req.params);
    await db.cart.deleteMany({where:{userId:u.id,restaurantId}});
    return {ok:true};
  });
}
