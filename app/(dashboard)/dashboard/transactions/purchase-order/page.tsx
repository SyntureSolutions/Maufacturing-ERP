'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, NotebookPen, ListPlus, CheckCircle2, X } from 'lucide-react';
import { DocCard, Field, PickButton, Pill, TabStrip, Dialog, FindDialog, useMsgBox, fmtDate, fmtNum, isoDay, type PillTone } from '@/components/workspace/controls';
import { useDocToolbar, type DocMode } from '@/components/workspace/toolbar';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import { DocList } from '@/components/workspace/DocList';
import { DocumentFlow } from '@/components/workspace/DocumentFlow';
import { CHARGE_LABELS, computeTax, stateCodeOf, stateName } from '@/lib/gst';
import { orderView } from '@/lib/purchaseUnits';

// Purchase Order screen: opens on the list of orders (List / F4); a document card with the vendor and order facts, Items / Tax Summary / Linked Documents tabs,
// a totals summary, and the command bar for creating, editing, moving between orders and printing.
// Lines can be picked from approved purchase indents. Saving goes to /api/purchase, which applies every rule
// (approval tier, source list, open indent quantity); its messages are shown as they are.

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];
const APPROVE_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER', 'FINANCE_MANAGER'];
const SEND_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const EDITABLE = ['DRAFT', 'PENDING_APPROVAL'];
const STATUS_TEXT: Record<string, string> = { DRAFT: 'Draft', PENDING_APPROVAL: 'Pending Approval', ORDERED: 'Approved / Ordered', PARTIALLY_RECEIVED: 'Partly Received', RECEIVED: 'Received', CANCELLED: 'Cancelled' };
const TABS = ['Items', 'Charges', 'Tax Summary', 'Linked Documents'];

interface Source { indent: string; indentNo?: string; lineNo: number; quantity: number }
// quantity and unitPrice are in `unit`: '' is the item's stock unit, otherwise its purchase unit (bag, roll...)
// unitPrice is the list rate as typed; disc is the line discount %, so the net rate is unitPrice less disc
interface Line { key: string; productId: string; unit: string; quantity: string; unitPrice: string; disc: string; deliveryDate: string; sources: Source[]; received?: number; billed?: number }
interface Charge { label: string; amount: string }
interface Draft { supplierId: string; expectedDeliveryDate: string; notes: string; lines: Line[]; charges: Charge[] }

const idOf = (v: any) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : '');
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
let seq = 0;
const newKey = () => `new-${++seq}`;
const emptyDraft = (): Draft => ({ supplierId: '', expectedDeliveryDate: '', notes: '', lines: [], charges: [] });
const netRate = (l: { unitPrice: string; disc: string }) => { const r = num(l.unitPrice), d = num(l.disc); return Number.isFinite(r) ? r * (1 - (Number.isFinite(d) ? d : 0) / 100) : 0; };

function toDraft(po: any): Draft {
  return {
    supplierId: idOf(po.supplier),
    expectedDeliveryDate: isoDay(po.expectedDeliveryDate),
    notes: po.notes || '',
    charges: (po.charges || []).map((c: any) => ({ label: c.label, amount: String(c.amount) })),
    lines: (po.items || []).map((i: any) => ({
      key: String(i._id), productId: idOf(i.product), unit: i.orderFactor ? i.orderUnit : '',
      quantity: String(orderView(i).qty), unitPrice: String(Math.round((i.listPrice ?? i.unitPrice) * (i.orderFactor || 1) * 100) / 100), disc: i.discountPercent ? String(i.discountPercent) : '', deliveryDate: isoDay(i.deliveryDate),
      sources: (i.sources || []).map((s: any) => ({ indent: idOf(s.indent), indentNo: s.indent?.number, lineNo: s.lineNo, quantity: s.quantity })),
      received: i.receivedQuantity || 0, billed: i.billedQuantity || 0,
    })),
  };
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `The server answered ${res.status}.`);
  return data;
}

