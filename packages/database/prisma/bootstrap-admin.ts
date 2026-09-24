import argon2 from "argon2";
import {PrismaClient,RoleCode} from "@prisma/client";
const db=new PrismaClient();
const placeholder=/(example[-_ ]?placeholder|replace[-_ ]?with|changeme|dummy|placeholder|xxxxx|<.*>)/i;

async function main(){
 const email=process.env.ADMIN_EMAIL;
 const initial=process.env.ADMIN_INITIAL_PASSWORD;
 if(!email||!initial||initial.length<12||placeholder.test(email)||placeholder.test(initial)) throw new Error("Administrator bootstrap variables must contain real non-placeholder values and the password must be at least 12 characters.");

 let user=await db.user.findUnique({where:{email}});
 if(!user){
  user=await db.user.create({
   data:{
    email,
    passwordHash:await argon2.hash(initial),
    emailVerifiedAt:new Date(),
    status:"ACTIVE",
    profile:{create:{name:"Platform Admin"}},
    wallet:{create:{}}
   }
  });
  console.log("Administrator account created for",email);
 }else{
  console.log("Administrator account already exists; password preserved for",email);
 }

 const role=await db.role.upsert({
  where:{code:RoleCode.SUPER_ADMIN},
  update:{name:"SUPER ADMIN"},
  create:{code:RoleCode.SUPER_ADMIN,name:"SUPER ADMIN"}
 });
 await db.userRole.upsert({
  where:{userId_roleId:{userId:user.id,roleId:role.id}},
  update:{},
  create:{userId:user.id,roleId:role.id}
 });
}
main().finally(()=>db.$disconnect());
