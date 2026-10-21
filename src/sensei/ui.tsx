/** Small shared pieces for the simple mode's screens. */
import React, { useEffect } from 'react';

export const Header: React.FC<{ title: string; left?: React.ReactNode; right?: React.ReactNode }> = ({ title, left, right }) => (
  <header className="sensei-header">
    <div className="sensei-header-side">{left}</div>
    <h1>{title}</h1>
    <div className="sensei-header-side end">{right}</div>
  </header>
);

export const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <span className="sensei-switch">
    <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span />
  </span>
);

export const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div
    className="sensei-overlay"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="sensei-dialog">
      <h2>{title}</h2>
      {children}
    </div>
  </div>
);

export const Toast: React.FC<{ message: string; onDone: () => void }> = ({ message, onDone }) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return <div className="sensei-toast" role="status">{message}</div>;
};

/** A row of mutually exclusive choices. */
export function Segmented<T extends string | number>({ options, value, onChange, label }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="sensei-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
