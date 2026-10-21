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

export type NavTarget = 'play' | 'games' | 'problems' | 'settings';

const NAV_ITEMS: ReadonlyArray<{ id: NavTarget; label: string }> = [
  { id: 'play', label: 'AIと対局' },
  { id: 'games', label: '棋譜' },
  { id: 'problems', label: '次の一手' },
  { id: 'settings', label: '設定' },
];

/** The way out of a full-screen game or review: a menu of the app's sections. */
export const NavMenu: React.FC<{ onNavigate: (target: NavTarget) => void }> = ({ onNavigate }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="sensei-menu-button" aria-label="メニュー" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <Dialog title="メニュー" onClose={() => setOpen(false)}>
          <ul className="sensei-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button type="button" className="sensei-list-item" onClick={() => { setOpen(false); onNavigate(item.id); }}>
                  <span className="sensei-list-main sensei-list-title">{item.label}</span>
                  <span aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="sensei-secondary" onClick={() => setOpen(false)}>閉じる</button>
        </Dialog>
      )}
    </>
  );
};
