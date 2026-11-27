'use client';

import { PageHeader, Alert } from '@/components/ui';
import { useEffect, useMemo, useState } from 'react';
import { pivot, Metric } from '@/lib/pivot';

const field = 'input input-auto';
const btn = 'btn btn-sm';

function fmt(v: number | null | undefined, m: Metric) {
  if (v === null || v === undefined) return '';
  if (m.format === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (m.format === 'currency') return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function BiPage() {
  const [sources, setSources] = useState<{ key: string; label: string }[]>([]);
  const [source, setSource] = useState('sales');
  const [data, setData] = useState<{ dimensions: { key: string; label: string }[]; metrics: Metric[]; rows: any[] } | null>(null);
  const [rowDims, setRowDims] = useState<string[]>([]);
  const [colDim, setColDim] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/bi').then(r => r.json()).then(d => setSources(Array.isArray(d) ? d : [])).catch(() => {}); }, []);
  useEffect(() => {
    setData(null); setError('');
    fetch(`/api/bi?source=${source}`).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setData(d); setRowDims([d.dimensions[0].key]); setColDim(null); setMetricKey(d.metrics[0].key);
    }).catch(e => setError(e.message));
  }, [source]);

  const metric = data?.metrics.find(m => m.key === metricKey);
  const result = useMemo(() => (data && metric ? pivot(data.rows, rowDims, colDim, metric) : null), [data, metric, rowDims, colDim]);
  const label = (k: string) => data?.dimensions.find(d => d.key === k)?.label || k;

  const onDrop = (zone: 'rows' | 'cols') => (e: React.DragEvent) => {
    e.preventDefault();
    const k = e.dataTransfer.getData('text/plain');
    if (!k) return;
    if (zone === 'rows') { setRowDims(r => (r.includes(k) ? r : [...r, k])); setColDim(c => (c === k ? null : c)); }
    else { setColDim(k); setRowDims(r => r.filter(x => x !== k)); }
  };

  const exportCsv = () => {
    if (!result || !metric) return;
    const head = [rowDims.map(label).join(' / ') || 'All', ...result.colKeys, ...(colDim ? ['Total'] : [])];
    const lines = result.rowKeys.map(rk => { const key = rk.join(' / '); return [key, ...result.colKeys.map(c => result.cells[`${key}||${c}`] ?? ''), ...(colDim ? [result.rowTotals[key] ?? ''] : [])]; });
    const csv = [head, ...lines].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' })); a.download = `report-${source}.csv`; a.click();
  };

  const Zone = ({ title, zone, items }: { title: string; zone: 'rows' | 'cols'; items: string[] }) => (
    <div onDragOver={e => e.preventDefault()} onDrop={onDrop(zone)} className="min-h-[3.5rem] flex-1 rounded-2xl border-2 border-dashed border-slate-300 p-2">
      <div className="mb-1 text-[11px] font-bold uppercase text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-1">{items.map(k => <span key={k} className="flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{label(k)}<button className="opacity-70" onClick={() => (zone === 'rows' ? setRowDims(rowDims.filter(x => x !== k)) : setColDim(null))}>×</button></span>)}
        {!items.length && <span className="text-xs text-slate-400">Drop a dimension here</span>}</div>
    </div>
  );

  return (
    <div className="ui-page">
      <PageHeader title="MIS Report Builder" subtitle="Pick a dataset, drag dimensions into rows or columns, and choose a metric (cost per unit, scrap rate, supplier quality and more)." />
      <div className="flex flex-wrap items-center gap-3">
        <select className={field} value={source} onChange={e => setSource(e.target.value)}>{sources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        {data && <select className={field} value={metricKey} onChange={e => setMetricKey(e.target.value)}>{data.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>}
        <button className={`${btn} btn-primary`} onClick={exportCsv}>Export CSV</button>
        {data && <span className="text-xs text-slate-500">{data.rows.length} records</span>}
      </div>
      {error && <Alert ok={false}>{error}</Alert>}
      {data && <>
        <div className="flex flex-wrap items-center gap-2 card">
          <span className="text-xs font-bold text-slate-500">Dimensions (drag):</span>
          {data.dimensions.map(d => <span key={d.key} draggable onDragStart={e => e.dataTransfer.setData('text/plain', d.key)} onDoubleClick={() => setRowDims(r => (r.includes(d.key) ? r : [...r, d.key]))} className="cursor-grab rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold">{d.label}</span>)}
        </div>
        <div className="flex flex-col gap-3 md:flex-row"><Zone title="Rows" zone="rows" items={rowDims} /><Zone title="Columns" zone="cols" items={colDim ? [colDim] : []} /></div>
        {result && metric && (
          <div className="table-wrap">
            <table className="w-full text-left text-sm"><thead className=""><tr>
              <th className="p-3">{rowDims.map(label).join(' / ') || 'All'}</th>{result.colKeys.map(c => <th key={c} className="text-right">{c}</th>)}{colDim && <th className="pr-3 text-right">Total</th>}</tr></thead>
              <tbody>{result.rowKeys.map(rk => { const key = rk.join(' / '); return (
                <tr key={key} className="border-t border-slate-100"><td className="p-3 font-semibold">{key}</td>{result.colKeys.map(c => <td key={c} className="text-right">{fmt(result.cells[`${key}||${c}`], metric)}</td>)}{colDim && <td className="pr-3 text-right font-bold">{fmt(result.rowTotals[key], metric)}</td>}</tr>); })}
                {!result.rowKeys.length && <tr><td colSpan={result.colKeys.length + 2} className="p-6 text-center text-slate-400">No data in this dataset yet.</td></tr>}</tbody>
              <tfoot><tr className="border-t-2 border-slate-800 font-bold"><td className="p-3">{metric.label} — total</td>{result.colKeys.map(c => <td key={c} className="text-right">{colDim ? fmt(result.colTotals[c], metric) : fmt(result.grandTotal, metric)}</td>)}{colDim && <td className="pr-3 text-right">{fmt(result.grandTotal, metric)}</td>}</tr></tfoot></table>
          </div>
        )}
      </>}
    </div>
  );
}
