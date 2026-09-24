import React,{useState} from 'react';
import { api,googleMapsDirectionsUrl,money } from '../api/client.js';
import { EmptyState,InlineError,Pill } from '../components/Common.jsx';

export function ActiveDelivery({token,delivery,onChanged}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState(null);
  if(!delivery)return <section className="card"><EmptyState title="Active delivery లేదు"/></section>;
  const toRestaurant=googleMapsDirectionsUrl(delivery.restaurant_latitude,delivery.restaurant_longitude);
  const toCustomer=googleMapsDirectionsUrl(delivery.delivery_latitude,delivery.delivery_longitude);
  async function advance(action){setBusy(true);setError(null);try{await api(`/v1/riders/me/orders/${delivery.id}/${action}`,{method:'POST',token});onChanged?.();}catch(e){setError(e);}finally{setBusy(false);}}
  return <section className="card stack"><div className="row wrap"><div><h2>ప్రస్తుత డెలివరీ</h2><strong>Order #{delivery.order_number}</strong></div><Pill tone="success">{delivery.status}</Pill></div><InlineError error={error}/>
    <div className="grid two"><div><span className="muted">Pickup</span><p><strong>{delivery.shop_name}</strong><br/>{delivery.restaurant_location}</p>{toRestaurant&&<a className="button link-button" href={toRestaurant} target="_blank" rel="noreferrer">Google Maps → Restaurant</a>}</div><div><span className="muted">Delivery</span><p><strong>{delivery.delivery_recipient_name}</strong><br/>{delivery.delivery_address_text}{delivery.delivery_landmark?` · ${delivery.delivery_landmark}`:''}</p>{toCustomer&&<a className="button primary link-button" href={toCustomer} target="_blank" rel="noreferrer">Google Maps → Customer</a>}</div></div>
    <div className="order-meta"><span>Delivery fee {money(delivery.delivery_fee_paise)}</span><span>Tip {money(delivery.tip_paise)}</span><span>{(Number(delivery.distance_meters)/1000).toFixed(1)} km</span></div>
    <div className="toolbar">{delivery.status==='assigned'&&<button className="button success" disabled={busy} onClick={()=>advance('pickup')}>Picked up ✓</button>}{delivery.status==='picked_up'&&<button className="button primary" disabled={busy} onClick={()=>advance('deliver')}>Delivery completed ✓</button>}</div>
  </section>;
}
