import React, { useEffect, useMemo, useState } from 'react';
import { api, money, qs } from '../api/client.js';
import { CardSkeleton, DarkModeToggle, EmptyState, InlineError, Modal, Pill } from '../components/Common.jsx';
import { useDarkMode } from '../hooks/useDarkMode.js';
import { usePolling } from '../hooks/usePolling.js';

const statusTe = { placed:'కొత్త ఆర్డర్', accepted:'అంగీకరించారు', assigned:'రైడర్ కేటాయించారు', picked_up:'పికప్ అయింది', delivered:'డెలివర్ అయింది', cancelled:'కస్టమర్ రద్దు', rejected:'తిరస్కరించారు', unassigned:'రైడర్ దొరకలేదు', payment_failed:'చెల్లింపు విఫలం' };

function NewOrderQueue({ token, restaurantId, rows, reload }) {
  const [rejecting, setRejecting] = useState(null);
  const [reasonCode, setReasonCode] = useState('item_unavailable');
  const [reasonText, setReasonText] = useState('కొన్ని items అందుబాటులో లేవు');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const accept = async order => {
    setBusy(order.id); setError(null);
    try { await api(`/v1/restaurants/${restaurantId}/orders/${order.id}/accept`, { method:'POST', token }); await reload(); }
    catch (e) { setError(e); } finally { setBusy(null); }
  };
  const reject = async e => {
    e.preventDefault(); setBusy(rejecting.id); setError(null);
    try { await api(`/v1/restaurants/${restaurantId}/orders/${rejecting.id}/reject`, { method:'POST', token, body:{ reasonCode, reasonText } }); setRejecting(null); await reload(); }
    catch (err) { setError(err); } finally { setBusy(null); }
  };
  return <section>
    <div className="section-title"><h2>కొత్త ఆర్డర్లు</h2>{rows.length > 0 && <span className="notification-dot" aria-label="కొత్త ఆర్డర్లు ఉన్నాయి"/>}</div>
    <InlineError error={error}/>
    {rows.length === 0 ? <EmptyState title="కొత్త ఆర్డర్లు లేవు" detail="కొత్త order వస్తే ఈ విభాగం ఆటోమేటిక్‌గా refresh అవుతుంది."/> : <div className="stack">{rows.map(o => <article key={o.id} className="card order-card">
      <div className="row wrap"><div><strong>#{o.id.slice(0,8)}</strong><div className="order-meta"><span>{new Date(o.created_at).toLocaleTimeString('te-IN')}</span><span>{o.customer_name || 'Customer'}</span></div></div><strong>{money(o.total_paise)}</strong></div>
      <div className="order-meta">{o.items?.map(i => <span key={i.id || i.name}>{i.quantity}× {i.name}</span>)}</div>
      <div className="toolbar"><button className="button primary" disabled={busy===o.id} onClick={() => accept(o)}>అంగీకరించండి</button><button className="button danger" disabled={busy===o.id} onClick={() => setRejecting(o)}>తిరస్కరించండి</button></div>
    </article>)}</div>}
    <Modal open={!!rejecting} title="ఆర్డర్ తిరస్కరణ" onClose={() => setRejecting(null)}><form className="stack" onSubmit={reject}>
      <div className="field"><label>కారణం</label><select value={reasonCode} onChange={e => setReasonCode(e.target.value)}><option value="item_unavailable">Item అందుబాటులో లేదు</option><option value="shop_closing">Shop closing</option><option value="too_busy">చాలా బిజీగా ఉంది</option><option value="other">ఇతర కారణం</option></select></div>
      <div className="field"><label>వివరణ</label><textarea required maxLength="500" value={reasonText} onChange={e => setReasonText(e.target.value)}/></div>
      <button className="button danger" disabled={busy===rejecting?.id}>కారణంతో తిరస్కరించండి</button>
    </form></Modal>
  </section>;
}

