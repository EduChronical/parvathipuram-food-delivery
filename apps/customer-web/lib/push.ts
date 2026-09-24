import {getApp,getApps,initializeApp} from "firebase/app";
import {deleteToken,getMessaging,getToken,isSupported} from "firebase/messaging";
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

function app(){
  return getApps().length?getApp():initializeApp(firebaseConfig);
}

export async function browserPushSupported(){
  return typeof window!=="undefined"&&"Notification" in window&&"serviceWorker" in navigator&&firebaseWebConfigured()&&await isSupported();
}

export async function enableBrowserPush(){
  if(!(await browserPushSupported())) throw new Error("Browser push is not configured or supported on this device.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted") throw new Error("Notification permission was not granted.");
  const registration=await navigator.serviceWorker.register("/firebase-messaging-sw.js",{scope:"/"});
  const messaging=getMessaging(app());
  const token=await getToken(messaging,{
    vapidKey:process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!,
    serviceWorkerRegistration:registration
  });
  if(!token) throw new Error("Firebase did not return a push token.");
  await api("/push/subscriptions",{method:"POST",body:JSON.stringify({token,platform:"web"})});
  localStorage.setItem("ppm_fcm_token",token);
  return token;
}

export async function disableBrowserPush(){
  const token=localStorage.getItem("ppm_fcm_token");
  if(token){
    await api("/push/subscriptions",{method:"DELETE",body:JSON.stringify({token})}).catch(()=>{});
  }
  if(firebaseWebConfigured()&&await isSupported()){
    try{await deleteToken(getMessaging(app()))}catch{}
  }
  localStorage.removeItem("ppm_fcm_token");
}