export default function PurchaseOrderScreen() {
  const msg = useMsgBox();
  const router = useRouter();
  const [role, setRole] = useState('');
  const [list, setList] = useState<any[]>([]);        // every PO, oldest first (First … Last)
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);          // the PO on screen (null when there is none yet)
  const [mode, setMode] = useState<DocMode>('view');
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [tab, setTab] = useState(TABS[0]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<null | 'locate' | 'supplier' | 'indent' | 'addl' | 'narration' | { item: number }>(null);
  const [selLine, setSelLine] = useState<number | null>(null);
  const [listing, setListing] = useState(false);     // showing the list of orders, not one order

  const editing = mode !== 'view';
  const canWrite = WRITE_ROLES.includes(role);

  // ---------- loading ----------

  const loadList = useCallback(async () => {
    const data = await readJson(await fetch('/api/purchase'));
    const asc = [...data].reverse();
    setList(asc);
    return asc;
  }, []);

  const show = useCallback(async (id: string) => {
    const po = await readJson(await fetch(`/api/purchase/${id}`));
    setDoc(po);
    setDraft(toDraft(po));
    setMode('view');
    setSelLine(null);
    setListing(false);
    window.history.replaceState(null, '', `?id=${po._id}`);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, sup, prod] = await Promise.all([
          fetch('/api/auth/session').then(r => r.json()).catch(() => ({})),
          fetch('/api/suppliers').then(readJson).catch(() => []),
          fetch('/api/products').then(readJson).catch(() => []),
        ]);
        setRole(session?.user?.role || '');
        setSuppliers(Array.isArray(sup) ? sup : []);
        setProducts(Array.isArray(prod) ? prod : []);
        fetch('/api/settings/company').then(r => (r.ok ? r.json() : null)).then(setCompany).catch(() => {});
        const all = await loadList();
        const wanted = new URLSearchParams(window.location.search).get('id');
        const start = wanted && all.find(p => String(p._id) === wanted);
        if (start) await show(String(start._id)); else setListing(true);
      } catch (e: any) {
        setLoadError(e.message);
      }
    })();
  }, [loadList, show]);

  // ---------- lookups ----------

  const productMap = useMemo(() => {
    const m = new Map<string, any>(products.map(p => [String(p._id), p]));
    for (const i of doc?.items || []) if (i.product && typeof i.product === 'object' && !m.has(String(i.product._id))) m.set(String(i.product._id), i.product);
    return m;
  }, [products, doc]);
  const supplierMap = useMemo(() => {
    const m = new Map<string, any>(suppliers.map(s => [String(s._id), s]));
    if (doc?.supplier && typeof doc.supplier === 'object' && !m.has(String(doc.supplier._id))) m.set(String(doc.supplier._id), doc.supplier);
    return m;
  }, [suppliers, doc]);

  const supplier = supplierMap.get(draft.supplierId);
  const companyState = company?.stateCode || stateCodeOf(company?.gstin);
  const supplierState = stateCodeOf(supplier?.gstin);
  const tax = useMemo(() => computeTax(draft.lines.map(l => {
    const p = productMap.get(l.productId);
    const q = num(l.quantity);
    return { description: p?.name || '', hsnCode: p?.hsnCode || '—', quantity: Number.isFinite(q) ? q : 0, unitPrice: netRate(l), gstRate: Number(p?.gstRate ?? 0) };
  }), supplierState, companyState, draft.charges.map(c => ({ label: c.label, amount: Number.isFinite(num(c.amount)) ? num(c.amount) : 0 }))), [draft.lines, draft.charges, productMap, supplierState, companyState]);
  const totalQty = draft.lines.reduce((s, l) => s + (Number.isFinite(num(l.quantity)) ? num(l.quantity) : 0), 0);

  // ---------- editing helpers ----------

  const setLine = (i: number, patch: Partial<Line>) => setDraft(d => ({ ...d, lines: d.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) }));
  const removeLine = (i: number) => { setDraft(d => ({ ...d, lines: d.lines.filter((_, n) => n !== i) })); setSelLine(null); };
  const chooseItem = (index: number, p: any) => {
    const pid = String(p._id);
    const dupe = draft.lines.findIndex((l, n) => l.productId === pid && n !== index);
    if (dupe >= 0) { msg.error(`${p.name} is already on line ${dupe + 1}. Change the quantity on that line instead.`); return; }
    const price = String(p.purchasePrice ?? 0);
    if (index >= draft.lines.length) setDraft(d => ({ ...d, lines: [...d.lines, { key: newKey(), productId: pid, unit: '', quantity: '1', unitPrice: price, disc: '', deliveryDate: '', sources: [] }] }));
    else setLine(index, { productId: pid, unit: '', unitPrice: draft.lines[index].unitPrice || price, sources: [] });
  };

  const startNew = (from?: Draft) => {
    if (!canWrite) { msg.error('Your role cannot raise purchase orders.'); return; }
    setDraft(from || emptyDraft());
    setMode('new');
    setListing(false);
    setTab(TABS[0]);
    setSelLine(null);
  };

  const discard = async () => {
    if (!(await msg.confirm('Discard the changes made to this purchase order?'))) return;
    if (doc) { setDraft(toDraft(doc)); setMode('view'); } else { setDraft(emptyDraft()); setMode('view'); setListing(true); }
  };

  const save = async () => {
    if (!draft.supplierId) { msg.error('Select the Seller (supplier).'); return; }
    if (!draft.lines.length) { msg.error('Add at least one item in Supply Details.'); return; }
    for (const [n, l] of draft.lines.entries()) {
      if (!(num(l.quantity) > 0)) { msg.error(`Line ${n + 1}: enter a quantity more than zero.`); return; }
      if (!(num(l.unitPrice) >= 0)) { msg.error(`Line ${n + 1}: enter the rate.`); return; }
      if (l.disc.trim() && !(num(l.disc) >= 0 && num(l.disc) < 100)) { msg.error(`Line ${n + 1}: discount must be from 0 to below 100%.`); return; }
    }
    const body = {
      supplier: draft.supplierId,
      expectedDeliveryDate: draft.expectedDeliveryDate || undefined,
      notes: draft.notes,
      items: draft.lines.map(l => ({
        product: l.productId, unit: l.unit || undefined, quantity: num(l.quantity), unitPrice: num(l.unitPrice), discountPercent: l.disc.trim() ? num(l.disc) : undefined, deliveryDate: l.deliveryDate || undefined,
        sources: l.sources.map(s => ({ indent: s.indent, lineNo: s.lineNo, quantity: s.quantity })),
      })),
      charges: draft.charges.filter(c => c.label.trim() || c.amount.trim()).map(c => ({ label: c.label.trim(), amount: num(c.amount) })),
    };
    setBusy(true);
    try {
      const saved = mode === 'new'
        ? await readJson(await fetch('/api/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
        : await readJson(await fetch(`/api/purchase/${doc._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      await loadList();
      await show(String(saved._id));
      await msg.info(`Purchase Order ${saved.poNumber} saved.\nStatus: ${STATUS_TEXT[saved.status] || saved.status}.`
        + (saved.status === 'PENDING_APPROVAL' ? `\nIt needs ${String(saved.approvalRequiredRole || '').replace(/_/g, ' ').toLowerCase()} approval before goods can be received.` : ''));
    } catch (e: any) {
      msg.error(e.message, 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  const patchStatus = async (status: string, question: string, done: string) => {
    if (!doc || !(await msg.confirm(question))) return;
    setBusy(true);
    try {
      if (status === 'ORDERED') await readJson(await fetch('/api/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'UPDATE_STATUS', poId: doc._id, newStatus: 'ORDERED' }) }));
      else await readJson(await fetch(`/api/purchase/${doc._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }));
      await loadList();
      await show(String(doc._id));
      msg.info(done);
    } catch (e: any) {
      msg.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendToVendor = async () => {
    if (!doc) return;
    if (!SEND_ROLES.includes(role)) { msg.error('Your role cannot send purchase orders to vendors.'); return; }
    if (!(await msg.confirm(`E-mail purchase order ${doc.poNumber} with its PDF to ${supplier?.name || 'the vendor'}?`))) return;
    setBusy(true);
    try {
      const r = await readJson(await fetch(`/api/purchase/${doc._id}/dispatch`, { method: 'POST' }));
      const lines = (r.results || []).map((x: any) => `${x.channel}: ${x.status}${x.error ? ` (${x.error})` : ''}`).join('\n');
      await msg.info(`${r.delivered ? 'Sent.' : 'Not delivered.'}\n${lines}${r.pdfWarning ? `\n${r.pdfWarning}` : ''}\nAcknowledgement link: ${r.ackLink}`);
      await show(String(doc._id));
    } catch (e: any) {
      msg.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- toolbar ----------

  const pos = doc ? list.findIndex(p => String(p._id) === String(doc._id)) : -1;
  const go = (i: number) => { const p = list[i]; if (p) show(String(p._id)).catch(e => msg.error(e.message)); };
  const viewing = !editing && !busy;
  const openList = () => { setListing(true); window.history.replaceState(null, '', '?view=list'); };
  const findByNumber = (no: string) => {
    const q = no.toLowerCase();
    const hit = list.find(p => String(p.poNumber).toLowerCase() === q) || list.find(p => String(p.poNumber).toLowerCase().endsWith(q));
    if (hit) show(String(hit._id)).catch(e => msg.error(e.message));
    else msg.error(`No purchase order numbered ${no}.`);
  };
  const listed = listing && !editing;
  useDocToolbar(listed ? {
    mode, listing: true, position: `${list.length} orders`, findByNumber,
    actions: { new: !busy && canWrite && (() => startNew()), locate: !busy && (() => setDialog('locate')), list: !!doc && (() => show(String(doc._id)).catch(e => msg.error(e.message))) },
  } : {
    mode,
    position: pos >= 0 ? `${pos + 1} of ${list.length}` : list.length ? `${list.length} orders` : '',
    actions: {
      first: viewing && list.length > 0 && pos !== 0 && (() => go(0)),
      prev: viewing && pos > 0 && (() => go(pos - 1)),
      next: viewing && pos >= 0 && pos < list.length - 1 && (() => go(pos + 1)),
      last: viewing && list.length > 0 && pos !== list.length - 1 && (() => go(list.length - 1)),
      locate: viewing && (() => setDialog('locate')),
      new: viewing && canWrite && (() => startNew()),
      edit: viewing && canWrite && !!doc && (() => {
        if (!EDITABLE.includes(doc.status)) { msg.error(`Purchase order ${doc.poNumber} is ${STATUS_TEXT[doc.status] || doc.status} and can no longer be edited.\nCancel it and raise a new one if it is wrong.`); return; }
        setMode('edit');
      }),
      save: editing && !busy && save,
      cancel: editing && !busy && discard,
      delete: viewing && canWrite && !!doc && (() => {
        if (['RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED'].includes(doc.status)) { msg.error(`Purchase order ${doc.poNumber} is ${STATUS_TEXT[doc.status]} and cannot be cancelled.`); return; }
        patchStatus('CANCELLED', `Cancel purchase order ${doc.poNumber}?\nIt is kept as Cancelled for the audit trail; it is not erased.`, `Purchase order ${doc.poNumber} is cancelled.`);
      }),
      copy: viewing && canWrite && !!doc && (() => startNew({ ...toDraft(doc), expectedDeliveryDate: '', lines: toDraft(doc).lines.map(l => ({ ...l, key: newKey(), sources: [], received: 0, billed: 0, deliveryDate: '' })) })),
      preview: viewing && !!doc && (() => setPdf({ url: `/api/purchase/${doc._id}/pdf`, title: `Purchase order ${doc.poNumber}` })),
      print: viewing && !!doc && (() => setPdf({ url: `/api/purchase/${doc._id}/pdf`, title: `Purchase order ${doc.poNumber}`, print: true })),
      email: viewing && !!doc && SEND_ROLES.includes(role) && ['ORDERED', 'PARTIALLY_RECEIVED'].includes(doc.status) && sendToVendor,
      list: viewing && openList,
    },
    findByNumber,
  });

  // ---------- render ----------

  const tone: Record<string, PillTone> = { DRAFT: 'plain', PENDING_APPROVAL: 'warn', ORDERED: 'info', PARTIALLY_RECEIVED: 'info', RECEIVED: 'ok', CANCELLED: 'bad' };
  const statusPill = mode === 'new' ? <Pill tone="new">New</Pill> : doc ? <Pill tone={tone[doc.status] || 'plain'}>{STATUS_TEXT[doc.status] || doc.status}</Pill> : undefined;
  const lineGst = (i: number) => { const t = tax.items[i]; return t ? t.cgstAmount + t.sgstAmount + t.igstAmount : 0; };
  const cols = editing ? 13 : 12;

  const locateDialog = dialog === 'locate' && (
    <FindDialog title="Find Purchase Order" rows={[...list].reverse()} onClose={() => setDialog(null)}
      onPick={p => { setDialog(null); show(String(p._id)).catch(e => msg.error(e.message)); }}
      columns={[
        { label: 'PO No.', width: 150, value: p => p.poNumber },
        { label: 'Date', width: 95, value: p => fmtDate(p.orderDate) },
        { label: 'Vendor', value: p => p.supplier?.name || '' },
        { label: 'Amount', width: 120, num: true, value: p => fmtNum(p.totalAmount) },
        { label: 'Status', width: 140, value: p => STATUS_TEXT[p.status] || p.status },
      ]} />);

  if (listed) return (
    <>
      {loadError && <div className="px-error">{loadError}</div>}
      <DocList title="Purchase Orders" fileName="purchase-orders" rows={[...list].reverse()}
        onOpen={p => show(String(p._id)).catch(e => msg.error(e.message))}
        statusOf={p => p.status} statuses={Object.fromEntries(Object.entries(STATUS_TEXT).map(([k, label]) => [k, { label, tone: tone[k] }]))}
        dateOf={p => p.orderDate}
        empty={<>No purchase orders yet. Press <b>New</b> (Ctrl+N) to raise the first one.</>}
        columns={[
          { label: 'PO No.', width: 150, value: p => <b>{p.poNumber}</b>, text: p => p.poNumber },
          { label: 'Date', width: 100, value: p => fmtDate(p.orderDate), text: p => isoDay(p.orderDate) },
          { label: 'Vendor', value: p => p.supplier?.name || '' },
          { label: 'Expected', width: 100, value: p => fmtDate(p.expectedDeliveryDate) || '—', text: p => isoDay(p.expectedDeliveryDate) },
          { label: 'Items', width: 70, num: true, value: p => (p.items || []).length },
          { label: 'Amount (₹)', width: 140, num: true, value: p => fmtNum(p.totalAmount), sum: p => Number(p.totalAmount) || 0 },
          { label: 'Status', width: 160, value: p => <Pill tone={tone[p.status] || 'plain'}>{STATUS_TEXT[p.status] || p.status}</Pill>, text: p => STATUS_TEXT[p.status] || p.status },
        ]} />
      {locateDialog}
    </>);

  return (
    <DocCard kind="Purchase Order" number={mode === 'new' ? 'New purchase order' : doc?.poNumber || 'Purchase orders'} status={statusPill}
      meta={doc && mode !== 'new' ? `Raised ${fmtDate(doc.orderDate)}${doc.approvedBy?.name ? ` · approved by ${doc.approvedBy.name}` : ''}` : undefined}>
      {loadError && <div className="px-doc__section"><div className="px-error">{loadError}</div></div>}
      {!loadError && !doc && mode === 'view' && list.length === 0 && (
        <div className="px-doc__section"><div className="px-note">No purchase orders yet. Press <b>New</b> (Ctrl+N) to raise the first one.</div></div>)}

      <div className="px-doc__section px-fields">
        <Field label="Vendor" wide pick={editing ? <PickButton onClick={() => setDialog('supplier')} title="Choose vendor" /> : undefined}>
          <input className="px-input" readOnly value={supplier ? `${supplier.name}${supplier.code ? ` (${supplier.code})` : ''}` : ''}
            placeholder={editing ? 'Choose the vendor' : ''} onDoubleClick={() => editing && setDialog('supplier')} />
        </Field>
        <Field label="Vendor GSTIN"><input className="px-input" readOnly value={supplier?.gstin || '—'} /></Field>
        <Field label="Vendor State"><input className="px-input" readOnly value={stateName(supplierState) || '—'} /></Field>
        <Field label="Order Date"><input className="px-input" readOnly value={mode === 'new' ? fmtDate(new Date()) : fmtDate(doc?.orderDate)} /></Field>
        <Field label="Expected Delivery">
          {editing
            ? <input type="date" className="px-input" value={draft.expectedDeliveryDate} onChange={e => setDraft(d => ({ ...d, expectedDeliveryDate: e.target.value }))} />
            : <input className="px-input" readOnly value={fmtDate(draft.expectedDeliveryDate) || '—'} />}
        </Field>
        <Field label="Deliver To (State)"><input className="px-input" readOnly value={stateName(companyState) || 'Company GSTIN not set'} /></Field>
        <Field label="Raised From"><input className="px-input" readOnly value={mode !== 'new' && doc?.sourceType === 'MRP_AUTO' ? 'MRP / replenishment' : draft.lines.some(l => l.sources.length) ? 'Purchase indent' : 'Manual'} /></Field>
      </div>

      <div className="px-doc__section px-actions">
        {editing && <button className="px-btn px-btn--accent" onClick={() => setDialog('indent')}><ListPlus />Add from Indent</button>}
        {!editing && doc?.status === 'PENDING_APPROVAL' && APPROVE_ROLES.includes(role) && (
          <button className="px-btn px-btn--primary" disabled={busy} onClick={() => patchStatus('ORDERED', `Approve purchase order ${doc.poNumber} for ₹${fmtNum(doc.totalAmount)}?`, `Purchase order ${doc.poNumber} is approved and can be sent to the vendor.`)}>
            <CheckCircle2 />Approve
          </button>)}
        <button className="px-btn" onClick={() => setDialog('addl')} disabled={!doc && mode !== 'new'}><Info />More Details</button>
        <button className="px-btn" onClick={() => setDialog('narration')}><NotebookPen />Remarks{draft.notes ? ' (1)' : ''}</button>
      </div>

      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      <div className="px-tabpanel">
        {tab === 'Items' && (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead>
                <tr>
                  <th className="ctr" style={{ width: 44 }}>#</th><th style={{ minWidth: 260 }}>Item</th><th className="num" style={{ width: 110 }}>Qty</th><th style={{ width: 60 }}>Unit</th>
                  <th className="num" style={{ width: 120 }}>Rate (₹)</th><th className="num" style={{ width: 70 }}>Disc %</th><th style={{ width: 150 }}>Needed By</th><th>From Indent</th><th className="num">Received</th>
                  <th className="num">Amount (₹)</th><th className="num">GST</th><th className="num">Line Total (₹)</th>{editing && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const p = productMap.get(l.productId);
                  const t = tax.items[i];
                  return (
                    <tr key={l.key} className={selLine === i ? 'is-selected' : ''} onClick={() => setSelLine(i)}>
                      <td className="ctr">{i + 1}</td>
                      <td title={p ? `${p.sku} - ${p.name}` : ''}>
                        <div className="flex items-center gap-2">
                          <span className="px-item"><b>{p?.name || '(item not found)'}</b><small>{p?.sku}{p?.hsnCode ? ` · HSN ${p.hsnCode}` : ''}</small></span>
                          {editing && <PickButton small onClick={() => setDialog({ item: i })} title="Change item" />}
                        </div>
                      </td>
                      <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} /> : fmtNum(num(l.quantity), 3)}</td>
                      <td className={editing && p?.purchaseUom && p.purchaseUom !== p.uom ? 'edit' : ''}>{editing && p?.purchaseUom && p.purchaseUom !== p.uom ? (
                        <select value={l.unit || p.uom} aria-label={`Line ${i + 1} unit`} title={`1 ${p.purchaseUom} = ${p.purchaseConversion || 1} ${p.uom}`}
                          onChange={e => {
                            const toBuy = e.target.value === p.purchaseUom, f = Number(p.purchaseConversion) || 1, q = num(l.quantity), r = num(l.unitPrice);
                            if ((toBuy ? 'buy' : 'stock') === (l.unit ? 'buy' : 'stock')) return;
                            const k = toBuy ? 1 / f : f;
                            setLine(i, { unit: toBuy ? p.purchaseUom : '', quantity: Number.isFinite(q) ? String(Math.round(q * k * 1e6) / 1e6) : l.quantity, unitPrice: Number.isFinite(r) ? String(Math.round((r / k) * 100) / 100) : l.unitPrice });
                          }}>
                          <option value={p.uom}>{p.uom}</option><option value={p.purchaseUom}>{p.purchaseUom}</option>
                        </select>
                      ) : <span title={l.unit && p ? `1 ${l.unit} = ${p.purchaseConversion || 1} ${p.uom}` : undefined}>{l.unit || p?.uom || ''}</span>}</td>
                      <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} aria-label={`Line ${i + 1} rate`} /> : fmtNum(num(l.unitPrice))}</td>
                      <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={l.disc} onChange={e => setLine(i, { disc: e.target.value })} aria-label={`Line ${i + 1} discount %`} placeholder="0" /> : l.disc ? `${fmtNum(num(l.disc), 2).replace(/\.?0+$/, '')}%` : ''}</td>
                      <td className={editing ? 'edit' : ''}>{editing ? <input type="date" value={l.deliveryDate} onChange={e => setLine(i, { deliveryDate: e.target.value })} aria-label={`Line ${i + 1} needed by`} /> : fmtDate(l.deliveryDate) || '—'}</td>
                      <td title={l.sources.map(s => `${s.indentNo || 'Indent'} line ${s.lineNo}: ${s.quantity}`).join('\n')}>{l.sources.map(s => <span key={`${s.indent}:${s.lineNo}`} className="px-tag">{s.indentNo || 'Indent'} / {s.lineNo}</span>)}</td>
                      <td className="num" title={p ? `in ${p.uom}` : undefined}>{mode === 'new' ? '—' : `${fmtNum(l.received, 3)} ${l.unit && p ? p.uom : ''}`.trim()}</td>
                      <td className="num" title={t?.chargeShare ? `plus ₹${fmtNum(t.chargeShare)} of the charges, taxed with this line` : undefined}>{fmtNum(t?.goodsValue)}</td>
                      <td className="num">{fmtNum(p?.gstRate ?? 0, 0)}% · {fmtNum(lineGst(i))}</td>
                      <td className="num"><b>{fmtNum(t?.totalAmount)}</b></td>
                      {editing && <td className="ctr"><button onClick={e => { e.stopPropagation(); removeLine(i); }} title="Remove line" aria-label={`Remove line ${i + 1}`}><X className="h-4 w-4 text-red-700" /></button></td>}
                    </tr>);
                })}
                {editing && (
                  <tr className="px-addrow">
                    <td className="ctr">+</td>
                    <td colSpan={cols - 1}><button className="px-btn" onClick={() => setDialog({ item: draft.lines.length })}><ListPlus />Add item</button></td>
                  </tr>)}
              </tbody>
            </table>
            {!editing && !draft.lines.length && <div className="px-empty">No items on this purchase order.</div>}
          </div>)}

        {tab === 'Charges' && (
          <div className="flex flex-col gap-3">
            <div className="px-note">Freight, packing & forwarding and other charges billed with the goods. They are spread over the lines by value, so each part takes its line’s GST rate and HSN.</div>
            <div className="px-table-wrap" style={{ maxWidth: 560 }}>
              <table className="px-table">
                <thead><tr><th>Charge</th><th className="num" style={{ width: 160 }}>Amount (₹)</th>{editing && <th style={{ width: 40 }} />}</tr></thead>
                <tbody>
                  {draft.charges.map((c, i) => (
                    <tr key={i}>
                      <td className={editing ? 'edit' : ''}>{editing ? <input list="po-charge-labels" value={c.label} onChange={e => setDraft(d => ({ ...d, charges: d.charges.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)) }))} aria-label={`Charge ${i + 1}`} placeholder="e.g. Freight" /> : c.label}</td>
                      <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={c.amount} onChange={e => setDraft(d => ({ ...d, charges: d.charges.map((x, n) => (n === i ? { ...x, amount: e.target.value } : x)) }))} aria-label={`Charge ${i + 1} amount`} /> : fmtNum(num(c.amount))}</td>
                      {editing && <td className="ctr"><button onClick={() => setDraft(d => ({ ...d, charges: d.charges.filter((_, n) => n !== i) }))} title="Remove charge" aria-label={`Remove charge ${i + 1}`}><X className="h-4 w-4 text-red-700" /></button></td>}
                    </tr>))}
                  {editing && <tr className="px-addrow"><td colSpan={3}><button className="px-btn" onClick={() => setDraft(d => ({ ...d, charges: [...d.charges, { label: d.charges.length ? '' : 'Freight', amount: '' }] }))}><ListPlus />Add charge</button></td></tr>}
                </tbody>
              </table>
              <datalist id="po-charge-labels">{CHARGE_LABELS.map(l => <option key={l} value={l} />)}</datalist>
              {!editing && !draft.charges.length && <div className="px-empty">No charges on this purchase order.</div>}
            </div>
          </div>)}

        {tab === 'Tax Summary' && (
          <div className="flex flex-col gap-3">
            <div className="px-note">
              {companyState ? (tax.intraState ? 'Vendor is in the same state: CGST + SGST.' : 'Vendor is in another state: IGST.') : 'The company GSTIN is not set, so tax is shown as IGST. Set it in Masters > Company Profile.'}
              {' '}The approval level is decided on the taxable value (₹{fmtNum(tax.subTotal)}); input GST is taken when the vendor bill is booked.
            </div>
            <div className="px-table-wrap">
              <table className="px-table">
                <thead><tr><th>HSN</th><th className="num">Taxable (₹)</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total GST</th></tr></thead>
                <tbody>
                  {tax.hsnSummary.map(h => <tr key={h.hsnCode}><td>{h.hsnCode}</td><td className="num">{fmtNum(h.taxableValue)}</td><td className="num">{fmtNum(h.cgst)}</td><td className="num">{fmtNum(h.sgst)}</td><td className="num">{fmtNum(h.igst)}</td><td className="num">{fmtNum(h.totalTax)}</td></tr>)}
                </tbody>
              </table>
              {!tax.hsnSummary.length && <div className="px-empty">No items.</div>}
            </div>
          </div>)}

        {tab === 'Linked Documents' && <DocumentFlow key={doc?._id || 'new'} type="PURCHASE_ORDER" what="purchase order" id={mode === 'new' ? null : doc?._id} onOpenSelf={id => show(id).catch(e => msg.error(e.message))} onOpen={href => router.push(href)} />}
      </div>

      <div className="px-bottom">
        <div style={{ color: 'var(--px-muted)', maxWidth: 520 }}>{draft.notes ? <><b>Remarks:</b> {draft.notes}</> : ''}</div>
        <div className="px-summary" aria-label="Totals">
          <div><span>{draft.lines.length} item{draft.lines.length === 1 ? '' : 's'}, total quantity</span><b>{fmtNum(totalQty, 3)}</b></div>
          {tax.chargesTotal > 0 && <><div><span>Goods value</span><b>₹ {fmtNum(tax.goodsTotal)}</b></div><div><span>Charges</span><b>₹ {fmtNum(tax.chargesTotal)}</b></div></>}
          <div><span>Taxable value</span><b>₹ {fmtNum(tax.subTotal)}</b></div>
          {tax.totalCGST > 0 && <div><span>CGST</span><b>₹ {fmtNum(tax.totalCGST)}</b></div>}
          {tax.totalSGST > 0 && <div><span>SGST</span><b>₹ {fmtNum(tax.totalSGST)}</b></div>}
          {tax.totalIGST > 0 && <div><span>IGST</span><b>₹ {fmtNum(tax.totalIGST)}</b></div>}
          <div className="is-total"><span>Grand total</span><span>₹ {fmtNum(tax.totalAmount)}</span></div>
        </div>
      </div>

      {/* ---------- dialogs ---------- */}

      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}
      {locateDialog}

      {dialog === 'supplier' && (
        <FindDialog title="Choose Vendor" rows={suppliers.filter(s => s.isActive !== false)} onClose={() => setDialog(null)} empty="No vendors. Add one in Masters > Vendors."
          onPick={s => { setDraft(d => ({ ...d, supplierId: String(s._id) })); setDialog(null); }}
          columns={[
            { label: 'Code', width: 110, value: s => s.code },
            { label: 'Name', value: s => s.name },
            { label: 'City', width: 120, value: s => s.city || '' },
            { label: 'GSTIN', width: 150, value: s => s.gstin || '' },
            { label: 'State', width: 130, value: s => stateName(stateCodeOf(s.gstin)) },
          ]} />)}

      {dialog && typeof dialog === 'object' && (
        <FindDialog title="Choose Item" rows={products.filter(p => p.isActive !== false)} onClose={() => setDialog(null)} empty="No items. Add them in Masters > Items."
          onPick={p => { chooseItem(dialog.item, p); setDialog(null); }}
          columns={[
            { label: 'Code', width: 130, value: p => p.sku },
            { label: 'Item', value: p => p.name },
            { label: 'UOM', width: 60, value: p => p.uom },
            { label: 'HSN', width: 90, value: p => p.hsnCode || '' },
            { label: 'GST %', width: 60, num: true, value: p => fmtNum(p.gstRate ?? 0) },
            { label: 'Rate', width: 100, num: true, value: p => fmtNum(p.purchasePrice ?? 0) },
          ]} />)}

      {dialog === 'indent' && (
        <PickIndentDialog draft={draft} onClose={() => setDialog(null)}
          onPick={(picked, preferredSupplier) => {
            setDraft(d => {
              const lines = [...d.lines];
              for (const pk of picked) {
                const at = lines.findIndex(l => l.productId === pk.productId);
                const src: Source = { indent: pk.indent, indentNo: pk.indentNo, lineNo: pk.lineNo, quantity: pk.quantity };
                if (at >= 0) { const f = lines[at].unit ? Number(productMap.get(pk.productId)?.purchaseConversion) || 1 : 1; lines[at] = { ...lines[at], quantity: String(Math.round(((num(lines[at].quantity) || 0) + pk.quantity / f) * 1e6) / 1e6), sources: [...lines[at].sources, src] }; }
                else lines.push({ key: newKey(), productId: pk.productId, unit: '', disc: '', quantity: String(pk.quantity), unitPrice: String(productMap.get(pk.productId)?.purchasePrice ?? 0), deliveryDate: pk.requiredBy, sources: [src] });
              }
              return { ...d, supplierId: d.supplierId || preferredSupplier || '', lines };
            });
            setDialog(null);
          }} />)}

      {dialog === 'narration' && (
        <Dialog title="Remarks" onClose={() => setDialog(null)} width={520} buttons={<button className="px-btn px-btn--primary" onClick={() => setDialog(null)}>OK</button>}>
          <textarea className="px-input" rows={6} readOnly={!editing} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} aria-label="Remarks" autoFocus />
          {!editing && <p className="mt-2" style={{ color: '#555' }}>Press Edit to change the remarks.</p>}
        </Dialog>)}

      {dialog === 'addl' && <AddlInfo doc={mode === 'new' ? null : doc} onClose={() => setDialog(null)} />}
    </DocCard>
  );
}

