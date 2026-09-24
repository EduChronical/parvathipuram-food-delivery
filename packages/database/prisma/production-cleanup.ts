import {PrismaClient,RestaurantStatus} from "@prisma/client";

const db=new PrismaClient();

async function main(){
  if(process.env.NODE_ENV!=="production"){
    console.log("Production cleanup skipped outside production");
    return;
  }
  const demoUsers=await db.user.findMany({
    where:{email:{endsWith:"@ppmbites.local"}},
    select:{id:true,email:true}
  });
  const ids=demoUsers.map(u=>u.id);
  if(ids.length){
    await db.session.updateMany({where:{userId:{in:ids},revokedAt:null},data:{revokedAt:new Date()}});
    await db.user.updateMany({where:{id:{in:ids}},data:{status:"SUSPENDED",passwordHash:null}});
  }
  const restaurants=await db.restaurant.updateMany({
    where:{slug:{endsWith:"-demo"}},
    data:{status:RestaurantStatus.SUSPENDED,isOpen:false,isPaused:true}
  });
  console.log("Production cleanup complete",{demoUsersSuspended:ids.length,demoRestaurantsSuspended:restaurants.count});
}

main().finally(()=>db.$disconnect());
