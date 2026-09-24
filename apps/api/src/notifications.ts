import {db,NotificationChannel} from "@ppm/database";
import {emailProvider,sendPush,smsProvider} from "./providers.js";
import {emailReady,fcmReady,smsReady} from "./integrations.js";

type Payload=Record<string,unknown>|undefined;

export async function notifyUser(userId:string,type:string,title:string,body:string,data?:Payload){
  try{
    const [user,prefs]=await Promise.all([
      db.user.findUnique({where:{id:userId},select:{email:true,phone:true}}),
      db.notificationPreference.findUnique({where:{userId}})
    ]);
    if(!user)return;

    if(prefs?.inApp??true){
      await db.notification.create({data:{userId,channel:NotificationChannel.IN_APP,type,title,body,data:data as any,sentAt:new Date()}});
    }

    if((prefs?.sms??true)&&!!user.phone&&smsReady()){
      const n=await db.notification.create({data:{userId,channel:NotificationChannel.SMS,type,title,body,data:data as any}});
      try{
        await smsProvider().send(user.phone!,body);
        await db.notification.update({where:{id:n.id},data:{sentAt:new Date(),error:null}});
      }catch(e:any){
        await db.notification.update({where:{id:n.id},data:{error:String(e?.message??e)}});
      }
    }

    if((prefs?.email??true)&&!!user.email&&emailReady()){
      const n=await db.notification.create({data:{userId,channel:NotificationChannel.EMAIL,type,title,body,data:data as any}});
      try{
        await emailProvider().send(user.email!,title,body);
        await db.notification.update({where:{id:n.id},data:{sentAt:new Date(),error:null}});
      }catch(e:any){
        await db.notification.update({where:{id:n.id},data:{error:String(e?.message??e)}});
      }
    }

    if((prefs?.push??true)&&fcmReady()){
      const subscriptions=await db.pushSubscription.findMany({where:{userId},select:{id:true,target:true}});
      if(subscriptions.length){
        const n=await db.notification.create({data:{userId,channel:NotificationChannel.PUSH,type,title,body,data:data as any}});
        let delivered=0;
        const errors:string[]=[];
        for(const subscription of subscriptions){
          try{
            const result=await sendPush(subscription.target,title,body,{type,...(data??{})} as any);
            if(result.invalid){
              await db.pushSubscription.deleteMany({where:{id:subscription.id}});
            }else if(result.ok){
              delivered++;
            }
          }catch(e:any){
            errors.push(String(e?.message??e));
          }
        }
        await db.notification.update({
          where:{id:n.id},
          data:delivered?{sentAt:new Date(),error:errors.length?errors.join("; ").slice(0,1000):null}:{error:(errors.join("; ")||"No active push subscription").slice(0,1000)}
        });
      }
    }
  }catch(e){
    console.error("notification persistence failed",{userId,type,error:String(e)});
  }
}

export async function notifyRestaurantUsers(restaurantId:string,type:string,title:string,body:string,data?:Payload){
  const [owners,staff]=await Promise.all([
    db.restaurantOwner.findMany({where:{restaurantId},select:{userId:true}}),
    db.restaurantStaff.findMany({where:{restaurantId,active:true},select:{userId:true}})
  ]);
  const ids=[...new Set([...owners,...staff].map(x=>x.userId))];
  await Promise.all(ids.map(id=>notifyUser(id,type,title,body,data)));
}

export async function notifyDeliveryPartners(partnerIds:string[],type:string,title:string,body:string,data?:Payload){
  if(!partnerIds.length)return;
  const partners=await db.deliveryPartner.findMany({where:{id:{in:partnerIds}},select:{userId:true}});
  await Promise.all(partners.map(p=>notifyUser(p.userId,type,title,body,data)));
}

export function orderStatusCopy(status:string,restaurantName?:string){
  const name=restaurantName?" from "+restaurantName:"";
  const map:Record<string,{title:string;body:string}>={
    PLACED:{title:"Order placed",body:"Your order"+name+" has been placed."},
    RESTAURANT_CONFIRMED:{title:"Restaurant accepted",body:"The restaurant accepted your order and will start preparing it."},
    PREPARING:{title:"Food is being prepared",body:"Your food is now being prepared."},
    READY_FOR_PICKUP:{title:"Food is ready",body:"Your order is ready for pickup by the delivery partner."},
    DELIVERY_PARTNER_ASSIGNED:{title:"Delivery partner assigned",body:"A delivery partner has been assigned to your order."},
    DELIVERY_PARTNER_ARRIVED_AT_RESTAURANT:{title:"Rider at restaurant",body:"Your delivery partner has reached the restaurant."},
    PICKED_UP:{title:"Order picked up",body:"Your food has been picked up and will be on the way shortly."},
    ON_THE_WAY:{title:"Order on the way",body:"Your delivery partner is on the way to you."},
    ARRIVED_AT_CUSTOMER:{title:"Delivery partner nearby",body:"Your delivery partner has arrived at your location."},
    DELIVERED:{title:"Order delivered",body:"Your order was delivered. You can now rate your experience."},
    CANCELLED:{title:"Order cancelled",body:"Your order has been cancelled."},
    REFUND_PENDING:{title:"Refund initiated",body:"A refund has been initiated for your order."},
    REFUNDED:{title:"Refund completed",body:"Your refund has been completed."}
  };
  return map[status]??{title:"Order update",body:"Your order status is now "+status.replaceAll("_"," ").toLowerCase()+"."};
}
