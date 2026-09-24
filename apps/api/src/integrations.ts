const PLACEHOLDER_RE=/(example[-_ ]?placeholder|replace[-_ ]?with|your[-_ ]|changeme|change-me|dummy|placeholder|xxxxx|<.*>)/i;

export function configuredValue(value:string|undefined|null){
  if(!value)return false;
  const v=String(value).trim();
  return !!v&&!PLACEHOLDER_RE.test(v);
}

export function envConfigured(...names:string[]){
  return names.every(name=>configuredValue(process.env[name]));
}

export function paymentReady(){
  return process.env.PAYMENT_PROVIDER==="razorpay"&&envConfigured("PAYMENT_API_KEY","PAYMENT_API_SECRET","PAYMENT_WEBHOOK_SECRET");
}
export function smsReady(){
  return process.env.SMS_PROVIDER==="twilio"&&envConfigured("SMS_API_KEY","SMS_API_SECRET","SMS_FROM");
}
export function emailReady(){
  return process.env.EMAIL_PROVIDER==="resend"&&envConfigured("EMAIL_API_KEY","EMAIL_FROM");
}
export function mapsReady(){
  return ["google","mapbox"].includes(process.env.MAP_PROVIDER??"")&&envConfigured("MAP_API_KEY");
}
export function objectStorageReady(){
  return envConfigured("STORAGE_ENDPOINT","STORAGE_BUCKET","STORAGE_ACCESS_KEY","STORAGE_SECRET_KEY");
}
export function redisReady(){
  return envConfigured("REDIS_URL");
}
export function fcmReady(){
  return envConfigured("FCM_PROJECT_ID","FCM_CLIENT_EMAIL","FCM_PRIVATE_KEY");
}

function missing(names:string[]){
  return names.filter(name=>!configuredValue(process.env[name]));
}

export function integrationStatus(){
  const paymentNames=["PAYMENT_API_KEY","PAYMENT_API_SECRET","PAYMENT_WEBHOOK_SECRET"];
  const smsNames=["SMS_API_KEY","SMS_API_SECRET","SMS_FROM"];
  const emailNames=["EMAIL_API_KEY","EMAIL_FROM"];
  const mapNames=["MAP_API_KEY"];
  const storageNames=["STORAGE_ENDPOINT","STORAGE_BUCKET","STORAGE_ACCESS_KEY","STORAGE_SECRET_KEY"];
  const redisNames=["REDIS_URL"];
  const fcmNames=["FCM_PROJECT_ID","FCM_CLIENT_EMAIL","FCM_PRIVATE_KEY"];
  return {
    payment:{provider:process.env.PAYMENT_PROVIDER??"dev",configured:paymentReady(),missing:paymentReady()?[]:missing(paymentNames)},
    sms:{provider:process.env.SMS_PROVIDER??"dev",configured:smsReady(),missing:smsReady()?[]:missing(smsNames)},
    email:{provider:process.env.EMAIL_PROVIDER??"dev",configured:emailReady(),missing:emailReady()?[]:missing(emailNames)},
    maps:{provider:process.env.MAP_PROVIDER??"none",configured:mapsReady(),missing:mapsReady()?[]:missing(mapNames)},
    storage:{provider:"s3-compatible",configured:objectStorageReady(),missing:objectStorageReady()?[]:missing(storageNames)},
    redis:{provider:"redis",configured:redisReady(),missing:redisReady()?[]:missing(redisNames)},
    push:{provider:"firebase-cloud-messaging",configured:fcmReady(),missing:fcmReady()?[]:missing(fcmNames)}
  };
}

export function publicCapabilities(){
  return {
    passwordAuth:true,
    cod:true,
    onlinePayments:paymentReady(),
    smsOtp:smsReady(),
    emailOtp:emailReady(),
    objectStorage:objectStorageReady(),
    maps:mapsReady(),
    pushNotifications:fcmReady(),
    realtime:redisReady()?"redis":"single-instance"
  };
}
