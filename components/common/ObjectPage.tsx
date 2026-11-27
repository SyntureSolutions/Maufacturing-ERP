'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Building blocks for document object pages (PO, purchase requisition, GRN): a read-only label/value field,
// a collapsible section and a tab strip. Styles live in app/globals.css (.field-row, .obj-section, .obj-tabs).

export const fmtDay = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');
export const fmtQty = (n: number) => (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
export const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Field({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children === undefined || children === null || children === '';
  return <div className="field-row"><span className="field-label">{label}</span><div className="field-value" title={typeof children === 'string' ? children : undefined}>{empty ? '—' : children}</div></div>;
}

export function StatusField({ label, tone, children }: { label: string; tone: 'positive' | 'negative' | 'critical' | 'info'; children: ReactNode }) {
  return <div className="field-row"><span className="field-label">{label}</span><span className={`status-text status-text--${tone}`}>{children}</span></div>;
}

export function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="obj-section">
      <button className="obj-section__toggle" onClick={onToggle} aria-expanded={open}>
        <span>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span><span>{title}</span>
      </button>
      {open && <div className="obj-section__body">{children}</div>}
    </section>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return <div className="obj-tabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={active === t} className={`tab ${active === t ? 'tab-active' : ''}`} onClick={() => onChange(t)}>{t}</button>)}</div>;
}
