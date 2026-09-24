import React,{useCallback,useEffect,useState} from 'react';
import { api } from '../api/client.js';
import { CardSkeleton,DarkModeToggle,InlineError } from '../components/Common.jsx';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { usePolling } from '../hooks/usePolling.js';
import { FraudFlags } from './FraudFlags.jsx';
import { LiveOperations } from './LiveOperations.jsx';
import { OperationalLogs } from './OperationalLogs.jsx';
import { OrderReportExport } from './OrderReportExport.jsx';

export function SuperAdminDashboard({token}){
  const [dark,setDark]=useDarkMode();const [live,setLive]=useState();const [logs,setLogs]=useState();const [flags,setFlags]=useState([]);const [error,setError]=useState(null);const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{if(!token)return;try{const [l,g,f]=await Promise.all([api('/v1/admin-dashboard/live',{token}),api('/v1/admin-dashboard/logs?type=all&limit=150',{token}),api('/v1/admin-dashboard/fraud-flags?unresolvedOnly=true&limit=100',{token})]);setLive(l);setLogs(g);setFlags(f);setError(null);}catch(e){setError(e);}finally{setLoading(false);}},[token]);
  useEffect(()=>{load();},[load]);usePolling(load,6000,Boolean(token));
  if(!token)return <main className="shell"><div className="error-banner">Super-admin login token required.</div></main>;
  return <main className="shell stack"><header className="topbar"><div><h1>Super Admin · Live Operations</h1><p>Parvathipuram Bites control panel</p></div><div className="toolbar"><button className="button" onClick={load}>Refresh</button><DarkModeToggle dark={dark} onChange={setDark}/></div></header><InlineError error={error}/>{loading?<><CardSkeleton/><CardSkeleton/><CardSkeleton/></>:<><LiveOperations data={live}/><OrderReportExport token={token}/><FraudFlags token={token} flags={flags} onChanged={load}/><OperationalLogs logs={logs}/></>}</main>;
}
