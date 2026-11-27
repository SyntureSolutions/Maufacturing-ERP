'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, CircleHelp, XCircle, Search, X } from 'lucide-react';

// Building blocks for document screens: the document card, labelled fields, pick buttons, tabs, dialogs,
// message boxes (instead of browser alert/confirm) and the Find list.

export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
export const fmtNum = (n: number | undefined | null, dp = 2) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const isoDay = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export type PillTone = 'new' | 'warn' | 'ok' | 'info' | 'bad' | 'plain';
export const Pill = ({ tone = 'plain', children }: { tone?: PillTone; children: ReactNode }) => <span className={`px-pill ${tone === 'plain' ? '' : `px-pill--${tone}`}`}>{children}</span>;

/** A document as a card: kind and number, a status pill, a line of facts, and Close (back to the start page). */
export function DocCard({ kind, number, status, meta, children }: { kind: string; number: ReactNode; status?: ReactNode; meta?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  return (
    <section className="px-doc" aria-label={kind}>
      <header className="px-doc__head">
        <div>
          <div className="px-doc__kind">{kind}</div>
          <h1 className="px-doc__no">{number}</h1>
        </div>
        {status}
        {meta && <div className="px-doc__meta">{meta}</div>}
        <button className="px-doc__close" onClick={() => router.push('/dashboard')} title="Close" aria-label="Close document"><X className="h-5 w-5" /></button>
      </header>
      {children}
    </section>
  );
}

/** Label above, control below; `pick` adds a selection button beside the control. */
export function Field({ label, children, pick, wide }: { label: string; children: ReactNode; pick?: ReactNode; wide?: boolean }) {
  return (
    <div className={`px-field ${wide ? 'px-field--wide' : ''}`}>
      <label>{label}</label>
      <div className="px-field__ctl">{children}{pick}</div>
    </div>
  );
}

export function PickButton({ onClick, disabled, title = 'Choose', small }: { onClick: () => void; disabled?: boolean; title?: string; small?: boolean }) {
  return <button type="button" className={`px-pick ${small ? 'px-pick--sm' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-label={title}><Search /></button>;
}

export function TabStrip({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="px-tabs" role="tablist">
      {tabs.map(t => <button key={t} role="tab" aria-selected={t === active} className={`px-tab ${t === active ? 'is-active' : ''}`} onClick={() => onChange(t)}>{t}</button>)}
    </div>
  );
}

/** A modal dialog. Esc or a click outside closes it. */
export function Dialog({ title, onClose, children, buttons, width }: { title: string; onClose: () => void; children: ReactNode; buttons?: ReactNode; width?: number }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="px-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="px-dialog" role="dialog" aria-label={title} style={width ? { width } : undefined}>
        <div className="px-dialog__title"><span className="flex-1">{title}</span><button className="px-doc__close" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        <div className="px-dialog__body">{children}</div>
        {buttons && <div className="px-dialog__buttons">{buttons}</div>}
      </div>
    </div>
  );
}

// ---------- Message boxes ----------

type MsgKind = 'info' | 'error' | 'warn' | 'confirm' | 'prompt';
interface Msg { kind: MsgKind; text: string; title: string; minLength?: number; resolve: (v: any) => void }
interface MsgApi {
  info: (text: string, title?: string) => Promise<void>;
  error: (text: string, title?: string) => Promise<void>;
  confirm: (text: string, title?: string) => Promise<boolean>;
  /** Asks for a written reason; resolves to the text, or null if cancelled. */
  prompt: (text: string, title?: string, minLength?: number) => Promise<string | null>;
}

const MsgCtx = createContext<MsgApi | null>(null);

export function MsgBoxProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Msg[]>([]);
  const [answer, setAnswer] = useState('');
  const push = useCallback((kind: MsgKind, text: string, title: string, minLength?: number) =>
    new Promise<any>(resolve => setQueue(q => [...q, { kind, text, title, minLength, resolve }])), []);
  const api = useMemo<MsgApi>(() => ({
    info: async (text, title = 'Done') => { await push('info', text, title); },
    error: async (text, title = 'Please check') => { await push('error', text, title); },
    confirm: (text, title = 'Confirm') => push('confirm', text, title),
    prompt: (text, title = 'Reason needed', minLength = 1) => push('prompt', text, title, minLength),
  }), [push]);
  const msg = queue[0];
  const done = (v: any) => { msg?.resolve(v); setQueue(q => q.slice(1)); setAnswer(''); };
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (msg?.kind !== 'prompt') okRef.current?.focus(); }, [msg]);
  const Icon = msg?.kind === 'error' ? XCircle : msg?.kind === 'warn' ? AlertTriangle : msg?.kind === 'confirm' || msg?.kind === 'prompt' ? CircleHelp : Info;
  const color = msg?.kind === 'error' ? '#c53030' : msg?.kind === 'confirm' || msg?.kind === 'prompt' ? '#f56a0a' : '#1a86e8';
  const short = msg?.kind === 'prompt' && answer.trim().length < (msg.minLength || 1);
  return (
    <MsgCtx.Provider value={api}>
      {children}
      {msg && (
        <Dialog title={msg.title} onClose={() => done(msg.kind === 'prompt' ? null : false)} buttons={
          msg.kind === 'confirm'
            ? <><button className="px-btn" onClick={() => done(false)}>No</button><button ref={okRef} className="px-btn px-btn--primary" onClick={() => done(true)}>Yes</button></>
            : msg.kind === 'prompt'
              ? <><button className="px-btn" onClick={() => done(null)}>Cancel</button><button className="px-btn px-btn--primary" disabled={short} onClick={() => done(answer.trim())}>OK</button></>
              : <button ref={okRef} className="px-btn px-btn--primary" onClick={() => done(true)}>OK</button>}>
          <div className="px-msg"><Icon style={{ color }} />
            <div className="flex-1">
              {msg.text}
              {msg.kind === 'prompt' && <>
                <textarea className="px-input mt-3" style={{ minHeight: 80 }} autoFocus value={answer} onChange={e => setAnswer(e.target.value)} aria-label="Reason" />
                {(msg.minLength || 0) > 1 && <div style={{ color: 'var(--px-muted)', fontSize: 12 }}>At least {msg.minLength} characters.</div>}
              </>}
            </div>
          </div>
        </Dialog>)}
    </MsgCtx.Provider>
  );
}

export function useMsgBox() {
  const api = useContext(MsgCtx);
  if (!api) throw new Error('useMsgBox must be used inside MsgBoxProvider');
  return api;
}

// ---------- Find (choose a record from a list) ----------

export interface ListColumn<T> { label: string; width?: number; value: (row: T) => ReactNode; num?: boolean; text?: (row: T) => string }

/**
 * A searchable list in a dialog, used to find a document, choose a vendor or an item.
 * Double-click or Enter takes the highlighted row; the arrow keys move it.
 */
export function FindDialog<T>({ title, rows, columns, onPick, onClose, empty = 'Nothing to show.', width = 860 }: {
  title: string; rows: T[]; columns: ListColumn<T>[]; onPick: (row: T) => void; onClose: () => void; empty?: string; width?: number;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const text = (r: T) => columns.map(c => (c.text ? c.text(r) : String(c.value(r) ?? ''))).join(' ').toLowerCase();
  const shown = q.trim() ? rows.filter(r => text(r).includes(q.trim().toLowerCase())) : rows;
  const pick = (r?: T) => { if (r) onPick(r); };
  return (
    <Dialog title={title} onClose={onClose} width={width} buttons={<><button className="px-btn" onClick={onClose}>Cancel</button><button className="px-btn px-btn--primary" onClick={() => pick(shown[sel])} disabled={!shown.length}>Select</button></>}>
      <div className="px-search">
        <input className="px-input" style={{ maxWidth: 360 }} autoFocus placeholder="Type to search…" aria-label="Search" value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(shown.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); pick(shown[sel]); }
          }} />
        <span style={{ color: 'var(--px-muted)' }}>{shown.length} of {rows.length}</span>
      </div>
      <div className="px-table-wrap" style={{ height: 380 }}>
        <table className="px-table">
          <thead><tr>{columns.map(c => <th key={c.label} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={i === sel ? 'is-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => pick(r)} style={{ cursor: 'pointer' }}>
                {columns.map(c => <td key={c.label} className={c.num ? 'num' : ''}>{c.value(r)}</td>)}
              </tr>))}
          </tbody>
        </table>
        {!shown.length && <div className="px-empty">{empty}</div>}
      </div>
    </Dialog>
  );
}

// ---------- Calculator ----------

/** Evaluates + - * / with brackets; anything else is refused (no eval). */
function calc(expr: string): number {
  const tokens = expr.replace(/\s+/g, '').match(/\d+(\.\d+)?|[-+*/()]/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): number => {
    const t = tokens[i++];
    if (t === '-') return -factor();
    if (t === '(') { const v = sum(); i++; return v; }
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error('bad');
    return n;
  };
  const product = (): number => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = tokens[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const sum = (): number => { let v = product(); while (peek() === '+' || peek() === '-') { const op = tokens[i++]; const r = product(); v = op === '+' ? v + r : v - r; } return v; };
  const v = sum();
  if (i !== tokens.length) throw new Error('bad');
  return v;
}

export function Calculator({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState('');
  const press = (k: string) => {
    if (k === 'C') return setV('');
    if (k === '=') { try { const r = calc(v); setV(Number.isFinite(r) ? String(Math.round(r * 1e6) / 1e6) : 'Error'); } catch { setV('Error'); } return; }
    setV(s => (s === 'Error' ? '' : s) + k);
  };
  return (
    <Dialog title="Calculator" onClose={onClose}>
      <div className="px-calc">
        <input className="px-input" autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') press('='); }} aria-label="Expression" />
        {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+', '(', ')', '='].map(k =>
          <button key={k} className={`px-btn ${k === '=' ? 'px-btn--primary' : ''}`} style={k === '=' ? { gridColumn: 'span 2' } : undefined} onClick={() => press(k)}>{k}</button>)}
      </div>
    </Dialog>
  );
}
