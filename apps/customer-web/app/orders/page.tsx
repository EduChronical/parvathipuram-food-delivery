"use client";
import {useEffect,useState} from "react";
import {api,Brand,EmptyState,money,Pill,Button} from "@ppm/ui";

export default function Orders(){
 const [orders,setOrders]=useState<any[]>([]);
 const [error,setError]=useState("");
 async function load(){try{setOrders(await api("/orders"))}catch(e:any){setError(e.message)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{
   const active=orders.find(o=>!["DELIVERED","CANCELLED","REFUNDED"].includes(o.status));
   const token=sessionStorage.getItem("ppm_access_token");
   if(!active||!token)return;
   const controller=new AbortController();
   (async()=>{
     try{
       const res=await fetch((process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000")+"/orders/"+active.id+"/events",{headers:{Authorization:"Bearer "+token},signal:controller.signal});
       if(!res.body)return;
       const reader=res.body.getReader();const decoder=new TextDecoder();let buffer="";
       for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.includes("event: order")){buffer="";await load()}}
     }catch{}
   })();
   return()=>controller.abort();
 },[orders.map(o=>o.id+o.status).join("|")]);
 return <main className="mx-auto max-w-4xl p-4 md:p-8"><div className="mb-7"><Brand/></div><div className="split"><h1 className="text-3xl font-black">Your orders</h1><div className="flex gap-2"><Button variant="secondary" onClick={load}>Refresh</Button><a href="/" className="button ghost inline-flex items-center">Home</a></div></div>{orders.length?<div className="list mt-6">{orders.map(o=><div key={o.id} className="card"><div className="split"><div><b>{o.restaurant.name}</b><div className="muted text-sm">{o.orderNumber}</div></div><Pill tone={o.status==="DELIVERED"?"success":o.status==="CANCELLED"?"danger":"warning"}>{o.status.replaceAll("_"," ")}</Pill></div><div className="split mt-4"><span>{new Date(o.createdAt).toLocaleString()}</span><b>{money(o.totalPaise)}</b></div></div>)}</div>:<EmptyState title="No orders yet" body="Your completed and active orders will appear here."/>}{error&&<div className="toast">{error}</div>}</main>
}
