"use client";
import {useEffect,useState} from "react";
import {api,apiBlob,Brand,EmptyState,money,Pill,Button} from "@ppm/ui";

function loadRazorpay(){
  return new Promise<boolean>(resolve=>{
    if((window as any).Razorpay)return resolve(true);
    const s=document.createElement("script");
    s.src="https://checkout.razorpay.com/v1/checkout.js";
    s.async=true;s.onload=()=>resolve(true);s.onerror=()=>resolve(false);
    document.body.appendChild(s);
  });
}

export default function Orders(){
 const [orders,setOrders]=useState<any[]>([]),[details,setDetails]=useState<Record<string,any>>({}),[ratingOrder,setRatingOrder]=useState<string|null>(null);
 const [stars,setStars]=useState(5),[reviewText,setReviewText]=useState(""),[error,setError]=useState("");
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

 async function toggleDetails(id:string){if(details[id]){setDetails(d=>({...d,[id]:null}));return}try{const d=await api("/orders/"+id);setDetails(x=>({...x,[id]:d}))}catch(e:any){setError(e.message)}}
 async function reorder(id:string){try{const r:any=await api("/orders/"+id+"/reorder",{method:"POST"});sessionStorage.setItem("ppm_restaurant_id",r.cart.restaurantId);if(r.skipped?.length)setError("Some unavailable items were skipped: "+r.skipped.join(", "));location.href="/checkout"}catch(e:any){setError(e.message)}}
 async function invoice(order:any){try{const blob=await apiBlob("/orders/"+order.id+"/invoice");const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="PPM-Bites-"+order.orderNumber+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}catch(e:any){setError(e.message)}}
 async function rate(id:string){try{await api("/reviews",{method:"POST",body:JSON.stringify({orderId:id,restaurantRating:stars,foodRating:stars,deliveryRating:stars,text:reviewText||undefined})});setRatingOrder(null);setReviewText("");setError("Thanks — your review was submitted.");await load()}catch(e:any){setError(e.message)}}
 async function retryPayment(o:any){
   try{
     setError("Opening secure payment…");
     const checkout:any=await api("/payments/"+o.id+"/create",{method:"POST"});
     if(checkout.alreadyPaid){await load();setError("Payment already confirmed.");return}
     const ready=await loadRazorpay();if(!ready)throw new Error("Payment window could not load");
     const rz=new (window as any).Razorpay({
       key:checkout.keyId,order_id:checkout.orderId,amount:checkout.amount,currency:checkout.currency??"INR",
       name:"PPM Bites",description:"Food order "+o.orderNumber,retry:{enabled:true},
       handler:()=>{setError("Payment received. Waiting for secure confirmation…");setTimeout(load,2000)},
       modal:{ondismiss:()=>setError("Payment window closed. You can retry again from this order.")}
     });
     rz.on("payment.failed",(r:any)=>setError(r?.error?.description??"Payment failed"));
     rz.open();
   }catch(e:any){setError(e.message)}
 }
 async function cancel(id:string){const reason=window.prompt("Why are you cancelling this order?");if(!reason)return;try{await api("/orders/"+id+"/cancel",{method:"POST",body:JSON.stringify({reason})});await load()}catch(e:any){setError(e.message)}}

 return <main className="mx-auto max-w-4xl p-4 md:p-8">
   <div className="mb-7"><Brand/></div>
   <div className="split"><h1 className="text-3xl font-black">Your orders</h1><div className="flex gap-2"><Button variant="secondary" onClick={load}>Refresh</Button><a href="/favorites" className="button secondary inline-flex items-center">Favorites</a><a href="/" className="button ghost inline-flex items-center">Home</a></div></div>
   {orders.length?<div className="list mt-6">{orders.map(o=><div key={o.id} className="card">
     <div className="split"><div><b>{o.restaurant.name}</b><div className="muted text-sm">{o.orderNumber}</div></div><Pill tone={o.status==="DELIVERED"?"success":o.status==="CANCELLED"?"danger":"warning"}>{o.status.replaceAll("_"," ")}</Pill></div>
     <div className="split mt-4"><span>{new Date(o.createdAt).toLocaleString()}</span><b>{money(o.totalPaise)}</b></div>
     <div className="mt-4 flex flex-wrap gap-2">
       <Button variant="secondary" onClick={()=>toggleDetails(o.id)}>{details[o.id]?"Hide details":"Track / details"}</Button>
       <Button variant="secondary" onClick={()=>invoice(o)}>Invoice PDF</Button>
       {o.status==="DELIVERED"&&<><Button onClick={()=>reorder(o.id)}>Reorder</Button><Button variant="ghost" onClick={()=>setRatingOrder(ratingOrder===o.id?null:o.id)}>Rate</Button></>}
       {o.status==="PAYMENT_PENDING"&&<Button onClick={()=>retryPayment(o)}>Retry payment</Button>}{["CREATED","PAYMENT_PENDING","PAYMENT_CONFIRMED","PLACED"].includes(o.status)&&<Button variant="danger" onClick={()=>cancel(o.id)}>Cancel</Button>}
     </div>
     {details[o.id]&&<div className="mt-5 rounded-2xl bg-[#f8f5ef] p-4"><b>Order progress</b><div className="mt-3 grid gap-2">{details[o.id].history?.map((h:any)=><div key={h.id} className="flex items-center justify-between gap-3 text-sm"><span>{h.toStatus.replaceAll("_"," ")}</span><span className="muted">{new Date(h.createdAt).toLocaleString()}</span></div>)}</div><div className="mt-4 border-t border-[#e9e4dc] pt-3">{details[o.id].items?.map((i:any)=><div className="split text-sm" key={i.id}><span>{i.quantity} × {i.nameSnapshot}</span><b>{money(i.unitPricePaise*i.quantity)}</b></div>)}</div></div>}
     {ratingOrder===o.id&&<div className="mt-5 rounded-2xl border border-[#e9e4dc] p-4"><h3 className="font-bold">Rate this order</h3><div className="mt-3 flex gap-2">{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setStars(n)} className={"text-2xl "+(n<=stars?"opacity-100":"opacity-30")}>★</button>)}</div><textarea className="input mt-3 min-h-24 py-3" placeholder="Tell us about the food and delivery" value={reviewText} onChange={e=>setReviewText(e.target.value)}/><Button style={{marginTop:12}} onClick={()=>rate(o.id)}>Submit review</Button></div>}
   </div>)}</div>:<EmptyState title="No orders yet" body="Your completed and active orders will appear here."/>}
   {error&&<div className="toast">{error}</div>}
 </main>;
}
