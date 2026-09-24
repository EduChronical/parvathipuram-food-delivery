import crypto from "node:crypto";
import {S3Client,PutObjectCommand} from "@aws-sdk/client-s3";

export type PaymentCreateInput={orderId:string;amountPaise:number;currency:string};
export type PaymentCreateResult={providerOrderId:string;checkout:any};
export interface PaymentProvider{
  createPayment(input:PaymentCreateInput):Promise<PaymentCreateResult>;
  verifyWebhook(raw:string,signature:string|undefined):boolean;
}

class DevPaymentProvider implements PaymentProvider{
  async createPayment(i:PaymentCreateInput){return {providerOrderId:"dev_"+i.orderId,checkout:{mode:"dev"}}}
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
  verifyWebhook(raw:string,signature:string|undefined){
    if(!signature||!process.env.PAYMENT_WEBHOOK_SECRET) return false;
    const digest=crypto.createHmac("sha256",process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(signature));
  }
}

export function paymentProvider():PaymentProvider{
  return process.env.PAYMENT_PROVIDER==="razorpay"?new RazorpayProvider():new DevPaymentProvider();
}

export interface SmsProvider{send(to:string,body:string):Promise<void>}
class DevSms implements SmsProvider{async send(to:string,body:string){console.info("DEV_SMS",{to,body})}}
export function smsProvider():SmsProvider{return new DevSms()}

export interface EmailProvider{send(to:string,subject:string,body:string):Promise<void>}
class DevEmail implements EmailProvider{async send(to:string,subject:string,body:string){console.info("DEV_EMAIL",{to,subject,body})}}
export function emailProvider():EmailProvider{return new DevEmail()}

export function storageClient(){
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