function ShopStatusToggle({ token, restaurant, onChanged }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try { const updated = await api(`/v1/restaurants/${restaurant.id}/open-state`, { method:'PATCH', token, body:{ isOpen: !restaurant.is_open } }); onChanged(updated); }
    finally { setBusy(false); }
  };
  return <section className="card"><div className="row"><div><h3>షాప్ స్థితి</h3><small className="owner-lock">🔒 మీరు మార్చిన open/closed field sync ద్వారా overwrite కాదు</small></div><button className={`button ${restaurant.is_open ? 'success' : 'danger'}`} disabled={busy} onClick={toggle}>{restaurant.is_open ? 'తెరిచి ఉంది' : 'మూసి ఉంది'}</button></div></section>;
}

function MenuManager({ token, restaurantId }) {
  const [items, setItems] = useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(null); const [editing,setEditing]=useState(null); const [form,setForm]=useState({});
  const load = async () => { try { setError(null); setItems(await api(`/v1/restaurants/${restaurantId}/owner-menu`, { token })); } catch(e){setError(e);} finally{setLoading(false);} };
  useEffect(()=>{load();},[restaurantId,token]);
  const toggle = async item => { try { await api(`/v1/restaurants/${restaurantId}/menu/${item.id}/availability`, {method:'PATCH',token,body:{isAvailable:!item.is_available}}); await load(); } catch(e){setError(e);} };
  const openEdit = item => { setEditing(item); setForm({name:item.name,description:item.description||'',priceRupees:(Number(item.price_paise)/100).toFixed(2),isVeg:item.is_veg,category:item.category||''}); };
  const save = async e => { e.preventDefault(); try { await api(`/v1/restaurants/${restaurantId}/menu/${editing.id}`, {method:'PATCH',token,body:{name:form.name,description:form.description||null,pricePaise:Math.round(Number(form.priceRupees)*100),isVeg:form.isVeg,category:form.category||null}}); setEditing(null); await load(); } catch(err){setError(err);} };
  return <section><div className="section-title"><h2>మెను నిర్వహణ</h2><span className="lock-note">Manual edits = owner-locked</span></div><InlineError error={error}/>{loading?<CardSkeleton rows={6}/>:<div className="card">{items.map(item=><div className="menu-row" key={item.id}><div><strong>{item.name}</strong><div className="order-meta"><span>{money(item.price_paise)}</span><span>{item.is_veg?'వెజ్':'నాన్-వెజ్'}</span>{Object.keys(item.owner_locked_fields||{}).length>0&&<span className="owner-lock">🔒 Owner lock</span>}</div></div><div className="toolbar"><button className={`button ${item.is_available?'success':'danger'}`} onClick={()=>toggle(item)}>{item.is_available?'In stock':'Out of stock'}</button><button className="button" onClick={()=>openEdit(item)}>Edit</button></div></div>)}</div>}
    <Modal open={!!editing} title="మెను item మార్చండి" onClose={()=>setEditing(null)}><form className="stack" onSubmit={save}>
      <div className="field"><label>పేరు</label><input required maxLength="180" value={form.name||''} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div>
      <div className="field"><label>వివరణ</label><textarea value={form.description||''} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></div>
      <div className="grid two"><div className="field"><label>ధర (₹)</label><input required type="number" min="0" step="0.01" value={form.priceRupees||''} onChange={e=>setForm(v=>({...v,priceRupees:e.target.value}))}/></div><div className="field"><label>కేటగిరీ</label><input value={form.category||''} onChange={e=>setForm(v=>({...v,category:e.target.value}))}/></div></div>
      <label className="row"><span>వెజ్ item</span><input type="checkbox" checked={!!form.isVeg} onChange={e=>setForm(v=>({...v,isVeg:e.target.checked}))}/></label>
      <p className="lock-note">ఈ formలో మార్చిన fields owner_locked_fieldsలో lock అవుతాయి; authorized catalog sync వాటిని overwrite చేయకూడదు.</p>
      <button className="button primary">సేవ్ చేయండి</button>
    </form></Modal>
  </section>;
}

