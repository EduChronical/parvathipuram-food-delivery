import crypto from "node:crypto";
import {S3Client,PutObjectCommand} from "@aws-sdk/client-s3";

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
  return process.env.PAYMENT_PROVIDER==="razorpay"?new RazorpayProvider():new DevPaymentProvider();
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
export function smsProvider():SmsProvider{return process.env.SMS_PROVIDER==="twilio"?new TwilioSms():new DevSms()}

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
export function emailProvider():EmailProvider{return process.env.EMAIL_PROVIDER==="resend"?new ResendEmail():new DevEmail()}

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