// ---------- Pick lines from approved purchase indents ----------

interface Picked { indent: string; indentNo: string; lineNo: number; productId: string; quantity: number; requiredBy: string }

function PickIndentDialog({ draft, onPick, onClose }: { draft: Draft; onPick: (lines: Picked[], preferredSupplier?: string) => void; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({}); // row key -> quantity to order

  useEffect(() => {
    fetch('/api/purchase-indents?status=APPROVED').then(readJson).then((indents: any[]) => {
      // what this draft already takes from each indent line is not offered again
      const taken = new Map<string, number>();
      for (const l of draft.lines) for (const s of l.sources) taken.set(`${s.indent}:${s.lineNo}`, (taken.get(`${s.indent}:${s.lineNo}`) || 0) + s.quantity);
      setRows(indents.flatMap(ind => (ind.items || []).map((it: any) => {
        const k = `${ind._id}:${it.lineNo}`;
        const open = Math.max(0, (it.openQty ?? it.quantity) - (taken.get(k) || 0));
        return { key: k, indent: String(ind._id), indentNo: ind.number, date: ind.createdAt, lineNo: it.lineNo, product: it.product, open, uom: it.uom || it.product?.uom, requiredBy: it.requiredBy, supplier: it.preferredSupplier };
      })).filter((r: any) => r.open > 0));
    }).catch(e => setError(e.message));
  }, [draft]);

  const toggle = (r: any) => setChosen(c => { const n = { ...c }; if (n[r.key] !== undefined) delete n[r.key]; else n[r.key] = String(r.open); return n; });
  const ok = () => {
    const picked: Picked[] = [];
    for (const r of rows || []) {
      if (chosen[r.key] === undefined) continue;
      const q = Number(chosen[r.key]);
      if (!(q > 0) || q > r.open + 1e-9) { setError(`${r.indentNo} line ${r.lineNo}: order between 0 and ${r.open}.`); return; }
      picked.push({ indent: r.indent, indentNo: r.indentNo, lineNo: r.lineNo, productId: idOf(r.product), quantity: q, requiredBy: isoDay(r.requiredBy) });
    }
    if (!picked.length) { setError('Tick at least one indent line.'); return; }
    const sups = [...new Set((rows || []).filter(r => chosen[r.key] !== undefined && r.supplier).map(r => idOf(r.supplier)))];
    onPick(picked, sups.length === 1 ? sups[0] : undefined);
  };

  return (
    <Dialog title="Add from Purchase Indent" onClose={onClose} width={940}
      buttons={<><button className="px-btn px-btn--primary" onClick={ok}>OK</button><button className="px-btn" onClick={onClose}>Cancel</button></>}>
      {error && <div className="px-error mb-2">{error}</div>}
      <div className="px-table-wrap" style={{ height: 360 }}>
        <table className="px-table" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 34 }}>✓</th><th style={{ width: 140 }}>Indent No.</th><th style={{ width: 90 }}>Date</th><th style={{ width: 50 }}>Line</th><th>Item</th><th style={{ width: 90 }}>Open Qty</th><th style={{ width: 100 }}>Order Qty</th><th style={{ width: 95 }}>Required By</th><th style={{ width: 150 }}>Preferred Vendor</th></tr></thead>
          <tbody>
            {rows === null && !error && <tr><td colSpan={9} className="ctr">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={9} className="ctr" style={{ height: 40 }}>No approved indent lines are open. Indents are raised and approved in Purchase &gt; Purchase Indents.</td></tr>}
            {rows?.map(r => (
              <tr key={r.key} className={chosen[r.key] !== undefined ? 'is-selected' : ''}>
                <td className="ctr"><input type="checkbox" checked={chosen[r.key] !== undefined} onChange={() => toggle(r)} aria-label={`Pick ${r.indentNo} line ${r.lineNo}`} /></td>
                <td>{r.indentNo}</td><td className="ctr">{fmtDate(r.date)}</td><td className="ctr">{r.lineNo}</td>
                <td>{r.product?.sku ? `${r.product.sku} - ${r.product.name}` : r.product?.name || ''}</td>
                <td className="num">{fmtNum(r.open, 3)} {r.uom || ''}</td>
                <td className={chosen[r.key] !== undefined ? 'edit' : 'num'}>{chosen[r.key] !== undefined ? <input className="num" value={chosen[r.key]} onChange={e => setChosen(c => ({ ...c, [r.key]: e.target.value }))} aria-label="Order quantity" /> : ''}</td>
                <td className="ctr">{fmtDate(r.requiredBy)}</td>
                <td>{r.supplier?.name || ''}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

// ---------- Addl. Info: approval, negotiation, vendor dispatch ----------

function AddlInfo({ doc, onClose }: { doc: any; onClose: () => void }) {
  const rows: [string, string][] = doc ? [
    ['Raised from', doc.sourceType === 'MRP_AUTO' ? 'MRP / auto-replenishment' : 'Manual'],
    ['Approval level', String(doc.approvalRequiredRole || '').replace(/_/g, ' ')],
    ['Approved by', doc.approvedBy?.name ? `${doc.approvedBy.name} (${String(doc.approvedBy.role || '').replace(/_/g, ' ')}) on ${fmtDate(doc.approvedBy.date)}` : 'Not yet approved'],
    ['Price negotiation', doc.negotiationStatus === 'NONE' ? 'None' : `${doc.negotiationStatus.replace(/_/g, ' ')}${doc.savingsAmount ? `, saving ₹${fmtNum(doc.savingsAmount)} (${doc.savingsPercentage}%)` : ''}`],
    ['Sent to vendor', doc.dispatch?.at ? `${fmtDate(doc.dispatch.at)} by ${doc.dispatch.by || ''} via ${(doc.dispatch.channels || []).join(', ') || 'no channel delivered'}` : 'Not sent'],
    ['Vendor acknowledged', doc.dispatch?.ackAt ? `${fmtDate(doc.dispatch.ackAt)} by ${doc.dispatch.ackBy || 'vendor'}` : 'No'],
    ['Created', `${fmtDate(doc.createdAt)}   Last changed ${fmtDate(doc.updatedAt)}`],
  ] : [['', 'Additional information is filled in when the purchase order is saved.']];
  return (
    <Dialog title="More Details" onClose={onClose} width={560} buttons={<button className="px-btn px-btn--primary" onClick={onClose}>OK</button>}>
      <div className="flex flex-col gap-3">
        {rows.map(([k, v]) => <Field key={k} label={k || 'Note'}><input className="px-input" readOnly value={v} /></Field>)}
      </div>
    </Dialog>
  );
}

