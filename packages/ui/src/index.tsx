import React from "react";

export const money=(paise:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(paise/100);

export function Brand({compact=false}:{compact?:boolean}){
  return <div className="brand"><span className="brand-mark">P</span>{!compact&&<span><b>PPM Bites</b><small>Parvathipuram, delivered</small></span>}</div>;
}
export function Pill({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"success"|"warning"|"danger"}){
  return <span className={"pill "+tone}>{children}</span>;
}
export function Button({children,variant="primary",...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"ghost"|"danger"}){
  return <button className={"button "+variant} {...props}>{children}</button>;
}
export function EmptyState({title,body}:{title:string;body:string}){return <div className="empty"><div className="empty-icon">✦</div><h3>{title}</h3><p>{body}</p></div>}
export function Stat({label,value,detail}:{label:string;value:string|number;detail?:string}){return <div className="stat"><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>}
export function PortalShell({title,nav,active,children,actions}:{title:string;nav:string[];active:string;children:React.ReactNode;actions?:React.ReactNode}){
  return <div className="portal">
    <aside><Brand/><nav>{nav.map(n=><a key={n} className={n===active?"active":""} href={"#"+n.toLowerCase().replaceAll(" ","-")}>{n}</a>)}</nav></aside>
    <main><header><div><span className="eyebrow">PPM BITES</span><h1>{title}</h1></div><div>{actions}</div></header>{children}</main>
  </div>;
}

const apiBase=()=>process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000";
export function saveSession(session:{accessToken:string;refreshToken?:string}){
  if(typeof window==="undefined")return;
  sessionStorage.setItem("ppm_access_token",session.accessToken);
  if(session.refreshToken)sessionStorage.setItem("ppm_refresh_token",session.refreshToken);
}
export function clearSession(){
  if(typeof window==="undefined")return;
  sessionStorage.removeItem("ppm_access_token");
  sessionStorage.removeItem("ppm_refresh_token");
  sessionStorage.removeItem("ppm_restaurant_id");
}
async function request<T>(path:string,init:RequestInit={},retry=true):Promise<T>{
  const token=typeof window!=="undefined"?sessionStorage.getItem("ppm_access_token"):null;
  const res=await fetch(apiBase()+path,{
    ...init,
    headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(init.headers??{})},
    cache:"no-store"
  });
  if(res.status===401&&retry&&typeof window!=="undefined"&&!path.startsWith("/auth/")){
    const refreshToken=sessionStorage.getItem("ppm_refresh_token");
    if(refreshToken){
      const refreshed=await fetch(apiBase()+"/auth/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken}),cache:"no-store"});
      if(refreshed.ok){
        const session:any=await refreshed.json();
        saveSession(session);
        return request<T>(path,init,false);
      }
      clearSession();
    }
  }
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message??"Request failed");
  return data;
}
export async function api<T=any>(path:string,init:RequestInit={}):Promise<T>{return request<T>(path,init,true)}
