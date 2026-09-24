import React, { useState } from 'react';
import { api } from '../api/client.js';
import { InlineError, Modal } from '../components/Common.jsx';

const reasons = [
  ['changed_mind','మనసు మార్చుకున్నాను'],
  ['wrong_items','తప్పు items ఎంచుకున్నాను'],
  ['wrong_address','తప్పు చిరునామా'],
  ['duplicate_order','డూప్లికేట్ ఆర్డర్'],
  ['other','ఇతర కారణం']
];

export function CancelOrderDialog({ token, order, open, onClose, onCancelled }) {
  const [reasonCode, setReasonCode] = useState('changed_mind');
  const [reasonText, setReasonText] = useState('ఆర్డర్‌ను రద్దు చేయాలి');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async e => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      await api(`/v1/orders/${order.id}/cancel`, { method: 'POST', token, body: { reasonCode, reasonText } });
      onCancelled?.(); onClose?.();
    } catch (err) { setError(err); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} title="ఆర్డర్ రద్దు" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="error-banner">రెస్టారెంట్ అంగీకరించే ముందు మాత్రమే cancellation అనుమతించబడుతుంది.</div>
        <div className="field"><label>కారణం</label><select value={reasonCode} onChange={e => setReasonCode(e.target.value)}>{reasons.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>వివరణ</label><textarea required minLength="1" maxLength="500" value={reasonText} onChange={e => setReasonText(e.target.value)} /></div>
        <InlineError error={error} />
        <button className="button danger" disabled={saving}>{saving ? 'రద్దు అవుతోంది…' : 'ఆర్డర్ రద్దు చేయండి'}</button>
      </form>
    </Modal>
  );
}
