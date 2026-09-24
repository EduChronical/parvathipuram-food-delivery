import IORedis from "ioredis";
const url=process.env.REDIS_URL;
export const redis=url?new IORedis(url,{maxRetriesPerRequest:null,lazyConnect:true}):null;
export async function publishOrder(orderId:string,event:any){
  if(!redis) return;
  if(redis.status==="wait") await redis.connect();
  await redis.publish("order:"+orderId,JSON.stringify(event));
}
