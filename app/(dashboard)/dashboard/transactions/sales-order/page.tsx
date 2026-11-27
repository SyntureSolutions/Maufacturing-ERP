'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, NotebookPen, ListPlus, CheckCircle2, X, PauseCircle, PlayCircle, PackageCheck, FileInput, Lock } from 'lucide-react';
import { DocCard, Field, PickButton, Pill, TabStrip, FindDialog, Dialog, useMsgBox, fmtDate, fmtNum, isoDay, type PillTone } from '@/components/workspace/controls';
import { useDocToolbar, type DocMode } from '@/components/workspace/toolbar';
import { DocList } from '@/components/workspace/DocList';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import { computeTax, stateCodeOf, stateName } from '@/lib/gst';
import { ChargesTable, chargeRows, chargesBody, chargesForTax, type ChargeRow } from '@/components/workspace/ChargesTable';

// Sales Order screen: create, change, approve, hold, cancel and print customer orders, or raise one from a quotation the
// customer accepted. Every rule lives in the API (/api/sales-orders): price lock on won quotations, minimum selling price,
// credit limit, approval matrix, stock reservation; its messages are shown as they are, and where it asks for a reason
// (margin, credit, locked price, hold, cancel) the screen asks the user for one.

const EDIT_ROLES = ['ADMIN', 'MANAGER', 'SALES'];
const HOLD_ROLES = ['ADMIN', 'MANAGER'];
const OVERRIDE_ROLES = ['ADMIN', 'MANAGER'];
const RESERVE_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SUPPLY_CHAIN_MANAGER'];
const STATUS_TEXT: Record<string, string> = { DRAFT: 'Draft', APPROVED: 'Approved', IN_FULFILLMENT: 'In Fulfilment', FULFILLED: 'Fulfilled', CANCELLED: 'Cancelled', ON_HOLD: 'On Hold' };
const TONE: Record<string, PillTone> = { DRAFT: 'plain', APPROVED: 'info', IN_FULFILLMENT: 'info', FULFILLED: 'ok', CANCELLED: 'bad', ON_HOLD: 'warn' };
const TERMS = ['ADVANCE', 'NET 15', 'NET 30', 'NET 45', 'NET 60', 'NET 90'];
const TABS = ['Items', 'Charges', 'Tax Summary', 'Linked Documents'];

// unitPrice is the list rate as typed; disc is the line discount %, so the net rate is unitPrice less disc
interface Line { key: string; lineNo?: number; productId: string; quantity: string; unitPrice: string; disc: string; deliveryDate: string; dispatched?: number; invoiced?: number }
interface Draft { customerId: string; poNumber: string; paymentTerms: string; deliveryDate: string; lines: Line[]; charges: ChargeRow[] }

const idOf = (v: any) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : '');
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
let seq = 0;
const newKey = () => `new-${++seq}`;
const emptyDraft = (): Draft => ({ customerId: '', poNumber: '', paymentTerms: 'NET 30', deliveryDate: '', lines: [], charges: [] });
const netRate = (l: { unitPrice: string; disc: string }) => { const r = num(l.unitPrice), d = num(l.disc); return Number.isFinite(r) ? r * (1 - (Number.isFinite(d) ? d : 0) / 100) : 0; };

function toDraft(so: any): Draft {
  return {
    customerId: idOf(so.customer), poNumber: so.poNumber || '', paymentTerms: so.paymentTerms || '', deliveryDate: isoDay(so.deliveryDate),
    lines: (so.items || []).map((i: any) => ({
      key: String(i._id || i.lineNo), lineNo: i.lineNo, productId: idOf(i.product), quantity: String(i.quantity), unitPrice: String(i.listPrice ?? i.unitPrice), disc: i.discountPercent ? String(i.discountPercent) : '',
      deliveryDate: isoDay(i.requiredDeliveryDate), dispatched: i.dispatchedQty || 0, invoiced: i.invoicedQty || 0,
    })),
    charges: chargeRows(so.charges),
  };
}

