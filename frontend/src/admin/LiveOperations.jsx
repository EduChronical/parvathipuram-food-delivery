import React from 'react';
import { money } from '../api/client.js';
import { EmptyState,Pill } from '../components/Common.jsx';

export function LiveOperations({data}){
  if(!data)return null;const s=data.summary||{};
  return <section className="stack">
    <div className="grid three"><div className="card stat"><span>Online riders</span><strong>{s.active_riders??0}</strong><small>{s.stale_online_riders?`${s.stale_online_riders} stale heartbeat`: 'Heartbeat current'}</small></div><div className="card stat"><span>Active restaurants</span><strong>{s.active_restaurants??0}</strong></div><div className="card stat"><span>Live orders</span><strong>{s.live_orders??0}</strong></div></div>
    <div className="card"><div className="section-title"><h2>Rider live status</h2><span className="pill">{data.riders?.length||0} riders</span></div>{!data.riders?.length?<EmptyState title="Riders లేరు"/>:<div className="table-wrap"><table><thead><tr><th>Rider</th><th>Status</th><th>Vehicle</th><th>Last seen</th><th>Delivery</th></tr></thead><tbody>{data.riders.map(r=><tr key={r.id}><td>{r.display_name}<br/><small>{r.phone_e164}</small></td><td><Pill tone={r.effective_online?'success':r.is_online?'warning':'neutral'}>{r.effective_online?'Online':r.is_online?'Stale':'Offline'}</Pill></td><td>{r.vehicle_type}</td><td>{r.last_seen_at?new Date(r.last_seen_at).toLocaleString('en-IN'):'—'}</td><td>{r.has_active_delivery?'Active':'—'}</td></tr>)}</tbody></table></div>}</div>
    <div className="card"><div className="section-title"><h2>Active restaurants</h2><span className="pill">{data.restaurants?.length||0}</span></div><div className="table-wrap"><table><thead><tr><th>Restaurant</th><th>Open</th><th>Rating</th><th>Live orders</th></tr></thead><tbody>{data.restaurants?.map(r=><tr key={r.id}><td>{r.shop_name}</td><td>{r.is_accepting_orders?'Yes':'No'}</td><td>{r.average_rating} ({r.rating_count})</td><td>{r.live_order_count}</td></tr>)}</tbody></table></div></div>
    <div className="card"><div className="section-title"><h2>Live incoming orders</h2><span className="pill">{data.orders?.length||0}</span></div><div className="table-wrap"><table><thead><tr><th>Order</th><th>Restaurant</th><th>Status</th><th>Rider</th><th>Total</th><th>Time</th></tr></thead><tbody>{data.orders?.map(o=><tr key={o.id}><td>#{o.order_number}</td><td>{o.shop_name}</td><td>{o.status}</td><td>{o.rider_name||'Unassigned'}</td><td>{money(o.grand_total_paise)}</td><td>{new Date(o.created_at).toLocaleTimeString('en-IN')}</td></tr>)}</tbody></table></div></div>
  </section>;
}
