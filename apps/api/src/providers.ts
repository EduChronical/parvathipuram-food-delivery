import crypto from "node:crypto";
import {S3Client,PutObjectCommand} from "@aws-sdk/client-s3";
import {emailReady,fcmReady,objectStorageReady,paymentReady,smsReady} from "./integrations.js";

export type PaymentCreateInput={orderId:string;amountPaise:number;currency:string};
export type PaymentCreateResult={providerOrderId:string;checkout:any};
export type RefundInput={providerPaymentId:string;amountPaise:number;reason:string;idempotencyKey:string};
export type RefundResult={providerRefundId:string};
export interface PaymentProvider{
  createPayment(input:PaymentCreateInput):Promise<PaymentCreateResult>;
  refundPayment(input:RefundInput):Promise<RefundResult>;
  verifyWebhook(raw:string,signature:string|undefined):boolean;
}

class DevPaymentProvider implements PaymentProvider{
  async createPayment(i:PaymentCreateInput){return {providerOrderId:"dev_"+i.orderId,checkout:{mode:"dev"}}}
  async refundPayment(i:RefundInput){return {providerRefundId:"dev_refund_"+i.idempotencyKey}}
  verifyWebhook(){return true}
}

class RazorpayProvider implements PaymentProvider{
  async createPayment(i:PaymentCreateInput){
    const key=process.env.PAYMENT_API_KEY!,secret=process.env.PAYMENT_API_SECRET!;
    const basic=Buffer.from(key+":"+secret).toString("base64");
    const res=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{Authorization:"Basic "+basic,"Content-Type":"application/json"},body:JSON.stringify({amount:i.amountPaise,currency:i.currency,receipt:i.orderId})});
    if(!res.ok) throw new Error("PAYMENT_PROVIDER_ERROR");
    const data:any=await res.json();
    return {providerOrderId:data.id,checkout:{keyId:key,orderId:data.id,amount:i.amountPaise,currency:i.currency}};
  }
  async refundPayment(i:RefundInput){
    const key=process.env.PAYMENT_API_KEY!,secret=process.env.PAYMENT_API_SECRET!;
    const basic=Buffer.from(key+":"+secret).toString("base64");
    const res=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(i.providerPaymentId)+"/refund",{
      method:"POST",
      headers:{Authorization:"Basic "+basic,"Content-Type":"application/json"},
      body:JSON.stringify({amount:i.amountPaise,notes:{reason:i.reason,ppmIdempotencyKey:i.idempotencyKey}})
    });
    if(!res.ok) throw new Error("REFUND_PROVIDER_ERROR");
    const data:any=await res.json();
    return {providerRefundId:String(data.id)};
  }
  verifyWebhook(raw:string,signature:string|undefined){
    if(!signature||!process.env.PAYMENT_WEBHOOK_SECRET) return false;
    const digest=crypto.createHmac("sha256",process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest("hex");
    const a=Buffer.from(digest),b=Buffer.from(signature);
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }
}

export function paymentProvider():PaymentProvider{
  if(process.env.PAYMENT_PROVIDER==="razorpay"){
    if(!paymentReady()) throw Object.assign(new Error("Payment provider is not configured"),{code:"PAYMENT_PROVIDER_NOT_CONFIGURED"});
    return new RazorpayProvider();
  }
  return new DevPaymentProvider();
}

export interface SmsProvider{send(to:string,body:string):Promise<void>}
class DevSms implements SmsProvider{async send(to:string,body:string){console.info("DEV_SMS",{to,body})}}
class TwilioSms implements SmsProvider{
  async send(to:string,body:string){
    const sid=process.env.SMS_API_KEY,token=process.env.SMS_API_SECRET,from=process.env.SMS_FROM;
    if(!sid||!token||!from) throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
    const form=new URLSearchParams({To:to,From:from,Body:body});
    const res=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{
      method:"POST",headers:{Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:form
    });
    if(!res.ok) throw new Error("SMS_DELIVERY_FAILED");
  }
}
export function smsProvider():SmsProvider{
  if(process.env.SMS_PROVIDER==="twilio"){
    if(!smsReady()) throw Object.assign(new Error("SMS provider is not configured"),{code:"SMS_PROVIDER_NOT_CONFIGURED"});
    return new TwilioSms();
  }
  return new DevSms();
}