/** fetch → { ok, status, data } without throwing, so callers can react to 409/422 answers that ask for a reason */
async function call(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
async function readJson(url: string) {
  const r = await call(url);
  if (!r.ok) throw new Error(r.data?.error || `The server answered ${r.status}.`);
  return r.data;
}

export default function SalesOrderScreen() {
  const msg = useMsgBox();
  const router = useRouter();
  const [role, setRole] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);
  const [mode, setMode] = useState<DocMode>('view');
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [tab, setTab] = useState(TABS[0]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<null | 'locate' | 'customer' | 'quote' | 'addl' | { item: number }>(null);
  const [listing, setListing] = useState(false);     // showing the list of orders, not one order

  const editing = mode !== 'view';
  const canWrite = EDIT_ROLES.includes(role);

  // ---------- loading ----------

  const loadList = useCallback(async () => {
    const data = await readJson('/api/sales-orders');
    const asc = [...data].reverse();
    setList(asc);
    return asc;
  }, []);

  const show = useCallback(async (id: string) => {
    const so = await readJson(`/api/sales-orders/${id}`);
    setDoc(so);
    setDraft(toDraft(so));
    setMode('view');
    setListing(false);
    window.history.replaceState(null, '', `?id=${so._id}`);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, cust, prod] = await Promise.all([
          fetch('/api/auth/session').then(r => r.json()).catch(() => ({})),
          readJson('/api/customers').catch(() => []),
          readJson('/api/products').catch(() => []),
        ]);
        setRole(session?.user?.role || '');
        setCustomers(Array.isArray(cust) ? cust : []);
        setProducts(Array.isArray(prod) ? prod : []);
        fetch('/api/settings/company').then(r => (r.ok ? r.json() : null)).then(setCompany).catch(() => {});
        const all = await loadList();
        const q = new URLSearchParams(window.location.search);
        const wanted = q.get('id');
        const start = wanted && all.find(o => String(o._id) === wanted);
        if (start) await show(String(start._id)); else setListing(true);
        // ?new=1 (Order Desk's "New Sales Order") opens a blank order straight away
        if (q.get('new') === '1' && EDIT_ROLES.includes(session?.user?.role)) { setDraft(emptyDraft()); setMode('new'); setListing(false); }
      } catch (e: any) {
        setLoadError(e.message);
      }
    })();
  }, [loadList, show]);

  // ---------- lookups and tax ----------

  const productMap = useMemo(() => {
    const m = new Map<string, any>(products.map(p => [String(p._id), p]));
    for (const i of doc?.items || []) if (i.product && typeof i.product === 'object' && !m.has(String(i.product._id))) m.set(String(i.product._id), i.product);
    return m;
  }, [products, doc]);
  const customer = useMemo(() => {
    const c = customers.find(x => String(x._id) === draft.customerId);
    if (c) return c;
    if (doc?.customer && typeof doc.customer === 'object' && String(doc.customer._id) === draft.customerId) return doc.customer;
    return null;
  }, [customers, doc, draft.customerId]);
  const customerName = customer?.name || (mode !== 'new' ? doc?.customerName : '') || '';
  const companyState = company?.stateCode || stateCodeOf(company?.gstin);
  const customerState = customer?.stateCode || stateCodeOf(customer?.gstin);
  const tax = useMemo(() => computeTax(draft.lines.map(l => {
    const p = productMap.get(l.productId);
    const q = num(l.quantity);
    return { description: p?.name || '', hsnCode: p?.hsnCode || '—', quantity: Number.isFinite(q) ? q : 0, unitPrice: netRate(l), gstRate: Number(p?.gstRate ?? 0) };
  }), companyState, customerState, chargesForTax(draft.charges)), [draft.lines, draft.charges, productMap, companyState, customerState]);
  const totalQty = draft.lines.reduce((s, l) => s + (Number.isFinite(num(l.quantity)) ? num(l.quantity) : 0), 0);

  // what may change in this edit: everything on a new or draft order; only the PO number and dates once approved
  const itemsEditable = mode === 'new' || (mode === 'edit' && doc?.status === 'DRAFT');
  const lineDated = draft.lines.some(l => l.deliveryDate);

  // ---------- editing ----------

  const setLine = (i: number, patch: Partial<Line>) => setDraft(d => ({ ...d, lines: d.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) }));
  const chooseItem = (index: number, p: any) => {
    const pid = String(p._id);
    const dupe = draft.lines.findIndex((l, n) => l.productId === pid && n !== index);
    if (dupe >= 0) { msg.error(`${p.name} is already on line ${dupe + 1}. Change the quantity on that line instead.`); return; }
    const price = String(p.price ?? 0);
    if (index >= draft.lines.length) setDraft(d => ({ ...d, lines: [...d.lines, { key: newKey(), productId: pid, quantity: '1', unitPrice: price, disc: '', deliveryDate: '' }] }));
    else setLine(index, { productId: pid, unitPrice: draft.lines[index].unitPrice || price });
  };
  const startNew = (from?: Draft) => {
    if (!canWrite) { msg.error('Your role cannot raise sales orders.'); return; }
    setDraft(from || emptyDraft());
    setMode('new');
    setListing(false);
    setTab(TABS[0]);
  };
  const discard = async () => {
    if (!(await msg.confirm('Discard the changes made to this sales order?'))) return;
    setDraft(doc ? toDraft(doc) : emptyDraft());
    setMode('view');
    if (!doc) setListing(true);
  };

  const reloadAndShow = async (id: string) => { await loadList(); await show(id); };

  const save = async () => {
    if (mode === 'new' && !draft.customerId) { msg.error('Choose the customer.'); return; }
    if (!draft.lines.length) { msg.error('Add at least one item.'); return; }
    for (const [n, l] of draft.lines.entries()) {
      if (!(num(l.quantity) > 0)) { msg.error(`Line ${n + 1}: enter a quantity more than zero.`); return; }
      if (!(num(l.unitPrice) >= 0)) { msg.error(`Line ${n + 1}: enter the rate.`); return; }
      if (l.disc.trim() && !(num(l.disc) >= 0 && num(l.disc) < 100)) { msg.error(`Line ${n + 1}: discount must be from 0 to below 100%.`); return; }
    }
    const items = draft.lines.map(l => ({ product: l.productId, quantity: num(l.quantity), unitPrice: num(l.unitPrice), discountPercent: l.disc.trim() ? num(l.disc) : 0, requiredDeliveryDate: l.deliveryDate || (mode === 'new' ? undefined : '') }));
    setBusy(true);
    try {
      if (mode === 'new') {
        const r = await call('/api/sales-orders', 'POST', { customer: draft.customerId, poNumber: draft.poNumber || undefined, paymentTerms: draft.paymentTerms || undefined, deliveryDate: lineDated ? undefined : draft.deliveryDate || undefined, items, charges: chargesBody(draft.charges) });
        if (!r.ok) { msg.error(r.data?.error || `Not saved (${r.status}).`, 'Not saved'); return; }
        await reloadAndShow(String(r.data._id));
        msg.info(`Sales Order ${r.data.soNumber} saved as a draft.\nApprove it to reserve stock and start fulfilment.`);
        return;
      }
      // an approved order only takes its customer PO number and delivery dates
      const body: any = doc.status === 'DRAFT'
        ? { poNumber: draft.poNumber, paymentTerms: draft.paymentTerms, items, charges: chargesBody(draft.charges), ...(lineDated ? {} : { deliveryDate: draft.deliveryDate || null }) }
        : { poNumber: draft.poNumber, ...(lineDated ? { lineDates: draft.lines.map(l => ({ lineNo: l.lineNo, requiredDeliveryDate: l.deliveryDate || null })) } : { deliveryDate: draft.deliveryDate || null }) };
      let r = await call(`/api/sales-orders/${doc._id}`, 'PATCH', body);
      if (r.status === 409 && /price is locked/i.test(r.data?.error || '')) {
        if (!OVERRIDE_ROLES.includes(role)) { msg.error(r.data.error, 'Price locked'); return; }
        const reason = await msg.prompt(`${r.data.error}\n\nTo change it anyway, write why.`, 'Price locked', 10);
        if (reason === null) return;
        r = await call(`/api/sales-orders/${doc._id}`, 'PATCH', { ...body, overrideReason: reason });
      }
      if (!r.ok && /nothing to change/i.test(r.data?.error || '')) { setMode('view'); return; }
      if (!r.ok) { msg.error(r.data?.error || `Not saved (${r.status}).`, 'Not saved'); return; }
      await reloadAndShow(String(doc._id));
      msg.info(`Sales Order ${doc.soNumber} saved.`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- order actions ----------

  const approve = async () => {
    if (!doc || !(await msg.confirm(`Approve sales order ${doc.soNumber} for ₹${fmtNum(doc.totalAmount)}?\nStock is reserved for it once it is approved.`))) return;
    setBusy(true);
    try {
      let extra: any = {};
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await call(`/api/sales-orders/${doc._id}/approval`, 'POST', extra);
        if (r.ok) {
          await reloadAndShow(String(doc._id));
          const warn = r.data.allocationWarning ? `\n${typeof r.data.allocationWarning === 'string' ? r.data.allocationWarning : 'Some stock could not be reserved; the shortfall is recorded on the order.'}` : '';
          msg.info(`${r.data.message || 'Approved.'}${warn}`);
          return;
        }
        if (r.status === 422 && r.data.belowMsp && !extra.approveBelowMsp) {
          const reason = await msg.prompt(`${r.data.error}\n\nWrite why this margin is accepted.`, 'Below minimum selling price', 10);
          if (reason === null) return;
          extra = { ...extra, approveBelowMsp: true, mspReason: reason };
          continue;
        }
        if (r.status === 422 && r.data.creditCheckFailed && !extra.bypassCreditCheck) {
          const reason = await msg.prompt(`${r.data.error}\n\nTo approve anyway, write why.`, 'Credit limit exceeded', 10);
          if (reason === null) return;
          extra = { ...extra, bypassCreditCheck: true, bypassReason: reason };
          continue;
        }
        msg.error(r.data?.error || `Not approved (${r.status}).`);
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  const holdOrRelease = async () => {
    if (!doc) return;
    const releasing = doc.status === 'ON_HOLD';
    const text = await msg.prompt(releasing ? `Release ${doc.soNumber} from hold? Add a remark.` : `Put ${doc.soNumber} on hold? Nothing is planned or dispatched for it while it is held.`, releasing ? 'Release hold' : 'Hold order', releasing ? 1 : 5);
    if (text === null) return;
    setBusy(true);
    try {
      const r = await call(`/api/sales-orders/${doc._id}/hold`, 'POST', releasing ? { action: 'release', remarks: text } : { action: 'hold', reason: text });
      if (!r.ok) { msg.error(r.data?.error || `Failed (${r.status}).`); return; }
      await reloadAndShow(String(doc._id));
    } finally {
      setBusy(false);
    }
  };

  const reserve = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const r = await call(`/api/sales-orders/${doc._id}/reserve`, 'POST', {});
      if (!r.ok) { msg.error(r.data?.error || `Failed (${r.status}).`); return; }
      await reloadAndShow(String(doc._id));
      msg.info(r.data?.message || 'Stock reserved for what was still open on the order.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!doc) return;
    if (!['DRAFT', 'APPROVED', 'ON_HOLD'].includes(doc.status)) { msg.error(`Sales order ${doc.soNumber} is ${STATUS_TEXT[doc.status]} and cannot be cancelled.`); return; }
    const reason = await msg.prompt(`Cancel sales order ${doc.soNumber}?\nReserved stock is released. The order is kept as Cancelled for the audit trail.`, 'Cancel sales order', 5);
    if (reason === null) return;
    setBusy(true);
    try {
      const r = await call(`/api/sales-orders/${doc._id}/cancel`, 'POST', { reason });
      if (!r.ok) { msg.error(r.data?.error || `Failed (${r.status}).`); return; }
      await reloadAndShow(String(doc._id));
      msg.info(`Sales order ${doc.soNumber} is cancelled.`);
    } finally {
      setBusy(false);
    }
  };

  /** A quotation the customer accepted becomes the order: the quotation is marked won and the server raises a price-locked draft. */
  const fromQuotation = async (q: any) => {
    setDialog(null);
    const po = await msg.prompt(`Raise a sales order from quotation ${q.quoteNumber} for ${q.customerName}.\nEnter the customer's PO number.`, 'Customer PO number', 1);
    if (po === null) return;
    setBusy(true);
    try {
      let r = await call(`/api/quotations/${q._id}`, 'PATCH', { stage: 'PO_RECEIVED', poNumber: po });
      if (!r.ok && /credit/i.test(r.data?.error || '') && (await msg.confirm(`${r.data.error}\n\nRaise the order anyway? It still goes through the credit check when it is approved.`))) {
        r = await call(`/api/quotations/${q._id}`, 'PATCH', { stage: 'PO_RECEIVED', poNumber: po, bypassCreditCheck: true });
      }
      if (!r.ok) { msg.error(r.data?.error || `Failed (${r.status}).`); return; }
      const so = r.data.createdSalesOrder;
      if (!so?._id) { msg.error('The quotation was marked won but no sales order came back. Check Sales Orders.'); return; }
      await reloadAndShow(String(so._id));
      msg.info(`Sales Order ${so.soNumber} raised from ${q.quoteNumber}.\nIts prices and terms are locked to the quotation.`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- command bar ----------

  const pos = doc ? list.findIndex(o => String(o._id) === String(doc._id)) : -1;
  const go = (i: number) => { const o = list[i]; if (o) show(String(o._id)).catch(e => msg.error(e.message)); };
  const viewing = !editing && !busy;
  const editable = !!doc && ['DRAFT', 'APPROVED'].includes(doc.status) && (!doc.taxInvoiceStatus || doc.taxInvoiceStatus === 'UNINVOICED');
  const findByNumber = (no: string) => {
    const q = no.toLowerCase();
    const hit = list.find(o => String(o.soNumber).toLowerCase() === q) || list.find(o => String(o.soNumber).toLowerCase().endsWith(q));
    if (hit) show(String(hit._id)).catch(e => msg.error(e.message));
    else msg.error(`No sales order numbered ${no}.`);
  };
  const listed = listing && !editing;
  useDocToolbar(listed ? {
    mode, listing: true, position: `${list.length} orders`, findByNumber,
    actions: { new: !busy && canWrite && (() => startNew()), list: !!doc && (() => show(String(doc._id)).catch(e => msg.error(e.message))) },
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
        if (!editable) { msg.error(`Sales order ${doc.soNumber} is ${doc.taxInvoiceStatus && doc.taxInvoiceStatus !== 'UNINVOICED' ? 'invoiced' : STATUS_TEXT[doc.status]} and can no longer be changed.`); return; }
        if (doc.approvalPending) { msg.error(`Sales order ${doc.soNumber} is waiting for an approval decision and cannot be changed meanwhile.`); return; }
        setMode('edit');
      }),
      save: editing && !busy && save,
      cancel: editing && !busy && discard,
      delete: viewing && canWrite && !!doc && cancelOrder,
      copy: viewing && canWrite && !!doc && (() => startNew({ ...toDraft(doc), poNumber: '', deliveryDate: '', lines: toDraft(doc).lines.map(l => ({ ...l, key: newKey(), lineNo: undefined, deliveryDate: '', dispatched: 0, invoiced: 0 })) })),
      preview: viewing && !!doc && (() => setPdf({ url: `/api/sales-orders/${doc._id}/pdf`, title: `Sales order ${doc.soNumber}` })),
      print: viewing && !!doc && (() => setPdf({ url: `/api/sales-orders/${doc._id}/pdf`, title: `Sales order ${doc.soNumber}`, print: true })),
      list: viewing && (() => { setListing(true); window.history.replaceState(null, '', '?view=list'); }),
    },
    findByNumber,
  });

  // ---------- render ----------

  const statusPill = mode === 'new' ? <Pill tone="new">New</Pill>
    : doc ? <>
      <Pill tone={TONE[doc.status] || 'plain'}>{STATUS_TEXT[doc.status] || doc.status}</Pill>
      {doc.approvalPending && <Pill tone="warn">Awaiting approval</Pill>}
      {doc.priceLocked && <Pill tone="plain"><Lock className="mr-1 h-3 w-3" />Price locked</Pill>}
    </> : undefined;
  const lineGst = (i: number) => { const t = tax.items[i]; return t ? t.cgstAmount + t.sgstAmount + t.igstAmount : 0; };
  const st = doc?.status;

  if (listed) return (
    <>
      {loadError && <div className="px-error">{loadError}</div>}
      <DocList title="Sales Orders" fileName="sales-orders" rows={[...list].reverse()}
        onOpen={o => show(String(o._id)).catch(e => msg.error(e.message))}
        statusOf={o => o.status} statuses={Object.fromEntries(Object.entries(STATUS_TEXT).map(([k, label]) => [k, { label, tone: TONE[k] }]))}
        dateOf={o => o.createdAt}
        empty={<>No sales orders yet. Press <b>New</b> (Ctrl+N), or raise one from an accepted quotation.</>}
        columns={[
          { label: 'SO No.', width: 150, value: o => <b>{o.soNumber}</b>, text: o => o.soNumber },
          { label: 'Date', width: 100, value: o => fmtDate(o.createdAt), text: o => isoDay(o.createdAt) },
          { label: 'Customer', value: o => o.customer?.name || o.customerName || '' },
          { label: 'Customer PO', width: 130, value: o => o.poNumber || '' },
          { label: 'Delivery', width: 100, value: o => fmtDate(o.deliveryDate) || '—', text: o => isoDay(o.deliveryDate) },
          { label: 'Value (₹)', width: 140, num: true, value: o => fmtNum(o.totalAmount), sum: o => Number(o.totalAmount) || 0 },
          { label: 'Status', width: 150, value: o => <Pill tone={TONE[o.status] || 'plain'}>{STATUS_TEXT[o.status] || o.status}</Pill>, text: o => STATUS_TEXT[o.status] || o.status },
        ]} />
    </>);

  return (
    <DocCard kind="Sales Order" number={mode === 'new' ? 'New sales order' : doc?.soNumber || 'Sales orders'} status={statusPill}
      meta={doc && mode !== 'new' ? `Raised ${fmtDate(doc.createdAt)}${doc.quotationRef ? ` · from quotation ${doc.quotationRef}` : ''}` : undefined}>
      {loadError && <div className="px-doc__section"><div className="px-error">{loadError}</div></div>}
      {!loadError && !doc && mode === 'view' && list.length === 0 && (
        <div className="px-doc__section"><div className="px-note">No sales orders yet. Press <b>New</b> (Ctrl+N), or raise one from an accepted quotation.</div></div>)}
      {doc?.status === 'ON_HOLD' && mode === 'view' && doc.hold && (
        <div className="px-doc__section"><div className="px-note"><b>On hold</b> since {fmtDate(doc.hold.at)} by {doc.hold.by}: {doc.hold.reason}</div></div>)}

      <div className="px-doc__section px-fields">
        <Field label="Customer" wide pick={mode === 'new' ? <PickButton onClick={() => setDialog('customer')} title="Choose customer" /> : undefined}>
          <input className="px-input" readOnly value={customerName ? `${customerName}${customer?.code ? ` (${customer.code})` : ''}` : ''}
            placeholder={mode === 'new' ? 'Choose the customer' : ''} onDoubleClick={() => mode === 'new' && setDialog('customer')} />
        </Field>
        <Field label="Customer GSTIN"><input className="px-input" readOnly value={customer?.gstin || '—'} /></Field>
        <Field label="Place of Supply"><input className="px-input" readOnly value={stateName(customerState) || '—'} /></Field>
        <Field label="Customer PO No.">
          <input className="px-input" readOnly={!editing} value={draft.poNumber} onChange={e => setDraft(d => ({ ...d, poNumber: e.target.value }))} placeholder={editing ? 'As written on the customer’s order' : '—'} />
        </Field>
        <Field label="Payment Terms">
          {itemsEditable
            ? <><input className="px-input" list="so-terms" value={draft.paymentTerms} onChange={e => setDraft(d => ({ ...d, paymentTerms: e.target.value }))} /><datalist id="so-terms">{TERMS.map(t => <option key={t} value={t} />)}</datalist></>
            : <input className="px-input" readOnly value={draft.paymentTerms || '—'} />}
        </Field>
        <Field label="Delivery Date">
          {editing && !lineDated
            ? <input type="date" className="px-input" value={draft.deliveryDate} onChange={e => setDraft(d => ({ ...d, deliveryDate: e.target.value }))} />
            : <input className="px-input" readOnly title={lineDated ? 'Taken from the earliest line date' : undefined}
              value={lineDated ? fmtDate(draft.lines.map(l => l.deliveryDate).filter(Boolean).sort()[0]) : fmtDate(draft.deliveryDate) || '—'} />}
        </Field>
        <Field label="Order Type"><input className="px-input" readOnly value={mode !== 'new' && doc?.orderType === 'EXPORT' ? `Export${doc.currency ? ` (${doc.currency})` : ''}` : 'Domestic'} /></Field>
      </div>

      <div className="px-doc__section px-actions">
        {!editing && canWrite && <button className="px-btn px-btn--accent" disabled={busy} onClick={() => setDialog('quote')}><FileInput />New from Quotation</button>}
        {!editing && st === 'DRAFT' && !doc.approvalPending && canWrite && <button className="px-btn px-btn--primary" disabled={busy} onClick={approve}><CheckCircle2 />Approve</button>}
        {!editing && ['APPROVED', 'IN_FULFILLMENT'].includes(st) && RESERVE_ROLES.includes(role) && <button className="px-btn" disabled={busy} onClick={reserve}><PackageCheck />Reserve Stock</button>}
        {!editing && HOLD_ROLES.includes(role) && ['DRAFT', 'APPROVED', 'IN_FULFILLMENT', 'ON_HOLD'].includes(st) && (
          <button className="px-btn" disabled={busy} onClick={holdOrRelease}>{st === 'ON_HOLD' ? <><PlayCircle />Release Hold</> : <><PauseCircle />Hold</>}</button>)}
        <button className="px-btn" onClick={() => setDialog('addl')} disabled={!doc || mode === 'new'}><Info />More Details</button>
        {!editing && doc && <button className="px-btn" onClick={() => router.push('/dashboard/order-desk')}><NotebookPen />Plan &amp; Fulfil (Order Desk)</button>}
      </div>

      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      <div className="px-tabpanel">
        {tab === 'Items' && (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead>
                <tr>
                  <th className="ctr" style={{ width: 44 }}>#</th><th style={{ minWidth: 260 }}>Item</th><th className="num" style={{ width: 110 }}>Qty</th><th style={{ width: 60 }}>Unit</th>
                  <th className="num" style={{ width: 120 }}>Rate (₹)</th><th className="num" style={{ width: 70 }}>Disc %</th><th style={{ width: 150 }}>Needed By</th><th className="num">Dispatched</th><th className="num">Invoiced</th>
                  <th className="num">Amount (₹)</th><th className="num">GST</th><th className="num">Line Total (₹)</th>{itemsEditable && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const p = productMap.get(l.productId);
                  const t = tax.items[i];
                  const below = p?.minSellingPrice && netRate(l) < p.minSellingPrice;
                  return (
                    <tr key={l.key}>
                      <td className="ctr">{i + 1}</td>
                      <td title={p ? `${p.sku} - ${p.name}` : ''}>
                        <div className="flex items-center gap-2">
                          <span className="px-item"><b>{p?.name || '(item not found)'}</b><small>{p?.sku}{p?.hsnCode ? ` · HSN ${p.hsnCode}` : ''}</small></span>
                          {itemsEditable && <PickButton small onClick={() => setDialog({ item: i })} title="Change item" />}
                        </div>
                      </td>
                      <td className={itemsEditable ? 'edit' : 'num'}>{itemsEditable ? <input className="num" inputMode="decimal" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} /> : fmtNum(num(l.quantity), 3)}</td>
                      <td>{p?.uom || ''}</td>
                      <td className={itemsEditable ? 'edit' : 'num'} title={below ? `Below minimum selling price ₹${fmtNum(p.minSellingPrice)}` : undefined}>
                        {itemsEditable ? <input className="num" inputMode="decimal" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} aria-label={`Line ${i + 1} rate`} style={below ? { borderColor: 'var(--px-orange)' } : undefined} />
                          : <>{fmtNum(num(l.unitPrice))}{below ? ' ⚠' : ''}</>}
                      </td>
                      <td className={itemsEditable ? 'edit' : 'num'}>{itemsEditable ? <input className="num" inputMode="decimal" value={l.disc} onChange={e => setLine(i, { disc: e.target.value })} aria-label={`Line ${i + 1} discount %`} placeholder="0" /> : l.disc ? `${fmtNum(num(l.disc), 2).replace(/\.?0+$/, '')}%` : ''}</td>
                      <td className={editing ? 'edit' : ''}>{editing ? <input type="date" value={l.deliveryDate} onChange={e => setLine(i, { deliveryDate: e.target.value })} aria-label={`Line ${i + 1} needed by`} /> : fmtDate(l.deliveryDate) || '—'}</td>
                      <td className="num">{mode === 'new' ? '—' : fmtNum(l.dispatched, 3)}</td>
                      <td className="num">{mode === 'new' ? '—' : fmtNum(l.invoiced, 3)}</td>
                      <td className="num" title={t?.chargeShare ? `plus ₹${fmtNum(t.chargeShare)} of the charges, taxed with this line` : undefined}>{fmtNum(t?.goodsValue)}</td>
                      <td className="num">{fmtNum(p?.gstRate ?? 0, 0)}% · {fmtNum(lineGst(i))}</td>
                      <td className="num"><b>{fmtNum(t?.totalAmount)}</b></td>
                      {itemsEditable && <td className="ctr"><button onClick={() => setDraft(d => ({ ...d, lines: d.lines.filter((_, n) => n !== i) }))} title="Remove line" aria-label={`Remove line ${i + 1}`}><X className="h-4 w-4 text-red-700" /></button></td>}
                    </tr>);
                })}
                {itemsEditable && (
                  <tr className="px-addrow">
                    <td className="ctr">+</td>
                    <td colSpan={12}><button className="px-btn" onClick={() => setDialog({ item: draft.lines.length })}><ListPlus />Add item</button></td>
                  </tr>)}
              </tbody>
            </table>
            {!editing && !draft.lines.length && <div className="px-empty">No items on this sales order.</div>}
            {mode === 'edit' && !itemsEditable && <div className="px-note" style={{ margin: 8 }}>The order is approved: only the customer PO number and delivery dates can change. Cancel and re-raise it to change items or prices.</div>}
          </div>)}

        {tab === 'Charges' && <ChargesTable rows={draft.charges} editing={itemsEditable} onChange={charges => setDraft(d => ({ ...d, charges }))} what="sales order" />}

        {tab === 'Tax Summary' && (
          <div className="flex flex-col gap-3">
            <div className="px-note">
              {companyState && customerState ? (tax.intraState ? 'Customer is in the same state: CGST + SGST.' : 'Customer is in another state: IGST.') : 'The company or customer GSTIN is not set, so tax is shown as IGST.'}
              {' '}The order value (₹{fmtNum(tax.subTotal)}) is before GST; GST is charged on the tax invoice.
            </div>
            <div className="px-table-wrap">
              <table className="px-table">
                <thead><tr><th>HSN</th><th className="num">Taxable (₹)</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total GST</th></tr></thead>
                <tbody>{tax.hsnSummary.map(h => <tr key={h.hsnCode}><td>{h.hsnCode}</td><td className="num">{fmtNum(h.taxableValue)}</td><td className="num">{fmtNum(h.cgst)}</td><td className="num">{fmtNum(h.sgst)}</td><td className="num">{fmtNum(h.igst)}</td><td className="num">{fmtNum(h.totalTax)}</td></tr>)}</tbody>
              </table>
              {!tax.hsnSummary.length && <div className="px-empty">No items.</div>}
            </div>
          </div>)}

        {tab === 'Linked Documents' && <LinkedDocuments key={doc?._id || 'new'} soId={mode === 'new' ? null : doc?._id} onOpenSo={id => show(id).catch(e => msg.error(e.message))} onOpen={href => router.push(href)} />}
      </div>

      <div className="px-bottom">
        <div style={{ color: 'var(--px-muted)', maxWidth: 520 }}>
          {doc?.mspOverride?.by && mode !== 'new' && <div><b>Below-MSP approved</b> by {doc.mspOverride.by}: {doc.mspOverride.reason}</div>}
        </div>
        <div className="px-summary" aria-label="Totals">
          <div><span>{draft.lines.length} item{draft.lines.length === 1 ? '' : 's'}, total quantity</span><b>{fmtNum(totalQty, 3)}</b></div>
          {tax.chargesTotal > 0 && <><div><span>Goods value</span><b>₹ {fmtNum(tax.goodsTotal)}</b></div><div><span>Charges</span><b>₹ {fmtNum(tax.chargesTotal)}</b></div></>}
          <div><span>Order value (before GST)</span><b>₹ {fmtNum(tax.subTotal)}</b></div>
          {tax.totalCGST > 0 && <div><span>CGST</span><b>₹ {fmtNum(tax.totalCGST)}</b></div>}
          {tax.totalSGST > 0 && <div><span>SGST</span><b>₹ {fmtNum(tax.totalSGST)}</b></div>}
          {tax.totalIGST > 0 && <div><span>IGST</span><b>₹ {fmtNum(tax.totalIGST)}</b></div>}
          <div className="is-total"><span>Grand total</span><span>₹ {fmtNum(tax.totalAmount)}</span></div>
        </div>
      </div>

      {/* ---------- dialogs ---------- */}

      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}
      {dialog === 'locate' && (
        <FindDialog title="Find Sales Order" rows={[...list].reverse()} onClose={() => setDialog(null)}
          onPick={o => { setDialog(null); show(String(o._id)).catch(e => msg.error(e.message)); }}
          columns={[
            { label: 'SO No.', width: 150, value: o => o.soNumber },
            { label: 'Date', width: 95, value: o => fmtDate(o.createdAt) },
            { label: 'Customer', value: o => o.customer?.name || o.customerName || '' },
            { label: 'Customer PO', width: 130, value: o => o.poNumber || '' },
            { label: 'Value (₹)', width: 120, num: true, value: o => fmtNum(o.totalAmount) },
            { label: 'Status', width: 120, value: o => STATUS_TEXT[o.status] || o.status },
          ]} />)}

      {dialog === 'customer' && (
        <FindDialog title="Choose Customer" rows={customers.filter(c => c.isActive !== false)} onClose={() => setDialog(null)} empty="No customers. Add one in Masters > Customers."
          onPick={c => { setDraft(d => ({ ...d, customerId: String(c._id), paymentTerms: c.paymentTerms || d.paymentTerms })); setDialog(null); }}
          columns={[
            { label: 'Code', width: 110, value: c => c.code },
            { label: 'Name', value: c => c.name },
            { label: 'City', width: 120, value: c => c.city || '' },
            { label: 'GSTIN', width: 160, value: c => c.gstin || '' },
            { label: 'Credit Limit (₹)', width: 130, num: true, value: c => (c.creditLimit ? fmtNum(c.creditLimit, 0) : '—') },
          ]} />)}

      {dialog && typeof dialog === 'object' && (
        <FindDialog title="Choose Item" rows={products.filter(p => p.isActive !== false)} onClose={() => setDialog(null)} empty="No items. Add them in Masters > Items."
          onPick={p => { chooseItem(dialog.item, p); setDialog(null); }}
          columns={[
            { label: 'Code', width: 130, value: p => p.sku },
            { label: 'Item', value: p => p.name },
            { label: 'Unit', width: 60, value: p => p.uom },
            { label: 'GST %', width: 60, num: true, value: p => fmtNum(p.gstRate ?? 0, 0) },
            { label: 'Price (₹)', width: 100, num: true, value: p => fmtNum(p.price ?? 0) },
            { label: 'Min. Price (₹)', width: 110, num: true, value: p => (p.minSellingPrice ? fmtNum(p.minSellingPrice) : '—') },
          ]} />)}

      {dialog === 'quote' && <QuotationPicker onClose={() => setDialog(null)} onPick={fromQuotation} />}

      {dialog === 'addl' && doc && <MoreDetails so={doc} onClose={() => setDialog(null)} />}
    </DocCard>
  );
}

