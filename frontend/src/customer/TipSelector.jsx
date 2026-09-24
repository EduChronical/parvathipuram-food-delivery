import React, { useMemo, useState } from 'react';
import { money } from '../api/client.js';

const PRESETS = [0, 1000, 2000, 5000];

export function TipSelector({ valuePaise, onChange }) {
  const [custom, setCustom] = useState('');
  const presetSelected = useMemo(() => PRESETS.includes(valuePaise), [valuePaise]);
  const setCustomTip = raw => {
    setCustom(raw);
    const rupees = Number(raw);
    if (Number.isFinite(rupees) && rupees >= 0) onChange(Math.round(rupees * 100));
  };
  return (
    <section className="card">
      <h3>డెలివరీ భాగస్వామికి టిప్</h3>
      <p className="muted">మీ టిప్ 100% రైడర్‌కే వెళ్తుంది. ప్లాట్‌ఫాం deduction ₹0.</p>
      <div className="tip-grid">
        {PRESETS.map(paise => (
          <button key={paise} type="button" className={`tip-choice ${valuePaise === paise ? 'selected' : ''}`} onClick={() => { setCustom(''); onChange(paise); }}>
            {paise === 0 ? 'టిప్ లేదు' : money(paise)}
          </button>
        ))}
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="custom-tip">కస్టమ్ టిప్ (₹)</label>
        <input id="custom-tip" type="number" min="0" max="10000" inputMode="decimal" value={custom} onChange={e => setCustomTip(e.target.value)} placeholder="ఉదా: 30" aria-describedby="tip-current" />
        {!presetSelected && <small id="tip-current" className="muted">ఎంచుకున్న టిప్: {money(valuePaise)}</small>}
      </div>
    </section>
  );
}
