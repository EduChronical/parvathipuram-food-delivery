import React,{useState} from 'react';
import { api } from '../api/client.js';
import { EmptyState,InlineError,Pill } from '../components/Common.jsx';

export function FraudFlags({token,flags,onChanged}){
  const [orderId,setOrderId]=useState('');const [busy,setBusy]=useState('');const [error,setError]=useState(null);
  async function scan(){if(!orderId)return;setBusy('scan');setError(null);try{await api(`/v1/admin-dashboard/fraud/scan/${encodeURIComponent(orderId)}`,{method:'POST',token});setOrderId('');onChanged?.();}catch(e){setError(e);}finally{setBusy('');}}
  async function resolve(id){setBusy(id);setError(null);try{await api(`/v1/admin-dashboard/fraud-flags/${id}/resolve`,{method:'POST',token});onChanged?.();}catch(e){setError(e);}finally{setBusy('');}}
  return <section className="card stack"><div className="section-title"><h2>Fraud-risk flags</h2><Pill tone={flags.length?'warning':'success'}>{flags.length} open</Pill></div><InlineError error={error}/><div className="row wrap"><input className="compact-input" value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="Order UUID for manual scan"/><button className="button" disabled={busy==='scan'||!orderId} onClick={scan}>Run fraud scan</button></div>
    {!flags.length?<EmptyState title="Open fraud flags లేవు"/>:<div className="table-wrap"><table><thead><tr><th>Score</th><th>Rule</th><th>Order</th><th>Detail</th><th></th></tr></thead><tbody>{flags.map(f=><tr key={f.id}><td><Pill tone={f.score>=400?'danger':'warning'}>{f.score}</Pill></td><td>{f.rule_key}</td><td>#{f.order_number||'—'}</td><td><code>{JSON.stringify(f.detail)}</code></td><td><button className="button" disabled={busy===f.id} onClick={()=>resolve(f.id)}>Resolve</button></td></tr>)}</tbody></table></div>}
  </section>;
}