// ---------- Quotations the customer may have accepted ----------

function QuotationPicker({ onPick, onClose }: { onPick: (q: any) => void; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    readJson('/api/quotations').then((all: any[]) => setRows(all.filter(q => ['QUOTATION_SENT', 'UNDER_REVIEW'].includes(q.stage)))).catch(e => setError(e.message));
  }, []);
  if (error) return <Dialog title="New from Quotation" onClose={onClose} buttons={<button className="px-btn" onClick={onClose}>Close</button>}><div className="px-error">{error}</div></Dialog>;
  if (!rows) return <Dialog title="New from Quotation" onClose={onClose}><div className="px-empty">Loading…</div></Dialog>;
  return (
    <FindDialog title="New from Quotation (sent or under review)" rows={rows} onClose={onClose} onPick={onPick}
      empty="No open quotations. Quotations are made in Sales > Quotations."
      columns={[
        { label: 'Quotation', width: 150, value: q => q.quoteNumber },
        { label: 'Customer', value: q => q.customerName },
        { label: 'Value (₹)', width: 130, num: true, value: q => fmtNum(q.totalAmount) },
        { label: 'Valid Until', width: 110, value: q => fmtDate(q.validUntil) || '—' },
        { label: 'Stage', width: 130, value: q => String(q.stage).replace(/_/g, ' ').toLowerCase() },
      ]} />
  );
}

