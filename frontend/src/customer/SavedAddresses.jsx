import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { CardSkeleton, EmptyState, InlineError, Modal, Pill } from '../components/Common.jsx';

const blank = { label: '', addressText: '', latitude: '', longitude: '', isDefault: false };

export function SavedAddresses({ token, onSelect, selectedId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) { setError(new Error('Your browser does not support location. Enter coordinates below.')); return; }
    setLocating(true); setError(null);
    navigator.geolocation.getCurrentPosition(position => {
      setForm(v => ({ ...v, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }));
      setLocating(false);
    }, () => { setError(new Error('Location was unavailable. Allow location access or enter your coordinates.')); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000 });
  };

  const load = async () => {
    try { setError(null); setRows(await api('/v1/customers/me/addresses', { token })); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const openNew = () => { setEditing('new'); setForm(blank); };
  const openEdit = row => { setEditing(row.id); setForm({ label: row.label, addressText: row.address_text, latitude: String(row.latitude), longitude: String(row.longitude), isDefault: row.is_default }); };
  const save = async e => {
    e.preventDefault(); setSaving(true); setError(null);
    const payload = { ...form, latitude: Number(form.latitude), longitude: Number(form.longitude) };
    try {
      if (editing === 'new') { const added = await api('/v1/customers/me/addresses', { method: 'POST', token, body: payload }); if (added?.id) onSelect?.(added.id); }
      else await api(`/v1/customers/me/addresses/${editing}`, { method: 'PATCH', token, body: payload });
      setEditing(null); await load();
    } catch (err) { setError(err); } finally { setSaving(false); }
  };
  const remove = async id => {
    if (!window.confirm('ఈ చిరునామాను తొలగించాలా?')) return;
    try { await api(`/v1/customers/me/addresses/${id}`, { method: 'DELETE', token }); if (selectedId === id) onSelect?.(null); await load(); }
    catch (e) { setError(e); }
  };

  return (
    <section>
      <div className="section-title"><h2>సేవ్ చేసిన చిరునామాలు</h2><button className="button primary" type="button" onClick={openNew}>+ చిరునామా</button></div>
      <InlineError error={error} />
      {loading ? <CardSkeleton rows={4} /> : rows.length === 0 ? <EmptyState title="చిరునామాలు లేవు" detail="ఆర్డర్ కోసం ఒక డెలివరీ చిరునామా జోడించండి." /> : (
        <div className="grid two">
          {rows.map(row => <article key={row.id} className={`card ${selectedId === row.id ? 'selected-card' : ''}`}>
            <div className="row"><strong>{row.label}</strong>{row.is_default && <Pill tone="success">డిఫాల్ట్</Pill>}</div>
            <p>{row.address_text}</p>
            <small className="muted">{row.latitude}, {row.longitude}</small>
            <div className="toolbar" style={{ marginTop: 10 }}>
              {onSelect && <button className="button primary" type="button" onClick={() => onSelect(row.id)}>ఎంచుకోండి</button>}
              <button className="button" type="button" onClick={() => openEdit(row)}>మార్చండి</button>
              <button className="button danger" type="button" onClick={() => remove(row.id)}>తొలగించండి</button>
            </div>
          </article>)}
        </div>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'కొత్త చిరునామా' : 'చిరునామా మార్చండి'} onClose={() => setEditing(null)}>
        <form className="stack" onSubmit={save}>
          <InlineError error={error}/>
          <button className="button" type="button" disabled={locating} onClick={locate}>{locating ? 'Finding your location…' : 'Use my current location / నా లొకేషన్'}</button>
          <div className="field"><label>పేరు</label><input required maxLength="80" value={form.label} onChange={e => setForm(v => ({ ...v, label: e.target.value }))} placeholder="ఇల్లు / ఆఫీస్" /></div>
          <div className="field"><label>పూర్తి చిరునామా</label><textarea required maxLength="500" rows="3" value={form.addressText} onChange={e => setForm(v => ({ ...v, addressText: e.target.value }))} /></div>
          <div className="grid two">
            <div className="field"><label>Latitude</label><input required type="number" step="0.000001" min="-90" max="90" value={form.latitude} onChange={e => setForm(v => ({ ...v, latitude: e.target.value }))} /></div>
            <div className="field"><label>Longitude</label><input required type="number" step="0.000001" min="-180" max="180" value={form.longitude} onChange={e => setForm(v => ({ ...v, longitude: e.target.value }))} /></div>
          </div>
          <label className="row"><span>డిఫాల్ట్ చిరునామా</span><input type="checkbox" checked={form.isDefault} onChange={e => setForm(v => ({ ...v, isDefault: e.target.checked }))} /></label>
          <button className="button primary" disabled={saving}>{saving ? 'సేవ్ అవుతోంది…' : 'సేవ్ చేయండి'}</button>
        </form>
      </Modal>
    </section>
  );
}
