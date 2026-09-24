import {z} from "zod";
import type {FastifyInstance} from "fastify";
import {db,RestaurantStatus} from "@ppm/database";
import {requireAuth} from "./security.js";

function pdfText(value:unknown){
  return String(value??"")
    .replaceAll("\\","\\\\")
    .replaceAll("(","\\(")
    .replaceAll(")","\\)")
    .replace(/[^\x20-\x7E]/g,"?");
}
function simplePdf(lines:string[]){
  const text=["BT","/F1 10 Tf","48 792 Td"];
  for(let i=0;i<lines.length;i++){
    if(i>0) text.push("0 -14 Td");
    text.push("("+pdfText(lines[i])+") Tj");
  }
  text.push("ET");
  const stream=text.join("\n");
  const objects=[
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Length "+Buffer.byteLength(stream,"utf8")+" >>\nstream\n"+stream+"\nendstream\nendobj\n"
  ];
  let body="%PDF-1.4\n";
  const offsets=[0];
  for(const obj of objects){offsets.push(Buffer.byteLength(body,"utf8"));body+=obj}
  const xref=Buffer.byteLength(body,"utf8");
  body+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<=objects.length;i++) body+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  body+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return Buffer.from(body,"utf8");
}

export async function engagementRoutes(app:FastifyInstance){
  app.get("/favorites",async(req)=>{
    const u=await requireAuth(req);
    return db.favorite.findMany({
      where:{userId:u.id},
      include:{
        restaurant:{include:{cuisines:{include:{cuisine:true}}}},
        menuItem:{include:{restaurant:true}}
      },
      orderBy:{createdAt:"desc"}
    });
  });

  app.post("/favorites/restaurants/:id",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const restaurant=await db.restaurant.findFirst({where:{id,status:RestaurantStatus.APPROVED}});
    if(!restaurant) return reply.code(404).send({code:"RESTAURANT_NOT_FOUND",message:"Restaurant not found",requestId:req.id});
    const existing=await db.favorite.findFirst({where:{userId:u.id,restaurantId:id,menuItemId:null}});
    if(existing) return existing;
    return db.favorite.create({data:{userId:u.id,restaurantId:id}});
  });

  app.delete("/favorites/restaurants/:id",async(req)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await db.favorite.deleteMany({where:{userId:u.id,restaurantId:id,menuItemId:null}});
    return {ok:true};
  });

  app.post("/favorites/dishes/:id",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const item=await db.menuItem.findFirst({where:{id,available:true,archivedAt:null}});
    if(!item) return reply.code(404).send({code:"ITEM_NOT_FOUND",message:"Dish not found",requestId:req.id});
    const existing=await db.favorite.findFirst({where:{userId:u.id,menuItemId:id}});
    if(existing) return existing;
    return db.favorite.create({data:{userId:u.id,menuItemId:id}});
  });

  app.delete("/favorites/dishes/:id",async(req)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    await db.favorite.deleteMany({where:{userId:u.id,menuItemId:id}});
    return {ok:true};
  });

  app.post("/orders/:id/reorder",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const order=await db.order.findFirst({
      where:{id,userId:u.id},
      include:{
        restaurant:true,
        items:{include:{menuItem:true,variant:true,addons:{include:{addon:true}}}}
      }
    });
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    if(order.restaurant.status!==RestaurantStatus.APPROVED||order.restaurant.isPaused||!order.restaurant.isOpen){
      return reply.code(409).send({code:"RESTAURANT_UNAVAILABLE",message:"Restaurant is not currently accepting orders",requestId:req.id});
    }

    const result=await db.$transaction(async tx=>{
      const cart=await tx.cart.upsert({
        where:{userId_restaurantId:{userId:u.id,restaurantId:order.restaurantId}},
        update:{couponCode:null},
        create:{userId:u.id,restaurantId:order.restaurantId}
      });
      await tx.cartItem.deleteMany({where:{cartId:cart.id}});
      const skipped:string[]=[];
      let added=0;
      for(const item of order.items){
        if(!item.menuItem.available||item.menuItem.archivedAt){skipped.push(item.nameSnapshot);continue}
        if(item.menuItem.stock!==null&&item.menuItem.stock<item.quantity){skipped.push(item.nameSnapshot);continue}
        if(item.variantId&&(!item.variant||!item.variant.available)){skipped.push(item.nameSnapshot);continue}
        const created=await tx.cartItem.create({data:{
          cartId:cart.id,menuItemId:item.menuItemId,variantId:item.variantId,quantity:item.quantity,note:item.note
        }});
        const validAddons=item.addons.filter(a=>a.addon.available);
        if(validAddons.length) await tx.cartItemAddon.createMany({
          data:validAddons.map(a=>({cartItemId:created.id,addonId:a.addonId,quantity:a.quantity}))
        });
        added++;
      }
      if(!added) throw Object.assign(new Error("No items from this order are currently available"),{statusCode:409,code:"REORDER_UNAVAILABLE"});
      const view=await tx.cart.findUniqueOrThrow({
        where:{id:cart.id},
        include:{restaurant:true,items:{include:{menuItem:true,variant:true,addons:{include:{addon:true}}}}}
      });
      return {cart:view,skipped};
    });
    return result;
  });

  app.get("/orders/:id/invoice",async(req,reply)=>{
    const u=await requireAuth(req);
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const order=await db.order.findFirst({
      where:{id,userId:u.id},
      include:{restaurant:true,user:{include:{profile:true}},items:{include:{addons:true}},payments:true}
    });
    if(!order) return reply.code(404).send({code:"ORDER_NOT_FOUND",message:"Order not found",requestId:req.id});
    const lines=[
      "PPM Bites - Order Receipt",
      "Order: "+order.orderNumber,
      "Date: "+order.createdAt.toISOString(),
      "Restaurant: "+order.restaurant.name,
      "Customer: "+(order.user.profile?.name??order.user.email??order.user.phone??"Customer"),
      "Status: "+order.status.replaceAll("_"," "),
      "",
      "Items"
    ];
    for(const item of order.items){
      lines.push(item.quantity+" x "+item.nameSnapshot+"  Rs "+((item.unitPricePaise*item.quantity)/100).toFixed(2));
      for(const addon of item.addons) lines.push("  + "+addon.nameSnapshot+"  Rs "+((addon.unitPricePaise*addon.quantity)/100).toFixed(2));
    }
    lines.push(
      "",
      "Items subtotal: Rs "+(order.itemSubtotalPaise/100).toFixed(2),
      "Add-ons: Rs "+(order.addonPaise/100).toFixed(2),
      "Tax: Rs "+(order.taxPaise/100).toFixed(2),
      "Delivery: Rs "+(order.deliveryFeePaise/100).toFixed(2),
      "Packaging: Rs "+(order.packagingPaise/100).toFixed(2),
      "Discount: -Rs "+(order.discountPaise/100).toFixed(2),
      "Wallet: -Rs "+(order.walletPaise/100).toFixed(2),
      "TOTAL: Rs "+(order.totalPaise/100).toFixed(2),
      "Payment: "+(order.payments[0]?.method??"Not recorded"),
      "",
      "Thank you for ordering with PPM Bites."
    );
    const pdf=simplePdf(lines);
    reply.header("Content-Type","application/pdf");
    reply.header("Content-Disposition",'attachment; filename="PPM-Bites-'+order.orderNumber+'.pdf"');
    return reply.send(pdf);
  });
}