// ---------- More Details ----------

function MoreDetails({ so, onClose }: { so: any; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Quotation', so.quotationRef || '—'],
    ['Price lock', so.priceLocked ? `Locked to the quotation${so.lockedAt ? ` since ${fmtDate(so.lockedAt)}` : ''}` : 'Not locked'],
    ['Approval', so.approvalPending ? 'Waiting in the approval inbox' : so.status === 'DRAFT' ? 'Not yet approved' : 'Approved'],
    ['Credit check', so.creditCheckPassed === false ? 'Overridden' : so.status === 'DRAFT' ? 'Checked when approved' : 'Passed'],
    ['Invoicing', String(so.taxInvoiceStatus || 'UNINVOICED').toLowerCase()],
    ['Proforma', so.proformaNumber ? `${so.proformaNumber} (${fmtDate(so.proformaIssuedAt)})` : 'None'],
    ['Stock not reserved', so.allocationShortfall?.length ? `${so.allocationShortfall.length} item(s) short at approval` : 'None'],
  ];
  return (
    <Dialog title="More Details" onClose={onClose} width={620} buttons={<button className="px-btn px-btn--primary" onClick={onClose}>OK</button>}>
      <div className="px-fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {rows.map(([k, v]) => <Field key={k} label={k}><input className="px-input" readOnly value={v} /></Field>)}
      </div>
      {!!so.holdHistory?.length && <>
        <h3 style={{ margin: '16px 0 6px', fontSize: 13 }}>Hold history</h3>
        <div className="px-table-wrap"><table className="px-table"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Reason</th></tr></thead>
          <tbody>{so.holdHistory.map((h: any, i: number) => <tr key={i}><td>{fmtDate(h.at)}</td><td>{h.action === 'HOLD' ? 'Held' : 'Released'}</td><td>{h.by}</td><td title={h.reason}>{h.reason || '—'}</td></tr>)}</tbody></table></div>
      </>}
      {!!so.priceOverrides?.length && <>
        <h3 style={{ margin: '16px 0 6px', fontSize: 13 }}>Locked-price changes</h3>
        <div className="px-table-wrap"><table className="px-table"><thead><tr><th>When</th><th>By</th><th>What</th><th>Reason</th></tr></thead>
          <tbody>{so.priceOverrides.map((o: any, i: number) => <tr key={i}><td>{fmtDate(o.at)}</td><td>{o.by}</td><td>{(o.changes || []).join(', ')}</td><td title={o.reason}>{o.reason}</td></tr>)}</tbody></table></div>
      </>}
    </Dialog>
  );
}

