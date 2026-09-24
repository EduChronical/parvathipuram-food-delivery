"use client";
import {useEffect,useState} from "react";
import {api,Brand,Button,EmptyState,money,Pill} from "@ppm/ui";

export default function FavoritesPage(){
  const [items,setItems]=useState<any[]>([]),[message,setMessage]=useState("");
  async function load(){try{setItems(await api("/favorites"))}catch(e:any){if(e.message.includes("Authentication"))location.href="/account";else setMessage(e.message)}}
  useEffect(()=>{load()},[]);
  async function remove(f:any){
    try{
      if(f.restaurantId) await api("/favorites/restaurants/"+f.restaurantId,{method:"DELETE"});
      else if(f.menuItemId) await api("/favorites/dishes/"+f.menuItemId,{method:"DELETE"});
      await load();
    }catch(e:any){setMessage(e.message)}
  }
  const restaurants=items.filter(x=>x.restaurant);
  const dishes=items.filter(x=>x.menuItem);
  return <main className="mx-auto max-w-5xl p-4 md:p-8">
    <div className="split mb-7"><a href="/"><Brand/></a><a className="button ghost inline-flex items-center" href="/">Home</a></div>
    <h1 className="text-3xl font-black">Favorites</h1>
    <p className="muted mt-1">Restaurants and dishes you saved for quick access.</p>
    <section className="mt-6"><h2 className="mb-3 text-xl font-bold">Restaurants</h2>
      {restaurants.length?<div className="grid cols-3">{restaurants.map(f=><div className="card" key={f.id}><div className="mb-3 flex h-24 items-center justify-center rounded-2xl bg-[#f3eee7] text-4xl">🍽️</div><div className="split"><b>{f.restaurant.name}</b><Pill tone="success">★ {Number(f.restaurant.avgRating).toFixed(1)}</Pill></div><p className="muted mt-1 text-sm">{f.restaurant.address}</p><div className="mt-4 flex gap-2"><a className="button secondary inline-flex items-center" href={"/?restaurant="+encodeURIComponent(f.restaurant.slug)}>View</a><Button variant="ghost" onClick={()=>remove(f)}>Remove</Button></div></div>)}</div>:<EmptyState title="No favorite restaurants yet" body="Save a restaurant from its menu page."/>}
    </section>
    <section className="mt-8"><h2 className="mb-3 text-xl font-bold">Dishes</h2>
      {dishes.length?<div className="grid cols-3">{dishes.map(f=><div className="card" key={f.id}><div className="mb-3 flex h-24 items-center justify-center rounded-2xl bg-[#fff2d9] text-4xl">🍛</div><b>{f.menuItem.name}</b><p className="muted mt-1 text-sm">{f.menuItem.restaurant?.name}</p><div className="mt-2 font-bold">{money(f.menuItem.discountedPricePaise??f.menuItem.pricePaise)}</div><Button variant="ghost" onClick={()=>remove(f)} style={{marginTop:12}}>Remove</Button></div>)}</div>:<EmptyState title="No favorite dishes yet" body="Save dishes while browsing a restaurant menu."/>}
    </section>
    {message&&<div className="toast">{message}</div>}
  </main>;
}
