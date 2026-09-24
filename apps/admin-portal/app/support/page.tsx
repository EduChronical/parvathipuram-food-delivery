"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,EmptyState,Pill} from "@ppm/ui";
export default function Support(){
 const [tickets,setTickets]=useState<any[]>([]),[message,setMessage]=useState("");
 async function load(){try{setTickets(await api("/support/tickets"))}catch(e:any){setMessage(e.message)}}
 useEffect(()=>{load()},[]);
 async function reply(id:string){
  const body=window.prompt("Reply to customer");if(!body)return;
  try{await api("/support/tickets/"+id+"/messages",{method:"POST",body:JSON.stringify({body,internal:false})});await load()}catch(e:any){setMessage(e.message)}
 }
 return <main className="mx-auto max-w-5xl p-4 md:p-8"><div className="mb-6 flex items-center justify-between"><Brand/><a href="/" className="button secondary inline-flex items-center">Admin home</a></div><h1 className="text-3xl font-black">Customer support</h1><p className="muted mb-6">Order, payment, delivery and account issues with customer-visible replies and protected internal notes.</p>{tickets.length?<div className="list">{tickets.map(t=><section className="card" key={t.id}><div className="split"><div><b>{t.subject}</b><div className="muted text-sm">{t.category}</div></div><Pill tone={t.status==="OPEN"?"warning":"neutral"}>{t.status}</Pill></div><div className="mt-4 stack">{t.messages?.map((m:any)=><div key={m.id} className={m.internal?"rounded-xl bg-[#fff2d9] p-3":"rounded-xl bg-[#f8f5ef] p-3"}>{m.body}{m.internal&&<div className="text-xs font-bold">Internal note</div>}</div>)}</div><Button style={{marginTop:14}} onClick={()=>reply(t.id)}>Reply</Button></section>)}</div>:<EmptyState title="Support queue is clear" body="Customer tickets will appear here."/>}{message&&<div className="toast">{message}</div>}</main>
}
