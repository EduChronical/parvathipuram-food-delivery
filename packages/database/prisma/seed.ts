import argon2 from "argon2";
import {PrismaClient,RoleCode,RestaurantStatus,DocumentStatus,CouponType} from "@prisma/client";
const db=new PrismaClient();
const password=process.env.DEMO_PASSWORD??"DemoPass!2026";

async function ensureUser(email:string,name:string,roleCode:RoleCode,phone:string){
  const passwordHash=await argon2.hash(password);
  const u=await db.user.upsert({
    where:{email},
    update:{passwordHash,status:"ACTIVE",phone,emailVerifiedAt:new Date(),phoneVerifiedAt:new Date()},
    create:{email,phone,passwordHash,status:"ACTIVE",emailVerifiedAt:new Date(),phoneVerifiedAt:new Date(),profile:{create:{name}},wallet:{create:{}}}
  });
  const role=await db.role.findUniqueOrThrow({where:{code:roleCode}});
  await db.userRole.upsert({where:{userId_roleId:{userId:u.id,roleId:role.id}},update:{},create:{userId:u.id,roleId:role.id}});
  return u;
}

async function main(){
  for(const code of Object.values(RoleCode)){
    await db.role.upsert({where:{code},update:{name:code.replaceAll("_"," ")},create:{code,name:code.replaceAll("_"," ")}});
  }
  const city=await db.city.upsert({
    where:{name_state_country:{name:"Parvathipuram",state:"Andhra Pradesh",country:"India"}},
    update:{active:true},
    create:{name:"Parvathipuram",state:"Andhra Pradesh",country:"India"}
  });
  let zone=await db.serviceZone.findFirst({where:{cityId:city.id,name:"Parvathipuram Central"}});
  if(!zone) zone=await db.serviceZone.create({data:{cityId:city.id,name:"Parvathipuram Central",centerLat:18.7830,centerLng:83.4260,radiusKm:12}});

  const customer=await ensureUser("customer@ppmbites.local","Demo Customer",RoleCode.CUSTOMER,"+919000000001");
  const owner=await ensureUser("restaurant@ppmbites.local","Demo Restaurant Owner",RoleCode.RESTAURANT_OWNER,"+919000000002");
  const rider=await ensureUser("delivery@ppmbites.local","Demo Delivery Partner",RoleCode.DELIVERY_PARTNER,"+919000000003");


  const restaurant=await db.restaurant.upsert({
    where:{slug:"spice-station-demo"},
    update:{status:RestaurantStatus.APPROVED,isOpen:true,isPaused:false},
    create:{
      cityId:city.id,serviceZoneId:zone.id,name:"Spice Station",slug:"spice-station-demo",
      description:"Fresh Andhra meals, biryani and quick bites.",address:"Main Road, Parvathipuram",
      latitude:18.7834,longitude:83.4254,status:RestaurantStatus.APPROVED,isOpen:true,prepMinutes:22,
      avgRating:4.5,ratingCount:128,foodLicenseNumber:"DEMO-FSSAI-001"
    }
  });
  await db.restaurantOwner.upsert({
    where:{restaurantId_userId:{restaurantId:restaurant.id,userId:owner.id}},
    update:{isPrimary:true},create:{restaurantId:restaurant.id,userId:owner.id,isPrimary:true}
  });
  const cuisine=await db.cuisine.upsert({where:{slug:"andhra"},update:{name:"Andhra"},create:{name:"Andhra",slug:"andhra"}});
  await db.restaurantCuisine.upsert({where:{restaurantId_cuisineId:{restaurantId:restaurant.id,cuisineId:cuisine.id}},update:{},create:{restaurantId:restaurant.id,cuisineId:cuisine.id}});
  const category=await db.menuCategory.upsert({where:{restaurantId_name:{restaurantId:restaurant.id,name:"Recommended"}},update:{active:true},create:{restaurantId:restaurant.id,name:"Recommended"}});

  const items=[
    ["Chicken Dum Biryani","Aromatic basmati rice with slow-cooked chicken.",24900,false,true],
    ["Paneer Biryani","Spiced paneer and fragrant basmati rice.",21900,true,true],
    ["Andhra Veg Meals","Rice, dal, curry, fry, rasam, curd and pickle.",15900,true,false],
    ["Chicken 65","Crispy spicy chicken starter.",19900,false,true],
    ["Lime Soda","Fresh lime soda.",5900,true,false]
  ] as const;
  for(const [name,description,pricePaise,veg,bestseller] of items){
    const found=await db.menuItem.findFirst({where:{restaurantId:restaurant.id,name}});
    if(found) await db.menuItem.update({where:{id:found.id},data:{description,pricePaise,veg,bestseller,available:true}});
    else await db.menuItem.create({data:{restaurantId:restaurant.id,categoryId:category.id,name,description,pricePaise,veg,bestseller,available:true}});
  }

  const existingAddress=await db.address.findFirst({where:{userId:customer.id,label:"Home"}});
  if(!existingAddress) await db.address.create({data:{userId:customer.id,label:"Home",line1:"Demo Home",locality:"Parvathipuram",city:"Parvathipuram",postalCode:"535501",latitude:18.7810,longitude:83.4270,isDefault:true}});
  await db.deliveryPartner.upsert({where:{userId:rider.id},update:{serviceZoneId:zone.id,status:DocumentStatus.APPROVED,online:true},create:{userId:rider.id,serviceZoneId:zone.id,status:DocumentStatus.APPROVED,online:true,vehicleType:"BIKE",vehicleNumber:"AP-DEMO-1234"}});
  const partner=await db.deliveryPartner.findUniqueOrThrow({where:{userId:rider.id}});
  await db.deliveryLocation.create({data:{deliveryPartnerId:partner.id,latitude:18.7840,longitude:83.4240}});

  await db.coupon.upsert({
    where:{code:"WELCOME50"},
    update:{active:true},
    create:{code:"WELCOME50",type:CouponType.PERCENT,value:50,cityId:city.id,startsAt:new Date("2026-01-01"),expiresAt:new Date("2027-12-31"),perCustomerLimit:1}
  });
  for(const [key,enabled] of [["COD",true],["WALLET",true],["MEMBERSHIPS",false],["REFERRALS",true],["SCHEDULED_DELIVERY",false],["PICKUP",false],["TIPPING",true]] as const){
    await db.featureFlag.upsert({where:{key},update:{enabled},create:{key,enabled}});
  }
  console.log("Seed complete. Demo password:",password);
}
main().finally(()=>db.$disconnect());
