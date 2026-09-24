import React, { useState } from 'react';
import { api } from '../api/client.js';
import { InlineError, Modal } from '../components/Common.jsx';

export function ReviewForm({ token, order, open, onClose, onSaved }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async e => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      await api(`/v1/orders/${order.id}/review`, { method: 'POST', token, body: { rating, body: body.trim() || null } });
      onSaved?.(); onClose?.();
    } catch (err) { setError(err); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} title="మీ రివ్యూ" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">డెలివర్ అయిన ఆర్డర్‌కు మాత్రమే రివ్యూ ఇవ్వవచ్చు.</p>
        <div className="review-stars" role="radiogroup" aria-label="రేటింగ్">
          {[1,2,3,4,5].map(star => <button key={star} type="button" role="radio" aria-checked={rating === star} onClick={() => setRating(star)} aria-label={`${star} స్టార్`}>{star <= rating ? '★' : '☆'}</button>)}
        </div>
        <div className="field"><label htmlFor="review-body">మీ అభిప్రాయం</label><textarea id="review-body" maxLength="2000" rows="5" value={body} onChange={e => setBody(e.target.value)} placeholder="ఆహారం, ప్యాకింగ్, అనుభవం గురించి రాయండి…" /></div>
        <InlineError error={error} />
        <button className="button primary" disabled={saving}>{saving ? 'పంపుతోంది…' : 'రివ్యూ పంపండి'}</button>
      </form>
    </Modal>
  );
}
