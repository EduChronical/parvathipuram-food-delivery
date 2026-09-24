import React,{useState} from 'react';
import { download,qs } from '../api/client.js';
import { InlineError } from '../components/Common.jsx';

function todayIndia(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`;}

export function OrderReportExport({token}){
  const [period,setPeriod]=useState('daily');const [date,setDate]=useState(todayIndia());const [busy,setBusy]=useState(false);const [error,setError]=useState(null);const [message,setMessage]=useState('');
  async function run(){setBusy(true);setError(null);setMessage('');try{const result=await download(`/v1/admin-dashboard/reports/orders.csv${qs({period,date})}`,{token});setMessage(`${result.filename} · ${result.rowCount} orders`);}catch(e){setError(e);}finally{setBusy(false);}}
  return <section className="card stack"><h2>CSV Order Reports</h2><InlineError error={error}/><div className="filters"><div className="field"><label>Period</label><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div className="field"><label>Anchor date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="field report-action"><label>&nbsp;</label><button className="button primary" disabled={busy} onClick={run}>{busy?'Generating…':'Download CSV'}</button></div></div>{message&&<div className="success-banner">{message}</div>}</section>;
}
