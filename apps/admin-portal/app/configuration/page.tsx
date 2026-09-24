"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,EmptyState} from "@ppm/ui";
export default function Configuration(){
 const [flags,setFlags]=useState<any[]>([]),[message,setMessage]=useState("");
 async function load(){try{setFlags(await api("/admin/feature-flags"))}catch(e:any){setMessage(e.message)}}
 useEffect(()=>{load()},[]);
 async function flip(f:any){try{await api("/admin/feature-flags/"+encodeURIComponent(f.key),{method:"PATCH",body:JSON.stringify({enabled:!f.enabled,config:f.config})});await load()}catch(e:any){setMessage(e.message)}}
 return <main className="mx-auto max-w-4xl p-4 md:p-8"><div className="mb-6 flex items-center justify-between"><Brand/><a href="/" className="button secondary inline-flex items-center">Admin home</a></div><h1 className="text-3xl font-black">Configuration</h1><p className="muted mb-6">Safely release optional platform capabilities without code deployment.</p>{flags.length?<div className="card list">{flags.map(f=><div className="row" key={f.key}><div><b>{f.key.replaceAll("_"," ")}</b><div className="muted text-sm">{f.enabled?"Enabled":"Disabled"}</div></div><Button variant={f.enabled?"secondary":"primary"} onClick={()=>flip(f)}>{f.enabled?"Disable":"Enable"}</Button></div>)}</div>:<EmptyState title="No flags configured" body="Seed the platform configuration to create default flags."/>}{message&&<div className="toast">{message}</div>}</main>
}
