"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,money} from "@ppm/ui";

export default function Checkout(){
 const [cart,setCart]=useState<any>(null);
 const [addresses,setAddresses]=useState<any[]>([]);
 const [addressId,setAddressId]=useState("");
 const [coupon,setCoupon]=useState("WELCOME50");
 const [method,setMethod]=useState("UPI");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [order,setOrder]=useState<any>(null);

 useEffect(()=>{
   const rid=sessionStorage.getItem("ppm_restaurant_id");
   if(!rid)return;
   Promise.all([api("/carts/"+rid),api("/me/addresses")])
    .then(([c,a]:any)=>{setCart(c);setAddresses(a);setAddressId(a.find((x:any)=>x.isDefault)?.id??a[0]?.id??"")})
    .catch((e:any)=>setMessage(e.message));
 },[]);

 async function place(){
   if(!cart||!addressId)return;
   setBusy(true);
   try{
    const result:any=await api("/checkout",{
      method:"POST",
      headers:{"Idempotency-Key":"checkout-"+Date.now()+"-"+Math.random().toString(36).slice(2)},
      body:JSON.stringify({restaurantId:cart.restaurantId,addressId,paymentMethod:method,couponCode:coupon||undefined})
    });
    if(result.paymentRequired&&(process.env.NEXT_PUBLIC_PAYMENT_PROVIDER??"dev")==="dev"){
      await api("/payments/"+result.order.id+"/dev-confirm",{method:"POST"});
    }
    setOrder(result.order);
    setMessage("Order placed successfully");
   }catch(e:any){setMessage(e.message)}
   finally{setBusy(false)}
 }

 if(order)return <main className="mx-auto max-w-xl p-5"><Brand/><div className="card mt-8 text-center"><div className="text-5xl">✓</div><h1 className="mt-3 text-3xl font-black">Order placed</h1><p className="muted">Order {order.orderNumber}</p><a className="button primary mt-5 inline-flex items-center" href="/orders">Track order</a></div></main>;

 const total=cart?.items?.reduce((s:number,i:any)=>s+(i.menuItem.discountedPricePaise??i.menuItem.pricePaise)*i.quantity,0)??0;
 return <main className="mx-auto max-w-3xl p-4 md:p-8"><div className="mb-7"><Brand/></div><h1 className="mb-5 text-3xl font-black">Checkout</h1><div className="grid cols-2"><section className="card stack"><h2 className="text-xl font-bold">Delivery</h2><select className="input" value={addressId} onChange={e=>setAddressId(e.target.value)}>{addresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.line1}</option>)}</select><textarea className="input min-h-24 py-3" placeholder="Delivery instructions"/><h2 className="mt-2 text-xl font-bold">Offer</h2><input className="input" value={coupon} onChange={e=>setCoupon(e.target.value)} placeholder="Coupon code"/><h2 className="mt-2 text-xl font-bold">Payment</h2><select className="input" value={method} onChange={e=>setMethod(e.target.value)}><option>UPI</option><option>CARD</option><option>NETBANKING</option><option>WALLET</option><option>COD</option></select></section><aside className="card"><h2 className="text-xl font-bold">Order summary</h2><div className="list mt-3">{cart?.items?.map((i:any)=><div className="row" key={i.id}><span>{i.quantity} × {i.menuItem.name}</span><b>{money((i.menuItem.discountedPricePaise??i.menuItem.pricePaise)*i.quantity)}</b></div>)}</div><div className="split mt-4 text-lg"><b>Items</b><b>{money(total)}</b></div><p className="muted text-sm">Taxes, delivery, packaging and discounts are recalculated securely by the server before payment.</p><Button disabled={busy||!addressId} onClick={place} style={{width:"100%",marginTop:16}}>{busy?"Placing…":"Place order"}</Button></aside></div>{message&&<div className="toast">{message}</div>}</main>
}
