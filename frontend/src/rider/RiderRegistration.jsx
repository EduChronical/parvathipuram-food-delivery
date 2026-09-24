import React,{useState} from 'react';
import { api } from '../api/client.js';
import { InlineError } from '../components/Common.jsx';

export function RiderRegistration({token,onRegistered}){
  const [vehicleType,setVehicleType]=useState('motorcycle');
  const [vehicleLabel,setVehicleLabel]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState(null);
  async function submit(e){e.preventDefault();setBusy(true);setError(null);try{const rider=await api('/v1/rider-dashboard/register',{method:'POST',token,body:{vehicleType,vehicleLabel:vehicleLabel||undefined}});onRegistered?.(rider);}catch(err){setError(err);}finally{setBusy(false);}}
  return <main className="shell narrow-shell">
    <section className="card stack">
      <div><h1>డెలివరీ పార్ట్నర్ నమోదు</h1><p className="muted">పత్రాలు అవసరం లేకుండా వేగంగా రైడర్ ప్రొఫైల్ ప్రారంభించండి.</p></div>
      <InlineError error={error}/>
      <form className="stack" onSubmit={submit}>
        <div className="field"><label>వాహనం</label><select value={vehicleType} onChange={e=>setVehicleType(e.target.value)}><option value="motorcycle">Motorcycle</option><option value="scooter">Scooter</option><option value="bicycle">Bicycle</option><option value="auto">Auto</option><option value="car">Car</option><option value="other">Other</option></select></div>
        <div className="field"><label>వాహనం పేరు / నంబర్ (ఐచ్చికం)</label><input value={vehicleLabel} maxLength={120} onChange={e=>setVehicleLabel(e.target.value)} placeholder="ఉదా: AP 39 AB 1234"/></div>
        <button className="button primary" disabled={busy}>{busy?'నమోదవుతోంది…':'రైడర్‌గా నమోదు చేయండి'}</button>
      </form>
    </section>
  </main>;
}