export interface EmailProvider{send(to:string,subject:string,body:string):Promise<void>}
class DevEmail implements EmailProvider{async send(to:string,subject:string,body:string){console.info("DEV_EMAIL",{to,subject,body})}}
class ResendEmail implements EmailProvider{
  async send(to:string,subject:string,body:string){
    const key=process.env.EMAIL_API_KEY,from=process.env.EMAIL_FROM;
    if(!key||!from) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
    const res=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({from,to:[to],subject,text:body})
    });
    if(!res.ok) throw new Error("EMAIL_DELIVERY_FAILED");
  }
}
export function emailProvider():EmailProvider{
  if(process.env.EMAIL_PROVIDER==="resend"){
    if(!emailReady()) throw Object.assign(new Error("Email provider is not configured"),{code:"EMAIL_PROVIDER_NOT_CONFIGURED"});
    return new ResendEmail();
  }
  return new DevEmail();
}

export function storageClient(){
  if(!objectStorageReady()) throw Object.assign(new Error("Object storage is not configured"),{code:"STORAGE_PROVIDER_NOT_CONFIGURED"});
  return new S3Client({
    region:process.env.STORAGE_REGION??"auto",
    endpoint:process.env.STORAGE_ENDPOINT||undefined,
    forcePathStyle:!!process.env.STORAGE_ENDPOINT,
    credentials:process.env.STORAGE_ACCESS_KEY&&process.env.STORAGE_SECRET_KEY?{accessKeyId:process.env.STORAGE_ACCESS_KEY,secretAccessKey:process.env.STORAGE_SECRET_KEY}:undefined
  });
}
export async function putObject(key:string,body:Uint8Array,contentType:string){
  await storageClient().send(new PutObjectCommand({Bucket:process.env.STORAGE_BUCKET!,Key:key,Body:body,ContentType:contentType}));
  return (process.env.STORAGE_PUBLIC_URL?process.env.STORAGE_PUBLIC_URL.replace(/\/$/,"")+"/":"")+key;
}


type PushData=Record<string,string|number|boolean|null|undefined>;
let googleAccessTokenCache:{token:string;expiresAt:number}|null=null;

function b64url(value:string|Buffer){
  return Buffer.from(value).toString("base64url");
}

async function googleAccessToken(){
  if(!fcmReady()) throw Object.assign(new Error("Firebase Cloud Messaging is not configured"),{code:"FCM_NOT_CONFIGURED"});
  if(googleAccessTokenCache&&googleAccessTokenCache.expiresAt>Date.now()+60_000) return googleAccessTokenCache.token;

  const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const claims=b64url(JSON.stringify({
    iss:process.env.FCM_CLIENT_EMAIL,
    scope:"https://www.googleapis.com/auth/firebase.messaging",
    aud:"https://oauth2.googleapis.com/token",
    iat:now,
    exp:now+3600
  }));
  const unsigned=header+"."+claims;
  const key=(process.env.FCM_PRIVATE_KEY??"").replace(/\\n/g,"\n");
  const signature=crypto.sign("RSA-SHA256",Buffer.from(unsigned),key).toString("base64url");
  const assertion=unsigned+"."+signature;

  const body=new URLSearchParams({
    grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const res=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body
  });
  if(!res.ok) throw new Error("FCM_OAUTH_ERROR");
  const data:any=await res.json();
  const expiresIn=Math.max(60,Number(data.expires_in??3600));
  googleAccessTokenCache={token:String(data.access_token),expiresAt:Date.now()+expiresIn*1000};
  return googleAccessTokenCache.token;
}

export async function sendPush(token:string,title:string,body:string,data:PushData={}){
  const projectId=process.env.FCM_PROJECT_ID!;
  const accessToken=await googleAccessToken();
  const stringData=Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]));
  const appOrigin=(process.env.APP_ORIGIN??"").split(",")[0]?.trim();
  const link=typeof data.url==="string"?data.url:(appOrigin||undefined);
  const icon=appOrigin?appOrigin.replace(/\/$/,"")+"/ppm-icon.svg":undefined;
  const res=await fetch("https://fcm.googleapis.com/v1/projects/"+encodeURIComponent(projectId)+"/messages:send",{
    method:"POST",
    headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
    body:JSON.stringify({message:{
      token,
      notification:{title,body},
      data:stringData,
      webpush:{
        ...(link?{fcmOptions:{link}}:{}),
        notification:{...(icon?{icon,badge:icon}:{}),tag:String(data.orderId??data.type??"ppm-bites")}
      }
    }})
  });
  if(res.ok) return {ok:true,invalid:false};
  const detail=await res.text();
  const invalid=res.status===404||res.status===410||detail.includes("UNREGISTERED")||detail.includes("registration-token-not-registered");
  if(invalid) return {ok:false,invalid:true};
  throw new Error("FCM_DELIVERY_FAILED");
}
