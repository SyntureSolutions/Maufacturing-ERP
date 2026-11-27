'use client';

import { useEffect, useState } from 'react';
import { Dialog, fmtNum } from '@/components/workspace/controls';

export interface HsnPick { code: string; kind: string; description: string; gstRate?: number }

/** Searches the HSN/SAC master as you type (digits match the start of the code, words match the description). */
export function HsnPicker({ onPick, onClose, initial = '' }: { onPick: (h: HsnPick) => void; onClose: () => void; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState<{ rows: HsnPick[]; total: number; all: number } | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/hsn?q=${encodeURIComponent(q.trim())}&limit=100`)
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Search failed.'); return d; })
        .then(d => { setRes(d); setSel(0); setError(''); })
        .catch(e => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const rows = res?.rows || [];
  return (
    <Dialog title="HSN / SAC Search" onClose={onClose} width={900}
      buttons={<><button className="px-btn" onClick={onClose}>Cancel</button><button className="px-btn px-btn--primary" disabled={!rows.length} onClick={() => rows[sel] && onPick(rows[sel])}>Select</button></>}>
      <div className="px-search">
        <input className="px-input" style={{ maxWidth: 380 }} autoFocus value={q} placeholder="Code (e.g. 8714) or words (e.g. bicycle parts)" aria-label="Search HSN or SAC"
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(rows.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
            if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); onPick(rows[sel]); }
          }} />
        <span style={{ color: 'var(--px-muted)' }}>{res ? `${res.total.toLocaleString('en-IN')} found${res.total > rows.length ? `, first ${rows.length} shown` : ''}` : ''}</span>
      </div>
      {error && <div className="px-error mb-2">{error}</div>}
      {res && res.all === 0 && <div className="px-note mb-2">The HSN/SAC master is empty. Import the list in Masters &gt; HSN / SAC Codes, or type the code on the item.</div>}
      <div className="px-table-wrap" style={{ height: 380 }}>
        <table className="px-table">
          <thead><tr><th style={{ width: 110 }}>Code</th><th style={{ width: 60 }}>Type</th><th>Description</th><th className="num" style={{ width: 80 }}>GST %</th></tr></thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={h.code} className={i === sel ? 'is-selected' : ''} style={{ cursor: 'pointer' }} onClick={() => setSel(i)} onDoubleClick={() => onPick(h)}>
                <td><b>{h.code}</b></td><td>{h.kind}</td><td title={h.description} style={{ whiteSpace: 'normal' }}>{h.description || '—'}</td>
                <td className="num">{h.gstRate === undefined || h.gstRate === null ? '—' : fmtNum(h.gstRate, 2).replace(/\.00$/, '')}</td>
              </tr>))}
          </tbody>
        </table>
        {res && !rows.length && res.all > 0 && <div className="px-empty">No code matches “{q}”.</div>}
      </div>
    </Dialog>
  );
}
