import React,{useCallback,useEffect,useState} from 'react';
import { api } from '../api/client.js';
import { CardSkeleton,DarkModeToggle,InlineError,Pill } from '../components/Common.jsx';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { usePolling } from '../hooks/usePolling.js';
import { ActiveDelivery } from './ActiveDelivery.jsx';
import { DemandHeatmap } from './DemandHeatmap.jsx';
import { IncomingOffers } from './IncomingOffers.jsx';
import { RiderRegistration } from './RiderRegistration.jsx';
import { RiderWallet } from './RiderWallet.jsx';

function getPosition(){return new Promise((resolve,reject)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracyMeters:p.coords.accuracy}),reject,{enableHighAccuracy:true,timeout:10000,maximumAge:15000}):reject(new Error('Geolocation not supported')));}

export function RiderDashboard({token}){
  const [dark,setDark]=useDarkMode();const [profile,setProfile]=useState();const [needsRegistration,setNeedsRegistration]=useState(false);const [offers,setOffers]=useState([]);const [wallet,setWallet]=useState();const [heat,setHeat]=useState([]);const [delivery,setDelivery]=useState(null);const [error,setError]=useState(null);const [loading,setLoading]=useState(true);const [toggleBusy,setToggleBusy]=useState(false);
  const load=useCallback(async()=>{if(!token)return;try{const p=await api('/v1/rider-dashboard/me',{token});setProfile(p);setNeedsRegistration(false);const [o,w,h,d]=await Promise.all([api('/v1/rider-dashboard/me/offers',{token}),api('/v1/rider-dashboard/me/wallet',{token}),api('/v1/rider-dashboard/me/demand-heatmap',{token}),api('/v1/rider-dashboard/me/current-delivery',{token})]);setOffers(o);setWallet(w);setHeat(h);setDelivery(d);setError(null);}catch(e){if(e.status===403||e.code==='RIDER_PROFILE_REQUIRED'){setNeedsRegistration(true);}else setError(e);}finally{setLoading(false);}},[token]);
  useEffect(()=>{load();},[load]);usePolling(load,7000,Boolean(profile));
  useEffect(()=>{if(!profile?.is_online)return undefined;const timer=setInterval(async()=>{try{const pos=await getPosition();await api('/v1/rider-dashboard/me/heartbeat',{method:'POST',token,body:pos});}catch{}},30000);return()=>clearInterval(timer);},[profile?.is_online,token]);
  async function toggleOnline(){setToggleBusy(true);setError(null);try{const online=!profile.is_online;const pos=online?await getPosition():{};const updated=await api('/v1/rider-dashboard/me/availability',{method:'PATCH',token,body:{online,...pos}});setProfile(p=>({...p,...updated}));}catch(e){setError(e);}finally{setToggleBusy(false);}}
  if(!token)return <main className="shell"><div className="error-banner">Login token required.</div></main>;
  if(loading)return <main className="shell stack"><CardSkeleton/><CardSkeleton/><CardSkeleton/></main>;
  if(needsRegistration)return <RiderRegistration token={token} onRegistered={()=>{setNeedsRegistration(false);setLoading(true);load();}}/>;
  return <main className="shell stack"><header className="topbar"><div><h1>డెలివరీ పార్ట్నర్ డాష్‌బోర్డ్</h1><p>Parvathipuram live delivery operations</p></div><div className="toolbar"><button className={`button ${profile?.is_online?'success':''}`} disabled={toggleBusy} onClick={toggleOnline}>{profile?.is_online?'● Online':'○ Offline'}</button><DarkModeToggle dark={dark} onChange={setDark}/></div></header><InlineError error={error}/>
    <div className="card row wrap"><div><strong>{profile?.vehicle_type}</strong>{profile?.vehicle_label&&<span className="muted"> · {profile.vehicle_label}</span>}</div><Pill tone={profile?.approved?'success':'warning'}>{profile?.approved?'Approved':'Approval pending'}</Pill></div>
    <IncomingOffers token={token} offers={offers} onChanged={load}/><ActiveDelivery token={token} delivery={delivery} onChanged={load}/><RiderWallet data={wallet}/>
    <section className="card"><div className="section-title"><h2>Parvathipuram Demand Heatmap</h2><span className="pill">Live</span></div><DemandHeatmap points={heat}/></section>
  </main>;
}
