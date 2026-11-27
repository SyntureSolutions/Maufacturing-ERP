'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DocCard, Pill, TabStrip, FindDialog, useMsgBox, fmtDate, fmtNum, type PillTone } from '@/components/workspace/controls';
import { useDocToolbar } from '@/components/workspace/toolbar';
import { DocList } from '@/components/workspace/DocList';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import BOMModal from '@/components/modals/BOMModal';

// Bill of materials: one version of one item's recipe. Its tree to the last level with live stock, whether inputs and
// outputs add up, "can we build N?", where the item is used, and its versions side by side. Editing a draft opens the
// BOM form; an active version is changed by making a new version and activating it (through approval if the Admin set one).

const EDIT_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'];
const TABS = ['Components', 'Scrap & by-products', 'Operations', 'Can we build?', 'Where used', 'Versions'];
const STATUS: Record<string, [string, PillTone]> = { DRAFT: ['Draft', 'new'], PENDING_APPROVAL: ['Waiting for approval', 'warn'], ACTIVE: ['Active', 'ok'], OBSOLETE: ['Obsolete', 'plain'] };
const q3 = (n: number) => fmtNum(n, 3).replace(/\.?0+$/, '');
const idOf = (x: any) => String(x?._id || x || '');
/** v2, and not vv2.0 for versions named with their own v */
const ver = (v: any) => (/^v/i.test(String(v)) ? String(v) : `v${v}`);
const perOne = (b: any, l: any) => (l.quantity * (l.unitFactor || 1)) / (b.baseQuantity || 1);

