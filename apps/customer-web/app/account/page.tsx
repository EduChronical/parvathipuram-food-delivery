"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,clearSession,saveSession,Pill} from "@ppm/ui";
import {disableBrowserPush,enableBrowserPush,firebaseWebConfigured} from "../../lib/push";

type Caps={passwordAuth:boolean;cod:boolean;onlinePayments:boolean;smsOtp:boolean;emailOtp:boolean;pushNotifications?:boolean};
type Mode="signin"|"register"|"otp"|"verifySignup"|"reset";

export default function AccountPage(){
  const [caps,setCaps]=useState<Caps>({passwordAuth:true,cod:true,onlinePayments:false,smsOtp:false,emailOtp:false,pushNotifications:false});
  const [me,setMe]=useState<any>(null),[addresses,setAddresses]=useState<any[]>([]),[sessions,setSessions]=useState<any[]>([]),[notificationPrefs,setNotificationPrefs]=useState<any>({inApp:true,push:true,sms:true,email:true,promotions:true});
  const [mode,setMode]=useState<Mode>("signin"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState(""),[email,setEmail]=useState("");
  const [otpDest,setOtpDest]=useState(""),[otpCode,setOtpCode]=useState(""),[otpRequested,setOtpRequested]=useState(false),[resetPassword,setResetPassword]=useState("");
  const [address,setAddress]=useState({label:"Home",line1:"",locality:"Parvathipuram",city:"Parvathipuram",postalCode:"535501",latitude:18.783,longitude:83.426,isDefault:true});
  const [profileForm,setProfileForm]=useState({name:"",language:"en",vegetarian:false,vegan:false});
  const [passwordForm,setPasswordForm]=useState({currentPassword:"",newPassword:""});
  const [pushEnabled,setPushEnabled]=useState(false);

  useEffect(()=>{api<Caps>("/platform/capabilities").then(setCaps).catch(()=>{});setPushEnabled(!!localStorage.getItem("ppm_fcm_token"));loadAccount()},[]);
  async function loadAccount(){
    if(typeof window==="undefined"||!sessionStorage.getItem("ppm_access_token"))return;
    try{
      const [u,a,s,n]:any=await Promise.all([api("/me"),api("/me/addresses"),api("/me/sessions"),api("/me/notification-preferences")]);
      setMe(u);setAddresses(a);setSessions(s);setNotificationPrefs(n);
      setProfileForm({
        name:u.profile?.name??"",
        language:u.profile?.language??"en",
        vegetarian:!!u.profile?.dietaryPreferences?.vegetarian,
        vegan:!!u.profile?.dietaryPreferences?.vegan
      });
    }catch{clearSession();setMe(null)}
  }
  async function signIn(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const s:any=await api("/auth/login",{method:"POST",body:JSON.stringify({identifier,password})});saveSession(s);await loadAccount();setMessage("Signed in")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function register(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r:any=await api("/auth/register",{method:"POST",body:JSON.stringify({name,email,password})});if(r.accessToken){saveSession(r);await loadAccount();setMessage(r.verificationDeferred?"Account created. Email verification will be enabled when mail delivery is configured.":"Account created")}else{setOtpDest(email);setMode("verifySignup");setMessage("Verification code sent to your email")}}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function requestOtp(){setBusy(true);setMessage("");try{await api("/auth/otp/request",{method:"POST",body:JSON.stringify({destination:otpDest,purpose:"LOGIN"})});setOtpRequested(true);setMessage("Verification code sent")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function verifyOtp(purpose:"LOGIN"|"SIGNUP"){setBusy(true);setMessage("");try{const s:any=await api("/auth/otp/verify",{method:"POST",body:JSON.stringify({destination:otpDest,purpose,code:otpCode,name:name||undefined})});saveSession(s);await loadAccount();setMessage("Signed in")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function requestReset(){setBusy(true);setMessage("");try{await api("/auth/forgot-password",{method:"POST",body:JSON.stringify({identifier:otpDest})});setOtpRequested(true);setMessage("If that account exists, a reset code has been sent")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function finishReset(){setBusy(true);setMessage("");try{await api("/auth/reset-password",{method:"POST",body:JSON.stringify({identifier:otpDest,code:otpCode,newPassword:resetPassword})});setMode("signin");setPassword("");setMessage("Password reset. Sign in with your new password.")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function addAddress(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api("/me/addresses",{method:"POST",body:JSON.stringify({...address,latitude:Number(address.latitude),longitude:Number(address.longitude)})});setAddresses(await api("/me/addresses"));setMessage("Address saved")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  function useLocation(){if(!navigator.geolocation){setMessage("Location is not available in this browser");return}navigator.geolocation.getCurrentPosition(p=>setAddress(a=>({...a,latitude:Number(p.coords.latitude.toFixed(6)),longitude:Number(p.coords.longitude.toFixed(6))})),()=>setMessage("Could not access your location"),{enableHighAccuracy:true,timeout:10000})}
  async function saveProfile(e:React.FormEvent){
    e.preventDefault();setBusy(true);
    try{
      await api("/me/profile",{method:"PATCH",body:JSON.stringify({
        name:profileForm.name,language:profileForm.language,
        dietaryPreferences:{vegetarian:profileForm.vegetarian,vegan:profileForm.vegan}
      })});
      await loadAccount();setMessage("Profile updated");
    }catch(e:any){setMessage(e.message)}finally{setBusy(false)}
  }
  async function saveNotifications(){
    try{setNotificationPrefs(await api("/me/notification-preferences",{method:"PATCH",body:JSON.stringify(notificationPrefs)}));setMessage("Notification preferences updated")}catch(e:any){setMessage(e.message)}
  }
  async function enablePush(){
    setBusy(true);setMessage("");
    try{await enableBrowserPush();setPushEnabled(true);setNotificationPrefs((p:any)=>({...p,push:true}));setMessage("Browser push notifications enabled")}
    catch(e:any){setMessage(e.message)}
    finally{setBusy(false)}
  }
  async function disablePush(){
    setBusy(true);setMessage("");
    try{await disableBrowserPush();setPushEnabled(false);setMessage("Browser push notifications disabled")}
    catch(e:any){setMessage(e.message)}
    finally{setBusy(false)}
  }
  async function revokeSession(id:string){try{await api("/me/sessions/"+id,{method:"DELETE"});await loadAccount();setMessage("Session revoked")}catch(e:any){setMessage(e.message)}}
  async function changePassword(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api("/auth/password",{method:"POST",body:JSON.stringify(passwordForm)});clearSession();setMe(null);setPasswordForm({currentPassword:"",newPassword:""});setMessage("Password changed. Please sign in again.")}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
  async function editAddress(a:any){
    const line1=window.prompt("House / street",a.line1);if(!line1)return;
    const locality=window.prompt("Locality",a.locality??"")??a.locality;
    try{await api("/me/addresses/"+a.id,{method:"PATCH",body:JSON.stringify({line1,locality})});setAddresses(await api("/me/addresses"));setMessage("Address updated")}catch(e:any){setMessage(e.message)}
  }
  async function deleteAddress(id:string){if(!window.confirm("Delete this saved address?"))return;try{await api("/me/addresses/"+id,{method:"DELETE"});setAddresses(await api("/me/addresses"));setMessage("Address deleted")}catch(e:any){setMessage(e.message)}}
  async function exportData(){try{const data=await api("/me/export");const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ppm-bites-data-export.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e:any){setMessage(e.message)}}
  async function deleteAccount(){if(!window.confirm("Request account deletion? Your active sessions will be revoked."))return;try{await api("/me",{method:"DELETE"});clearSession();setMe(null);setMessage("Account deletion requested")}catch(e:any){setMessage(e.message)}}

  async function signOut(){const refreshToken=sessionStorage.getItem("ppm_refresh_token");try{if(refreshToken)await api("/auth/logout",{method:"POST",body:JSON.stringify({refreshToken})})}catch{}clearSession();setMe(null);setAddresses([]);setSessions([]);setMode("signin")}

  if(me)return <main className="mx-auto max-w-6xl p-4 md:p-8">
    <div className="split mb-7"><a href="/"><Brand/></a><div className="flex flex-wrap gap-2"><a className="button secondary inline-flex items-center" href="/orders">Orders</a><a className="button secondary inline-flex items-center" href="/notifications">Notifications</a><a className="button secondary inline-flex items-center" href="/favorites">Favorites</a><Button variant="ghost" onClick={signOut}>Sign out</Button></div></div>

    <div className="grid cols-2">
      <section className="card">
        <span className="eyebrow">PROFILE</span><h1 className="mt-2 text-3xl font-black">{me.profile?.name??"Customer"}</h1>
        <form className="stack mt-4" onSubmit={saveProfile}>
          <input className="input" required minLength={2} placeholder="Name" value={profileForm.name} onChange={e=>setProfileForm({...profileForm,name:e.target.value})}/>
          <select className="input" value={profileForm.language} onChange={e=>setProfileForm({...profileForm,language:e.target.value})}><option value="en">English</option><option value="te">Telugu</option><option value="hi">Hindi</option></select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.vegetarian} onChange={e=>setProfileForm({...profileForm,vegetarian:e.target.checked})}/> Prefer vegetarian options</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profileForm.vegan} onChange={e=>setProfileForm({...profileForm,vegan:e.target.checked})}/> Prefer vegan options</label>
          <Button disabled={busy}>Save profile</Button>
        </form>
        <div className="mt-5 border-t border-[#e9e4dc] pt-4"><div><span className="muted text-sm">Email</span><div className="font-semibold">{me.email??"Not added"} {me.emailVerifiedAt&&<Pill tone="success">Verified</Pill>}</div></div><div className="mt-3"><span className="muted text-sm">Phone</span><div className="font-semibold">{me.phone??"Not added"}</div></div><div className="mt-3"><span className="muted text-sm">Wallet</span><div className="font-semibold">₹{((me.wallet?.balancePaise??0)/100).toFixed(0)}</div></div></div>
      </section>

      <section className="card">
        <span className="eyebrow">SECURITY</span><h2 className="mt-2 text-xl font-bold">Password & sessions</h2>
        <form className="stack mt-4" onSubmit={changePassword}><input className="input" type="password" minLength={8} required placeholder="Current password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})}/><input className="input" type="password" minLength={10} required placeholder="New password (10+ characters)" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})}/><Button variant="secondary" disabled={busy}>Change password</Button></form>
        <div className="list mt-5">{sessions.slice(0,8).map(s=><div key={s.id} className="row"><div><b>{s.deviceName||"Browser session"}</b><div className="muted text-xs">{s.ipAddress||"IP unavailable"} · {new Date(s.createdAt).toLocaleString()}</div></div>{s.revokedAt?<Pill>Signed out</Pill>:<Button variant="ghost" onClick={()=>revokeSession(s.id)}>Revoke</Button>}</div>)}</div>
      </section>
    </div>

    <section className="card mt-5">
      <div className="split"><div><span className="eyebrow">DELIVERY</span><h2 className="mt-1 text-2xl font-bold">Saved addresses</h2></div><span className="muted text-sm">{addresses.length} saved</span></div>
      {addresses.length>0&&<div className="grid cols-2 mt-4">{addresses.map(a=><div key={a.id} className="rounded-2xl border border-[#e9e4dc] p-4"><div className="font-bold">{a.label} {a.isDefault&&<Pill tone="success">Default</Pill>}</div><div className="muted mt-1 text-sm">{a.line1}{a.locality?", "+a.locality:""}, {a.city} {a.postalCode??""}</div><div className="mt-3 flex gap-2"><Button variant="ghost" onClick={()=>editAddress(a)}>Edit</Button><Button variant="danger" onClick={()=>deleteAddress(a.id)}>Delete</Button></div></div>)}</div>}
      <form onSubmit={addAddress} className="grid cols-2 mt-5"><div className="stack"><input className="input" placeholder="Label e.g. Home" value={address.label} onChange={e=>setAddress({...address,label:e.target.value})}/><input className="input" placeholder="House / street" required value={address.line1} onChange={e=>setAddress({...address,line1:e.target.value})}/><input className="input" placeholder="Locality" value={address.locality} onChange={e=>setAddress({...address,locality:e.target.value})}/><div className="grid grid-cols-2 gap-2"><input className="input" placeholder="City" value={address.city} onChange={e=>setAddress({...address,city:e.target.value})}/><input className="input" placeholder="PIN" value={address.postalCode} onChange={e=>setAddress({...address,postalCode:e.target.value})}/></div></div><div className="stack"><div className="grid grid-cols-2 gap-2"><input className="input" type="number" step="any" aria-label="Latitude" value={address.latitude} onChange={e=>setAddress({...address,latitude:Number(e.target.value)})}/><input className="input" type="number" step="any" aria-label="Longitude" value={address.longitude} onChange={e=>setAddress({...address,longitude:Number(e.target.value)})}/></div><Button type="button" variant="secondary" onClick={useLocation}>Use my current location</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={address.isDefault} onChange={e=>setAddress({...address,isDefault:e.target.checked})}/> Make default address</label><Button disabled={busy||!address.line1} type="submit">Save address</Button></div></form>
    </section>

    <div className="grid cols-2 mt-5">
      <section className="card"><span className="eyebrow">NOTIFICATIONS</span><h2 className="mt-1 text-xl font-bold">Notification preferences</h2><div className="stack mt-4">{(["inApp","push","sms","email","promotions"] as const).map(k=><label key={k} className="flex items-center justify-between gap-3"><span>{k==="inApp"?"In-app":k[0].toUpperCase()+k.slice(1)}</span><input type="checkbox" checked={!!notificationPrefs[k]} onChange={e=>setNotificationPrefs({...notificationPrefs,[k]:e.target.checked})}/></label>)}</div><Button onClick={saveNotifications} style={{marginTop:16}}>Save preferences</Button><div className="mt-4 border-t border-[#e9e4dc] pt-4"><div className="split"><div><b>Browser push</b><div className="muted text-xs">{pushEnabled?"Enabled on this browser":caps.pushNotifications&&firebaseWebConfigured()?"Available":"Waiting for Firebase credentials"}</div></div>{pushEnabled?<Button variant="ghost" disabled={busy} onClick={disablePush}>Disable</Button>:<Button variant="secondary" disabled={busy||!caps.pushNotifications||!firebaseWebConfigured()} onClick={enablePush}>Enable push</Button>}</div></div></section>
      <section className="card"><span className="eyebrow">PRIVACY</span><h2 className="mt-1 text-xl font-bold">Your data</h2><p className="muted mt-2 text-sm">Download a JSON copy of your account data, or request deletion.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={exportData}>Export my data</Button><Button variant="danger" onClick={deleteAccount}>Delete account</Button></div></section>
    </div>
    {message&&<div className="toast">{message}</div>}
  </main>

  const otpAvailable=caps.emailOtp||caps.smsOtp;
  return <main className="mx-auto max-w-4xl p-4 md:p-8"><div className="split mb-8"><a href="/"><Brand/></a><a href="/" className="button ghost inline-flex items-center">← Back to restaurants</a></div><div className="grid md:grid-cols-[.85fr_1.15fr] gap-5"><section className="card bg-[#171512] text-white"><span className="eyebrow">PPM BITES ACCOUNT</span><h1 className="mt-3 text-4xl font-black">One account for ordering, tracking and support.</h1><p className="mt-3 text-[#cfc8bf]">Secure password sign-in is available now. OTP options appear automatically when verified messaging providers are connected.</p><div className="mt-6 flex flex-wrap gap-2"><Pill tone="success">Password auth</Pill><Pill tone={caps.emailOtp?"success":"neutral"}>Email OTP {caps.emailOtp?"on":"pending"}</Pill><Pill tone={caps.smsOtp?"success":"neutral"}>SMS OTP {caps.smsOtp?"on":"pending"}</Pill></div></section>
    <section className="card"><div className="mb-5 flex flex-wrap gap-2"><Button variant={mode==="signin"?"primary":"secondary"} onClick={()=>{setMode("signin");setMessage("")}}>Sign in</Button><Button variant={mode==="register"?"primary":"secondary"} onClick={()=>{setMode("register");setMessage("")}}>Create account</Button>{otpAvailable&&<Button variant={mode==="otp"?"primary":"secondary"} onClick={()=>{setMode("otp");setOtpRequested(false);setMessage("")}}>OTP sign in</Button>}</div>
    {mode==="signin"&&<form onSubmit={signIn} className="stack"><h2 className="text-2xl font-bold">Welcome back</h2><input className="input" required placeholder="Email or phone" value={identifier} onChange={e=>setIdentifier(e.target.value)}/><input className="input" required minLength={8} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}/><Button disabled={busy} type="submit">{busy?"Signing in…":"Sign in"}</Button>{otpAvailable&&<button type="button" className="text-left text-sm font-semibold text-[#b83317]" onClick={()=>{setMode("reset");setOtpDest(identifier);setOtpRequested(false)}}>Forgot password?</button>}</form>}
    {mode==="register"&&<form onSubmit={register} className="stack"><h2 className="text-2xl font-bold">Create your account</h2><input className="input" required minLength={2} placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/><input className="input" required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input" required minLength={10} type="password" placeholder="Password (10+ characters)" value={password} onChange={e=>setPassword(e.target.value)}/><Button disabled={busy} type="submit">{busy?"Creating…":"Create account"}</Button></form>}
    {mode==="verifySignup"&&<div className="stack"><h2 className="text-2xl font-bold">Verify your email</h2><p className="muted">Enter the 6-digit code sent to {otpDest}.</p><input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\D/g,""))}/><Button disabled={busy||otpCode.length!==6} onClick={()=>verifyOtp("SIGNUP")}>Verify and continue</Button></div>}
    {mode==="otp"&&<div className="stack"><h2 className="text-2xl font-bold">Sign in with OTP</h2><input className="input" placeholder="Verified email or phone" value={otpDest} onChange={e=>setOtpDest(e.target.value)}/>{!otpRequested?<Button disabled={busy||!otpDest} onClick={requestOtp}>Send code</Button>:<><input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\D/g,""))}/><Button disabled={busy||otpCode.length!==6} onClick={()=>verifyOtp("LOGIN")}>Verify and sign in</Button></>}</div>}
    {mode==="reset"&&<div className="stack"><h2 className="text-2xl font-bold">Reset password</h2><input className="input" placeholder="Email or phone" value={otpDest} onChange={e=>setOtpDest(e.target.value)}/>{!otpRequested?<Button disabled={busy||!otpDest} onClick={requestReset}>Send reset code</Button>:<><input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\D/g,""))}/><input className="input" type="password" minLength={10} placeholder="New password (10+ characters)" value={resetPassword} onChange={e=>setResetPassword(e.target.value)}/><Button disabled={busy||otpCode.length!==6||resetPassword.length<10} onClick={finishReset}>Reset password</Button></>}</div>}
    {message&&<div className="mt-4 rounded-xl bg-[#f8f5ef] p-3 text-sm">{message}</div>}</section></div></main>;
}
