import argon2 from "argon2";
import {PrismaClient,RoleCode} from "@prisma/client";
const db=new PrismaClient();

async function main(){
 const email=process.env.ADMIN_EMAIL;
 const initial=process.env.ADMIN_INITIAL_PASSWORD;
 if(!email||!initial||initial.length<12) throw new Error("Administrator bootstrap variables are required and password must be at least 12 characters.");
 const hash=await argon2.hash(initial);
 const user=await db.user.upsert({
  where:{email},
  update:{passwordHash:hash,emailVerifiedAt:new Date(),status:"ACTIVE"},
  create:{email,passwordHash:hash,emailVerifiedAt:new Date(),status:"ACTIVE",profile:{create:{name:"Platform Admin"}},wallet:{create:{}}}
 });
 const role=await db.role.upsert({where:{code:RoleCode.SUPER_ADMIN},update:{name:"SUPER ADMIN"},create:{code:RoleCode.SUPER_ADMIN,name:"SUPER ADMIN"}});
 await db.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:role.id}},update:{},create:{userId:user.id,roleId:role.id}});
 console.log("Administrator account bootstrapped for",email);
}
main().finally(()=>db.$disconnect());
