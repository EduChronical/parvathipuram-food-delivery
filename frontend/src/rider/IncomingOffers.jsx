import React,{useState} from 'react';
import { api,money } from '../api/client.js';
import { EmptyState,InlineError,Pill } from '../components/Common.jsx';

export function IncomingOffers({token,offers,onChanged}){
  const [busy,setBusy]=useState('');const [error,setError]=useState(null);const [reason,setReason]=useState({});
  async function act(offer,action){setBusy(offer.offer_id);setError(null);try{await api(`/v1/rider-dashboard/me/offers/${offer.offer_id}/${action}`,{method:'POST',token,body:action==='reject'?{reason:reason[offer.offer_id]||'Cannot accept now'}:undefined});onChanged?.();}catch(e){setError(e);}finally{setBusy('');}}
  return <section className="card stack"><div className="section-title"><h2>కొత్త డెలివరీ ఆఫర్లు</h2><Pill tone={offers.length?'warning':'neutral'}>{offers.length}</Pill></div><InlineError error={error}/>
    {!offers.length?<EmptyState title="కొత్త ఆఫర్లు లేవు" detail="మీరు Online లో ఉంటే సమీప ఆర్డర్లు ఇక్కడ కనిపిస్తాయి."/>:<div className="stack">{offers.map(o=><article className="offer-card" key={o.offer_id}>
      <div className="row wrap"><strong>Order #{o.order_number}</strong><span className="price">{money(Number(o.delivery_fee_paise)+Number(o.tip_paise))}</span></div>
      <div className="order-meta"><span>{o.shop_name}</span><span>{(Number(o.distance_meters)/1000).toFixed(1)} km</span><span>Fee {money(o.delivery_fee_paise)}</span><span>Tip {money(o.tip_paise)}</span></div>
      <div className="row wrap"><button className="button primary" disabled={busy===o.offer_id} onClick={()=>act(o,'accept')}>అంగీకరించండి</button><div className="reject-inline"><input aria-label="Reject reason" value={reason[o.offer_id]||''} onChange={e=>setReason(v=>({...v,[o.offer_id]:e.target.value}))} placeholder="Reject reason"/><button className="button danger" disabled={busy===o.offer_id} onClick={()=>act(o,'reject')}>Reject</button></div></div>
    </article>)}</div>}
  </section>;
}
