"use client";

import {useEffect,useMemo,useState} from "react";
import {api,Brand,Button,EmptyState,money,Pill,clearSession} from "@ppm/ui";

type Restaurant={
  id:string;slug:string;name:string;description?:string;avgRating:string|number;ratingCount:number;
  prepMinutes:number;avgCostForTwoPaise:number;vegOnly:boolean;distanceKm?:number|null;estimatedDeliveryMinutes?:number|null;
  cuisines?:any[];foodLicenseNumber?:string|null;
};
type MenuRestaurant=Restaurant&{categories:any[];hours?:any[];reviews?:any[];images?:any[]};

const localDirectory=[
 {name:"Zaikas Green Chutneys",category:"South Indian"},
 {name:"Apna Darbar",category:"North Indian · Biryani"},
 {name:"Delicious Fried Chicken",category:"Fast food · Pizza · Burgers"},
 {name:"Mana Inti Kitchen",category:"Wraps · Sandwiches · Fast food"},
 {name:"Madhuram Authentic Telugu Kitchen",category:"Telugu · South Indian · Biryani"},
 {name:"Taj Royal Food Street",category:"Andhra · South Indian"},
 {name:"Biryanis And More",category:"Biryani · Kebab · Chinese"},
 {name:"Helapuri Multicuisine Resturant",category:"Biryani · Chinese · Andhra"}
];
const groceryDirectory=[{name:"More Supermarket",category:"Groceries · Supermarket"}];

