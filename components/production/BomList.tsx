'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CopyPlus, Pencil, Plus, ShieldCheck, Trash2, PackageSearch } from 'lucide-react';
import BOMModal from '@/components/modals/BOMModal';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Bills of materials, one card per item with all its versions. The default version is what work orders and MRP use.
// Draft -> Activate (straight away, or through the approval matrix if the Admin set a BOM activation rule) -> Active, locked.
// A change to an active BOM is made as a new version.

const EDIT_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'];
const STATUS: Record<string, [string, string]> = {
  DRAFT: ['Draft', 'bg-slate-100 text-slate-700'],
  PENDING_APPROVAL: ['Waiting for approval', 'bg-amber-100 text-amber-800'],
  ACTIVE: ['Active', 'bg-emerald-100 text-emerald-700'],
  OBSOLETE: ['Obsolete', 'bg-slate-100 text-slate-400'],
};
const n = (v: number) => String(Math.round((v || 0) * 1000) / 1000);

export default function BomList({ onChange }: { onChange?: () => void }) {
  const [boms, setBoms] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [role, setRole] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({}); // item -> version shown
  const [modal, setModal] = useState<{ bom?: any } | null>(null);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');

  const load = () => fetch('/api/production/bom', { cache: 'no-store' })
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `BOMs could not be loaded (${r.status}).`); setBoms(d); setError(''); })
    .catch(e => setError(e.message));
  useEffect(() => {
    load();
    fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {});
  }, []);
  const canEdit = EDIT_ROLES.includes(role);

  // group versions by item: default first, then drafts / pending, then newest
  const items = useMemo(() => {
    const map = new Map<string, { product: any; versions: any[] }>();
    for (const b of boms || []) {
      const k = String(b.product?._id || b.product);
      if (!map.has(k)) map.set(k, { product: b.product, versions: [] });
      map.get(k)!.versions.push(b);
    }
    const rank = (b: any) => (b.isDefault ? 0 : b.status === 'PENDING_APPROVAL' ? 1 : b.status === 'DRAFT' ? 2 : b.status === 'ACTIVE' ? 3 : 4);
    const s = q.trim().toLowerCase();
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, product: v.product, versions: v.versions.sort((a, b) => rank(a) - rank(b) || +new Date(b.updatedAt) - +new Date(a.updatedAt)) }))
      .filter(i => !s || `${i.product?.sku} ${i.product?.name}`.toLowerCase().includes(s))
      .sort((a, b) => String(a.product?.sku).localeCompare(String(b.product?.sku)));
  }, [boms, q]);

  const act = async (bom: any, action: 'activate' | 'new-version' | 'delete') => {
    if (action === 'delete' && !window.confirm(`Delete draft version ${bom.version}?`)) return;
    setBusy(bom._id); setMsg(null);
    try {
      const res = await fetch(`/api/production/bom/${bom._id}`, action === 'delete'
        ? { method: 'DELETE' }
        : { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `That did not work (${res.status}).`);
      const item = String(bom.product?._id || bom.product);
      if (action === 'activate') setMsg({ ok: true, text: res.status === 202 ? `Version ${bom.version} sent for approval (${(d.request?.levels || []).join(' → ')}). The current version stays in use until it is approved.` : `Version ${bom.version} is now the default BOM.` });
      if (action === 'new-version') { setMsg({ ok: true, text: `Draft version ${d.version} made from version ${bom.version}. Edit it, then activate it.` }); setShown(s => ({ ...s, [item]: d._id })); }
      if (action === 'delete') setMsg({ ok: true, text: `Draft version ${bom.version} deleted.` });
      await load(); onChange?.();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(''); }
  };

  const btn = 'text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1 disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="px-3 py-2 rounded-xl border border-slate-200 text-sm w-72" placeholder="Search item code or name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search BOMs" />
        <span className="flex-1" />
        {canEdit && <button onClick={() => setModal({})} className="text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-xl flex items-center gap-1.5"><Plus className="w-4 h-4" /> New BOM</button>}
      </div>
      {msg && <div className={`text-sm px-4 py-2.5 rounded-xl ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      {error && <div className="text-sm px-4 py-2.5 rounded-xl bg-red-50 text-red-700">{error}</div>}
      {!boms && !error && <p className="text-slate-500 text-sm text-center py-8">Loading…</p>}

      {items.map(({ key, product, versions }) => {
        const bom = versions.find(v => v._id === shown[key]) || versions[0];
        const isOpen = open === key;
        const def = versions.find(v => v.isDefault) || versions.find(v => v.status === 'ACTIVE');
        const [label, tone] = STATUS[bom.status] || [bom.status, 'bg-slate-100'];
        return (
          <div key={key} className={`border rounded-2xl overflow-hidden ${isOpen ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
            <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="w-full p-4 flex items-center justify-between text-left">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl"><PackageSearch className="w-5 h-5" /></div>
                <div>
                  <h4 className="font-bold text-slate-900">{product?.name || 'Item not found'} <span className="font-mono text-xs text-slate-500">{product?.sku}</span></h4>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {def ? <>In use: <b className="text-slate-700">version {def.version}</b> · makes {n(def.baseQuantity || 1)} {product?.uom} · {def.components?.length || 0} components</> : <span className="text-amber-700 font-bold">No active version: work orders cannot be raised for this item yet</span>}
                    {versions.length > 1 && <> · {versions.length} versions</>}
                  </div>
                </div>
              </div>
              {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
            </button>

            {isOpen && (
              <div className="border-t border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {versions.length > 1 ? (
                    <select className="text-sm px-2 py-1.5 rounded-lg border border-slate-200" value={bom._id} onChange={e => setShown(s => ({ ...s, [key]: e.target.value }))} aria-label="Version">
                      {versions.map(v => <option key={v._id} value={v._id}>Version {v.version} · {STATUS[v.status]?.[0] || v.status}{v.isDefault ? ' · default' : ''}</option>)}
                    </select>
                  ) : <span className="text-sm font-bold text-slate-700">Version {bom.version}</span>}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${tone}`}>{label}</span>
                  {bom.isDefault && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Default</span>}
                  <span className="text-xs text-slate-500">
                    Makes {n(bom.baseQuantity || 1)} {product?.uom}
                    {bom.activatedBy && <> · activated by {bom.activatedBy}{bom.activatedAt ? ` on ${new Date(bom.activatedAt).toLocaleDateString('en-IN')}` : ''}</>}
                    {bom.status === 'PENDING_APPROVAL' && bom.submittedBy && <> · sent by {bom.submittedBy}</>}
                  </span>
                  <span className="flex-1" />
                  {canEdit && bom.status === 'DRAFT' && <>
                    <button className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`} onClick={() => setModal({ bom })} disabled={!!busy}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                    <button className={`${btn} border-blue-700 bg-blue-700 text-white hover:bg-blue-800`} onClick={() => act(bom, 'activate')} disabled={!!busy}><ShieldCheck className="w-3.5 h-3.5" /> Activate</button>
                    <button className={`${btn} border-slate-200 text-red-600 hover:bg-red-50`} onClick={() => act(bom, 'delete')} disabled={!!busy} aria-label="Delete draft"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>}
                  {canEdit && bom.status !== 'DRAFT' && <button className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`} onClick={() => act(bom, 'new-version')} disabled={!!busy}><CopyPlus className="w-3.5 h-3.5" /> New version</button>}
                  <a className={`${btn} border-slate-200 text-blue-700 hover:bg-blue-50`} href={`/dashboard/masters/bom?id=${bom._id}`}>Open</a>
                  <PdfButton url={pdfUrl.bom(bom._id)} title={`BOM ${product?.sku || ''} v${bom.version}`} />
                </div>

                {bom.status === 'DRAFT' && bom.rejection?.remarks && <div className="text-sm px-3 py-2 rounded-lg bg-amber-50 text-amber-900">Sent back by {bom.rejection.by}{bom.rejection.role ? ` (${bom.rejection.role})` : ''}: {bom.rejection.remarks}</div>}
                {bom.notes && <p className="text-sm text-slate-600">{bom.notes}</p>}

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase border-b border-slate-100">
                      <tr><th className="p-2.5">Component</th><th className="p-2.5">Code</th><th className="p-2.5 text-right">Qty for {n(bom.baseQuantity || 1)} {product?.uom}</th><th className="p-2.5">Unit</th><th className="p-2.5 text-right">Wastage</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {(bom.components || []).map((c: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2.5 font-medium">{c.product?.name || 'Item not found'}</td>
                          <td className="p-2.5 font-mono text-xs text-slate-500">{c.product?.sku}</td>
                          <td className="p-2.5 text-right font-bold">{n(c.quantity)}</td>
                          <td className="p-2.5">{c.unit}{c.unitFactor && c.unitFactor !== 1 ? <span className="text-xs text-slate-500"> (= {n(c.quantity * c.unitFactor)} {c.product?.uom})</span> : null}</td>
                          <td className="p-2.5 text-right text-slate-500">{c.wastagePercentage ? `${n(c.wastagePercentage)}%` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!bom.components?.length && <p className="text-sm text-slate-500 text-center py-4">No components.</p>}
                </div>

                {bom.outputs?.length > 0 && (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase border-b border-slate-100">
                        <tr><th className="p-2.5">Scrap &amp; by-products</th><th className="p-2.5">Code</th><th className="p-2.5">Type</th><th className="p-2.5 text-right">Expected from {n(bom.baseQuantity || 1)} {product?.uom}</th><th className="p-2.5">Unit</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {bom.outputs.map((o: any, i: number) => (
                          <tr key={i}>
                            <td className="p-2.5 font-medium">{o.product?.name || 'Item not found'}</td>
                            <td className="p-2.5 font-mono text-xs text-slate-500">{o.product?.sku}</td>
                            <td className="p-2.5"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${o.kind === 'SCRAP' ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-800'}`}>{o.kind === 'SCRAP' ? 'Scrap' : 'By-product'}</span></td>
                            <td className="p-2.5 text-right font-bold">{n(o.quantity)}</td>
                            <td className="p-2.5">{o.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {bom.routingSteps?.length > 0 && (
                  <div className="text-sm text-slate-600">
                    <span className="text-xs font-bold uppercase text-slate-400">Operations </span>
                    {bom.routingSteps.map((s: any) => `${s.stepNumber}. ${s.description}${s.machineType ? ` (${s.machineType})` : ''}${s.estimatedTimeMinutes ? `, ${n(s.estimatedTimeMinutes)} min` : ''}`).join(' → ')}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {boms && !items.length && <p className="text-slate-500 text-sm text-center py-8">{boms.length ? 'No BOMs match.' : 'No bills of materials yet.'}{canEdit && !boms.length && ' Use New BOM to add the first one.'}</p>}

      <BOMModal isOpen={!!modal} bom={modal?.bom} onClose={() => setModal(null)} onSuccess={() => { load(); onChange?.(); setMsg({ ok: true, text: modal?.bom ? 'Draft saved.' : 'Draft BOM created. Activate it to use it for work orders and MRP.' }); }} />
    </div>
  );
}
