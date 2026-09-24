import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, money, qs } from '../api/client.js';
import { CardSkeleton, EmptyState, InlineError, Pill } from '../components/Common.jsx';
import { RestaurantFilters } from './RestaurantFilters.jsx';
import { TipSelector } from './TipSelector.jsx';

const defaultFilters = { diet: 'all', minPriceRupees: '', maxPriceRupees: '', openNow: true };

export function RestaurantBrowser({ token, selectedAddressId, onOrderPlaced }) {
  const [filters, setFilters] = useState(defaultFilters);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRestaurant, setActiveRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [cart, setCart] = useState({});
  const [tipPaise, setTipPaise] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const orderAttempt = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const params = {
          diet: filters.diet,
          openNow: filters.openNow,
          minPricePaise: filters.minPriceRupees === '' ? undefined : Math.max(0, Math.round(Number(filters.minPriceRupees) * 100)),
          maxPricePaise: filters.maxPriceRupees === '' ? undefined : Math.max(0, Math.round(Number(filters.maxPriceRupees) * 100))
        };
        setRestaurants(await api(`/v1/catalog/restaurants${qs(params)}`, { token, signal: controller.signal }));
      } catch (e) { if (e.name !== 'AbortError') setError(e); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [token, filters]);

  const openMenu = async restaurant => {
    setActiveRestaurant(restaurant); setMenu([]); setCart({}); setMenuLoading(true); setError(null);
    try { setMenu(await api(`/v1/catalog/restaurants/${restaurant.id}/menu`, { token })); }
    catch (e) { setError(e); } finally { setMenuLoading(false); }
  };

  const cartRows = useMemo(() => menu.filter(item => cart[item.id] > 0).map(item => ({ ...item, quantity: cart[item.id] })), [menu, cart]);
  const foodTotal = cartRows.reduce((sum, item) => sum + Number(item.price_paise) * item.quantity, 0);
  const checkoutBody = useMemo(() => ({ restaurantId: activeRestaurant?.id, addressId: selectedAddressId, items: cartRows.map(i => ({ menuItemId: i.id, quantity: i.quantity })), tipPaise, paymentMethod: 'cod' }), [activeRestaurant?.id, selectedAddressId, cartRows, tipPaise]);
  useEffect(() => {
    setQuote(null); orderAttempt.current = null;
    if (!selectedAddressId || !activeRestaurant || cartRows.length === 0) { setQuoteLoading(false); return; }
    const controller = new AbortController();
    setQuoteLoading(true);
    const timer = setTimeout(() => api('/v1/orders/quote', { method: 'POST', token, body: checkoutBody, signal: controller.signal }).then(setQuote).catch(e => { if (e.name !== 'AbortError') setError(e); }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [token, checkoutBody]);

  const placeOrder = async () => {
    if (!selectedAddressId) { setError(new Error('ముందుగా delivery address ఎంచుకోండి.')); return; }
    if (!activeRestaurant || cartRows.length === 0 || !quote || quoteLoading || placing) return;
    setPlacing(true); setError(null);
    try {
      const result = await api('/v1/orders', {
        method: 'POST', token,
        body: { ...checkoutBody, idempotencyKey: orderAttempt.current ||= crypto.randomUUID() }
      });
      setCart({}); setTipPaise(0); orderAttempt.current = null; onOrderPlaced?.(result.order);
    } catch (e) { setError(e); } finally { setPlacing(false); }
  };

  return (
    <section>
      <div className="section-title"><h2>రెస్టారెంట్లు</h2><span className="muted">పార్వతీపురం</span></div>
      <RestaurantFilters value={filters} onChange={setFilters} />
      <div style={{ height: 10 }} />
      <InlineError error={error} />
      {loading ? <div className="grid two"><CardSkeleton rows={3}/><CardSkeleton rows={3}/><CardSkeleton rows={3}/><CardSkeleton rows={3}/></div> : restaurants.length === 0 ? (
        <EmptyState title="ఈ ఫిల్టర్లకు రెస్టారెంట్లు లేవు" detail="ప్రస్తుతం అందుబాటులో ఉన్న రెస్టారెంట్లు లేవు. ఫిల్టర్లను మార్చి చూడండి లేదా కొంత సమయం తర్వాత మళ్లీ ప్రయత్నించండి." />
      ) : (
        <div className="grid two">
          {restaurants.map(r => <article key={r.id} className="card restaurant-card">
            {r.cover_url ? <img className="restaurant-photo" src={r.cover_url} loading="lazy" alt="" /> : <div className="restaurant-photo" />}
            <div>
              <h3>{r.shop_name}</h3>
              <div className="order-meta"><span>★ {Number(r.avg_rating).toFixed(1)}</span><span>• {r.eta_minutes} నిమి</span><span>• {r.mandal || 'పార్వతీపురం'}</span></div>
              <div className="toolbar" style={{ marginTop: 6 }}><Pill tone={r.open_now ? 'success' : 'danger'}>{r.open_now ? 'తెరిచి ఉంది' : 'మూసి ఉంది'}</Pill>{r.has_veg && <Pill>వెజ్</Pill>}{r.has_nonveg && <Pill>నాన్-వెజ్</Pill>}</div>
            </div>
            <button className="button primary" type="button" disabled={!r.open_now} onClick={() => openMenu(r)}>మెను చూడండి</button>
          </article>)}
        </div>
      )}

      {activeRestaurant && <section className="card" style={{ marginTop: 14 }}>
        <div className="row"><div><h2>{activeRestaurant.shop_name}</h2><small className="muted">మెను</small></div><button className="icon-button" onClick={() => setActiveRestaurant(null)}>✕</button></div>
        {menuLoading ? <CardSkeleton rows={6} /> : <div className="stack">
          {menu.map(item => <div className="menu-row" key={item.id}>
            <div><strong>{item.name}</strong><div className="order-meta"><span>{item.is_veg ? '🟢 వెజ్' : '🔴 నాన్-వెజ్'}</span><span className="price">{money(item.price_paise)}</span>{!item.is_available && <Pill tone="danger">అందుబాటులో లేదు</Pill>}</div>{item.description && <small className="muted">{item.description}</small>}</div>
            <div className="toolbar">
              <button className="button" disabled={!cart[item.id]} onClick={() => setCart(c => ({ ...c, [item.id]: Math.max(0, (c[item.id] || 0) - 1) }))}>−</button>
              <strong>{cart[item.id] || 0}</strong>
              <button className="button" disabled={!item.is_available} onClick={() => setCart(c => ({ ...c, [item.id]: Math.min(100, (c[item.id] || 0) + 1) }))}>+</button>
            </div>
          </div>)}
        </div>}
        {cartRows.length > 0 && <div className="stack" style={{ marginTop: 14 }}>
          <TipSelector valuePaise={tipPaise} onChange={setTipPaise} />
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="row"><span>Food subtotal</span><strong>{money(quote?.subtotalPaise ?? foodTotal)}</strong></div>
            <div className="row"><span>Delivery fee</span><strong>{quote ? money(quote.deliveryFeePaise) : '—'}</strong></div>
            <div className="row"><span>Tip</span><strong>{money(quote?.tipPaise ?? tipPaise)}</strong></div>
            <div className="row"><span>Total payable</span><strong>{quote ? money(quote.totalPaise) : '—'}</strong></div>
            <small className="muted">{quoteLoading ? 'Calculating delivery fee…' : 'Pay cash when your order arrives.'}</small>
          </div>
          <button className="button primary" disabled={placing || !selectedAddressId || !quote || quoteLoading} onClick={placeOrder}>{placing ? 'ఆర్డర్ అవుతోంది…' : selectedAddressId ? 'COD ఆర్డర్ చేయండి' : 'ముందుగా చిరునామా ఎంచుకోండి'}</button>
        </div>}
      </section>}
    </section>
  );
}
