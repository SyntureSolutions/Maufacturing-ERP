'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Download, ArrowUp, ArrowDown } from 'lucide-react';
import { Pill, fmtNum, type PillTone } from '@/components/workspace/controls';

// The list view of a document screen: every document of the kind in one table, with a search box, a chip per status
// (with its count), a date range, sorting by any column and totals for what is shown. Clicking a row opens the document.
// Export writes what is shown to a CSV file that opens in Excel.

export interface DocListColumn<T> {
  label: string;
  value: (row: T) => ReactNode;
  /** Plain text for search, sorting and export (default: the value, when it is a string or number) */
  text?: (row: T) => string | number;
  num?: boolean;
  width?: number;
  /** Total this column over the rows shown (money columns) */
  sum?: (row: T) => number;
}

export interface DocListStatus { label: string; tone?: PillTone }

export function DocList<T>({ title, rows, columns, statusOf, statuses, dateOf, onOpen, empty, fileName }: {
  title: string;
  rows: T[];
  columns: DocListColumn<T>[];
  /** The status key of a row; chips are drawn in the order of `statuses` */
  statusOf?: (row: T) => string;
  statuses?: Record<string, DocListStatus>;
  /** The document date, for the From / To filter */
  dateOf?: (row: T) => string | Date | undefined | null;
  onOpen: (row: T) => void;
  empty: ReactNode;
  fileName: string;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ col: number; desc: boolean } | null>(null);

  const textOf = (c: DocListColumn<T>, r: T) => {
    if (c.text) return c.text(r);
    const v = c.value(r);
    return typeof v === 'string' || typeof v === 'number' ? v : '';
  };
  const dayOf = (r: T) => { const d = dateOf?.(r); return d ? new Date(d).toISOString().slice(0, 10) : ''; };

  // rows matching the search and dates (the status chips count these, so a chip shows what clicking it would give)
  const matched = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => {
      if (from || to) { const d = dayOf(r); if (!d || (from && d < from) || (to && d > to)) return false; }
      if (!words.length) return true;
      const hay = columns.map(c => String(textOf(c, r))).join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, q, from, to]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (statusOf) for (const r of matched) { const s = statusOf(r); m.set(s, (m.get(s) || 0) + 1); }
    return m;
  }, [matched, statusOf]);

  const shown = useMemo(() => {
    const list = status && statusOf ? matched.filter(r => statusOf(r) === status) : [...matched];
    if (sort) {
      const c = columns[sort.col];
      list.sort((a, b) => {
        const x = c.sum ? c.sum(a) : textOf(c, a), y = c.sum ? c.sum(b) : textOf(c, b);
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return sort.desc ? -cmp : cmp;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, status, statusOf, sort, columns]);

  const totals = columns.map(c => (c.sum ? shown.reduce((t, r) => t + (Number(c.sum!(r)) || 0), 0) : null));
  const hasTotals = totals.some(t => t !== null);
  const filtered = q || status || from || to;

  const exportCsv = () => {
    const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [columns.map(c => cell(c.label)).join(','), ...shown.map(r => columns.map(c => cell(c.sum ? c.sum(r) : textOf(c, r))).join(','))];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="px-doc px-list" aria-label={title}>
      <header className="px-doc__head">
        <h1 className="px-doc__no">{title}</h1>
        <span className="px-doc__meta">{filtered ? `${shown.length} of ${rows.length}` : `${rows.length}`} {rows.length === 1 ? 'document' : 'documents'}</span>
      </header>

      <div className="px-doc__section px-list__filters">
        <input className="px-input" style={{ maxWidth: 300 }} placeholder="Search number, party, item…" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
        {dateOf && <>
          <label className="px-list__date">From<input type="date" className="px-input" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="px-list__date">To<input type="date" className="px-input" value={to} onChange={e => setTo(e.target.value)} /></label>
        </>}
        {filtered && <button className="px-btn" onClick={() => { setQ(''); setStatus(''); setFrom(''); setTo(''); }}>Clear filters</button>}
        <button className="px-btn" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!shown.length} title="Download what is shown as a CSV file (opens in Excel)"><Download />Export</button>
      </div>

      {statusOf && statuses && (
        <div className="px-doc__section px-list__chips" role="group" aria-label="Filter by status">
          <button className={`px-chip ${!status ? 'is-on' : ''}`} onClick={() => setStatus('')}>All <b>{matched.length}</b></button>
          {Object.entries(statuses).filter(([k]) => counts.has(k) || status === k).map(([k, s]) => (
            <button key={k} className={`px-chip ${status === k ? 'is-on' : ''}`} onClick={() => setStatus(status === k ? '' : k)}>
              <Pill tone={s.tone}>{s.label}</Pill> <b>{counts.get(k) || 0}</b>
            </button>))}
        </div>)}

      <div className="px-doc__section">
        <div className="px-table-wrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
          <table className="px-table">
            <thead><tr>{columns.map((c, i) => (
              <th key={c.label} className={`px-list__th ${c.num ? 'num' : ''}`} style={c.width ? { width: c.width } : undefined}
                aria-sort={sort?.col === i ? (sort.desc ? 'descending' : 'ascending') : undefined}
                onClick={() => setSort(s => (s?.col === i ? (s.desc ? null : { col: i, desc: true }) : { col: i, desc: false }))} title="Sort">
                {c.label}{sort?.col === i && (sort.desc ? <ArrowDown className="px-list__sort" /> : <ArrowUp className="px-list__sort" />)}
              </th>))}</tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onOpen(r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r); }}>
                  {columns.map(c => <td key={c.label} className={c.num ? 'num' : ''}>{c.value(r)}</td>)}
                </tr>))}
            </tbody>
            {hasTotals && shown.length > 0 && (
              <tfoot><tr className="px-list__total">{columns.map((c, i) => (
                <td key={c.label} className={c.num ? 'num' : ''}>{i === 0 ? `Total (${shown.length})` : totals[i] !== null ? fmtNum(totals[i]!) : ''}</td>))}</tr></tfoot>)}
          </table>
          {!shown.length && <div className="px-empty">{rows.length ? 'Nothing matches these filters.' : empty}</div>}
        </div>
      </div>
    </section>
  );
}
