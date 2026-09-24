import React from 'react';

export function DarkModeToggle({ dark, onChange }) {
  return (
    <button className="icon-button" type="button" onClick={() => onChange(!dark)} aria-pressed={dark} aria-label="డార్క్ మోడ్ మార్చండి">
      {dark ? '☀️' : '🌙'} <span className="desktop-only">{dark ? 'లైట్' : 'డార్క్'}</span>
    </button>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="card skeleton-card" aria-busy="true" aria-label="లోడ్ అవుతోంది">
      <Skeleton className="skeleton-title" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="skeleton-line" />)}
    </div>
  );
}

export function EmptyState({ title, detail }) {
  return <div className="empty-state"><strong>{title}</strong>{detail && <p>{detail}</p>}</div>;
}

export function InlineError({ error }) {
  if (!error) return null;
  return <div className="error-banner" role="alert">{error.message || String(error)}</div>;
}

export function Pill({ children, tone = 'neutral' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="మూసివేయండి">✕</button></header>
        {children}
      </section>
    </div>
  );
}
