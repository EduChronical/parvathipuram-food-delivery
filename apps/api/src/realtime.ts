import {EventEmitter} from "node:events";
import {Redis} from "ioredis";

const url=process.env.REDIS_URL;
export const redis=url?new Redis(url,{maxRetriesPerRequest:null,lazyConnect:true}):null;
const localBus=new EventEmitter();
localBus.setMaxListeners(500);

export async function publishOrder(orderId:string,event:unknown){
  const message=JSON.stringify(event);
  if(redis){
    if(redis.status==="wait") await redis.connect();
    await redis.publish("order:"+orderId,message);
    return;
  }
  localBus.emit("order:"+orderId,message);
}

export function subscribeLocalOrder(orderId:string,listener:(message:string)=>void){
  const channel="order:"+orderId;
  localBus.on(channel,listener);
  return ()=>localBus.off(channel,listener);
}
