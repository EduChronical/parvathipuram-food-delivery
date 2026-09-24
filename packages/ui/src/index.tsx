import React from "react";

export const money=(paise:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(paise/100);

export type AuthSession={accessToken:string;refreshToken?:string;user?:any};
export function saveSession(session:AuthSession){
  if(typeof window==="undefined")return;
  sessionStorage.setItem("ppm_access_token",session.accessToken);
  if(session.refreshToken)sessionStorage.setItem("ppm_refresh_token",session.refreshToken);
  if(session.user)sessionStorage.setItem("ppm_user",JSON.stringify(session.user));
}
export function clearSession(){
  if(typeof window==="undefined")return;
  sessionStorage.removeItem("ppm_access_token");
  sessionStorage.removeItem("ppm_refresh_token");
  sessionStorage.removeItem("ppm_user");
}

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
  </div>
}

async function rawApi(path:string,init:RequestInit={},token?:string|null){
  return fetch((process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000")+path,{
    ...init,
    headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(init.headers??{})},
    cache:"no-store"
  });
}

export async function api<T=any>(path:string,init:RequestInit={}):Promise<T>{
  const token=typeof window!=="undefined"?sessionStorage.getItem("ppm_access_token"):null;
  let res=await rawApi(path,init,token);
  if(res.status===401&&typeof window!=="undefined"&&!path.startsWith("/auth/")){
    const refreshToken=sessionStorage.getItem("ppm_refresh_token");
    if(refreshToken){
      const rr=await rawApi("/auth/refresh",{method:"POST",body:JSON.stringify({refreshToken})},null);
      if(rr.ok){
        const next=await rr.json();
        saveSession(next);
        res=await rawApi(path,init,next.accessToken);
      }else clearSession();
    }
  }
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message??"Request failed");
  return data;
}
