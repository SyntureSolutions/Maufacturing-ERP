'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { DocCard, Pill, fmtDate, fmtNum, type PillTone } from '@/components/workspace/controls';

// Stock by item: every item in the item master with its stock, worked out from batches, open POs and open work orders.
// A row opens the item in the item master; "New item" opens a blank item there. Batches stay on Stock & Batches.

const TYPES: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material', SEMI_FINISHED: 'Semi-finished', FINISHED_GOOD: 'Finished Good', PACKAGING: 'Packing Material',
  TRADING_GOOD: 'Trading Good', SPARE_PART: 'Spare / Stores', SERVICE: 'Service',
};
const STATUS: Record<string, [string, PillTone]> = {
  OUT: ['Out of stock', 'bad'], NOT_RELEASED: ['Waiting for QC / on hold', 'warn'], ALL_RESERVED: ['All reserved', 'warn'],
  BELOW_REORDER: ['Below reorder', 'warn'], OK: ['In stock', 'ok'], NON_STOCK: ['Not stocked', 'plain'],
};
const WRITE_ROLES = ['ADMIN', 'MANAGER'];
type Filter = 'ALL' | 'NONE' | 'BELOW_REORDER' | 'OK';
const NOTHING_AVAILABLE = ['OUT', 'NOT_RELEASED', 'ALL_RESERVED'];
const inFilter = (f: Filter, status: string) => f === 'ALL' || (f === 'NONE' ? NOTHING_AVAILABLE.includes(status) : status === f);

export default function StockByItemScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {});
  }, []);
  useEffect(() => {
    let gone = false;
    fetch('/api/inventory/stock', { cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `Stock could not be loaded (${r.status}).`); return d; })
      .then(d => { if (!gone) { setRows(d); setError(''); } })
      .catch(e => { if (!gone) setError(e.message); });
    return () => { gone = true; };
  }, [stamp]);

  const live = useMemo(() => (rows || []).filter(r => showInactive || r.isActive), [rows, showInactive]);
  const stocked = live.filter(r => r.status !== 'NON_STOCK');
  const count = (f: Filter) => stocked.filter(r => inFilter(f, r.status)).length;
  const value = stocked.reduce((t, r) => t + r.value, 0);
  const costMissing = stocked.filter(r => r.costMissing > 0).length;

  const shown = live.filter(r => {
    if (!inFilter(filter, r.status)) return false;
    if (type && r.productType !== type) return false;
    const s = q.trim().toLowerCase();
    return !s || `${r.sku} ${r.name} ${r.category || ''}`.toLowerCase().includes(s);
  });
  const open = (id: string) => router.push(`/dashboard/masters/items?id=${id}`);
  const tile = (f: Filter, label: string, n: number, tone = '') => (
    <button type="button" className={`px-tile ${tone ? `px-tile--${tone}` : ''} ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(filter === f ? 'ALL' : f)} aria-pressed={filter === f}>
      <div className="px-tile__label">{label}</div><div className="px-tile__value">{n}</div>
    </button>);

  return (
    <DocCard kind="Inventory" number="Stock by Item"
      meta={rows ? `${stocked.length} stocked items · stock value ₹${fmtNum(value)}${costMissing ? ` · ${costMissing} item${costMissing > 1 ? 's' : ''} with stock but no cost` : ''}` : undefined}>
      <div className="px-doc__section" style={{ display: 'grid', gap: 12 }}>
        <div className="px-tiles">
          {tile('ALL', 'All stocked items', stocked.length)}
          {tile('NONE', 'Nothing available', count('NONE'), 'bad')}
          {tile('BELOW_REORDER', 'Below reorder level', count('BELOW_REORDER'), 'warn')}
          {tile('OK', 'In stock', count('OK'))}
        </div>
        <div className="px-filters">
          <input className="px-input px-search-in" placeholder="Search item code, name or category" value={q} onChange={e => setQ(e.target.value)} aria-label="Search items" />
          <select className="px-input" value={type} onChange={e => setType(e.target.value)} aria-label="Item type">
            <option value="">All item types</option>
            {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="px-check"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Show inactive items</label>
          <span style={{ flex: 1 }} />
          <button type="button" className="px-btn" onClick={() => { setRows(null); setStamp(s => s + 1); }}><RefreshCw className="h-4 w-4" /> Refresh</button>
          <Link className="px-btn" href="/dashboard/inventory">Stock &amp; Batches</Link>
          {WRITE_ROLES.includes(role) && <Link className="px-btn px-btn--primary" href="/dashboard/masters/items?new=1"><Plus className="h-4 w-4" /> New item</Link>}
        </div>
      </div>

      <div className="px-doc__section">
        {error ? <div className="px-error">{error}</div> : !rows ? <div className="px-empty">Loading…</div> : (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead><tr>
                <th>Item code</th><th>Item</th><th>Status</th><th>Unit</th>
                <th className="num" title="Every batch, whatever its quality or store">On hand</th>
                <th className="num" title="Waiting for QC, on hold, rejected, quarantine or scrap">Not usable</th>
                <th className="num" title="Set aside for sales orders and work orders">Reserved</th>
                <th className="num" title="Usable and free">Available</th>
                <th className="num" title="Still to come on open purchase orders">On order</th>
                <th className="num" title="Still to come from open work orders">In production</th>
                <th className="num">Reorder at</th><th className="num">Value (₹)</th>
              </tr></thead>
              <tbody>{shown.map(r => {
                const [label, tone] = STATUS[r.status];
                const stockedItem = r.status !== 'NON_STOCK';
                const n = (v: number) => (stockedItem ? fmtNum(v, 3).replace(/\.?0+$/, '') : '—');
                return (
                  <tr key={r._id} className="is-link" onClick={() => open(r._id)} onKeyDown={e => { if (e.key === 'Enter') open(r._id); }} tabIndex={0} title="Open in the item master">
                    <td><b>{r.sku}</b></td>
                    <td style={{ maxWidth: 230 }} title={`${r.name} · ${TYPES[r.productType] || r.productType}${r.category ? ` · ${r.category}` : ''}${r.lastReceipt ? ` · last received ${fmtDate(r.lastReceipt)}` : ''}`}>{r.name}<span className="px-muted"> · {TYPES[r.productType] || r.productType}</span>{!r.isActive && <> <Pill tone="bad">Inactive</Pill></>}</td>
                    <td><Pill tone={tone}>{label}</Pill></td><td>{r.uom}</td>
                    <td className="num">{n(r.onHand)}</td><td className="num">{r.notUsable ? n(r.notUsable) : ''}</td><td className="num">{r.reserved ? n(r.reserved) : ''}</td>
                    <td className="num"><b>{n(r.available)}</b></td><td className="num">{r.onOrder ? n(r.onOrder) : ''}</td><td className="num">{r.inProduction ? n(r.inProduction) : ''}</td>
                    <td className="num">{stockedItem && r.reorderLevel ? n(r.reorderLevel) : ''}</td>
                    <td className="num">{stockedItem && r.onHand ? (r.costMissing ? <span title={`${fmtNum(r.costMissing, 3)} ${r.uom} on batches with no cost`}>{fmtNum(r.value)} *</span> : fmtNum(r.value)) : ''}</td>
                  </tr>);
              })}</tbody>
            </table>
            {!shown.length && <div className="px-empty">{rows.length ? 'No items match.' : 'No items yet. Add the first one with New item.'}</div>}
            {shown.some(r => r.costMissing > 0) && <div className="px-empty" style={{ textAlign: 'left' }}>* Some of this stock has no cost on its batch, so the value shown is less than the real value.</div>}
          </div>)}
      </div>
    </DocCard>
  );
}
