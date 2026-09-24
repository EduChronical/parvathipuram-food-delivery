import React, { useEffect, useState } from 'react';
import { api, money } from '../api/client.js';
import { CardSkeleton, EmptyState, InlineError, Pill } from '../components/Common.jsx';
import { CancelOrderDialog } from './CancelOrderDialog.jsx';
import { ReviewForm } from './ReviewForm.jsx';

const statusTe = {
  placed:'రెస్టారెంట్ అంగీకారం కోసం', accepted:'అంగీకరించారు', assigned:'రైడర్ కేటాయించారు', picked_up:'పికప్ అయింది', delivered:'డెలివర్ అయింది', cancelled:'రద్దు', rejected:'తిరస్కరించారు', unassigned:'రైడర్ కోసం చూస్తున్నాం', payment_failed:'చెల్లింపు విఫలం'
};

export function OrderHistory({ token, defaultAddressId, refreshSignal = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [reviewOrder, setReviewOrder] = useState(null);
  const [reorderingId, setReorderingId] = useState(null);

  const load = async () => {
    try { setError(null); setOrders(await api('/v1/customers/me/orders?limit=50', { token })); }
    catch (e) { setError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token, refreshSignal]);

  const reorder = async order => {
    setReorderingId(order.id); setError(null);
    try {
      await api(`/v1/orders/${order.id}/reorder`, { method:'POST', token, body:{ addressId: defaultAddressId || order.address_id, tipPaise: Number(order.tip_paise || 0), idempotencyKey: crypto.randomUUID() } });
      await load();
    } catch (e) { setError(e); } finally { setReorderingId(null); }
  };

  return (
    <section>
      <div className="section-title"><h2>నా ఆర్డర్లు</h2><button className="button" onClick={load}>రిఫ్రెష్</button></div>
      <InlineError error={error} />
      {loading ? <div className="stack"><CardSkeleton rows={4}/><CardSkeleton rows={4}/></div> : orders.length === 0 ? <EmptyState title="ఇంకా ఆర్డర్లు లేవు" /> : (
        <div className="stack">{orders.map(order => <article key={order.id} className="card order-card">
          <div className="row wrap"><div><strong>{order.restaurant_name || 'Restaurant'}</strong><div className="order-meta"><span>{new Date(order.created_at).toLocaleString('te-IN')}</span><span>#{order.id.slice(0,8)}</span></div></div><Pill tone={order.status === 'delivered' ? 'success' : ['cancelled','rejected','payment_failed'].includes(order.status) ? 'danger' : 'warning'}>{statusTe[order.status] || order.status}</Pill></div>
          <div className="order-meta">{order.items?.map(i => <span key={i.id || i.name}>{i.quantity}× {i.name}</span>)}</div>
          <div className="row"><span className="muted">మొత్తం</span><span className="price">{money(order.total_paise)}</span></div>
          <div className="toolbar">
            <button className="button primary" disabled={reorderingId === order.id} onClick={() => reorder(order)}>{reorderingId === order.id ? 'మళ్లీ ఆర్డర్ అవుతోంది…' : 'మళ్లీ ఇదే ఆర్డర్'}</button>
            {order.status === 'placed' && <button className="button danger" onClick={() => setCancelOrder(order)}>రద్దు</button>}
            {order.status === 'delivered' && !order.has_review && <button className="button" onClick={() => setReviewOrder(order)}>రివ్యూ ఇవ్వండి</button>}
          </div>
        </article>)}</div>
      )}
      {cancelOrder && <CancelOrderDialog token={token} order={cancelOrder} open onClose={() => setCancelOrder(null)} onCancelled={load} />}
      {reviewOrder && <ReviewForm token={token} order={reviewOrder} open onClose={() => setReviewOrder(null)} onSaved={load} />}
    </section>
  );
}