function SalesDashboard({ data }) {
  const daily = data?.dailySales || []; const top = data?.topDishes || [];
  const totals = useMemo(()=>({orders:daily.reduce((s,r)=>s+Number(r.delivered_orders),0),sales:daily.reduce((s,r)=>s+Number(r.food_sales_paise),0)}),[daily]);
  return <section><div className="section-title"><h2>సేల్స్</h2><span className="muted">Delivered food sales only</span></div><div className="grid three"><div className="card stat"><span className="muted">Delivered orders</span><strong>{totals.orders}</strong></div><div className="card stat"><span className="muted">Food sales</span><strong>{money(totals.sales)}</strong></div><div className="card stat"><span className="muted">Platform commission</span><strong>₹0</strong></div></div><div className="grid two" style={{marginTop:12}}><div className="card"><h3>రోజువారీ అమ్మకాలు</h3><div className="table-wrap"><table><thead><tr><th>తేదీ</th><th>Orders</th><th>Food sales</th></tr></thead><tbody>{daily.map(r=><tr key={r.sales_date}><td>{r.sales_date}</td><td>{r.delivered_orders}</td><td>{money(r.food_sales_paise)}</td></tr>)}</tbody></table></div></div><div className="card"><h3>Top dishes</h3><div className="table-wrap"><table><thead><tr><th>Dish</th><th>Qty</th><th>Sales</th></tr></thead><tbody>{top.map(r=><tr key={r.name_snapshot}><td>{r.name_snapshot}</td><td>{r.quantity_sold}</td><td>{money(r.sales_paise)}</td></tr>)}</tbody></table></div></div></div></section>;
}

function ReviewsPanel({ reviews }) { return <section><div className="section-title"><h2>కస్టమర్ రివ్యూలు</h2></div>{reviews.length===0?<EmptyState title="రివ్యూలు లేవు"/>:<div className="stack">{reviews.map(r=><article className="card" key={r.id}><div className="row"><strong>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</strong><small className="muted">{new Date(r.created_at).toLocaleDateString('te-IN')}</small></div>{r.body&&<p>{r.body}</p>}<small className="muted">Order #{r.order_id.slice(0,8)}</small></article>)}</div>}</section>; }

export function RestaurantOwnerDashboard({ token, restaurantId }) {
  const [dark,setDark]=useDarkMode(); const [restaurant,setRestaurant]=useState(null); const [orders,setOrders]=useState([]); const [dashboard,setDashboard]=useState(null); const [reviews,setReviews]=useState([]); const [error,setError]=useState(null); const [loading,setLoading]=useState(true);
  const load = async () => { try { setError(null); const [d,o,r]=await Promise.all([api(`/v1/restaurants/${restaurantId}/dashboard`,{token}),api(`/v1/restaurants/${restaurantId}/orders${qs({limit:100})}`,{token}),api(`/v1/restaurants/${restaurantId}/reviews?limit=100`,{token})]); setDashboard(d);setRestaurant(d.restaurant);setOrders(o);setReviews(r);} catch(e){setError(e);} finally{setLoading(false);} };
  useEffect(()=>{load();},[restaurantId,token]);
  usePolling(load,10000,true);
  const newOrders=orders.filter(o=>o.status==='placed');
  return <main className="shell" lang="te"><header className="topbar"><div><h1>{restaurant?.shop_name||'రెస్టారెంట్ డ్యాష్‌బోర్డ్'}</h1><p>Owner dashboard</p></div><DarkModeToggle dark={dark} onChange={setDark}/></header><InlineError error={error}/>{loading?<><CardSkeleton rows={4}/><CardSkeleton rows={5}/></>:restaurant&&<><ShopStatusToggle token={token} restaurant={restaurant} onChanged={setRestaurant}/><NewOrderQueue token={token} restaurantId={restaurantId} rows={newOrders} reload={load}/><section><div className="section-title"><h2>Order status</h2></div><div className="stack">{orders.filter(o=>o.status!=='placed').slice(0,20).map(o=><article className="card" key={o.id}><div className="row"><div><strong>#{o.id.slice(0,8)}</strong><div className="order-meta"><span>{statusTe[o.status]||o.status}</span><span>{new Date(o.created_at).toLocaleString('te-IN')}</span></div></div><strong>{money(o.total_paise)}</strong></div></article>)}</div></section><MenuManager token={token} restaurantId={restaurantId}/><SalesDashboard data={dashboard}/><ReviewsPanel reviews={reviews}/></>}</main>;
}
