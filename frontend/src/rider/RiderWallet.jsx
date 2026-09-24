import React from 'react';
import { money } from '../api/client.js';
import { EmptyState } from '../components/Common.jsx';

export function RiderWallet({data}){
  if(!data)return null;const w=data.wallet||{};
  return <section className="stack">
    <div className="grid three">
      <div className="card stat"><span className="muted">మొత్తం సంపాదన</span><strong>{money(w.earned_balance_paise)}</strong><small>Posted / settled ledger</small></div>
      <div className="card stat"><span className="muted">డెలివరీ ఫీజు</span><strong>{money(w.delivery_fee_income_paise)}</strong><small>100% rider income</small></div>
      <div className="card stat"><span className="muted">టిప్స్</span><strong>{money(w.tip_income_paise)}</strong><small>100% rider tips</small></div>
    </div>
    <div className="card"><div className="section-title"><h3>వాలెట్ ట్రాన్సాక్షన్ హిస్టరీ</h3><span className="pill">Pending {money(w.pending_balance_paise)}</span></div>
      {!data.history?.length?<EmptyState title="లెడ్జర్ ఎంట్రీలు లేవు"/>:<div className="table-wrap"><table><thead><tr><th>సమయం</th><th>Order</th><th>రకం</th><th>Status</th><th>Amount</th></tr></thead><tbody>{data.history.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString('en-IN')}</td><td>#{x.order_number||'—'}</td><td>{x.entry_type}</td><td>{x.status}</td><td>{x.direction==='debit'?'-':'+'}{money(x.amount_paise)}</td></tr>)}</tbody></table></div>}
    </div>
    <div className="card"><div className="section-title"><h3>బ్యాంక్ / పేఔట్ హిస్టరీ</h3><span className="pill">{data.payouts?.length||0} payouts</span></div>
      {!data.payouts?.length?<EmptyState title="పేఔట్ రికార్డులు లేవు"/>:<div className="table-wrap"><table><thead><tr><th>Requested</th><th>Status</th><th>Provider</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{data.payouts.map(x=><tr key={x.id}><td>{new Date(x.requested_at).toLocaleString('en-IN')}</td><td>{x.status}</td><td>{x.provider||'—'}</td><td>{x.provider_reference||'—'}</td><td>{money(x.amount_paise)}</td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
