import {Worker,Queue} from "bullmq";
import {Redis} from "ioredis";
import {db,NotificationChannel} from "@ppm/database";
import {emailProvider,sendPush,smsProvider} from "./providers.js";
import {emailReady,fcmReady,redisReady,smsReady} from "./integrations.js";

if(!redisReady()){
  console.log("Notification worker disabled: REDIS_URL is not configured.");
  process.exit(0);
}

const connection=new Redis(process.env.REDIS_URL!,{maxRetriesPerRequest:null});
export const notificationQueue=new Queue("notifications",{connection});

new Worker("notifications",async job=>{
  const n=await db.notification.findUnique({where:{id:String(job.data.notificationId)}});
  if(!n||n.sentAt) return;
  try{
    const user=await db.user.findUniqueOrThrow({where:{id:n.userId}});
    if(n.channel===NotificationChannel.SMS&&user.phone){
      if(!smsReady()) throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
      await smsProvider().send(user.phone,n.body);
    }
    if(n.channel===NotificationChannel.EMAIL&&user.email){
      if(!emailReady()) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
      await emailProvider().send(user.email,n.title,n.body);
    }
    if(n.channel===NotificationChannel.PUSH){
      if(!fcmReady()) throw new Error("FCM_NOT_CONFIGURED");
      const subscriptions=await db.pushSubscription.findMany({where:{userId:n.userId}});
      let delivered=0;
      for(const s of subscriptions){
        const result=await sendPush(s.token,n.title,n.body,(n.data??{}) as any);
        if(result.invalid) await db.pushSubscription.deleteMany({where:{id:s.id}});
        else if(result.ok) delivered++;
      }
      if(!delivered) throw new Error("NO_ACTIVE_PUSH_SUBSCRIPTIONS");
    }
    await db.notification.update({where:{id:n.id},data:{sentAt:new Date(),error:null}});
  }catch(e:any){
    await db.notification.update({where:{id:n.id},data:{error:String(e?.message??e).slice(0,1000)}});
    throw e;
  }
},{connection,concurrency:10});

console.log("Notification worker started");