// ---------- Linked documents: enquiry and quotation before, work orders, challans, invoices and receipts after ----------

const TYPE_NAME: Record<string, string> = {
  ENQUIRY: 'Enquiry', QUOTATION: 'Quotation', SALES_ORDER: 'Sales Order', WORK_ORDER: 'Work Order', DELIVERY_CHALLAN: 'Delivery Challan', INVOICE: 'Tax Invoice',
  RECEIPT: 'Receipt', PURCHASE_INDENT: 'Purchase Indent', PURCHASE_ORDER: 'Purchase Order', RFQ: 'Request for Quotation', GRN: 'Goods Receipt', VENDOR_BILL: 'Vendor Bill', PAYMENT: 'Payment', MRP_RUN: 'MRP Run',
};
const ORDER = ['ENQUIRY', 'QUOTATION', 'SALES_ORDER', 'WORK_ORDER', 'PURCHASE_INDENT', 'RFQ', 'PURCHASE_ORDER', 'GRN', 'VENDOR_BILL', 'PAYMENT', 'DELIVERY_CHALLAN', 'INVOICE', 'RECEIPT'];

function LinkedDocuments({ soId, onOpen, onOpenSo }: { soId: string | null; onOpen: (href: string) => void; onOpenSo: (id: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!soId) return;
    readJson(`/api/lineage?type=SALES_ORDER&id=${soId}`).then(setData).catch(e => setError(e.message));
  }, [soId]);
  if (!soId) return <div className="px-note">Linked documents are shown once the sales order is saved.</div>;
  if (error) return <div className="px-error">{error}</div>;
  if (!data) return <div className="px-empty">Loading…</div>;
  const nodes = [...data.nodes].sort((a: any, b: any) => (ORDER.indexOf(a.type) - ORDER.indexOf(b.type)) || String(a.date || '').localeCompare(String(b.date || '')));
  return (
    <div className="px-table-wrap">
      <table className="px-table">
        <thead><tr><th style={{ width: 210 }}>Document</th><th style={{ width: 170 }}>Number</th><th style={{ width: 110 }}>Date</th><th className="num" style={{ width: 150 }}>Amount (₹)</th><th>Status</th></tr></thead>
        <tbody>
          {nodes.map((n: any) => {
            const self = n.type === 'SALES_ORDER' && String(n.id) === String(soId);
            return (
              <tr key={n.key} className={self ? 'is-selected' : ''} title={self ? 'This document' : 'Double-click to open'} style={{ cursor: self ? 'default' : 'pointer' }}
                onDoubleClick={() => { if (self) return; if (n.type === 'SALES_ORDER') onOpenSo(String(n.id)); else onOpen(n.type === 'PURCHASE_ORDER' ? `/dashboard/transactions/purchase-order?id=${n.id}` : n.page); }}>
                <td>{TYPE_NAME[n.type] || n.type}</td><td>{self ? <b>{n.number}</b> : n.number}</td><td>{fmtDate(n.date)}</td>
                <td className="num">{n.amount !== undefined ? fmtNum(n.amount) : ''}</td><td>{String(n.status || '').replace(/_/g, ' ')}</td>
              </tr>);
          })}
        </tbody>
      </table>
      {data.truncated && <div className="px-note">The chain is long; only part of it is shown.</div>}
    </div>
  );
}
