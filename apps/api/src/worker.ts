import {Worker,Queue} from "bullmq";
import {Redis} from "ioredis";
import {db,NotificationChannel} from "@ppm/database";
import {smsProvider,emailProvider} from "./providers.js";

const connection=new Redis(process.env.REDIS_URL??"redis://localhost:6379",{maxRetriesPerRequest:null});
export const notificationQueue=new Queue("notifications",{connection});

new Worker("notifications",async job=>{
  const n=await db.notification.findUnique({where:{id:String(job.data.notificationId)}});
  if(!n||n.sentAt) return;
  try{
    const user=await db.user.findUniqueOrThrow({where:{id:n.userId}});
    if(n.channel===NotificationChannel.SMS&&user.phone) await smsProvider().send(user.phone,n.body);
    if(n.channel===NotificationChannel.EMAIL&&user.email) await emailProvider().send(user.email,n.title,n.body);
    await db.notification.update({where:{id:n.id},data:{sentAt:new Date(),error:null}});
  }catch(e:any){
    await db.notification.update({where:{id:n.id},data:{error:String(e?.message??e)}});
    throw e;
  }
},{connection,concurrency:10});

console.log("Notification worker started");
