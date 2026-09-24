"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,EmptyState,Pill,money} from "@ppm/ui";

export default function Support(){
 const [tickets,setTickets]=useState<any[]>([]),[message,setMessage]=useState("");
 async function load(){try{setTickets(await api("/support/tickets"))}catch(e:any){setMessage(e.message)}}
 useEffect(()=>{load()},[]);
 async function reply(id:string,internal=false){
  const body=window.prompt(internal?"Internal note":"Reply to customer");if(!body)return;
  try{await api("/support/tickets/"+id+"/messages",{method:"POST",body:JSON.stringify({body,internal})});await load()}catch(e:any){setMessage(e.message)}
 }
 async function patch(id:string,body:any){try{await api("/support/tickets/"+id,{method:"PATCH",body:JSON.stringify(body)});await load()}catch(e:any){setMessage(e.message)}}
 async function refund(t:any){
   if(!t.order)return;
   const amount=Number(prompt("Refund amount in rupees",String((t.order.totalPaise/100).toFixed(2))));if(!amount)return;
   const reason=prompt("Refund reason",t.subject);if(!reason)return;
   try{
     await api("/admin/refunds",{method:"POST",body:JSON.stringify({orderId:t.order.id,amountPaise:Math.round(amount*100),reason,idempotencyKey:"support-"+t.id+"-"+Date.now()})});
     setMessage("Refund processed/queued");await load();
   }catch(e:any){setMessage(e.message)}
 }
 return <main className="mx-auto max-w-6xl p-4 md:p-8">
   <div className="mb-6 flex items-center justify-between"><Brand/><a href="/" className="button secondary inline-flex items-center">Admin home</a></div>
   <h1 className="text-3xl font-black">Customer support</h1>
   <p className="muted mb-6">Order, payment, delivery and account issues with customer-visible replies, protected internal notes, assignment and refunds.</p>
   {tickets.length?<div className="list">{tickets.map(t=><section className="card" key={t.id}>
     <div className="split"><div><b>{t.subject}</b><div className="muted text-sm">{t.category} · {t.customer?.profile?.name??t.customer?.email??"Customer"}</div></div><div className="flex gap-2"><Pill tone={t.priority==="URGENT"?"danger":t.priority==="HIGH"?"warning":"neutral"}>{t.priority}</Pill><Pill tone={t.status==="OPEN"?"warning":t.status==="RESOLVED"||t.status==="CLOSED"?"success":"neutral"}>{t.status.replaceAll("_"," ")}</Pill></div></div>
     {t.order&&<div className="mt-3 rounded-xl bg-[#f8f5ef] p-3 text-sm"><b>{t.order.orderNumber}</b> · {t.order.restaurant?.name} · {money(t.order.totalPaise)} · {t.order.status.replaceAll("_"," ")}</div>}
     <div className="mt-4 stack">{t.messages?.map((m:any)=><div key={m.id} className={m.internal?"rounded-xl bg-[#fff2d9] p-3":"rounded-xl bg-[#f8f5ef] p-3"}>{m.body}{m.internal&&<div className="text-xs font-bold">Internal note</div>}</div>)}</div>
     <div className="mt-4 flex flex-wrap gap-2"><Button onClick={()=>reply(t.id,false)}>Reply</Button><Button variant="secondary" onClick={()=>reply(t.id,true)}>Internal note</Button><Button variant="secondary" onClick={()=>patch(t.id,{assignToSelf:true,status:"IN_PROGRESS"})}>Assign to me</Button><Button variant="secondary" onClick={()=>patch(t.id,{priority:t.priority==="URGENT"?"NORMAL":"URGENT"})}>{t.priority==="URGENT"?"Normal priority":"Mark urgent"}</Button><Button variant="secondary" onClick={()=>patch(t.id,{status:"WAITING_FOR_CUSTOMER"})}>Waiting</Button><Button onClick={()=>patch(t.id,{status:"RESOLVED"})}>Resolve</Button>{t.order&&<Button variant="danger" onClick={()=>refund(t)}>Refund</Button>}</div>
   </section>)}</div>:<EmptyState title="Support queue is clear" body="Customer tickets will appear here."/>}
   {message&&<div className="toast">{message}</div>}
 </main>
}