export default function CustomerApp(){
 const [token,setToken]=useState<string|null>(null);
 const [restaurants,setRestaurants]=useState<Restaurant[]>([]);
 const [selected,setSelected]=useState<MenuRestaurant|null>(null);
 const [cart,setCart]=useState<any>(null);
 const [search,setSearch]=useState(""),[message,setMessage]=useState("");
 const [veg,setVeg]=useState(false),[openOnly,setOpenOnly]=useState(false),[minRating,setMinRating]=useState(0),[maxCost,setMaxCost]=useState<number|undefined>();
 const [sort,setSort]=useState("relevance"),[coords,setCoords]=useState({lat:18.783,lng:83.426,label:"Parvathipuram Central"});
 const [customItem,setCustomItem]=useState<any>(null),[variantId,setVariantId]=useState(""),[addonIds,setAddonIds]=useState<string[]>([]),[note,setNote]=useState("");

 useEffect(()=>{
   setToken(sessionStorage.getItem("ppm_access_token"));
   if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
 },[]);
 useEffect(()=>{loadRestaurants()},[]);
 useEffect(()=>{
   const slug=new URLSearchParams(location.search).get("restaurant");
   if(slug)openRestaurant(slug);
 },[token]);

 async function loadRestaurants(){
   try{
     const q=new URLSearchParams({lat:String(coords.lat),lng:String(coords.lng),sort});
     if(search)q.set("search",search);
     if(veg)q.set("veg","true");
     if(openOnly)q.set("open","true");
     if(minRating)q.set("minRating",String(minRating));
     if(maxCost)q.set("maxCost",String(maxCost));
     const d:any=await api("/restaurants?"+q.toString());
     setRestaurants(d.items??[]);
     if(search)api("/analytics",{method:"POST",body:JSON.stringify({name:"search",properties:{query:search}})}).catch(()=>{});
   }catch(e:any){setMessage(e.message)}
 }
 function useCurrentLocation(){
   if(!navigator.geolocation){setMessage("Location is unavailable in this browser");return}
   navigator.geolocation.getCurrentPosition(p=>{
     const next={lat:Number(p.coords.latitude.toFixed(6)),lng:Number(p.coords.longitude.toFixed(6)),label:"Current location"};
     setCoords(next);
     setMessage("Location updated. Tap Search to refresh nearby restaurants.");
   },()=>setMessage("Could not access your location"),{enableHighAccuracy:true,timeout:10000});
 }
 async function openRestaurant(slug:string){
   try{
     const r:any=await api("/restaurants/"+slug);
     setSelected(r);sessionStorage.setItem("ppm_restaurant_id",r.id);
     api("/analytics",{method:"POST",body:JSON.stringify({name:"restaurant_view",properties:{restaurantId:r.id}})}).catch(()=>{});
     if(token)setCart(await api("/carts/"+r.id));else setCart(null);
   }catch(e:any){setMessage(e.message)}
 }
 async function putCart(item:any,quantity:number,selectedVariantId?:string,selectedAddonIds:string[]=[],itemNote?:string){
   if(!token){location.href="/account";return}
   try{
     const c:any=await api("/carts/"+selected!.id+"/items",{method:"PUT",body:JSON.stringify({
       menuItemId:item.id,variantId:selectedVariantId||undefined,quantity,note:itemNote||undefined,addonIds:selectedAddonIds
     })});
     setCart(c);
     if(quantity>0)api("/analytics",{method:"POST",body:JSON.stringify({name:"add_to_cart",properties:{menuItemId:item.id,restaurantId:selected!.id,quantity}})}).catch(()=>{});
   }catch(e:any){setMessage(e.message)}
 }
 async function beginAdd(item:any){
   const variants=(item.variants??[]).filter((v:any)=>v.available);
   const groups=item.addonLinks??[];
   if(!variants.length&&!groups.length){await putCart(item,1);setMessage(item.name+" added");return}
   setCustomItem(item);
   setVariantId(variants[0]?.id??"");
   const defaults:string[]=[];
   for(const link of groups){
     const need=Math.max(link.group.minSelect??0,link.group.required?1:0);
     defaults.push(...(link.group.addons??[]).filter((a:any)=>a.available).slice(0,need).map((a:any)=>a.id));
   }
   setAddonIds(defaults);setNote("");
 }
 function toggleAddon(group:any,addonId:string){
   const groupIds=(group.addons??[]).map((a:any)=>a.id);
   const selectedInGroup=addonIds.filter(id=>groupIds.includes(id));
   if(addonIds.includes(addonId)){setAddonIds(addonIds.filter(id=>id!==addonId));return}
   if(selectedInGroup.length>=group.maxSelect){setMessage("Choose at most "+group.maxSelect+" from "+group.name);return}
   setAddonIds([...addonIds,addonId]);
 }
 async function addCustomized(){
   if(!customItem)return;
   try{
     await putCart(customItem,1,variantId||undefined,addonIds,note);
     setMessage(customItem.name+" added with your choices");
     setCustomItem(null);
   }catch{}
 }
 async function updateCartLine(ci:any,quantity:number){
   await putCart(ci.menuItem,quantity,ci.variantId??undefined,(ci.addons??[]).map((a:any)=>a.addonId),ci.note??undefined);
 }
 async function saveRestaurant(){if(!token){location.href="/account";return}try{await api("/favorites/restaurants/"+selected!.id,{method:"POST"});setMessage(selected!.name+" saved to Favorites")}catch(e:any){setMessage(e.message)}}
 async function saveDish(item:any){if(!token){location.href="/account";return}try{await api("/favorites/dishes/"+item.id,{method:"POST"});setMessage(item.name+" saved to Favorites")}catch(e:any){setMessage(e.message)}}

 const cartTotal=useMemo(()=>cart?.items?.reduce((sum:number,ci:any)=>{
   const base=ci.menuItem.discountedPricePaise??ci.menuItem.pricePaise;
   const variant=ci.variant?.priceDeltaPaise??0;
   const addons=(ci.addons??[]).reduce((s:number,a:any)=>s+(a.addon?.pricePaise??0)*(a.quantity??1),0);
   return sum+(base+variant+addons)*ci.quantity;
 },0)??0,[cart]);
 const customPrice=useMemo(()=>{
   if(!customItem)return 0;
   const base=customItem.discountedPricePaise??customItem.pricePaise;
   const variant=(customItem.variants??[]).find((v:any)=>v.id===variantId)?.priceDeltaPaise??0;
   let addons=0;
   for(const link of customItem.addonLinks??[])for(const a of link.group.addons??[])if(addonIds.includes(a.id))addons+=a.pricePaise;
   return base+variant+addons;
 },[customItem,variantId,addonIds]);

 function signOut(){clearSession();setToken(null);setCart(null)}

 if(selected)return <div className="min-h-screen bg-[#f8f5ef]">
   <div className="sticky top-0 z-20 border-b border-[#e9e4dc] bg-[#fffdfa]/95 p-4 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between"><button onClick={()=>{setSelected(null);setCart(null)}} className="font-semibold">← Back</button><Brand/><span>{cart?.items?.reduce((s:number,i:any)=>s+i.quantity,0)??0} item(s)</span></div></div>
   <main className="mx-auto max-w-6xl p-4 md:p-7">
     <div className="card mb-5"><div className="split"><div><span className="eyebrow">RESTAURANT</span><h1 className="text-3xl font-bold">{selected.name}</h1><p className="muted">{selected.description}</p><div className="mt-2 flex flex-wrap gap-2"><Pill tone="success">★ {Number(selected.avgRating).toFixed(1)} ({selected.ratingCount})</Pill><Pill>{selected.prepMinutes} min prep</Pill>{selected.cuisines?.slice(0,3).map((x:any)=><Pill key={x.cuisine.id}>{x.cuisine.name}</Pill>)}</div>{selected.foodLicenseNumber&&<div className="muted mt-3 text-xs">Food licence: {selected.foodLicenseNumber}</div>}</div><div className="text-right"><div className="text-2xl font-bold">{money(selected.avgCostForTwoPaise)}</div><span className="muted">for two</span><div className="mt-3"><Button variant="secondary" onClick={saveRestaurant}>♡ Save restaurant</Button></div></div></div></div>

     {selected.categories.map(cat=><section key={cat.id} className="card mb-4"><h2 className="mb-3 text-xl font-bold">{cat.name}</h2><div className="list">{cat.items.map((item:any)=><div className="row" key={item.id}><div><div className="font-bold">{item.veg?"🟢":"🔴"} {item.name} {item.bestseller&&<Pill tone="warning">Bestseller</Pill>}</div><div>{money(item.discountedPricePaise??item.pricePaise)} {item.variants?.length>0&&<span className="muted text-xs">· variants available</span>}</div><p className="muted max-w-xl text-sm">{item.description}</p>{item.addonLinks?.length>0&&<div className="muted mt-1 text-xs">Customizable · {item.addonLinks.map((x:any)=>x.group.name).join(", ")}</div>}</div><div className="flex gap-2"><Button variant="ghost" onClick={()=>saveDish(item)}>♡</Button><Button onClick={()=>beginAdd(item)}>Add</Button></div></div>)}</div></section>)}

     {cart?.items?.length>0&&<section className="card mb-24"><div className="split"><div><span className="eyebrow">YOUR CART</span><h2 className="text-xl font-bold">Review items</h2></div><b>{money(cartTotal)}</b></div><div className="list mt-4">{cart.items.map((ci:any)=><div className="row" key={ci.id}><div><b>{ci.menuItem.name}{ci.variant?" · "+ci.variant.name:""}</b>{ci.addons?.length>0&&<div className="muted text-xs">{ci.addons.map((a:any)=>a.addon.name).join(", ")}</div>}{ci.note&&<div className="muted text-xs">Note: {ci.note}</div>}</div><div className="flex items-center gap-2"><Button variant="ghost" onClick={()=>updateCartLine(ci,Math.max(0,ci.quantity-1))}>−</Button><b>{ci.quantity}</b><Button variant="ghost" onClick={()=>updateCartLine(ci,ci.quantity+1)}>+</Button><Button variant="danger" onClick={()=>updateCartLine(ci,0)}>Remove</Button></div></div>)}</div></section>}

     {selected.reviews?.length>0&&<section className="card mb-24"><div className="split"><div><span className="eyebrow">VERIFIED REVIEWS</span><h2 className="text-xl font-bold">What customers say</h2></div><Pill>{selected.reviews.length} recent</Pill></div><div className="grid cols-2 mt-4">{selected.reviews.map((r:any)=><div key={r.id} className="rounded-xl border border-[#e9e4dc] p-3"><b>★ {r.restaurantRating}/5</b><p className="mt-2 text-sm">{r.text||"No written comment"}</p>{r.restaurantReply&&<p className="muted mt-2 text-sm"><b>Restaurant reply:</b> {r.restaurantReply}</p>}</div>)}</div></section>}
   </main>

   {cartTotal>0&&<div className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-32px)] max-w-xl -translate-x-1/2 items-center justify-between rounded-2xl bg-[#171512] p-3 text-white shadow-2xl"><div><b>{cart.items.reduce((s:number,i:any)=>s+i.quantity,0)} item(s)</b><div>{money(cartTotal)}</div></div><a className="rounded-xl bg-[#e6502c] px-5 py-3 font-bold" href="/checkout">Checkout →</a></div>}

   {customItem&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-5"><div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-t-3xl bg-[#fffdfa] p-5 shadow-2xl md:rounded-3xl"><div className="split"><div><span className="eyebrow">CUSTOMIZE</span><h2 className="text-2xl font-black">{customItem.name}</h2></div><button className="text-2xl" onClick={()=>setCustomItem(null)}>×</button></div>
     {(customItem.variants??[]).filter((v:any)=>v.available).length>0&&<div className="mt-5"><h3 className="font-bold">Choose a variant</h3><div className="mt-2 grid gap-2">{customItem.variants.filter((v:any)=>v.available).map((v:any)=><label key={v.id} className="row rounded-xl border border-[#e9e4dc] p-3"><span>{v.name} {v.priceDeltaPaise?"+ "+money(v.priceDeltaPaise):""}</span><input type="radio" name="variant" checked={variantId===v.id} onChange={()=>setVariantId(v.id)}/></label>)}</div></div>}
     {(customItem.addonLinks??[]).map((link:any)=><div className="mt-5" key={link.group.id}><div className="split"><h3 className="font-bold">{link.group.name}</h3><span className="muted text-xs">Choose {link.group.minSelect??0}–{link.group.maxSelect}{link.group.required?" · required":""}</span></div><div className="mt-2 grid gap-2">{link.group.addons.filter((a:any)=>a.available).map((a:any)=><label key={a.id} className="row rounded-xl border border-[#e9e4dc] p-3"><span>{a.name} {a.pricePaise?"+ "+money(a.pricePaise):""}</span><input type="checkbox" checked={addonIds.includes(a.id)} onChange={()=>toggleAddon(link.group,a.id)}/></label>)}</div></div>)}
     <textarea className="input mt-5 min-h-20 py-3" placeholder="Item note (optional)" value={note} onChange={e=>setNote(e.target.value)}/>
     <div className="split mt-5"><b className="text-xl">{money(customPrice)}</b><Button onClick={addCustomized}>Add customized item</Button></div>
   </div></div>}
   {message&&<div className="toast">{message}</div>}
 </div>;

 return <div className="min-h-screen bg-[#f8f5ef]">
   <header className="sticky top-0 z-20 border-b border-[#e9e4dc] bg-[#fffdfa]/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 p-4"><Brand/><button onClick={useCurrentLocation} className="hidden text-sm font-semibold md:block">📍 {coords.label}</button><div className="flex items-center gap-2">{token&&<a href="/orders" className="button ghost inline-flex items-center">Orders</a>}{token&&<a href="/notifications" className="button ghost inline-flex items-center">Notifications</a>}{token&&<a href="/favorites" className="button ghost inline-flex items-center">Favorites</a>}<a href="/account" className="button secondary inline-flex items-center">{token?"Account":"Sign in"}</a>{token&&<Button variant="ghost" onClick={signOut}>Sign out</Button>}</div></div></header>
   <main className="mx-auto max-w-7xl p-4 md:p-7">
    <section className="mb-7 grid gap-5 overflow-hidden rounded-[28px] bg-[#171512] p-6 text-white md:grid-cols-[1.3fr_.7fr] md:p-10"><div><span className="eyebrow">PARVATHIPURAM'S OWN</span><h1 className="mt-2 text-4xl font-black leading-tight md:text-6xl">Local favourites.<br/>Delivered simply.</h1><p className="mt-3 max-w-xl text-[#cfc8bf]">Order food from nearby restaurants with transparent pricing, secure accounts and live order progress.</p><div className="mt-5 flex flex-wrap gap-2"><Pill tone="success">Local restaurants</Pill><Pill>Live tracking</Pill><Pill>Secure checkout</Pill></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-3xl bg-[#e6502c] p-5"><div className="text-4xl">🍛</div><b className="mt-6 block text-xl">Meals & biryani</b><span className="text-sm text-[#ffe1d9]">Fresh local picks</span></div><div className="rounded-3xl bg-[#f2b84b] p-5 text-[#171512]"><div className="text-4xl">⚡</div><b className="mt-6 block text-xl">Quick delivery</b><span className="text-sm">Built for Parvathipuram</span></div><div className="col-span-2 rounded-3xl bg-[#2b6f55] p-5"><div className="flex items-end justify-between"><div><div className="text-4xl">🛒</div><b className="mt-3 block text-xl">Instant groceries</b><span className="text-sm text-[#d8efe5]">Local grocery merchant onboarding is open.</span></div><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">ONBOARDING</span></div></div></div></section>

    <div className="mb-4 flex gap-2"><input className="input" placeholder="Search restaurants, dishes or cuisine" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loadRestaurants()}/><Button onClick={loadRestaurants}>Search</Button></div>
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Button variant={openOnly?"primary":"secondary"} onClick={()=>setOpenOnly(!openOnly)}>Open now</Button>
      <Button variant={veg?"primary":"secondary"} onClick={()=>setVeg(!veg)}>Veg only</Button>
      <Button variant={minRating>=4?"primary":"secondary"} onClick={()=>setMinRating(minRating>=4?0:4)}>4★ & above</Button>
      <Button variant={maxCost===500?"primary":"secondary"} onClick={()=>setMaxCost(maxCost===500?undefined:500)}>Under ₹500 for two</Button>
      <select className="input !w-auto" value={sort} onChange={e=>setSort(e.target.value)}><option value="relevance">Relevance</option><option value="rating">Rating</option><option value="deliveryTime">Delivery time</option><option value="costLow">Cost low to high</option><option value="costHigh">Cost high to low</option><option value="distance">Distance</option><option value="popularity">Popularity</option></select>
      <Button variant="ghost" onClick={loadRestaurants}>Apply filters</Button>
      <Button variant="ghost" onClick={useCurrentLocation}>Use current location</Button>
    </div>

    <h2 className="mb-4 text-2xl font-bold">Restaurants near you</h2>
    {restaurants.length?<div className="grid cols-3">{restaurants.map(r=><button key={r.id} onClick={()=>openRestaurant(r.slug)} className="card text-left transition hover:-translate-y-1"><div className="mb-4 flex h-36 items-end rounded-2xl bg-gradient-to-br from-[#ffdfc7] via-[#f7b98d] to-[#e6502c] p-4"><span className="pill">{r.vegOnly?"Pure veg":"Multi-cuisine"}</span></div><div className="split"><h3 className="text-lg font-bold">{r.name}</h3><Pill tone="success">★ {Number(r.avgRating).toFixed(1)}</Pill></div><p className="muted mt-1 line-clamp-2 text-sm">{r.description}</p><div className="mt-3 flex flex-wrap gap-1">{r.cuisines?.slice(0,3).map((x:any)=><Pill key={x.cuisine.id}>{x.cuisine.name}</Pill>)}</div><div className="mt-4 flex justify-between text-sm"><span>{r.estimatedDeliveryMinutes??r.prepMinutes} min {r.distanceKm!=null?"· "+r.distanceKm.toFixed(1)+" km":""}</span><span>{money(r.avgCostForTwoPaise)} for two</span></div></button>)}</div>:<EmptyState title="No restaurants found" body="Try broader filters or a different delivery location."/>}

    <section className="mt-8"><div className="split mb-4"><div><span className="eyebrow">LOCAL DIRECTORY</span><h2 className="mt-1 text-2xl font-bold">More places in Parvathipuram</h2><p className="muted text-sm">Public directory listings only. Ordering activates only after the business completes PPM Bites partner onboarding.</p></div></div><div className="grid cols-3">{localDirectory.map(x=><div key={x.name} className="card"><div className="mb-3 flex h-24 items-center justify-center rounded-2xl bg-[#f3eee7] text-4xl">🍽️</div><h3 className="font-bold">{x.name}</h3><p className="muted mt-1 text-sm">{x.category}</p><div className="mt-4"><Pill tone="warning">Not yet orderable</Pill></div></div>)}</div></section>
    <section className="mt-8 rounded-[28px] bg-[#e8f4ee] p-6 md:p-8"><div className="split"><div><span className="eyebrow">INSTANT GROCERIES</span><h2 className="mt-1 text-2xl font-black">Local grocery delivery</h2><p className="muted mt-1">The grocery vertical is separated from restaurant ordering and is onboarding local stores.</p><div className="mt-4 flex flex-wrap gap-2">{groceryDirectory.map(x=><span key={x.name} className="pill">{x.name} · onboarding pending</span>)}</div></div><a href="/partner" className="button secondary inline-flex items-center">Join as a local partner</a></div></section>
    <section className="mt-8 rounded-[28px] border border-[#e9e4dc] bg-white p-6 md:p-8"><div className="split"><div><span className="eyebrow">GROW WITH PPM BITES</span><h2 className="mt-1 text-2xl font-black">Own a restaurant or want to deliver?</h2><p className="muted mt-1">Apply directly online. Partner applications are reviewed before going live.</p></div><a href="/partner" className="button primary inline-flex items-center">Partner with us →</a></div></section>
   </main>
   {message&&<div className="toast">{message}</div>}
 </div>
}
