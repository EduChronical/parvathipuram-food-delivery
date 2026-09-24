"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,EmptyState,Pill} from "@ppm/ui";

export default function NotificationsPage(){
 const [items,setItems]=useState<any[]>([]),[message,setMessage]=useState("");
 async function load(){try{setItems(await api("/notifications"))}catch(e:any){if(e.message.includes("Authentication"))location.href="/account";else setMessage(e.message)}}
 useEffect(()=>{load()},[]);
 async function read(id:string){try{await api("/notifications/"+id+"/read",{method:"PATCH"});await load()}catch(e:any){setMessage(e.message)}}
 async function readAll(){try{await api("/notifications/read-all",{method:"POST"});await load()}catch(e:any){setMessage(e.message)}}
 const unread=items.filter(n=>!n.readAt).length;
 return <main className="mx-auto max-w-4xl p-4 md:p-8">
  <div className="split mb-7"><a href="/"><Brand/></a><div className="flex gap-2"><Button variant="secondary" onClick={readAll} disabled={!unread}>Mark all read</Button><a href="/" className="button ghost inline-flex items-center">Home</a></div></div>
  <div className="split"><div><h1 className="text-3xl font-black">Notifications</h1><p className="muted mt-1">Order, partner and account updates from PPM Bites.</p></div>{unread>0&&<Pill tone="warning">{unread} unread</Pill>}</div>
  {items.length?<div className="list mt-6">{items.map(n=><button key={n.id} onClick={()=>!n.readAt&&read(n.id)} className={"card w-full text-left "+(!n.readAt?"border-[#e6502c]":"")}><div className="split"><b>{n.title}</b><Pill tone={n.readAt?"neutral":"success"}>{n.readAt?"Read":"New"}</Pill></div><p className="mt-2 text-sm">{n.body}</p><div className="muted mt-3 text-xs">{new Date(n.createdAt).toLocaleString()} · {String(n.channel).replaceAll("_"," ")}</div></button>)}</div>:<EmptyState title="No notifications yet" body="Order and account updates will appear here."/>}
  {message&&<div className="toast">{message}</div>}
 </main>;
}
