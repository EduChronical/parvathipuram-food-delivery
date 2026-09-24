import {getApp,getApps,initializeApp} from "firebase/app";
import {getMessaging,isSupported,onRegistered,onUnregistered,register,unregister} from "firebase/messaging";
import {api} from "@ppm/ui";

const PLACEHOLDER_RE=/(example[-_ ]?placeholder|replace[-_ ]?with|your[-_ ]|changeme|dummy|placeholder|xxxxx|<.*>)/i;
const configured=(v:string|undefined)=>!!v&&!PLACEHOLDER_RE.test(v);

const firebaseConfig={
  apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export function firebaseWebConfigured(){
  return Object.values(firebaseConfig).every(configured)&&configured(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
}

function firebaseApp(){
  return getApps().length?getApp():initializeApp(firebaseConfig);
}

export async function browserPushSupported(){
  return typeof window!=="undefined"&&"Notification" in window&&"serviceWorker" in navigator&&firebaseWebConfigured()&&await isSupported();
}

async function registerTarget(serviceWorkerRegistration:ServiceWorkerRegistration){
  const messaging=getMessaging(firebaseApp());
  return new Promise<string>((resolve,reject)=>{
    let settled=false;
    const finish=(fn:()=>void)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      stopRegistered();
      fn();
    };
    const stopRegistered=onRegistered(messaging,target=>{
      finish(()=>resolve(target));
    });
    const timer=setTimeout(()=>finish(()=>reject(new Error("Timed out waiting for Firebase push registration."))),15000);
    register(messaging,{
      vapidKey:process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!,
      serviceWorkerRegistration
    }).catch(error=>finish(()=>reject(error)));
  });
}

export async function enableBrowserPush(){
  if(!(await browserPushSupported())) throw new Error("Browser push is not configured or supported on this device.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted") throw new Error("Notification permission was not granted.");

  const serviceWorkerRegistration=await navigator.serviceWorker.register("/firebase-messaging-sw.js",{scope:"/"});
  const target=await registerTarget(serviceWorkerRegistration);
  await api("/push/subscriptions",{method:"POST",body:JSON.stringify({target,platform:"web"})});
  localStorage.setItem("ppm_fcm_target",target);

  const messaging=getMessaging(firebaseApp());
  onUnregistered(messaging,removedTarget=>{
    if(localStorage.getItem("ppm_fcm_target")===removedTarget){
      api("/push/subscriptions",{method:"DELETE",body:JSON.stringify({target:removedTarget})}).catch(()=>{});
      localStorage.removeItem("ppm_fcm_target");
    }
  });
  return target;
}

export async function disableBrowserPush(){
  const target=localStorage.getItem("ppm_fcm_target");
  if(target){
    await api("/push/subscriptions",{method:"DELETE",body:JSON.stringify({target})}).catch(()=>{});
  }
  if(firebaseWebConfigured()&&await isSupported()){
    try{await unregister(getMessaging(firebaseApp()))}catch{}
  }
  localStorage.removeItem("ppm_fcm_target");
}
