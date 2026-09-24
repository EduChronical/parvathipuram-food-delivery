"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,money} from "@ppm/ui";

type Capabilities={onlinePayments:boolean;cod:boolean};
export default function Checkout(){
 const [cart,setCart]=useState<any>(null),[addresses,setAddresses]=useState<any[]>([]),[addressId,setAddressId]=useState("");
 const [coupon,setCoupon]=useState("WELCOME50"),[method,setMethod]=useState("COD"),[instructions,setInstructions]=useState("");
 const [capabilities,setCapabilities]=useState<Capabilities>({onlinePayments:false,cod:true}),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[order,setOrder]=useState<any>(null);
 const [adding,setAdding]=useState(false),[label,setLabel]=useState("Home"),[line1,setLine1]=useState(""),[landmark,setLandmark]=useState(""),[postalCode,setPostalCode]=useState("535501"),[lat,setLat]=useState<number|null>(null),[lng,setLng]=useState<number|null>(null);

 async function loadAddresses(){const a:any=await api("/me/addresses");setAddresses(a);setAddressId(a.find((x:any)=>x.isDefault)?.id??a[0]?.id??"");setAdding(!a.length)}
 useEffect(()=>{const rid=sessionStorage.getItem("ppm_restaurant_id");if(!rid)return;Promise.all([api("/carts/"+rid),api("/platform/capabilities"),loadAddresses()]).then(([c,cap]:any)=>{setCart(c);setCapabilities(cap);setMethod(cap.onlinePayments?"UPI":"COD")}).catch((e:any)=>setMessage(e.message))},[]);

 function locate(){
  if(!navigator.geolocation){setMessage("Location is not supported on this device");return}
  navigator.geolocation.getCurrentPosition(p=>{setLat(p.coords.latitude);setLng(p.coords.longitude);setMessage("Current location captured")},()=>setMessage("Allow location access to save a delivery address"),{enableHighAccuracy:true,timeout:10000});
 }
 async function saveAddress(e:React.FormEvent){e.preventDefault();if(lat==null||lng==null){setMessage("Use current location before saving the address");return}try{
  await api("/me/addresses",{method:"POST",body:JSON.stringify({label,line1,city:"Parvathipuram",postalCode,landmark:landmark||undefined,latitude:lat,longitude:lng,isDefault:true})});
  await loadAddresses();setAdding(false);setMessage("Delivery address saved");
 }catch(e:any){setMessage(e.message)}}

 async function place(){if(!cart||!addressId)return;setBusy(true);try{
  const result:any=await api("/checkout",{method:"POST",headers:{"Idempotency-Key":"checkout-"+Date.now()+"-"+Math.random().toString(36).slice(2)},body:JSON.stringify({restaurantId:cart.restaurantId,addressId,paymentMethod:method,couponCode:coupon||undefined,deliveryInstructions:instructions||undefined})});
  if(result.paymentRequired){setMessage("Payment session created. Complete payment before the restaurant receives the order.");return}
  setOrder(result.order);setMessage("Order placed successfully");
 }catch(e:any){setMessage(e.message)}finally{setBusy(false)}}

 if(order)return <main className="mx-auto max-w-xl p-5"><Brand/><div className="card mt-8 text-center"><div className="text-5xl">✓</div><h1 className="mt-3 text-3xl font-black">Order placed</h1><p className="muted">Order {order.orderNumber}</p><a className="button primary mt-5 inline-flex items-center" href="/orders">Track order</a></div></main>;
 const total=cart?.items?.reduce((s:number,i:any)=>s+(i.menuItem.discountedPricePaise??i.menuItem.pricePaise)*i.quantity,0)??0;
 return <main className="mx-auto max-w-3xl p-4 md:p-8"><div className="mb-7"><Brand/></div><h1 className="mb-5 text-3xl font-black">Checkout</h1>
  <div className="grid cols-2"><section className="card stack"><div className="split"><h2 className="text-xl font-bold">Delivery</h2><Button variant="secondary" onClick={()=>setAdding(!adding)}>{adding?"Cancel":"Add address"}</Button></div>
   {addresses.length>0&&<select className="input" value={addressId} onChange={e=>setAddressId(e.target.value)}>{addresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.line1}</option>)}</select>}
   {adding&&<form className="stack rounded-2xl border border-[#e9e4dc] p-3" onSubmit={saveAddress}><input className="input" placeholder="Label e.g. Home" value={label} onChange={e=>setLabel(e.target.value)} required/><input className="input" placeholder="House / street / area" value={line1} onChange={e=>setLine1(e.target.value)} required/><input className="input" placeholder="Landmark (optional)" value={landmark} onChange={e=>setLandmark(e.target.value)}/><input className="input" placeholder="PIN code" value={postalCode} onChange={e=>setPostalCode(e.target.value)}/><Button type="button" variant="secondary" onClick={locate}>{lat!=null?"✓ Location captured":"Use current location"}</Button><Button type="submit">Save delivery address</Button></form>}
   <textarea className="input min-h-24 py-3" placeholder="Delivery instructions" value={instructions} onChange={e=>setInstructions(e.target.value)}/>
   <h2 className="mt-2 text-xl font-bold">Offer</h2><input className="input" value={coupon} onChange={e=>setCoupon(e.target.value)} placeholder="Coupon code"/>
   <h2 className="mt-2 text-xl font-bold">Payment</h2><select className="input" value={method} onChange={e=>setMethod(e.target.value)}>{capabilities.onlinePayments&&<><option>UPI</option><option>CARD</option><option>NETBANKING</option><option>WALLET</option></>}<option>COD</option></select>{!capabilities.onlinePayments&&<p className="muted text-sm">Online payments are not enabled yet. Cash on delivery is available.</p>}
  </section>
  <aside className="card"><h2 className="text-xl font-bold">Order summary</h2><div className="list mt-3">{cart?.items?.map((i:any)=><div className="row" key={i.id}><span>{i.quantity} × {i.menuItem.name}</span><b>{money((i.menuItem.discountedPricePaise??i.menuItem.pricePaise)*i.quantity)}</b></div>)}</div><div className="split mt-4 text-lg"><b>Items</b><b>{money(total)}</b></div><p className="muted text-sm">Taxes, delivery, packaging and discounts are recalculated securely by the server before payment.</p><Button disabled={busy||!addressId} onClick={place} style={{width:"100%",marginTop:16}}>{busy?"Placing…":"Place order"}</Button></aside></div>
  {message&&<div className="toast">{message}</div>}
 </main>;
}
