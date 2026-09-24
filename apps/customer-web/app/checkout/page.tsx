"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,money,Pill} from "@ppm/ui";

type Caps={onlinePayments:boolean;cod:boolean};
type PaymentMethod="COD"|"UPI"|"CARD"|"NETBANKING"|"WALLET";

function loadRazorpay(){
  return new Promise<boolean>(resolve=>{
    if((window as any).Razorpay)return resolve(true);
    const s=document.createElement("script");
    s.src="https://checkout.razorpay.com/v1/checkout.js";
    s.async=true;
    s.onload=()=>resolve(true);
    s.onerror=()=>resolve(false);
    document.body.appendChild(s);
  });
}
async function waitForPlacement(orderId:string){
  for(let i=0;i<12;i++){
    const o:any=await api("/orders/"+orderId);
    if(["PLACED","RESTAURANT_CONFIRMED","PREPARING","READY_FOR_PICKUP","DELIVERY_PARTNER_ASSIGNED"].includes(o.status))return o;
    if(o.paymentStatus==="FAILED")throw new Error("Payment failed");
    await new Promise(r=>setTimeout(r,1500));
  }
  return null;
}

export default function Checkout(){
 const [cart,setCart]=useState<any>(null),[addresses,setAddresses]=useState<any[]>([]),[addressId,setAddressId]=useState("");
 const [caps,setCaps]=useState<Caps>({onlinePayments:false,cod:true});
 const [coupon,setCoupon]=useState("WELCOME50"),[instructions,setInstructions]=useState(""),[paymentMethod,setPaymentMethod]=useState<PaymentMethod>("COD");
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[order,setOrder]=useState<any>(null);

 useEffect(()=>{
   const rid=sessionStorage.getItem("ppm_restaurant_id");
   if(!sessionStorage.getItem("ppm_access_token")){location.href="/account";return}
   if(!rid)return;
   Promise.all([api("/carts/"+rid),api("/me/addresses"),api("/platform/capabilities")]).then(([c,a,p]:any)=>{
     setCart(c);setAddresses(a);setAddressId(a.find((x:any)=>x.isDefault)?.id??a[0]?.id??"");setCaps(p)
   }).catch((e:any)=>setMessage(e.message));
 },[]);

 async function launchOnlinePayment(result:any){
   const checkout:any=await api("/payments/"+result.order.id+"/create",{method:"POST"});
   if(checkout.alreadyPaid){setOrder(result.order);return}
   const ready=await loadRazorpay();
   if(!ready)throw new Error("Payment window could not load. Please retry.");
   await new Promise<void>((resolve,reject)=>{
     const rz=new (window as any).Razorpay({
       key:checkout.keyId,
       order_id:checkout.orderId,
       amount:checkout.amount,
       currency:checkout.currency??"INR",
       name:"PPM Bites",
       description:"Food order "+result.order.orderNumber,
       retry:{enabled:true},
       theme:{},
       handler:async()=>{
         try{
           setMessage("Payment received. Confirming securely…");
           const placed=await waitForPlacement(result.order.id);
           setOrder(placed??result.order);
           resolve();
         }catch(e){reject(e)}
       },
       modal:{ondismiss:()=>reject(new Error("Payment window closed. Your pending order can be retried from Orders."))}
     });
     rz.on("payment.failed",(r:any)=>reject(new Error(r?.error?.description??"Payment failed")));
     rz.open();
   });
 }

 async function place(){
   if(!cart||!addressId)return;setBusy(true);setMessage("");
   try{
     const result:any=await api("/checkout",{
       method:"POST",
       headers:{"Idempotency-Key":"checkout-"+Date.now()+"-"+Math.random().toString(36).slice(2)},
       body:JSON.stringify({
         restaurantId:cart.restaurantId,addressId,paymentMethod,
         couponCode:coupon||undefined,deliveryInstructions:instructions||undefined
       })
     });
     if(paymentMethod==="COD"){
       setOrder(result.order);setMessage("Order placed successfully");
     }else{
       await launchOnlinePayment(result);
     }
   }catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 }

 if(order)return <main className="mx-auto max-w-xl p-5"><Brand/><div className="card mt-8 text-center"><div className="text-5xl">✓</div><h1 className="mt-3 text-3xl font-black">{order.status==="PLACED"||paymentMethod==="COD"?"Order placed":"Payment submitted"}</h1><p className="muted">Order {order.orderNumber}</p><a className="button primary mt-5 inline-flex items-center" href="/orders">Track order</a></div></main>;

 const total=cart?.items?.reduce((s:number,i:any)=>s+(i.menuItem.discountedPricePaise??i.menuItem.pricePaise)*i.quantity,0)??0;
 const methods:PaymentMethod[]=caps.onlinePayments?["COD","UPI","CARD","NETBANKING","WALLET"]:["COD"];

 return <main className="mx-auto max-w-3xl p-4 md:p-8">
   <div className="mb-7 split"><Brand/><a href="/account" className="button ghost inline-flex items-center">Account</a></div>
   <h1 className="mb-5 text-3xl font-black">Checkout</h1>
   <div className="grid cols-2">
    <section className="card stack">
      <h2 className="text-xl font-bold">Delivery</h2>
      {addresses.length?<select className="input" value={addressId} onChange={e=>setAddressId(e.target.value)}>{addresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.line1}</option>)}</select>:<div className="rounded-xl bg-[#fff2d9] p-3 text-sm">No saved address. <a className="font-bold underline" href="/account">Add an address</a> before placing the order.</div>}
      <textarea className="input min-h-24 py-3" placeholder="Delivery instructions" value={instructions} onChange={e=>setInstructions(e.target.value)}/>
      <h2 className="mt-2 text-xl font-bold">Offer</h2>
      <input className="input" value={coupon} onChange={e=>setCoupon(e.target.value)} placeholder="Coupon code"/>
      <h2 className="mt-2 text-xl font-bold">Payment</h2>
      <div className="grid gap-2">{methods.map(m=><button type="button" key={m} onClick={()=>setPaymentMethod(m)} className={"rounded-xl border p-3 text-left "+(paymentMethod===m?"border-[#e6502c] bg-[#fff4ef]":"border-[#e9e4dc] bg-white")}><div className="split"><b>{m==="COD"?"Cash on delivery":m==="NETBANKING"?"Net banking":m[0]+m.slice(1).toLowerCase()}</b>{paymentMethod===m&&<Pill tone="success">Selected</Pill>}</div>{m!=="COD"&&<div className="muted mt-1 text-sm">Secure online payment through the configured gateway.</div>}</button>)}</div>
      {!caps.onlinePayments&&<div className="rounded-xl bg-[#f8f5ef] p-3 text-sm">Online payment options automatically appear when the live payment gateway and webhook are configured.</div>}
    </section>

    <aside className="card">
      <h2 className="text-xl font-bold">Order summary</h2>
      <div className="list mt-3">{cart?.items?.map((i:any)=><div className="row" key={i.id}><span>{i.quantity} × {i.menuItem.name}</span><b>{money((i.menuItem.discountedPricePaise??i.menuItem.pricePaise)*i.quantity)}</b></div>)}</div>
      <div className="split mt-4 text-lg"><b>Items</b><b>{money(total)}</b></div>
      <p className="muted text-sm">Taxes, delivery, packaging and discounts are recalculated securely by the server before order confirmation.</p>
      <Button disabled={busy||!addressId} onClick={place} style={{width:"100%",marginTop:16}}>{busy?"Processing…":paymentMethod==="COD"?"Place COD order":"Continue to secure payment"}</Button>
    </aside>
   </div>
   {message&&<div className="toast">{message}</div>}
 </main>;
}
