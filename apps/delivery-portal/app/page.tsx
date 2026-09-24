"use client";
import {useEffect,useState} from "react";
import {api,Button,EmptyState,money,Pill,PortalShell,Stat} from "@ppm/ui";

export default function DeliveryPortal(){
 const [logged,setLogged]=useState(false);
 const [password,setPassword]=useState("DemoPass!2026");
 const [online,setOnline]=useState(true);
 const [offers,setOffers]=useState<any[]>([]);
 const [message,setMessage]=useState("");
 useEffect(()=>setLogged(!!sessionStorage.getItem("ppm_access_token")),[]);
 useEffect(()=>{if(logged){load();sendLocation()}},[logged]);

 async function login(e:React.FormEvent){
  e.preventDefault();
  try{
   const d:any=await api("/auth/login",{method:"POST",body:JSON.stringify({identifier:"delivery@ppmbites.local",password})});
   sessionStorage.setItem("ppm_access_token",d.accessToken);setLogged(true);
  }catch(e:any){setMessage(e.message)}
 }
 async function load(){try{setOffers(await api("/delivery/offers"))}catch(e:any){setMessage(e.message)}}
 async function toggle(){
  try{const next=!online;await api("/delivery/online",{method:"POST",body:JSON.stringify({online:next})});setOnline(next)}
  catch(e:any){setMessage(e.message)}
 }
 function sendLocation(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(async p=>{
   try{await api("/delivery/location",{method:"POST",body:JSON.stringify({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracyM:p.coords.accuracy})})}catch{}
  },()=>{});
 }
 async function respond(id:string,accept:boolean){
  try{await api("/delivery/assignments/"+id+"/respond",{method:"POST",body:JSON.stringify({accept})});setMessage(accept?"Delivery accepted":"Offer declined");await load()}
  catch(e:any){setMessage(e.message)}
 }

 if(!logged)return <main className="mx-auto max-w-md p-5 pt-20">
  <div className="card"><span className="eyebrow">DELIVERY PARTNER</span><h1 className="my-3 text-3xl font-black">Your route. Your earnings.</h1>
  <p className="muted">Go online, accept nearby deliveries and keep every step visible.</p>
  <form className="stack mt-5" onSubmit={login}><input className="input" value="delivery@ppmbites.local" readOnly/><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><Button type="submit">Sign in</Button></form></div>
  {message&&<div className="toast">{message}</div>}</main>;

 return <PortalShell title="Delivery hub" nav={["Home","Current Delivery","Earnings","History","Profile","Support"]} active="Home" actions={<Button variant={online?"secondary":"primary"} onClick={toggle}>{online?"Go offline":"Go online"}</Button>}>
  <div className="grid cols-4 mb-5"><Stat label="Status" value={online?"Online":"Offline"} detail="Availability"/><Stat label="New offers" value={offers.length}/><Stat label="Today's earnings" value={money(0)}/><Stat label="Active deliveries" value={0}/></div>
  <section className="card"><div className="split"><div><span className="eyebrow">NEARBY REQUESTS</span><h2 className="text-xl font-bold">Delivery offers</h2></div><Button variant="secondary" onClick={load}>Refresh</Button></div>
  {offers.length?<div className="list mt-4">{offers.map(a=><div className="row" key={a.id}><div><b>{a.order.restaurant.name}</b><div className="muted text-sm">{a.order.restaurant.address}</div><div className="mt-1 font-bold">{money(a.order.deliveryFeePaise)}</div></div><div className="flex gap-2"><Button variant="secondary" onClick={()=>respond(a.id,false)}>Decline</Button><Button onClick={()=>respond(a.id,true)}>Accept</Button></div></div>)}</div>:<EmptyState title={online?"No delivery offers right now":"You are offline"} body={online?"Nearby requests will appear here when restaurants need a rider.":"Go online to receive delivery requests."}/>}</section>
  {message&&<div className="toast">{message}</div>}
 </PortalShell>
}
