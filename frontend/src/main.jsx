import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerDashboard } from './customer/CustomerDashboard.jsx';
import { RestaurantOwnerDashboard } from './restaurant/RestaurantOwnerDashboard.jsx';
import { RiderDashboard } from './rider/RiderDashboard.jsx';
import { SuperAdminDashboard } from './admin/SuperAdminDashboard.jsx';
import { api } from './api/client.js';
import { InlineError } from './components/Common.jsx';
import './operations.css';
import './styles.css';

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('pb-access-token') || '');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState(null);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  function logout() { sessionStorage.removeItem('pb-access-token'); localStorage.removeItem('pb-access-token'); setToken(''); setUser(null); }
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null);
    api('/v1/auth/me', { token, signal: controller.signal }).then(result => setUser(result.user)).catch(e => {
      if (e.name !== 'AbortError') { setError(e); if (e.status === 401) logout(); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, attempt]);
  async function authenticate(event) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const body = { phone: String(form.get('phone')).trim(), password: String(form.get('password')) };
    if (signup) body.fullName = String(form.get('fullName')).trim();
    try {
      const result = await api(signup ? '/v1/auth/register' : '/v1/auth/login', { method: 'POST', body });
      if (!result?.token) throw new Error('Sign-in could not be completed. Please try again.');
      sessionStorage.setItem('pb-access-token', result.token); setToken(result.token);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  if (loading) return <main className="auth-shell"><p role="status">మీ ఖాతా లోడ్ అవుతోంది… Loading your account…</p></main>;
  if (!token) return <main className="auth-shell"><section className="auth-intro"><span className="brand-mark">PB</span><p className="eyebrow">LOCAL FOOD. LOCAL PEOPLE.</p><h1>Parvathipuram<br/>Bites</h1><p lang="te">మన ఊరి రుచులు, మీ ఇంటి దగ్గరకు.</p><p>Find participating restaurants, choose your meal and follow your order from kitchen to doorstep.</p><div className="auth-chips"><span>Parvathipuram</span><span>Cash on delivery</span><span>Order updates</span></div></section><section className="card auth-card"><h2>{signup ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{signup ? 'Start ordering with your phone number.' : 'Sign in to order or manage your deliveries.'}</p><InlineError error={error}/><form className="stack" onSubmit={authenticate}>{signup && <label className="field">Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={100}/></label>}<label className="field">Mobile number<input name="phone" type="tel" autoComplete="tel" placeholder="10-digit mobile number" inputMode="tel" required pattern="(\+91)?[6-9][0-9]{9}"/></label><label className="field">Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 10 : 1} maxLength={128}/></label>{signup && <small className="muted">Use at least 10 characters.</small>}<button className="button primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button></form><button className="button auth-switch" disabled={busy} onClick={() => { setSignup(!signup); setError(null); }}>{signup ? 'Already have an account? Sign in' : 'New here? Create account'}</button></section></main>;
  if (!user) return <main className="shell stack"><InlineError error={error}/><button className="button" onClick={() => setAttempt(x => x + 1)}>Retry loading account</button><button className="button" onClick={logout}>Sign out</button></main>;
  let dashboard;
  if (user.role === 'customer') dashboard = <CustomerDashboard token={token}/>;
  else if (user.role === 'restaurant_owner' && user.restaurantId) dashboard = <RestaurantOwnerDashboard token={token} restaurantId={user.restaurantId}/>;
  else if (user.role === 'rider' || user.role === 'delivery_agent') dashboard = <RiderDashboard token={token}/>;
  else if (user.role === 'admin' || user.role === 'super_admin') dashboard = <SuperAdminDashboard token={token}/>;
  else dashboard = <main className="shell"><p>Your account is awaiting operational setup. Please contact the service administrator.</p></main>;
  return <><nav className="account-bar"><strong>Parvathipuram Bites</strong><span>{user.fullName}</span><button className="button" onClick={logout}>Sign out</button></nav>{dashboard}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
