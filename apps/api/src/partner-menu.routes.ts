import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,RoleCode} from "@ppm/database";
import {requireRole} from "./security.js";

async function assertRestaurantAccess(userId:string,roles:string[],restaurantId:string){
  if(roles.includes("SUPER_ADMIN")) return;
  const [owner,staff]=await Promise.all([
    db.restaurantOwner.findFirst({where:{restaurantId,userId}}),
    db.restaurantStaff.findFirst({where:{restaurantId,userId,active:true}})
  ]);
  if(!owner&&!staff) throw Object.assign(new Error("Restaurant access denied"),{statusCode:403,code:"FORBIDDEN"});
}
async function assertManagerAccess(userId:string,roles:string[],restaurantId:string){
  if(roles.includes("SUPER_ADMIN")) return;
  const [owner,staff]=await Promise.all([
    db.restaurantOwner.findFirst({where:{restaurantId,userId}}),
    db.restaurantStaff.findFirst({where:{restaurantId,userId,active:true,role:{in:[RoleCode.RESTAURANT_MANAGER]}}})
  ]);
  if(!owner&&!staff) throw Object.assign(new Error("Restaurant manager access required"),{statusCode:403,code:"FORBIDDEN"});
}

export async function partnerMenuRoutes(app:FastifyInstance){
  app.get("/partner/restaurants/:id/menu",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertRestaurantAccess(u.id,u.roles,id);
    return db.restaurant.findUniqueOrThrow({
      where:{id},
      include:{
        hours:{orderBy:[{weekday:"asc"},{shift:"asc"}]},
        categories:{orderBy:{sortOrder:"asc"},include:{
          items:{where:{archivedAt:null},orderBy:{name:"asc"},include:{
            variants:{orderBy:{name:"asc"}},
            addonLinks:{include:{group:{include:{addons:{orderBy:{name:"asc"}}}}}}
          }}
        }},
        promotions:{orderBy:{startsAt:"desc"},take:50}
      }
    });
  });

  app.post("/partner/restaurants/:id/categories",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertManagerAccess(u.id,u.roles,id);
    const b=z.object({name:z.string().min(2).max(100),sortOrder:z.number().int().min(0).default(0)}).parse(req.body);
    return db.menuCategory.create({data:{restaurantId:id,...b}});
  });

  app.patch("/partner/categories/:categoryId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {categoryId}=z.object({categoryId:z.string().uuid()}).parse(req.params);
    const category=await db.menuCategory.findUniqueOrThrow({where:{id:categoryId}});
    await assertManagerAccess(u.id,u.roles,category.restaurantId);
    const b=z.object({name:z.string().min(2).max(100).optional(),sortOrder:z.number().int().min(0).optional(),active:z.boolean().optional()}).parse(req.body);
    return db.menuCategory.update({where:{id:categoryId},data:b});
  });

  app.post("/partner/restaurants/:id/items",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertRestaurantAccess(u.id,u.roles,id);
    const b=z.object({
      categoryId:z.string().uuid(),name:z.string().min(2).max(160),description:z.string().max(1000).optional(),
      imageUrl:z.string().url().optional(),pricePaise:z.number().int().positive(),discountedPricePaise:z.number().int().positive().nullable().optional(),
      veg:z.boolean().default(false),vegan:z.boolean().default(false),spicy:z.boolean().default(false),bestseller:z.boolean().default(false),
      available:z.boolean().default(true),stock:z.number().int().min(0).nullable().optional(),prepMinutes:z.number().int().min(1).max(240).optional()
    }).parse(req.body);
    const category=await db.menuCategory.findFirst({where:{id:b.categoryId,restaurantId:id}});
    if(!category) throw Object.assign(new Error("Category does not belong to restaurant"),{statusCode:400,code:"INVALID_CATEGORY"});
    return db.menuItem.create({data:{restaurantId:id,...b}});
  });

  app.patch("/partner/items/:itemId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {itemId}=z.object({itemId:z.string().uuid()}).parse(req.params);
    const item=await db.menuItem.findUniqueOrThrow({where:{id:itemId}});
    await assertRestaurantAccess(u.id,u.roles,item.restaurantId);
    const b=z.object({
      categoryId:z.string().uuid().optional(),name:z.string().min(2).max(160).optional(),description:z.string().max(1000).nullable().optional(),
      imageUrl:z.string().url().nullable().optional(),pricePaise:z.number().int().positive().optional(),discountedPricePaise:z.number().int().positive().nullable().optional(),
      veg:z.boolean().optional(),vegan:z.boolean().optional(),spicy:z.boolean().optional(),bestseller:z.boolean().optional(),
      available:z.boolean().optional(),stock:z.number().int().min(0).nullable().optional(),prepMinutes:z.number().int().min(1).max(240).nullable().optional()
    }).parse(req.body);
    if(b.categoryId){
      const category=await db.menuCategory.findFirst({where:{id:b.categoryId,restaurantId:item.restaurantId}});
      if(!category) throw Object.assign(new Error("Category does not belong to restaurant"),{statusCode:400,code:"INVALID_CATEGORY"});
    }
    return db.menuItem.update({where:{id:itemId},data:b});
  });

  app.delete("/partner/items/:itemId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {itemId}=z.object({itemId:z.string().uuid()}).parse(req.params);
    const item=await db.menuItem.findUniqueOrThrow({where:{id:itemId}});
    await assertManagerAccess(u.id,u.roles,item.restaurantId);
    return db.menuItem.update({where:{id:itemId},data:{archivedAt:new Date(),available:false}});
  });

  app.post("/partner/items/:itemId/variants",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {itemId}=z.object({itemId:z.string().uuid()}).parse(req.params);
    const item=await db.menuItem.findUniqueOrThrow({where:{id:itemId}});
    await assertRestaurantAccess(u.id,u.roles,item.restaurantId);
    const b=z.object({name:z.string().min(1).max(100),priceDeltaPaise:z.number().int().default(0),available:z.boolean().default(true)}).parse(req.body);
    return db.menuItemVariant.create({data:{menuItemId:itemId,...b}});
  });

  app.patch("/partner/variants/:variantId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {variantId}=z.object({variantId:z.string().uuid()}).parse(req.params);
    const variant=await db.menuItemVariant.findUniqueOrThrow({where:{id:variantId},include:{item:true}});
    await assertRestaurantAccess(u.id,u.roles,variant.item.restaurantId);
    const b=z.object({name:z.string().min(1).max(100).optional(),priceDeltaPaise:z.number().int().optional(),available:z.boolean().optional()}).parse(req.body);
    return db.menuItemVariant.update({where:{id:variantId},data:b});
  });

  app.delete("/partner/variants/:variantId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {variantId}=z.object({variantId:z.string().uuid()}).parse(req.params);
    const variant=await db.menuItemVariant.findUniqueOrThrow({where:{id:variantId},include:{item:true}});
    await assertManagerAccess(u.id,u.roles,variant.item.restaurantId);
    await db.menuItemVariant.delete({where:{id:variantId}});
    return {ok:true};
  });

  app.post("/partner/restaurants/:id/addon-groups",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertManagerAccess(u.id,u.roles,id);
    const b=z.object({name:z.string().min(1).max(100),minSelect:z.number().int().min(0).default(0),maxSelect:z.number().int().min(1).max(20).default(1),required:z.boolean().default(false)}).parse(req.body);
    if(b.minSelect>b.maxSelect) throw Object.assign(new Error("Minimum selection cannot exceed maximum"),{statusCode:400,code:"INVALID_ADDON_LIMIT"});
    return db.addonGroup.create({data:{restaurantId:id,...b}});
  });

  app.post("/partner/addon-groups/:groupId/addons",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","RESTAURANT_STAFF","SUPER_ADMIN"]);
    const {groupId}=z.object({groupId:z.string().uuid()}).parse(req.params);
    const group=await db.addonGroup.findUniqueOrThrow({where:{id:groupId}});
    await assertRestaurantAccess(u.id,u.roles,group.restaurantId);
    const b=z.object({name:z.string().min(1).max(100),pricePaise:z.number().int().min(0),available:z.boolean().default(true)}).parse(req.body);
    return db.addon.create({data:{groupId,...b}});
  });

  app.post("/partner/items/:itemId/addon-groups/:groupId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {itemId,groupId}=z.object({itemId:z.string().uuid(),groupId:z.string().uuid()}).parse(req.params);
    const [item,group]=await Promise.all([db.menuItem.findUniqueOrThrow({where:{id:itemId}}),db.addonGroup.findUniqueOrThrow({where:{id:groupId}})]);
    if(item.restaurantId!==group.restaurantId) throw Object.assign(new Error("Item and add-on group belong to different restaurants"),{statusCode:400,code:"ADDON_RESTAURANT_MISMATCH"});
    await assertManagerAccess(u.id,u.roles,item.restaurantId);
    return db.itemAddon.upsert({where:{itemId_groupId:{itemId,groupId}},update:{},create:{itemId,groupId}});
  });

  app.delete("/partner/items/:itemId/addon-groups/:groupId",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {itemId,groupId}=z.object({itemId:z.string().uuid(),groupId:z.string().uuid()}).parse(req.params);
    const item=await db.menuItem.findUniqueOrThrow({where:{id:itemId}});
    await assertManagerAccess(u.id,u.roles,item.restaurantId);
    await db.itemAddon.deleteMany({where:{itemId,groupId}});
    return {ok:true};
  });

  app.put("/partner/restaurants/:id/hours",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertManagerAccess(u.id,u.roles,id);
    const b=z.object({hours:z.array(z.object({
      weekday:z.number().int().min(0).max(6),shift:z.number().int().min(1).max(5).default(1),
      opensAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),closesAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),closed:z.boolean().default(false)
    })).max(35)}).parse(req.body);
    return db.$transaction(async tx=>{
      await tx.restaurantHour.deleteMany({where:{restaurantId:id}});
      if(b.hours.length) await tx.restaurantHour.createMany({data:b.hours.map(h=>({restaurantId:id,...h}))});
      return tx.restaurantHour.findMany({where:{restaurantId:id},orderBy:[{weekday:"asc"},{shift:"asc"}]});
    });
  });

  app.patch("/partner/restaurants/:id/settings",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertManagerAccess(u.id,u.roles,id);
    const b=z.object({
      isOpen:z.boolean().optional(),isPaused:z.boolean().optional(),vegOnly:z.boolean().optional(),
      prepMinutes:z.number().int().min(1).max(240).optional(),minOrderPaise:z.number().int().min(0).optional(),
      avgCostForTwoPaise:z.number().int().min(0).optional(),deliveryRadiusKm:z.number().positive().max(100).optional(),
      description:z.string().max(2000).nullable().optional(),logoUrl:z.string().url().nullable().optional(),coverUrl:z.string().url().nullable().optional()
    }).parse(req.body);
    return db.restaurant.update({where:{id},data:b});
  });

  app.post("/partner/restaurants/:id/promotions",async(req)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertManagerAccess(u.id,u.roles,id);
    const b=z.object({
      title:z.string().min(2).max(160),description:z.string().max(1000).optional(),imageUrl:z.string().url().optional(),
      kind:z.string().min(2).max(50),startsAt:z.coerce.date(),endsAt:z.coerce.date(),active:z.boolean().default(true)
    }).parse(req.body);
    if(b.endsAt<=b.startsAt) throw Object.assign(new Error("Promotion end must be after start"),{statusCode:400,code:"INVALID_PROMOTION_WINDOW"});
    return db.promotion.create({data:{restaurantId:id,...b}});
  });

  app.post("/partner/restaurants/:id/staff",async(req,reply)=>{
    const u=requireRole(req,["RESTAURANT_OWNER","RESTAURANT_MANAGER","SUPER_ADMIN"]);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await assertManagerAccess(u.id,u.roles,id);
    const b=z.object({email:z.string().email(),role:z.enum(["RESTAURANT_MANAGER","RESTAURANT_STAFF"])}).parse(req.body);
    const user=await db.user.findUnique({where:{email:b.email.toLowerCase()}});
    if(!user) return reply.code(404).send({code:"USER_NOT_FOUND",message:"Staff member must create a PPM Bites account first",requestId:req.id});
    const role=await db.role.findUniqueOrThrow({where:{code:b.role as RoleCode}});
    await db.$transaction([
      db.restaurantStaff.upsert({where:{restaurantId_userId:{restaurantId:id,userId:user.id}},update:{role:b.role as RoleCode,active:true},create:{restaurantId:id,userId:user.id,role:b.role as RoleCode}}),
      db.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:role.id}},update:{},create:{userId:user.id,roleId:role.id}})
    ]);
    return {ok:true,userId:user.id,role:b.role};
  });
}