async function call(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

export default function BomScreen() {
  const router = useRouter();
  const msg = useMsgBox();
  const [boms, setBoms] = useState<any[] | null>(null);
  const [doc, setDoc] = useState<any | null>(null);
  const [view, setView] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [tab, setTab] = useState(TABS[0]);
  const [qty, setQty] = useState('');
  const [buildQty, setBuildQty] = useState('');
  const [build, setBuild] = useState<any | null>(null);
  const [indentQty, setIndentQty] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<[string, string]>(['', '']);
  const [modal, setModal] = useState<{ bom?: any } | null>(null);
  const [find, setFind] = useState(false);
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(false);     // showing every BOM version in a list, not one BOM
  const canEdit = EDIT_ROLES.includes(role);

  const loadList = useCallback(async () => {
    const r = await call('/api/production/bom');
    if (!r.ok) { setError(r.data.error || `BOMs could not be loaded (${r.status}).`); return []; }
    setBoms(r.data); return r.data as any[];
  }, []);

  // one entry per item for the navigator and Find: its default version, else the newest
  const heads = useMemo(() => {
    const by = new Map<string, any>();
    for (const b of boms || []) {
      const k = idOf(b.product), cur = by.get(k);
      if (!cur || (b.isDefault && !cur.isDefault) || (!cur.isDefault && new Date(b.updatedAt) > new Date(cur.updatedAt))) by.set(k, b);
    }
    return [...by.values()].sort((a, b) => String(a.product?.sku).localeCompare(String(b.product?.sku)));
  }, [boms]);

  const open = useCallback(async (id: string, n?: string) => {
    const [one, ex] = await Promise.all([call(`/api/production/bom/${id}`), call(`/api/production/bom/${id}/explore${n ? `?qty=${n}` : ''}`)]);
    if (!one.ok) { msg.error(one.data.error || 'BOM not found.'); return; }
    setDoc(one.data); setView(ex.ok ? ex.data : null); setError(ex.ok ? '' : ex.data.error);
    setQty(n || q3(one.data.baseQuantity || 1)); setBuild(null);
    const all: any[] = ex.data?.versions || []; // newest first
    const at = all.findIndex(v => v._id === id);
    const older = all[at + 1] || all.find(v => v._id !== id);
    setCompare(older ? [older._id, id] : [id, '']);
    setListing(false);
    router.replace(`/dashboard/masters/bom?id=${id}`, { scroll: false });
  }, [msg, router]);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    loadList().then(list => {
      const want = params.get('id');
      if (params.get('new') === '1') setModal({});
      const first = want && list.find(b => b._id === want) ? want : null;
      if (first) open(first); else setListing(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async (id = doc?._id) => { await loadList(); if (id) await open(id, qty); };

  const act = async (action: 'activate' | 'new-version' | 'delete') => {
    if (!doc) return;
    if (action === 'delete' && !(await msg.confirm(`Delete draft version ${doc.version} of ${doc.product?.sku}?`))) return;
    setBusy(true);
    try {
      const r = action === 'delete' ? await call(`/api/production/bom/${doc._id}`, 'DELETE') : await call(`/api/production/bom/${doc._id}`, 'PATCH', { action });
      if (!r.ok) { msg.error(r.data.error || 'That did not work.'); return; }
      if (action === 'activate') { msg.info(r.status === 202 ? `Version ${doc.version} was sent for approval (${(r.data.request?.levels || []).join(' → ')}). The current version stays in use until it is approved.` : `Version ${doc.version} is now the default BOM of ${doc.product?.sku}.`); await refresh(); }
      if (action === 'new-version') { await loadList(); await open(r.data._id); msg.info(`Draft version ${r.data.version} made from version ${doc.version}. Edit it, then activate it.`); }
      if (action === 'delete') { const list = await loadList(); const next = list.find(b => idOf(b.product) === idOf(doc.product)) || list[0]; if (next) await open(next._id); else { setDoc(null); setView(null); } }
    } finally { setBusy(false); }
  };

  const pos = doc ? heads.findIndex(h => idOf(h.product) === idOf(doc.product)) : -1;
  const go = (i: number) => heads[i] && open(heads[i]._id);
  const idle = !busy && !modal;
  const pdfReq = (print = false): PdfRequest => ({ url: `/api/production/bom/${doc._id}/pdf`, title: `BOM ${doc.product?.sku} ${ver(doc.version)}`, print });
  const findByNumber = (no: string) => {
    const s = no.toLowerCase();
    const hit = heads.find(h => String(h.product?.sku).toLowerCase() === s) || heads.find(h => `${h.product?.sku} ${h.product?.name}`.toLowerCase().includes(s));
    if (hit) open(hit._id); else msg.error(`No BOM for an item with code or name "${no}".`);
  };
  useDocToolbar(listing ? {
    mode: 'view', listing: true, position: `${(boms || []).length} versions`, findByNumber,
    actions: { new: idle && canEdit && (() => setModal({})), list: !!doc && (() => open(doc._id)) },
  } : {
    mode: 'view',
    position: pos >= 0 ? `${pos + 1} of ${heads.length}` : heads.length ? `${heads.length} items` : '',
    deleteLabel: 'Delete draft',
    actions: {
      first: idle && pos > 0 && (() => go(0)),
      prev: idle && pos > 0 && (() => go(pos - 1)),
      next: idle && pos >= 0 && pos < heads.length - 1 && (() => go(pos + 1)),
      last: idle && pos >= 0 && pos < heads.length - 1 && (() => go(heads.length - 1)),
      locate: idle && (() => setFind(true)),
      new: idle && canEdit && (() => setModal({})),
      edit: idle && canEdit && doc?.status === 'DRAFT' && (() => setModal({ bom: doc })),
      copy: idle && canEdit && !!doc && doc.status !== 'DRAFT' && (() => act('new-version')),
      delete: idle && canEdit && doc?.status === 'DRAFT' && (() => act('delete')),
      preview: !!doc && (() => setPdf(pdfReq())),
      print: !!doc && (() => setPdf(pdfReq(true))),
      list: idle && (() => { setListing(true); router.replace('/dashboard/masters/bom?view=list', { scroll: false }); }),
    },
    findByNumber,
  });

  const checkBuild = async () => {
    const n = Number(buildQty);
    if (!(n > 0)) { msg.error('Enter how many you want to make.'); return; }
    const r = await call(`/api/production/bom/${doc._id}/explore?build=${n}`);
    if (!r.ok) { msg.error(r.data.error); return; }
    setBuild(r.data);
    setIndentQty(Object.fromEntries(r.data.shortages.map((s: any) => [s.product, q3(Math.max(0, s.short - s.onOrder))])));
  };
  const raiseIndent = async () => {
    const items = build.shortages.map((s: any) => ({ product: s.product, quantity: Number(indentQty[s.product]) || 0, uom: s.uom })).filter((i: any) => i.quantity > 0);
    if (!items.length) { msg.error('Nothing to indent: every shortage is covered by open purchase orders, or the quantities are zero.'); return; }
    const r = await call('/api/purchase-indents', 'POST', { items, source: 'MANUAL', remarks: `Shortage to make ${q3(build.quantity)} ${doc.product?.uom} of ${doc.product?.sku} (BOM v${doc.version})` });
    if (!r.ok) { msg.error(r.data.error || 'Indent not raised.'); return; }
    msg.info(`Indent ${(r.data || []).map((i: any) => i.number).join(', ')} raised for ${items.length} item${items.length > 1 ? 's' : ''}.`);
  };

  // ---------- render ----------

  // every version of every BOM; the chips filter by status
  if (listing) return (
    <>
      {error && <div className="px-error">{error}</div>}
      <DocList title="Bills of Materials" fileName="boms" rows={boms || []}
        onOpen={b => open(b._id)}
        statusOf={b => b.status} statuses={Object.fromEntries(Object.entries(STATUS).map(([k, [label, tone]]) => [k, { label, tone }]))}
        dateOf={b => b.updatedAt}
        empty={boms ? <>No bills of materials yet.{canEdit && <> Press <b>New</b> (Ctrl+N) to add the first one.</>}</> : 'Loading…'}
        columns={[
          { label: 'Item code', width: 140, value: b => <b>{b.product?.sku}</b>, text: b => b.product?.sku || '' },
          { label: 'Item', value: b => b.product?.name || '', text: b => b.product?.name || '' },
          { label: 'Version', width: 90, value: b => ver(b.version), text: b => String(b.version) },
          { label: 'Makes', width: 110, num: true, value: b => `${q3(b.baseQuantity || 1)} ${b.product?.uom || ''}`, text: b => b.baseQuantity || 1 },
          { label: 'Lines', width: 70, num: true, value: b => (b.components || []).length },
          { label: 'Changed', width: 100, value: b => fmtDate(b.updatedAt), text: b => String(b.updatedAt || '') },
          { label: 'Status', width: 190, value: b => <><Pill tone={STATUS[b.status]?.[1] || 'plain'}>{STATUS[b.status]?.[0] || b.status}</Pill>{b.isDefault && <> <Pill tone="info">Default</Pill></>}</>, text: b => `${STATUS[b.status]?.[0] || b.status}${b.isDefault ? ' default' : ''}` },
        ]} />
      <BOMModal isOpen={!!modal} bom={modal?.bom} onClose={() => setModal(null)} onSuccess={async () => { const list = await loadList(); if (list[0]) open(list[0]._id); }} />
    </>);

  if (error && !doc) return <DocCard kind="Bill of Materials" number="BOMs"><div className="px-doc__section"><div className="px-error">{error}</div></div></DocCard>;
  if (!doc) return (
    <DocCard kind="Bill of Materials" number="BOMs">
      <div className="px-doc__section">{boms && !boms.length ? <div className="px-note">No bills of materials yet.{canEdit && <> Press <b>New</b> (Ctrl+N) to add the first one.</>}</div> : <div className="px-empty">Loading…</div>}</div>
      <BOMModal isOpen={!!modal} bom={modal?.bom} onClose={() => setModal(null)} onSuccess={async () => { const list = await loadList(); if (list[0]) open(list[0]._id); }} />
    </DocCard>);

  const [label, tone] = STATUS[doc.status] || [doc.status, 'plain'];
  const uom = doc.product?.uom || '';
  const versions: any[] = view?.versions || [];
  const pills = <><Pill tone={tone}>{label}</Pill>{doc.isDefault && <Pill tone="info">Default</Pill>}</>;
  const meta = <>{doc.product?.name} · makes <b>{q3(doc.baseQuantity || 1)} {uom}</b>{doc.activatedBy && <> · activated by {doc.activatedBy} on {fmtDate(doc.activatedAt)}</>}{doc.status === 'PENDING_APPROVAL' && doc.submittedBy && <> · sent by {doc.submittedBy}</>}{doc.createdBy && doc.status === 'DRAFT' && <> · drafted by {doc.createdBy}</>}</>;

  return (
    <DocCard kind="Bill of Materials" number={`${doc.product?.sku || 'BOM'} · ${ver(doc.version)}`} status={pills} meta={meta}>
      <div className="px-doc__section" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label className="px-muted" htmlFor="bom-version">Version</label>
        <select id="bom-version" className="px-input" style={{ width: 'auto' }} value={doc._id} onChange={e => open(e.target.value)}>
          {versions.map(v => <option key={v._id} value={v._id}>{ver(v.version)} · {STATUS[v.status]?.[0] || v.status}{v.isDefault ? ' · default' : ''}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {canEdit && doc.status === 'DRAFT' && <>
          <button className="px-btn" onClick={() => setModal({ bom: doc })} disabled={busy}>Edit draft</button>
          <button className="px-btn px-btn--primary" onClick={() => act('activate')} disabled={busy}>Activate</button>
        </>}
        {canEdit && doc.status !== 'DRAFT' && <button className="px-btn" onClick={() => act('new-version')} disabled={busy}>New version</button>}
        <Link className="px-btn" href={`/dashboard/masters/items?id=${idOf(doc.product)}`}>Item master</Link>
      </div>

      {doc.status === 'DRAFT' && doc.rejection?.remarks && <div className="px-doc__section"><div className="px-note">Sent back by {doc.rejection.by}{doc.rejection.role ? ` (${doc.rejection.role})` : ''}: {doc.rejection.remarks}</div></div>}
      {doc.status === 'PENDING_APPROVAL' && <div className="px-doc__section"><div className="px-note">Waiting for approval in the <Link href="/dashboard/approval-matrix">Approval Matrix</Link>. It is locked meanwhile; work orders and MRP keep using the current default.</div></div>}
      {doc.notes && <div className="px-doc__section"><span className="px-muted">Notes: </span>{doc.notes}</div>}

      {view?.balance?.comparable && <BalanceStrip b={view.balance} />}

      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      <div className="px-tabpanel">
        {error && <div className="px-error">{error}</div>}

        {tab === 'Components' && view && <>
          <div className="px-filters" style={{ marginBottom: 10 }}>
            <span className="px-muted">Quantities for</span>
            <input className="px-input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && Number(qty) > 0) open(doc._id, qty); }} aria-label="Quantity to show" />
            <span>{uom}</span>
            <button className="px-btn" onClick={() => Number(qty) > 0 && open(doc._id, qty)}>Show</button>
            <span className="px-muted">· every level; sub-assemblies use their default BOM · stock is what is usable and free now</span>
          </div>
          <TreeTable root={view.tree} />
        </>}

        {tab === 'Scrap & by-products' && (
          (doc.outputs || []).length ? (
            <div className="px-table-wrap"><table className="px-table">
              <thead><tr><th>Item</th><th>Type</th><th className="num">Expected from {q3(doc.baseQuantity || 1)} {uom}</th><th>Unit</th><th className="num">Per 1 {uom}</th></tr></thead>
              <tbody>{doc.outputs.map((o: any, i: number) => (
                <tr key={i}><td><b>{o.product?.sku}</b> {o.product?.name}</td><td><Pill tone={o.kind === 'SCRAP' ? 'plain' : 'info'}>{o.kind === 'SCRAP' ? 'Scrap' : 'By-product'}</Pill></td>
                  <td className="num">{q3(o.quantity)}</td><td>{o.unit}</td><td className="num">{q3(perOne(doc, o))} {o.product?.uom}</td></tr>))}</tbody>
            </table></div>
          ) : <div className="px-empty">This version gives no scrap or by-products.</div>
        )}

        {tab === 'Operations' && (
          (doc.routingSteps || []).length ? (
            <div className="px-table-wrap"><table className="px-table">
              <thead><tr><th>#</th><th>Operation</th><th>Machine / work centre</th><th className="num">Minutes</th></tr></thead>
              <tbody>{doc.routingSteps.map((s: any) => <tr key={s.stepNumber}><td>{s.stepNumber}</td><td>{s.description}</td><td>{s.machineType}</td><td className="num">{s.estimatedTimeMinutes ? q3(s.estimatedTimeMinutes) : ''}</td></tr>)}</tbody>
              <tfoot><tr><td /><td><b>Total</b></td><td /><td className="num"><b>{q3(doc.routingSteps.reduce((t: number, s: any) => t + (s.estimatedTimeMinutes || 0), 0))}</b></td></tr></tfoot>
            </table></div>
          ) : <div className="px-empty">No operations on this version.</div>
        )}

        {tab === 'Can we build?' && <>
          <div className="px-filters" style={{ marginBottom: 10 }}>
            <span>Make</span>
            <input className="px-input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" value={buildQty} onChange={e => setBuildQty(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') checkBuild(); }} aria-label="Quantity to make" placeholder="Qty" />
            <span>{uom} with this version</span>
            <button className="px-btn px-btn--primary" onClick={checkBuild}>Check stock</button>
            <span className="px-muted">· sub-assemblies come from stock first, the rest is made from their own BOM</span>
          </div>
          {build && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className={build.ok ? 'px-note' : 'px-error'}>
                {build.ok ? <>Yes. There is enough usable stock to make <b>{q3(build.quantity)} {uom}</b>.</> : <>Not yet: <b>{build.shortages.length} item{build.shortages.length > 1 ? 's are' : ' is'} short</b> for {q3(build.quantity)} {uom}.</>}
                {' '}The most you can make from stock today is <b>{q3(build.maxNow)} {uom}</b>.
              </div>
              {!build.ok && <>
                <div className="px-table-wrap"><table className="px-table">
                  <thead><tr><th>Item</th><th className="num">Needed</th><th className="num">Available</th><th className="num">Short</th><th className="num">On order</th><th className="num">Indent qty</th><th>Unit</th></tr></thead>
                  <tbody>{build.shortages.map((s: any) => (
                    <tr key={s.product}><td><b>{s.sku}</b> {s.name}</td><td className="num">{q3(s.need)}</td><td className="num">{q3(s.available)}</td><td className="num"><b>{q3(s.short)}</b></td><td className="num">{s.onOrder ? q3(s.onOrder) : ''}</td>
                      <td className="num"><input className="px-input" style={{ width: 96, textAlign: 'right' }} inputMode="decimal" value={indentQty[s.product] ?? ''} onChange={e => setIndentQty({ ...indentQty, [s.product]: e.target.value })} aria-label={`Indent quantity for ${s.sku}`} /></td><td>{s.uom}</td></tr>))}</tbody>
                </table></div>
                <div><button className="px-btn px-btn--primary" onClick={raiseIndent}>Raise purchase indent</button> <span className="px-muted">Indent quantity starts at what is short less what is already on order.</span></div>
              </>}
            </div>
          )}
        </>}

        {tab === 'Where used' && view && (
          view.whereUsed.length ? (
            <div className="px-table-wrap"><table className="px-table">
              <thead><tr><th>Used in</th><th>Version</th><th>As</th><th className="num">Quantity</th><th>Unit</th><th className="num">For</th></tr></thead>
              <tbody>{view.whereUsed.map((w: any) => (
                <tr key={`${w.bom}`} className="is-link" onClick={() => open(w.bom)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') open(w.bom); }}>
                  <td><b>{w.sku}</b> {w.name}</td><td>{ver(w.version)} {w.isDefault ? <Pill tone="info">Default</Pill> : <Pill tone={STATUS[w.status]?.[1]}>{STATUS[w.status]?.[0]}</Pill>}</td>
                  <td>{w.role === 'COMPONENT' ? 'Component' : w.role === 'SCRAP' ? 'Scrap from it' : 'By-product of it'}</td>
                  <td className="num">{q3(w.quantity)}</td><td>{w.unit}</td><td className="num">{q3(w.baseQuantity)} {w.uom}</td></tr>))}</tbody>
            </table></div>
          ) : <div className="px-empty">{doc.product?.sku} is not used in any other bill of materials.</div>
        )}

        {tab === 'Versions' && <Versions versions={versions} pair={compare} setPair={setCompare} open={open} uom={uom} />}
      </div>

      <BOMModal isOpen={!!modal} bom={modal?.bom} onClose={() => setModal(null)} onSuccess={async () => {
        if (modal?.bom) { await refresh(modal.bom._id); msg.info('Draft saved.'); return; }
        const list = await loadList(); const made = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
        if (made) await open(made._id); msg.info('Draft BOM created. Activate it to use it for work orders and MRP.');
      }} />
      {find && <FindDialog title="Find Bill of Materials" rows={heads} onClose={() => setFind(false)} onPick={h => { setFind(false); open(h._id); }}
        columns={[
          { label: 'Item code', width: 140, value: h => h.product?.sku, text: h => h.product?.sku || '' },
          { label: 'Item', value: h => h.product?.name, text: h => h.product?.name || '' },
          { label: 'Version', width: 90, value: h => ver(h.version), text: h => String(h.version) },
          { label: 'Status', width: 150, value: h => `${STATUS[h.status]?.[0] || h.status}${h.isDefault ? ' · default' : ''}`, text: h => h.status },
          { label: 'Makes', width: 110, num: true, value: h => `${q3(h.baseQuantity || 1)} ${h.product?.uom || ''}` },
        ]} />}
      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}
    </DocCard>
  );
}

/** Inputs against outputs, when every line is in the item's own unit: input = output + scrap + by-products + loss. */
function BalanceStrip({ b }: { b: any }) {
  const total = Math.max(b.input, b.output + b.scrap + b.byProduct, 1e-9);
  const parts: [string, number, string][] = [['Output', b.output, '#1d4ed8'], ['By-products', b.byProduct, '#0ea5e9'], ['Scrap', b.scrap, '#f97316'], ['Loss', Math.max(0, b.loss), '#94a3b8']];
  const over = b.loss < -1e-6;
  return (
    <div className="px-doc__section" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
        <b>Material balance</b>
        <span>Inputs <b>{q3(b.input)} {b.unit}</b> →</span>
        {parts.filter(([, v]) => v > 0).map(([l, v, c]) => <span key={l}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c, marginRight: 5 }} />{l} <b>{q3(v)} {b.unit}</b> <span className="px-muted">({Math.round((v / b.input) * 100)}%)</span></span>)}
        {over ? <Pill tone="bad">Outputs are {q3(-b.loss)} {b.unit} more than the inputs</Pill> : <Pill tone="ok">Balanced</Pill>}
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#e2e8f0' }} aria-hidden>
        {parts.filter(([, v]) => v > 0).map(([l, v, c]) => <div key={l} style={{ width: `${(v / total) * 100}%`, background: c }} title={`${l} ${q3(v)} ${b.unit}`} />)}
      </div>
    </div>
  );
}

/** Every level of the tree as indented rows, each with the stock that is free to use now. */
function TreeTable({ root }: { root: any }) {
  const [shut, setShut] = useState<Set<string>>(new Set());
  const rows: { n: any; depth: number; key: string }[] = [];
  const add = (n: any, depth: number, key: string) => { rows.push({ n, depth, key }); if (!shut.has(key)) n.children.forEach((c: any, i: number) => add(c, depth + 1, `${key}.${i}`)); };
  root.children.forEach((c: any, i: number) => add(c, 0, String(i)));
  const toggle = (k: string) => setShut(s => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  return (
    <div className="px-table-wrap"><table className="px-table">
      <thead><tr><th>Component</th><th className="num">Per parent</th><th className="num">Needed for {q3(root.need)} {root.uom}</th><th className="num">Available</th><th className="num">On order</th><th>Stock</th></tr></thead>
      <tbody>{rows.map(({ n, depth, key }) => {
        const made = !!n.bomVersion;
        const [l, t]: [string, PillTone] = n.available >= n.need - 1e-9 ? ['Enough', 'ok'] : n.available > 0 ? ['Part', 'warn'] : ['None', 'bad'];
        return (
          <tr key={key}>
            <td style={{ paddingLeft: 8 + depth * 22 }}>
              {made ? <button className="px-iconbtn" style={{ width: 18, display: 'inline-block' }} onClick={() => toggle(key)} aria-label={shut.has(key) ? 'Open level' : 'Close level'}>{shut.has(key) ? '▸' : '▾'}</button> : <span style={{ display: 'inline-block', width: 18 }} />}
              <b>{n.sku}</b> {n.name}{made && <span className="px-muted"> · made, BOM {ver(n.bomVersion)}</span>}
            </td>
            <td className="num">{q3(n.perParent)} {n.uom}</td>
            <td className="num"><b>{q3(n.need)}</b> {n.uom}</td>
            <td className="num">{q3(n.available)}</td>
            <td className="num">{n.onOrder ? q3(n.onOrder) : ''}</td>
            <td><Pill tone={t}>{l}</Pill>{made && t !== 'ok' && <span className="px-muted"> or make</span>}</td>
          </tr>);
      })}</tbody>
    </table></div>
  );
}

/** All versions, and two of them side by side: per ONE unit of the item, so versions with different base quantities compare fairly. */
function Versions({ versions, pair, setPair, open, uom }: { versions: any[]; pair: [string, string]; setPair: (p: [string, string]) => void; open: (id: string) => void; uom: string }) {
  const a = versions.find(v => v._id === pair[0]), b = versions.find(v => v._id === pair[1]);
  const lines = (v: any) => new Map<string, any>([
    ...(v?.components || []).map((c: any) => [`C:${idOf(c.product)}`, { kind: 'Component', p: c.product, q: perOne(v, c), w: c.wastagePercentage || 0 }] as [string, any]),
    ...(v?.outputs || []).map((o: any) => [`O:${idOf(o.product)}`, { kind: o.kind === 'SCRAP' ? 'Scrap' : 'By-product', p: o.product, q: perOne(v, o), w: 0 }] as [string, any]),
  ]);
  const la = lines(a), lb = lines(b);
  const keys = [...new Set([...la.keys(), ...lb.keys()])];
  const same = (x: any, y: any) => x && y && Math.abs(x.q - y.q) < 1e-9 && x.w === y.w;
  const pick = (i: 0 | 1) => (
    <select className="px-input" style={{ width: 'auto' }} value={pair[i]} onChange={e => setPair(i === 0 ? [e.target.value, pair[1]] : [pair[0], e.target.value])} aria-label={i === 0 ? 'First version' : 'Second version'}>
      <option value="">—</option>{versions.map(v => <option key={v._id} value={v._id}>{ver(v.version)} · {STATUS[v.status]?.[0]}</option>)}
    </select>);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="px-table-wrap"><table className="px-table">
        <thead><tr><th>Version</th><th>Status</th><th className="num">Makes</th><th className="num">Components</th><th>Created</th><th>Activated</th><th>Notes</th></tr></thead>
        <tbody>{versions.map(v => (
          <tr key={v._id} className="is-link" onClick={() => open(v._id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') open(v._id); }}>
            <td><b>{ver(v.version)}</b>{v.isDefault && <> <Pill tone="info">Default</Pill></>}</td><td><Pill tone={STATUS[v.status]?.[1]}>{STATUS[v.status]?.[0]}</Pill></td>
            <td className="num">{q3(v.baseQuantity || 1)} {uom}</td><td className="num">{v.components?.length || 0}</td>
            <td>{fmtDate(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ''}</td><td>{v.activatedAt ? `${fmtDate(v.activatedAt)} · ${v.activatedBy || ''}` : ''}</td><td className="px-muted">{v.notes}</td>
          </tr>))}</tbody>
      </table></div>

      {versions.length > 1 && <>
        <div className="px-filters"><b>Compare</b> {pick(0)} <span>with</span> {pick(1)} <span className="px-muted">· quantities per 1 {uom}</span></div>
        {a && b && a._id !== b._id && (
          <div className="px-table-wrap"><table className="px-table">
            <thead><tr><th>Item</th><th>Line</th><th className="num">{ver(a.version)}</th><th className="num">{ver(b.version)}</th><th>Change</th></tr></thead>
            <tbody>{keys.map(k => {
              const x = la.get(k), y = lb.get(k), line = x || y;
              const change = !x ? ['Added', 'ok'] : !y ? ['Removed', 'bad'] : same(x, y) ? ['Same', 'plain'] : ['Changed', 'warn'];
              const show = (z: any) => (z ? <>{q3(z.q)} {z.p?.uom}{z.w ? ` +${q3(z.w)}%` : ''}</> : '—');
              return (
                <tr key={k} style={change[0] === 'Same' ? { opacity: 0.6 } : undefined}>
                  <td><b>{line.p?.sku}</b> {line.p?.name}</td><td>{line.kind}</td><td className="num">{show(x)}</td><td className="num">{show(y)}</td><td><Pill tone={change[1] as PillTone}>{change[0]}</Pill></td>
                </tr>);
            })}
              {(a.routingSteps?.length || 0) !== (b.routingSteps?.length || 0) && <tr><td colSpan={5} className="px-muted">Operations: {a.routingSteps?.length || 0} in {ver(a.version)}, {b.routingSteps?.length || 0} in {ver(b.version)}.</td></tr>}
            </tbody>
          </table></div>
        )}
      </>}
      {versions.length <= 1 && <div className="px-empty">Only one version so far. Use <b>New version</b> to change an active BOM.</div>}
    </div>
  );
}

