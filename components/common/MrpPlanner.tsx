'use client';

import { Alert } from '@/components/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

const TYPE_STYLE: Record<string, string> = {
  FG: 'bg-blue-100 text-blue-800', SFG: 'bg-purple-100 text-purple-800', RM: 'bg-slate-100 text-slate-700', PM: 'bg-amber-100 text-amber-800',
};

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function nextMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

function TreeNode({ node, depth }: { node: any; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <div>
      <div className="flex items-center gap-2 py-1 text-sm" style={{ paddingLeft: depth * 20 }}>
        {node.children.length ? <button onClick={() => setOpen(!open)} className="w-4 text-slate-500">{open ? '▾' : '▸'}</button> : <span className="w-4" />}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_STYLE[node.itemType]}`}>{node.itemType}</span>
        <span className="font-semibold text-slate-800">{node.name}</span>
        <span className="text-xs text-slate-400">{node.sku}</span>
        <span className="ml-auto text-xs font-semibold text-slate-600">{node.quantity} {node.uom}</span>
      </div>
      {open && node.children.map((c: any) => <TreeNode key={c.product + c.sku} node={c} depth={depth + 1} />)}
    </div>
  );
}

const shortDay = (d: any) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');

export default function MrpPlanner() {
  const months = useMemo(() => nextMonths(3), []);
  const [products, setProducts] = useState<any[]>([]);
  const [forecast, setForecast] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState({ includeOrders: true, includeForecast: true });
  const [matrix, setMatrix] = useState<any[] | null>(null);
  const [lastRun, setLastRun] = useState<any | null>(null);
  const [woResult, setWoResult] = useState<{ created: any[]; skipped: any[]; message?: string } | null>(null);
  const [treeProduct, setTreeProduct] = useState('');
  const [tree, setTree] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api('/api/products'), api('/api/forecasts')]);
      setProducts(Array.isArray(p) ? p : []);
      const map: Record<string, string> = {};
      (Array.isArray(f) ? f : []).forEach((x: any) => { map[`${x.product}|${x.month}`] = String(x.quantity); });
      setForecast(map);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const finished = products.filter(p => (p.productType || 'FINISHED_GOOD') !== 'RAW_MATERIAL' && (p.productType || 'FINISHED_GOOD') !== 'PACKAGING');

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const saveForecast = () => guard(async () => {
    const entries = Object.entries(forecast).filter(([, v]) => v !== '').map(([k, v]) => { const [product, month] = k.split('|'); return { product, month, quantity: Number(v) }; });
    const r = await api('/api/forecasts', 'PUT', { entries });
    setMsg({ ok: true, text: `Saved ${r.saved} forecast entries.` });
  });

  const calculate = (save: boolean) => guard(async () => {
    const r = await api('/api/mrp/run', 'POST', { ...opts, months: months.length, preview: !save });
    setMatrix(r.matrix);
    if (save) { setLastRun(r); setWoResult(null); setMsg({ ok: true, text: 'MRP run saved.' }); }
  });

  const createIndents = () => guard(async () => {
    const r = await api('/api/mrp/indents', 'POST', { runId: lastRun._id });
    setLastRun({ ...lastRun, indentsCreated: true });
    setMsg({ ok: true, text: r.message || `${r.created.length} purchase indent(s) created — review them in Procurement Planning.` });
  });

  const createWorkOrders = () => guard(async () => {
    const r = await api('/api/mrp/work-orders', 'POST', { runId: lastRun._id });
    setWoResult(r);
    if (r.created.length) { setLastRun({ ...lastRun, workOrdersCreated: true }); setMsg({ ok: true, text: `${r.created.length} work order(s) created as PLANNED. Find them under Production Orders.` }); }
    else setMsg({ ok: false, text: r.message || 'No work orders were created.' });
  });

  const showTree = (id: string) => guard(async () => { setTreeProduct(id); setTree(id ? await api(`/api/mrp/bom-tree?product=${id}`) : null); });

  const cell = 'p-2 text-right tabular-nums';
  return (
    <div className="space-y-6">
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      <section className="space-y-3 card">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Sales projection (monthly forecast)</h3>
          <button disabled={busy} onClick={saveForecast} className="btn btn-sm btn-primary">Save forecast</button>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Product</th>{months.map(m => <th key={m} className="p-2 text-right">{m}</th>)}</tr></thead>
          <tbody>{finished.map(p => (
            <tr key={p._id} className="border-t border-slate-100">
              <td className="p-2">{p.name} <span className="text-xs text-slate-400">{p.sku}</span></td>
              {months.map(m => <td key={m} className="p-2 text-right"><input type="number" min="0" className="input input-auto w-24 text-right" value={forecast[`${p._id}|${m}`] ?? ''} onChange={e => setForecast({ ...forecast, [`${p._id}|${m}`]: e.target.value })} /></td>)}
            </tr>
          ))}</tbody>
        </table></div>
        <p className="text-xs text-slate-500">Forecast quantity is reduced by confirmed sales orders due in the same month, so demand is not counted twice.</p>
      </section>

      <section className="space-y-3 card">
        <div className="flex flex-wrap items-center gap-4">
          <h3 className="font-bold text-slate-900">Run MRP</h3>
          <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={opts.includeOrders} onChange={e => setOpts({ ...opts, includeOrders: e.target.checked })} />Sales orders</label>
          <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={opts.includeForecast} onChange={e => setOpts({ ...opts, includeForecast: e.target.checked })} />Forecast ({months.length} months)</label>
          <button disabled={busy} onClick={() => calculate(false)} className="btn btn-sm btn-secondary">Preview</button>
          <button disabled={busy} onClick={() => calculate(true)} className="btn btn-sm btn-primary">Run &amp; save</button>
          {lastRun && !lastRun.indentsCreated && <button disabled={busy} onClick={createIndents} className="btn btn-sm btn-success">Create purchase indents</button>}
          {lastRun && !lastRun.workOrdersCreated && (matrix || []).some((r: any) => r.orderType === 'WORK_ORDER' && r.netIndentQty > 0) && <button disabled={busy} onClick={createWorkOrders} className="btn btn-sm btn-primary">Create work orders</button>}
        </div>
        <p className="text-xs text-slate-500">Net indent = (gross requirement + reorder level) − (in stock + open PO + open work orders). Sub-assemblies are exploded through multi-level BOMs.</p>
        {woResult && woResult.created.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-sm font-bold">Work orders created from this run</div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr><th className="py-1.5 text-left">Work order</th><th className="text-left">Product</th><th className="text-left">Type</th><th className="text-right">Qty</th><th className="text-left pl-4">Builds for</th><th className="text-left">Window</th></tr></thead>
              <tbody>{woResult.created.map((w: any) => {
                const p = matrix?.find((x: any) => x.product === w.product);
                return (<tr key={w._id} className="border-t border-slate-200">
                  <td className="py-1.5 font-semibold num">{w.woNumber}</td><td>{p?.name}</td><td>{w.itemType === 'SFG' ? 'Sub-assembly' : 'Assembly'}</td><td className="text-right num">{w.quantity}</td>
                  <td className="pl-4">{w.parentWorkOrder || '—'}</td><td className="num whitespace-nowrap">{new Date(w.plannedStartDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → {new Date(w.plannedEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td></tr>);
              })}</tbody>
            </table></div>
            {woResult.skipped.length > 0 && <div className="mt-2 text-xs text-amber-800">Skipped: {woResult.skipped.map((x: any) => `${matrix?.find((m: any) => m.product === x.product)?.name || x.product} (${x.reason})`).join(', ')}</div>}
          </div>
        )}
        {matrix && (matrix.length ? (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className=""><tr>
              <th className="p-2 text-left">Item</th><th className="p-2">Type</th><th className="p-2 text-right">Req qty</th><th className="p-2 text-right">In stock</th>
              <th className="p-2 text-right">PO pipeline</th><th className="p-2 text-right">Open WO</th><th className="p-2 text-right">Reorder / safety</th><th className="p-2 text-right">Net indent qty</th><th className="p-2">Need by</th><th className="p-2" title="Need by less the lead time in the item master">Order / start by</th><th className="p-2">Action</th>
            </tr></thead>
            <tbody>{matrix.map(r => (
              <tr key={r.product} className="border-t border-slate-100">
                <td className="p-2">{r.name} <span className="text-xs text-slate-400">{r.sku}</span></td>
                <td className="p-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_STYLE[r.itemType]}`}>{r.itemType}</span></td>
                <td className={cell}>{r.grossReq}</td><td className={cell}>{r.inStock}</td><td className={cell}>{r.poPipeline}</td><td className={cell}>{r.openWorkOrders}</td><td className={cell}>{r.reorderLevel}{r.safetyStock ? ` / ${r.safetyStock}` : ''}</td>
                <td className={`${cell} font-bold ${r.netIndentQty > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.netIndentQty}</td>
                <td className="p-2 text-xs">{shortDay(r.needBy)}</td>
                <td className={`p-2 text-xs ${r.late ? 'font-bold text-red-600' : ''}`}>{r.netIndentQty > 0 ? <>{shortDay(r.orderBy)}{r.leadTimeDays ? ` (${r.leadTimeDays} d)` : ''}{r.late && ' · late'}</> : ''}</td>
                <td className="p-2 text-xs">{r.notPlanned ? 'Not planned (item master)' : r.netIndentQty > 0 ? (r.orderType === 'PURCHASE' ? 'Purchase indent' : 'Work order') : 'Covered'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-sm text-slate-400">No demand found. Add a forecast or approve sales orders.</p>)}
      </section>

      <section className="space-y-3 card">
        <h3 className="font-bold text-slate-900">BOM explorer</h3>
        <select className="input md:w-96" value={treeProduct} onChange={e => showTree(e.target.value)}>
          <option value="">Select a product…</option>{products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
        </select>
        {tree && (tree.children.length ? <TreeNode node={tree} depth={0} /> : <p className="text-sm text-slate-400">No active BOM for this product.</p>)}
      </section>
    </div>
  );
}
