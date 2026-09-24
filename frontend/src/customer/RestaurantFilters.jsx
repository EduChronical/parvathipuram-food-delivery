import React from 'react';

export function RestaurantFilters({ value, onChange }) {
  const set = patch => onChange({ ...value, ...patch });
  return (
    <section className="card" aria-label="రెస్టారెంట్ ఫిల్టర్లు">
      <div className="filters">
        <div className="field">
          <label htmlFor="diet">ఆహారం</label>
          <select id="diet" value={value.diet} onChange={e => set({ diet: e.target.value })}>
            <option value="all">అన్నీ</option>
            <option value="veg">వెజ్</option>
            <option value="nonveg">నాన్-వెజ్</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="minPrice">కనిష్ఠ ధర (₹)</label>
          <input id="minPrice" inputMode="numeric" min="0" type="number" value={value.minPriceRupees} onChange={e => set({ minPriceRupees: e.target.value })} placeholder="0" />
        </div>
        <div className="field">
          <label htmlFor="maxPrice">గరిష్ఠ ధర (₹)</label>
          <input id="maxPrice" inputMode="numeric" min="0" type="number" value={value.maxPriceRupees} onChange={e => set({ maxPriceRupees: e.target.value })} placeholder="500" />
        </div>
        <label className="row card" style={{ boxShadow: 'none', padding: '8px 12px' }}>
          <span><strong>ఇప్పుడు తెరిచి ఉన్నవి</strong><br/><small className="muted">Open now</small></span>
          <input type="checkbox" checked={value.openNow} onChange={e => set({ openNow: e.target.checked })} aria-label="ఇప్పుడు తెరిచి ఉన్న రెస్టారెంట్లు మాత్రమే" />
        </label>
      </div>
    </section>
  );
}
