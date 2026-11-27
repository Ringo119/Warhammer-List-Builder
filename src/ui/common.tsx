import { useEffect, useState, type ReactNode } from 'react';
import { IconBack } from './icons';
import * as I from './icons';
import { back } from '../lib';

export function AppBar({ title, sub, onBack, right }: { title: ReactNode; sub?: ReactNode; onBack?: (() => void) | string; right?: ReactNode }) {
  return (
    <header className="appbar">
      {onBack !== undefined && (
        <button className="icon-btn" aria-label="Back" onClick={() => (typeof onBack === 'string' ? back(onBack) : onBack())}>
          <IconBack />
        </button>
      )}
      <div className="title" style={onBack === undefined ? { paddingLeft: 12 } : undefined}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

let toastSetter: ((s: string | null) => void) | undefined;
export function toast(msg: string) {
  toastSetter?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" key={msg + Date.now()}>{msg}</div> : null;
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="center-load">
      <div>
        <div className="spinner" />
        {text}
      </div>
    </div>
  );
}

export function Rich({ html, className = '' }: { html: string; className?: string }) {
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** BSData text uses ^^**Keyword**^^ and **bold** markup */
export function bsText(s: string) {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\^\^\*\*(.*?)\*\*\^\^/g, '<span class="kwb">$1</span>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

export function RoleIcon({ section, category }: { section: string; category?: string }) {
  const c = category ?? '';
  if (/Aircraft|Fly/.test(c)) return <I.RoleAircraft />;
  if (section === 'Characters') return <I.RoleCharacter />;
  if (section === 'Battleline') return <I.RoleBattleline />;
  if (section === 'Dedicated Transports') return <I.RoleTransport />;
  if (/Vehicle|Walker|Monster/.test(c)) return <I.RoleVehicle />;
  if (/Mounted|Bike/.test(c)) return <I.RoleMounted />;
  if (section === 'Configuration') return <I.RoleConfig />;
  return <I.RoleInfantry />;
}
