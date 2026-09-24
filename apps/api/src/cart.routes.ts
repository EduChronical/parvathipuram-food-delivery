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
    const item=await db.menuItem.findFirst({
      where:{id:b.menuItemId,restaurantId,available:true,archivedAt:null},
      include:{variants:true,addonLinks:{include:{group:{include:{addons:true}}}}}
    });
    if(!item) return reply.code(409).send({code:"ITEM_UNAVAILABLE",message:"Item unavailable",requestId:req.id});
    if(item.stock!==null&&b.quantity>item.stock) return reply.code(409).send({code:"ITEM_STOCK_CHANGED",message:"Requested quantity exceeds available stock",requestId:req.id});
    if(item.variants.some(v=>v.available)&&!b.variantId) return reply.code(409).send({code:"VARIANT_REQUIRED",message:"Choose a variant",requestId:req.id});
    if(b.variantId&&!item.variants.some(v=>v.id===b.variantId&&v.available)) return reply.code(409).send({code:"VARIANT_UNAVAILABLE",message:"Variant unavailable",requestId:req.id});

    const uniqueAddonIds=[...new Set(b.addonIds)];
    const allowed=new Map<string,{groupId:string;available:boolean}>();
    for(const link of item.addonLinks){
      for(const addon of link.group.addons) allowed.set(addon.id,{groupId:link.group.id,available:addon.available});
    }
    for(const addonId of uniqueAddonIds){
      const meta=allowed.get(addonId);
      if(!meta||!meta.available) return reply.code(409).send({code:"ADDON_UNAVAILABLE",message:"One or more add-ons are unavailable for this item",requestId:req.id});
    }
    for(const link of item.addonLinks){
      const count=uniqueAddonIds.filter(id=>allowed.get(id)?.groupId===link.group.id).length;
      if(count<link.group.minSelect||(link.group.required&&count===0)) return reply.code(409).send({code:"ADDON_MIN_REQUIRED",message:"Select the required options for "+link.group.name,requestId:req.id});
      if(count>link.group.maxSelect) return reply.code(409).send({code:"ADDON_MAX_EXCEEDED",message:"Too many selections for "+link.group.name,requestId:req.id});
    }

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
    if(uniqueAddonIds.length){
      await db.cartItemAddon.createMany({data:uniqueAddonIds.map(addonId=>({cartItemId:ci.id,addonId}))});
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
