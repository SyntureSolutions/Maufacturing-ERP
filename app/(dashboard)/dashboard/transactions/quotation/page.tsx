'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, ListPlus, X, Send, Eye, Trophy, ThumbsDown, BadgePercent, CheckCircle2, XCircle } from 'lucide-react';
import { DocCard, Field, PickButton, Pill, TabStrip, FindDialog, Dialog, useMsgBox, fmtDate, fmtNum, isoDay, type PillTone } from '@/components/workspace/controls';
import { useDocToolbar, type DocMode } from '@/components/workspace/toolbar';
import { DocList } from '@/components/workspace/DocList';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import { computeTax, stateCodeOf, stateName } from '@/lib/gst';
import { TERMS_PRESETS, INCOTERMS, rev } from '@/lib/quoteTerms';
import { ChargesTable, chargeRows, chargesBody, chargesForTax, type ChargeRow } from '@/components/workspace/ChargesTable';

// Quotation screen: make a quotation for a customer (or a prospect not yet in the masters), send it, revise it,
// ask for a discount, and mark it won (which raises the sales order) or lost. A draft that was never sent is changed
// in place; once sent, every change is a numbered revision with a note, so the customer's copy stays on record.
// All rules live in /api/quotations; its messages are shown as they are.

const EDIT_ROLES = ['ADMIN', 'MANAGER', 'SALES'];
const STAGE_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'FINANCE_MANAGER'];
const OPEN = ['ENQUIRY_RECEIVED', 'QUOTATION_SENT', 'UNDER_REVIEW'];
const STAGE_TEXT: Record<string, string> = { ENQUIRY_RECEIVED: 'Draft (not sent)', QUOTATION_SENT: 'Sent', UNDER_REVIEW: 'Under Review', PO_RECEIVED: 'Won', LOST_DECLINED: 'Lost' };
const TONE: Record<string, PillTone> = { ENQUIRY_RECEIVED: 'plain', QUOTATION_SENT: 'info', UNDER_REVIEW: 'warn', PO_RECEIVED: 'ok', LOST_DECLINED: 'bad' };
const LOSS: Record<string, string> = { COMPETITOR: 'Went to a competitor', PRICE: 'Price', LEAD_TIME: 'Lead time', SPEC_MISMATCH: 'Specification did not match', BUDGET_CANCELLED: 'Budget cancelled', OTHER: 'Other' };
const TERMS = ['ADVANCE', 'NET 15', 'NET 30', 'NET 45', 'NET 60', 'NET 90'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'];
const TABS = ['Items', 'Charges', 'Tax Summary', 'Terms', 'Revisions', 'Linked Documents'];

// listPrice / disc come from an approved discount; typing a new rate drops them
interface Line { key: string; productId: string; productName: string; quantity: string; unitPrice: string; listPrice?: number; disc?: number }
interface Draft {
  customerId: string; customerName: string; validUntil: string; paymentTerms: string; terms: string; lines: Line[]; charges: ChargeRow[];
  orderType: 'DOMESTIC' | 'EXPORT'; currency: string; exchangeRate: string; incoterm: string; portOfLoading: string; portOfDischarge: string; country: string;
}

const idOf = (v: any) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : '');
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
let seq = 0;
const newKey = () => `new-${++seq}`;
const in30 = () => isoDay(new Date(Date.now() + 30 * 86400000));
const emptyDraft = (): Draft => ({
  customerId: '', customerName: '', validUntil: in30(), paymentTerms: 'NET 30', terms: TERMS_PRESETS[0].text, lines: [], charges: [],
  orderType: 'DOMESTIC', currency: 'USD', exchangeRate: '', incoterm: 'FOB', portOfLoading: '', portOfDischarge: '', country: '',
});

function toDraft(q: any): Draft {
  return {
    customerId: idOf(q.customer), customerName: q.customerName || '', validUntil: isoDay(q.validUntil), paymentTerms: q.paymentTerms || '', terms: q.terms || '',
    lines: (q.items || []).map((i: any, n: number) => ({ key: String(i._id || n), productId: idOf(i.product), productName: i.productName || i.product?.name || '', quantity: String(i.quantity), unitPrice: String(i.unitPrice), listPrice: i.listPrice, disc: i.discountPercent })),
    charges: chargeRows(q.charges),
    orderType: q.orderType === 'EXPORT' ? 'EXPORT' : 'DOMESTIC', currency: q.currency && q.currency !== 'INR' ? q.currency : 'USD', exchangeRate: q.exchangeRate ? String(q.exchangeRate) : '',
    incoterm: q.incoterm || 'FOB', portOfLoading: q.portOfLoading || '', portOfDischarge: q.portOfDischarge || '', country: q.country || '',
  };
}

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

export default function QuotationScreen() {
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
  const [dialog, setDialog] = useState<null | 'locate' | 'customer' | 'addl' | 'lost' | 'discount' | { item: number }>(null);
  const [listing, setListing] = useState(false);     // showing the list of quotations, not one quotation

  const editing = mode !== 'view';
  const canEdit = EDIT_ROLES.includes(role);
  const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));

  // ---------- loading ----------

  const loadList = useCallback(async () => {
    const data = await readJson('/api/quotations');
    const asc = [...data].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    setList(asc);
    return asc;
  }, []);

  const show = useCallback(async (id: string) => {
    const q = await readJson(`/api/quotations/${id}`);
    setDoc(q);
    setDraft(toDraft(q));
    setMode('view');
    setListing(false);
    window.history.replaceState(null, '', `?id=${q._id}`);
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
        if (q.get('new') === '1' && EDIT_ROLES.includes(session?.user?.role)) { setDraft(emptyDraft()); setMode('new'); }
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
  const customer = useMemo(() => customers.find(c => String(c._id) === draft.customerId)
    || (doc?.customer && typeof doc.customer === 'object' && String(doc.customer._id) === draft.customerId ? doc.customer : null), [customers, doc, draft.customerId]);
  const isExport = draft.orderType === 'EXPORT';
  const companyState = company?.stateCode || stateCodeOf(company?.gstin);
  const customerState = customer?.stateCode || stateCodeOf(customer?.gstin);
  const tax = useMemo(() => computeTax(draft.lines.map(l => {
    const p = productMap.get(l.productId);
    const q = num(l.quantity), r = num(l.unitPrice);
    return { description: l.productName, hsnCode: p?.hsnCode || '—', quantity: Number.isFinite(q) ? q : 0, unitPrice: Number.isFinite(r) ? r : 0, gstRate: isExport ? 0 : Number(p?.gstRate ?? 18) };
  }), companyState, customerState, chargesForTax(draft.charges)), [draft.lines, draft.charges, productMap, companyState, customerState, isExport]);
  const totalQty = draft.lines.reduce((s, l) => s + (Number.isFinite(num(l.quantity)) ? num(l.quantity) : 0), 0);
  const cur = isExport ? draft.currency : '₹';

  // ---------- editing ----------

  const setLine = (i: number, p: Partial<Line>) => setDraft(d => ({ ...d, lines: d.lines.map((l, n) => (n === i ? { ...l, ...p } : l)) }));
  const chooseItem = (index: number, p: any) => {
    const pid = String(p._id);
    const dupe = draft.lines.findIndex((l, n) => l.productId === pid && n !== index);
    if (dupe >= 0) { msg.error(`${p.name} is already on line ${dupe + 1}. Change the quantity on that line instead.`); return; }
    if (index >= draft.lines.length) setDraft(d => ({ ...d, lines: [...d.lines, { key: newKey(), productId: pid, productName: p.name, quantity: '1', unitPrice: String(p.price ?? 0) }] }));
    else setLine(index, { productId: pid, productName: p.name, unitPrice: draft.lines[index].unitPrice || String(p.price ?? 0) });
  };

  const body = () => ({
    customer: draft.customerId || undefined, customerName: draft.customerId ? undefined : draft.customerName, validUntil: draft.validUntil || undefined, paymentTerms: draft.paymentTerms, terms: draft.terms,
    items: draft.lines.map(l => ({ product: l.productId || undefined, productName: l.productName, quantity: num(l.quantity), unitPrice: num(l.unitPrice), listPrice: l.listPrice, discountPercent: l.disc })),
    charges: chargesBody(draft.charges),
    orderType: draft.orderType,
    ...(isExport ? { currency: draft.currency, exchangeRate: num(draft.exchangeRate), incoterm: draft.incoterm, portOfLoading: draft.portOfLoading, portOfDischarge: draft.portOfDischarge, country: draft.country } : {}),
  });

  const reloadAndShow = async (id: string) => { await loadList(); await show(id); };

  const save = async () => {
    if (!draft.customerId && !draft.customerName.trim()) { msg.error('Choose the customer, or type the name of the prospect.'); return; }
    if (!draft.lines.length) { msg.error('Add at least one item.'); return; }
    for (const [n, l] of draft.lines.entries()) {
      if (!(num(l.quantity) > 0)) { msg.error(`Line ${n + 1}: enter a quantity more than zero.`); return; }
      if (!(num(l.unitPrice) >= 0)) { msg.error(`Line ${n + 1}: enter the rate.`); return; }
    }
    setBusy(true);
    try {
      if (mode === 'new') {
        const r = await call('/api/quotations', 'POST', body());
        if (!r.ok) { msg.error(r.data?.error || `Not saved (${r.status}).`, 'Not saved'); return; }
        await reloadAndShow(String(r.data._id));
        msg.info(`Quotation ${r.data.quoteNumber} saved as a draft.\nPress “Mark as Sent” once it has gone to the customer.`);
        return;
      }
      // a draft is changed in place; a sent quotation gets a new revision with a note
      if (doc.stage === 'ENQUIRY_RECEIVED') {
        const r = await call(`/api/quotations/${doc._id}`, 'PATCH', body());
        if (!r.ok) { msg.error(r.data?.error || `Not saved (${r.status}).`, 'Not saved'); return; }
      } else {
        const note = await msg.prompt(`${doc.quoteNumber} has been sent, so this becomes ${rev((doc.revision || 1) + 1)}.\nWhat changed?`, 'New revision', 3);
        if (note === null) return;
        const content: Record<string, any> = body();
        delete content.customer; delete content.customerName; // the customer of a sent quotation stays
        const r = await call(`/api/quotations/${doc._id}/revise`, 'POST', { ...content, note });
        if (!r.ok) { msg.error(r.data?.error || `Not saved (${r.status}).`, 'Not saved'); return; }
      }
      await reloadAndShow(String(doc._id));
      msg.info(`Quotation ${doc.quoteNumber} saved.`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- stage moves ----------

  const moveTo = async (stage: string, extra: any = {}) => {
    setBusy(true);
    try {
      const r = await call(`/api/quotations/${doc._id}`, 'PATCH', { stage, ...extra });
      if (!r.ok) return r;
      await reloadAndShow(String(doc._id));
      return r;
    } finally {
      setBusy(false);
    }
  };

  const win = async () => {
    const po = await msg.prompt(`Mark ${doc.quoteNumber} as won?\nA draft sales order is raised with the quotation's prices locked.\n\nEnter the customer's PO number.`, 'Won', 1);
    if (po === null) return;
    let r = await moveTo('PO_RECEIVED', { poNumber: po });
    if (r && !r.ok && r.data?.creditCheckFailed) {
      const reason = await msg.prompt(`${r.data.error}\n\nTo take the order anyway (Admin, Manager or Finance Manager), write why.`, 'Credit limit exceeded', 10);
      if (reason === null) return;
      r = await moveTo('PO_RECEIVED', { poNumber: po, bypassCreditCheck: true, bypassReason: reason });
    }
    if (!r?.ok) { msg.error(r?.data?.error || 'Not changed.'); return; }
    const so = r.data.createdSalesOrder;
    if (so?._id && (await msg.confirm(`${r.data.message}\n\nOpen sales order ${so.soNumber} now?`, 'Won'))) router.push(`/dashboard/transactions/sales-order?id=${so._id}`);
  };

  const simpleMove = async (stage: string, done: string) => {
    const r = await moveTo(stage);
    if (r && !r.ok) msg.error(r.data?.error || 'Not changed.'); else msg.info(done);
  };

  const remove = async () => {
    if (!doc) return;
    if (doc.stage !== 'ENQUIRY_RECEIVED') { msg.error(`${doc.quoteNumber} has been sent, so it is kept on record. Mark it lost instead.`); return; }
    if (!(await msg.confirm(`Delete draft quotation ${doc.quoteNumber}? It was never sent, so it is removed.`))) return;
    setBusy(true);
    try {
      const r = await call(`/api/quotations/${doc._id}`, 'DELETE');
      if (!r.ok) { msg.error(r.data?.error || `Not deleted (${r.status}).`); return; }
      await loadList();
      setDoc(null); setDraft(emptyDraft()); setListing(true);
      window.history.replaceState(null, '', '?view=list');
      msg.info(r.data.message);
    } finally {
      setBusy(false);
    }
  };

  const decideDiscount = async (approve: boolean) => {
    const remarks = await msg.prompt(approve ? 'Approve the discount? Add a remark.' : 'Reject the discount? Say why.', approve ? 'Approve discount' : 'Reject discount', approve ? 1 : 3);
    if (remarks === null) return;
    setBusy(true);
    try {
      const r = await call(`/api/quotations/${doc._id}/discount`, 'POST', { action: approve ? 'approve' : 'reject', remarks });
      if (!r.ok) { msg.error(r.data?.error || 'Not changed.'); return; }
      await reloadAndShow(String(doc._id));
    } finally {
      setBusy(false);
    }
  };

  // ---------- command bar ----------

  const pos = doc ? list.findIndex(o => String(o._id) === String(doc._id)) : -1;
  const go = (i: number) => { const o = list[i]; if (o) show(String(o._id)).catch(e => msg.error(e.message)); };
  const viewing = !editing && !busy;
  const pendingDiscount = (doc?.discountRequests || []).at(-1)?.status === 'PENDING' ? (doc.discountRequests || []).at(-1) : null;
  const findByNumber = (no: string) => {
    const q = no.toLowerCase();
    const hit = list.find(o => String(o.quoteNumber).toLowerCase() === q) || list.find(o => String(o.quoteNumber).toLowerCase().endsWith(q));
    if (hit) show(String(hit._id)).catch(e => msg.error(e.message));
    else msg.error(`No quotation numbered ${no}.`);
  };
  const listed = listing && !editing;   // New / Duplicate leave the list by switching to new mode; Discard comes back to it
  useDocToolbar(listed ? {
    mode, listing: true, position: `${list.length} quotations`, findByNumber,
    actions: { new: !busy && canEdit && (() => { setDraft(emptyDraft()); setMode('new'); setTab(TABS[0]); }), list: !!doc && (() => show(String(doc._id)).catch(e => msg.error(e.message))) },
  } : {
    mode,
    position: pos >= 0 ? `${pos + 1} of ${list.length}` : list.length ? `${list.length} quotations` : '',
    deleteLabel: 'Delete draft',
    actions: {
      first: viewing && pos > 0 && (() => go(0)),
      prev: viewing && pos > 0 && (() => go(pos - 1)),
      next: viewing && pos >= 0 && pos < list.length - 1 && (() => go(pos + 1)),
      last: viewing && pos >= 0 && pos < list.length - 1 && (() => go(list.length - 1)),
      locate: viewing && (() => setDialog('locate')),
      new: viewing && canEdit && (() => { setDraft(emptyDraft()); setMode('new'); setTab(TABS[0]); }),
      edit: viewing && canEdit && !!doc && (() => {
        if (!OPEN.includes(doc.stage)) { msg.error(`${doc.quoteNumber} is ${STAGE_TEXT[doc.stage]} and can no longer be changed.`); return; }
        if (pendingDiscount) { msg.error('A discount request is waiting for a decision. Decide it before changing the quotation.'); return; }
        setMode('edit');
      }),
      save: editing && !busy && save,
      cancel: editing && !busy && (async () => { if (await msg.confirm('Discard the changes made to this quotation?')) { setDraft(doc ? toDraft(doc) : emptyDraft()); setMode('view'); } }),
      delete: viewing && canEdit && !!doc && remove,
      copy: viewing && canEdit && !!doc && (() => { setDraft({ ...toDraft(doc), validUntil: in30(), lines: toDraft(doc).lines.map(l => ({ ...l, key: newKey() })) }); setMode('new'); setTab(TABS[0]); }),
      preview: viewing && !!doc && (() => setPdf({ url: `/api/quotations/${doc._id}/pdf`, title: `Quotation ${doc.quoteNumber}` })),
      print: viewing && !!doc && (() => setPdf({ url: `/api/quotations/${doc._id}/pdf`, title: `Quotation ${doc.quoteNumber}`, print: true })),
      list: viewing && (() => { setListing(true); window.history.replaceState(null, '', '?view=list'); }),
    },
    findByNumber,
  });

  // ---------- render ----------

  const st = doc?.stage;
  const open = !!doc && OPEN.includes(st) && mode !== 'new';
  const custEditable = mode === 'new' || (mode === 'edit' && st === 'ENQUIRY_RECEIVED');
  const status = mode === 'new' ? <Pill tone="new">New</Pill> : doc ? <>
    <Pill tone={TONE[st] || 'plain'}>{STAGE_TEXT[st] || st}</Pill>
    <Pill>{rev(doc.revision || 1)}</Pill>
    {pendingDiscount && <Pill tone="warn">Discount awaiting approval</Pill>}
    {isExport && <Pill tone="info">Export</Pill>}
  </> : undefined;
  const lineGst = (i: number) => { const t = tax.items[i]; return t ? t.cgstAmount + t.sgstAmount + t.igstAmount : 0; };
  const expired = doc && open && doc.validUntil && new Date(doc.validUntil) < new Date(new Date().toDateString());

  // export quotations are in their own currency, so the total counts rupee quotations only
  if (listed) return (
    <>
      {loadError && <div className="px-error">{loadError}</div>}
      <DocList title="Quotations" fileName="quotations" rows={[...list].reverse()}
        onOpen={o => show(String(o._id)).catch(e => msg.error(e.message))}
        statusOf={o => o.stage} statuses={Object.fromEntries(Object.entries(STAGE_TEXT).map(([k, label]) => [k, { label, tone: TONE[k] }]))}
        dateOf={o => o.createdAt}
        empty={<>No quotations yet. Press <b>New</b> (Ctrl+N), or make one from an enquiry.</>}
        columns={[
          { label: 'Quotation', width: 160, value: o => <b>{o.quoteNumber} {rev(o.revision || 1)}</b>, text: o => `${o.quoteNumber} ${rev(o.revision || 1)}` },
          { label: 'Date', width: 100, value: o => fmtDate(o.createdAt), text: o => isoDay(o.createdAt) },
          { label: 'Customer', value: o => o.customerName },
          { label: 'Valid Until', width: 105, value: o => fmtDate(o.validUntil) || '—', text: o => isoDay(o.validUntil) },
          { label: 'Value (₹)', width: 150, num: true, value: o => o.orderType === 'EXPORT' ? `${o.currency} ${fmtNum(o.totalAmount)}` : fmtNum(o.totalAmount), sum: o => (o.orderType === 'EXPORT' ? 0 : Number(o.totalAmount) || 0) },
          { label: 'Stage', width: 150, value: o => <Pill tone={TONE[o.stage] || 'plain'}>{STAGE_TEXT[o.stage] || o.stage}</Pill>, text: o => STAGE_TEXT[o.stage] || o.stage },
        ]} />
    </>);

  return (
    <DocCard kind="Quotation" number={mode === 'new' ? 'New quotation' : doc?.quoteNumber || 'Quotations'} status={status}
      meta={doc && mode !== 'new' ? `Made ${fmtDate(doc.createdAt)}${doc.enquiryRef ? ` · from enquiry ${doc.enquiryRef}` : ''}${doc.salesOrderRef ? ` · order ${doc.salesOrderRef}` : ''}` : undefined}>
      {loadError && <div className="px-doc__section"><div className="px-error">{loadError}</div></div>}
      {!loadError && !doc && mode === 'view' && list.length === 0 && <div className="px-doc__section"><div className="px-note">No quotations yet. Press <b>New</b> (Ctrl+N) to make the first one.</div></div>}
      {expired && mode === 'view' && <div className="px-doc__section"><div className="px-note">This quotation expired on {fmtDate(doc.validUntil)}. Revise it with a new validity date before the customer accepts it.</div></div>}
      {st === 'LOST_DECLINED' && mode === 'view' && <div className="px-doc__section"><div className="px-error"><b>Lost</b> – {LOSS[doc.lossCategory] || doc.lossCategory}: {doc.lossReason}</div></div>}
      {pendingDiscount && mode === 'view' && (
        <div className="px-doc__section">
          <div className="px-note flex flex-wrap items-center gap-3">
            <span><b>Discount requested:</b> {pendingDiscount.percent}% (₹{fmtNum(pendingDiscount.amount)}) by {pendingDiscount.requestedBy} – {pendingDiscount.reason}. Needs {String(pendingDiscount.requiredRole).toLowerCase()} approval.</span>
            {['ADMIN', 'MANAGER', 'SALES'].includes(role) && <>
              <button className="px-btn px-btn--primary" disabled={busy} onClick={() => decideDiscount(true)}><CheckCircle2 />Approve</button>
              <button className="px-btn" disabled={busy} onClick={() => decideDiscount(false)}><XCircle />Reject</button>
            </>}
          </div>
        </div>)}

      <div className="px-doc__section px-fields">
        {customer || !custEditable
          ? <Field label="Customer" wide pick={custEditable ? <PickButton onClick={() => setDialog('customer')} title="Choose customer" /> : undefined}>
            <input className="px-input" readOnly value={customer ? `${customer.name}${customer.code ? ` (${customer.code})` : ''}` : `${draft.customerName}${draft.customerName ? ' (prospect)' : ''}`} />
          </Field>
          : <Field label="Customer or Prospect" wide pick={<PickButton onClick={() => setDialog('customer')} title="Choose a registered customer" />}>
            <input className="px-input" value={draft.customerName} onChange={e => set({ customerName: e.target.value })} placeholder="Choose a customer, or type a prospect’s name" />
          </Field>}
        <Field label="Customer GSTIN"><input className="px-input" readOnly value={customer?.gstin || '—'} /></Field>
        <Field label="Place of Supply"><input className="px-input" readOnly value={isExport ? 'Export (outside India)' : stateName(customerState) || '—'} /></Field>
        <Field label="Valid Until">
          {editing ? <input type="date" className="px-input" value={draft.validUntil} onChange={e => set({ validUntil: e.target.value })} /> : <input className="px-input" readOnly value={fmtDate(draft.validUntil) || '—'} />}
        </Field>
        <Field label="Payment Terms">
          {editing ? <><input className="px-input" list="qt-terms" value={draft.paymentTerms} onChange={e => set({ paymentTerms: e.target.value })} /><datalist id="qt-terms">{TERMS.map(t => <option key={t} value={t} />)}</datalist></>
            : <input className="px-input" readOnly value={draft.paymentTerms || '—'} />}
        </Field>
        <Field label="Domestic or Export">
          <div className="px-seg" role="radiogroup" aria-label="Domestic or export">
            <button className={!isExport ? 'is-on' : ''} disabled={!editing} onClick={() => set({ orderType: 'DOMESTIC' })}>Domestic</button>
            <button className={isExport ? 'is-on' : ''} disabled={!editing} onClick={() => set({ orderType: 'EXPORT', terms: draft.terms === TERMS_PRESETS[0].text ? TERMS_PRESETS[1].text : draft.terms })}>Export</button>
          </div>
        </Field>
        <Field label="Customer PO"><input className="px-input" readOnly value={doc?.poNumber && mode !== 'new' ? doc.poNumber : '—'} /></Field>
      </div>

      {isExport && (
        <div className="px-doc__section">
          <div className="px-section-title">Export details</div>
          <div className="px-fields">
            <Field label="Currency">{editing ? <select className="px-input" value={draft.currency} onChange={e => set({ currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select> : <input className="px-input" readOnly value={draft.currency} />}</Field>
            <Field label={`Exchange Rate (₹ per ${draft.currency})`}><input className="px-input" inputMode="decimal" readOnly={!editing} value={draft.exchangeRate} onChange={e => set({ exchangeRate: e.target.value })} /></Field>
            <Field label="Incoterm">{editing ? <select className="px-input" value={draft.incoterm} onChange={e => set({ incoterm: e.target.value })}>{INCOTERMS.map(c => <option key={c}>{c}</option>)}</select> : <input className="px-input" readOnly value={draft.incoterm} />}</Field>
            <Field label="Country"><input className="px-input" readOnly={!editing} value={draft.country} onChange={e => set({ country: e.target.value })} /></Field>
            <Field label="Port of Loading"><input className="px-input" readOnly={!editing} value={draft.portOfLoading} onChange={e => set({ portOfLoading: e.target.value })} /></Field>
            <Field label="Port of Discharge"><input className="px-input" readOnly={!editing} value={draft.portOfDischarge} onChange={e => set({ portOfDischarge: e.target.value })} /></Field>
          </div>
        </div>)}

      <div className="px-doc__section px-actions">
        {!editing && open && STAGE_ROLES.includes(role) && <>
          {st === 'ENQUIRY_RECEIVED' && <button className="px-btn px-btn--primary" disabled={busy} onClick={() => simpleMove('QUOTATION_SENT', `${doc.quoteNumber} is marked as sent. Changes from now on are numbered revisions.`)}><Send />Mark as Sent</button>}
          {st === 'QUOTATION_SENT' && <button className="px-btn" disabled={busy} onClick={() => simpleMove('UNDER_REVIEW', `${doc.quoteNumber} is under review by the customer.`)}><Eye />Customer Reviewing</button>}
          <button className="px-btn px-btn--accent" disabled={busy || !!pendingDiscount} onClick={win}><Trophy />Won → Sales Order</button>
          <button className="px-btn" disabled={busy} onClick={() => setDialog('lost')}><ThumbsDown />Lost</button>
        </>}
        {!editing && open && EDIT_ROLES.includes(role) && !pendingDiscount && <button className="px-btn" disabled={busy} onClick={() => setDialog('discount')}><BadgePercent />Request Discount</button>}
        <button className="px-btn" onClick={() => setDialog('addl')} disabled={!doc || mode === 'new'}><Info />More Details</button>
      </div>

      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      <div className="px-tabpanel">
        {tab === 'Items' && (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead>
                <tr>
                  <th className="ctr" style={{ width: 44 }}>#</th><th style={{ minWidth: 260 }}>Item</th><th className="num" style={{ width: 110 }}>Qty</th><th style={{ width: 60 }}>Unit</th>
                  <th className="num" style={{ width: 130 }}>Rate ({cur})</th><th className="num">Amount ({cur})</th>{!isExport && <><th className="num">GST</th><th className="num">Line Total (₹)</th></>}
                  {editing && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const p = productMap.get(l.productId);
                  const t = tax.items[i];
                  return (
                    <tr key={l.key}>
                      <td className="ctr">{i + 1}</td>
                      <td title={p ? `${p.sku} - ${p.name}` : l.productName}>
                        <div className="flex items-center gap-2">
                          <span className="px-item"><b>{l.productName || p?.name || '(no item)'}</b><small>{p ? `${p.sku}${p.hsnCode ? ` · HSN ${p.hsnCode}` : ''}` : 'Not linked to an item – choose one before the order is taken'}</small></span>
                          {editing && <PickButton small onClick={() => setDialog({ item: i })} title="Choose item" />}
                        </div>
                      </td>
                      <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} /> : fmtNum(num(l.quantity), 3)}</td>
                      <td>{p?.uom || ''}</td>
                      <td className={editing ? 'edit' : 'num'}>{editing ? <input className="num" inputMode="decimal" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value, listPrice: undefined, disc: undefined })} aria-label={`Line ${i + 1} rate`} /> : fmtNum(num(l.unitPrice))}
                        {l.disc ? <small className="block" style={{ color: 'var(--px-muted)' }}>list {fmtNum(l.listPrice)} less {fmtNum(l.disc, 2).replace(/\.?0+$/, '')}%</small> : null}</td>
                      <td className="num" title={t?.chargeShare ? `plus ${fmtNum(t.chargeShare)} of the charges, taxed with this line` : undefined}>{fmtNum(t?.goodsValue)}</td>
                      {!isExport && <><td className="num">{fmtNum(p?.gstRate ?? 18, 0)}% · {fmtNum(lineGst(i))}</td><td className="num"><b>{fmtNum(t?.totalAmount)}</b></td></>}
                      {editing && <td className="ctr"><button onClick={() => setDraft(d => ({ ...d, lines: d.lines.filter((_, n) => n !== i) }))} title="Remove line" aria-label={`Remove line ${i + 1}`}><X className="h-4 w-4 text-red-700" /></button></td>}
                    </tr>);
                })}
                {editing && <tr className="px-addrow"><td className="ctr">+</td><td colSpan={9}><button className="px-btn" onClick={() => setDialog({ item: draft.lines.length })}><ListPlus />Add item</button></td></tr>}
              </tbody>
            </table>
            {!editing && !draft.lines.length && <div className="px-empty">No items on this quotation.</div>}
          </div>)}

        {tab === 'Charges' && <ChargesTable rows={draft.charges} editing={editing} onChange={charges => setDraft(d => ({ ...d, charges }))} currency={cur} what="quotation" />}

        {tab === 'Tax Summary' && (isExport
          ? <div className="px-note">Export quotations carry no GST (zero-rated supply under LUT / bond).</div>
          : <div className="flex flex-col gap-3">
            <div className="px-note">{companyState && customerState ? (tax.intraState ? 'Customer is in the same state: CGST + SGST.' : 'Customer is in another state: IGST.') : 'The company or customer GSTIN is not known, so tax is shown as IGST. The server works it out again when the quotation is saved.'}</div>
            <div className="px-table-wrap">
              <table className="px-table">
                <thead><tr><th>HSN</th><th className="num">Taxable (₹)</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total GST</th></tr></thead>
                <tbody>{tax.hsnSummary.map(h => <tr key={h.hsnCode}><td>{h.hsnCode}</td><td className="num">{fmtNum(h.taxableValue)}</td><td className="num">{fmtNum(h.cgst)}</td><td className="num">{fmtNum(h.sgst)}</td><td className="num">{fmtNum(h.igst)}</td><td className="num">{fmtNum(h.totalTax)}</td></tr>)}</tbody>
              </table>
              {!tax.hsnSummary.length && <div className="px-empty">No items.</div>}
            </div>
          </div>)}

        {tab === 'Terms' && (
          <div className="flex flex-col gap-2">
            {editing && (
              <div className="px-actions"><span className="px-hint">Start from:</span>
                {TERMS_PRESETS.map(t => <button key={t.key} className="px-btn" onClick={() => set({ terms: t.text })}>{t.label}</button>)}
              </div>)}
            <textarea className="px-input" style={{ minHeight: 200 }} readOnly={!editing} value={draft.terms} onChange={e => set({ terms: e.target.value })} aria-label="Terms and conditions" />
          </div>)}

        {tab === 'Revisions' && (
          !doc || mode === 'new' ? <div className="px-note">Revisions start once the quotation is saved and sent.</div>
            : <div className="px-table-wrap">
              <table className="px-table">
                <thead><tr><th style={{ width: 90 }}>Revision</th><th style={{ width: 110 }}>Replaced on</th><th style={{ width: 160 }}>By</th><th className="num" style={{ width: 140 }}>Value ({doc.orderType === 'EXPORT' ? doc.currency : '₹'})</th><th>What changed</th></tr></thead>
                <tbody>
                  {[...(doc.revisions || [])].reverse().map((r: any) => <tr key={r.rev}><td>{rev(r.rev)}</td><td>{fmtDate(r.at)}</td><td>{r.changedBy}</td><td className="num">{fmtNum(r.totalAmount)}</td><td style={{ whiteSpace: 'normal' }}>{r.note}</td></tr>)}
                  <tr className="is-selected"><td><b>{rev(doc.revision || 1)}</b></td><td>current</td><td /><td className="num"><b>{fmtNum(doc.totalAmount)}</b></td><td /></tr>
                </tbody>
              </table>
            </div>)}

        {tab === 'Linked Documents' && <LinkedDocuments key={doc?._id || 'new'} quoteId={mode === 'new' ? null : doc?._id} onOpen={href => router.push(href)} onOpenQuote={id => show(id).catch(e => msg.error(e.message))} />}
      </div>

      <div className="px-bottom">
        <div style={{ color: 'var(--px-muted)', maxWidth: 520 }}>{isExport && draft.exchangeRate ? `≈ ₹ ${fmtNum(tax.subTotal * (num(draft.exchangeRate) || 0))} at ₹${draft.exchangeRate} per ${draft.currency}` : ''}</div>
        <div className="px-summary" aria-label="Totals">
          <div><span>{draft.lines.length} item{draft.lines.length === 1 ? '' : 's'}, total quantity</span><b>{fmtNum(totalQty, 3)}</b></div>
          {tax.chargesTotal > 0 && <><div><span>Goods value</span><b>{cur} {fmtNum(tax.goodsTotal)}</b></div><div><span>Charges</span><b>{cur} {fmtNum(tax.chargesTotal)}</b></div></>}
          <div><span>Quoted value{isExport ? '' : ' (before GST)'}</span><b>{cur} {fmtNum(tax.subTotal)}</b></div>
          {!isExport && tax.totalCGST > 0 && <div><span>CGST</span><b>₹ {fmtNum(tax.totalCGST)}</b></div>}
          {!isExport && tax.totalSGST > 0 && <div><span>SGST</span><b>₹ {fmtNum(tax.totalSGST)}</b></div>}
          {!isExport && tax.totalIGST > 0 && <div><span>IGST</span><b>₹ {fmtNum(tax.totalIGST)}</b></div>}
          <div className="is-total"><span>Grand total</span><span>{cur} {fmtNum(isExport ? tax.subTotal : tax.totalAmount)}</span></div>
        </div>
      </div>

      {/* ---------- dialogs ---------- */}

      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}
      {dialog === 'locate' && (
        <FindDialog title="Find Quotation" rows={[...list].reverse()} onClose={() => setDialog(null)} onPick={o => { setDialog(null); show(String(o._id)).catch(e => msg.error(e.message)); }}
          columns={[
            { label: 'Quotation', width: 150, value: o => `${o.quoteNumber} ${rev(o.revision || 1)}` },
            { label: 'Date', width: 95, value: o => fmtDate(o.createdAt) },
            { label: 'Customer', value: o => o.customerName },
            { label: 'Value', width: 130, num: true, value: o => `${o.orderType === 'EXPORT' ? o.currency : '₹'} ${fmtNum(o.totalAmount)}` },
            { label: 'Valid Until', width: 105, value: o => fmtDate(o.validUntil) || '—' },
            { label: 'Stage', width: 130, value: o => STAGE_TEXT[o.stage] || o.stage },
          ]} />)}

      {dialog === 'customer' && (
        <FindDialog title="Choose Customer" rows={customers.filter(c => c.isActive !== false)} onClose={() => setDialog(null)} empty="No customers. Add one in Masters > Customers, or type a prospect’s name."
          onPick={c => { set({ customerId: String(c._id), customerName: c.name, paymentTerms: c.paymentTerms || draft.paymentTerms }); setDialog(null); }}
          columns={[
            { label: 'Code', width: 110, value: c => c.code },
            { label: 'Name', value: c => c.name },
            { label: 'City', width: 120, value: c => c.city || '' },
            { label: 'GSTIN', width: 160, value: c => c.gstin || '' },
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
          ]} />)}

      {dialog === 'lost' && doc && <LostDialog onClose={() => setDialog(null)} onLost={async (cat, reason) => {
        const r = await moveTo('LOST_DECLINED', { lossCategory: cat, lossReason: reason });
        if (r && !r.ok) { msg.error(r.data?.error || 'Not changed.'); return; }
        setDialog(null);
      }} />}

      {dialog === 'discount' && doc && <DiscountDialog total={(doc.items || []).reduce((t: number, i: any) => t + (i.totalPrice || 0), 0)} onClose={() => setDialog(null)} onRequest={async (percent, reason) => {
        const r = await call(`/api/quotations/${doc._id}/discount`, 'POST', { action: 'request', percent, reason });
        if (!r.ok) { msg.error(r.data?.error || 'Not requested.'); return; }
        setDialog(null);
        await reloadAndShow(String(doc._id));
        const req = r.data.request; // the API answers { quote, request }
        msg.info(req?.status === 'APPROVED' ? `Discount of ${percent}% is within your authority and was applied as ${rev(r.data.quote?.revision || 1)}.` : `Discount of ${percent}% requested. It needs ${String(req?.requiredRole || 'manager').toLowerCase()} approval.`);
      }} />}

      {dialog === 'addl' && doc && <MoreDetails q={doc} onClose={() => setDialog(null)} />}
    </DocCard>
  );
}

// ---------- Lost: reason category and detail ----------

function LostDialog({ onLost, onClose }: { onLost: (category: string, reason: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Dialog title="Quotation lost" onClose={onClose} width={520}
      buttons={<><button className="px-btn" onClick={onClose}>Cancel</button><button className="px-btn px-btn--primary" disabled={!cat || reason.trim().length < 3} onClick={() => onLost(cat, reason.trim())}>Mark as Lost</button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Main reason"><select className="px-input" value={cat} onChange={e => setCat(e.target.value)} autoFocus><option value="">— choose —</option>{Object.entries(LOSS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="What happened"><textarea className="px-input" style={{ minHeight: 90 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Competitor quoted 8% lower with 2-week delivery" /></Field>
        <div className="px-hint">Loss reasons feed the loss analysis in Sales.</div>
      </div>
    </Dialog>
  );
}

// ---------- Request a discount ----------

function DiscountDialog({ total, onRequest, onClose }: { total: number; onRequest: (percent: number, reason: string) => void; onClose: () => void }) {
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');
  const p = Number(percent);
  const ok = p > 0 && p < 100 && reason.trim().length >= 5;
  return (
    <Dialog title="Request discount" onClose={onClose} width={480}
      buttons={<><button className="px-btn" onClick={onClose}>Cancel</button><button className="px-btn px-btn--primary" disabled={!ok} onClick={() => onRequest(p, reason.trim())}>Request</button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Discount (%)"><input className="px-input" inputMode="decimal" autoFocus value={percent} onChange={e => setPercent(e.target.value)} /></Field>
        {p > 0 && <div className="px-hint">≈ ₹ {fmtNum(total * p / 100)} off ₹ {fmtNum(total)}. Small discounts are approved at once; larger ones go to a Manager or Admin.</div>}
        <Field label="Why"><textarea className="px-input" style={{ minHeight: 80 }} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

// ---------- More Details ----------

function MoreDetails({ q, onClose }: { q: any; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Enquiry', q.enquiryRef || '—'],
    ['Sales order', q.salesOrderRef || '—'],
    ['Customer PO', q.poNumber || '—'],
    ['Credit check', q.creditCheckPassed ? (q.creditCheckNotes || 'Passed') : 'Done when the quotation is won'],
    ['Proforma', q.proformaNumber ? `${q.proformaNumber} (${fmtDate(q.proformaIssuedAt)})` : 'None'],
    ['Last changed', fmtDate(q.updatedAt)],
  ];
  return (
    <Dialog title="More Details" onClose={onClose} width={620} buttons={<button className="px-btn px-btn--primary" onClick={onClose}>OK</button>}>
      <div className="px-fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {rows.map(([k, v]) => <Field key={k} label={k}><input className="px-input" readOnly value={v} /></Field>)}
      </div>
      {!!q.discountRequests?.length && <>
        <h3 style={{ margin: '16px 0 6px', fontSize: 13 }}>Discount requests</h3>
        <div className="px-table-wrap"><table className="px-table"><thead><tr><th>Asked</th><th className="num">%</th><th>By</th><th>Status</th><th>Decided by</th><th>Reason</th></tr></thead>
          <tbody>{q.discountRequests.map((d: any, i: number) => <tr key={i}><td>{fmtDate(d.requestedAt)}</td><td className="num">{d.percent}</td><td>{d.requestedBy}</td><td>{String(d.status).toLowerCase()}</td><td>{d.decidedBy || '—'}</td><td title={d.reason}>{d.reason}</td></tr>)}</tbody></table></div>
      </>}
    </Dialog>
  );
}

// ---------- Linked documents ----------

const TYPE_NAME: Record<string, string> = { ENQUIRY: 'Enquiry', QUOTATION: 'Quotation', SALES_ORDER: 'Sales Order', WORK_ORDER: 'Work Order', DELIVERY_CHALLAN: 'Delivery Challan', INVOICE: 'Tax Invoice', RECEIPT: 'Receipt', PURCHASE_INDENT: 'Purchase Indent', PURCHASE_ORDER: 'Purchase Order' };
const ORDER = ['ENQUIRY', 'QUOTATION', 'SALES_ORDER', 'WORK_ORDER', 'PURCHASE_INDENT', 'PURCHASE_ORDER', 'DELIVERY_CHALLAN', 'INVOICE', 'RECEIPT'];

function LinkedDocuments({ quoteId, onOpen, onOpenQuote }: { quoteId: string | null; onOpen: (href: string) => void; onOpenQuote: (id: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!quoteId) return;
    readJson(`/api/lineage?type=QUOTATION&id=${quoteId}`).then(setData).catch(e => setError(e.message));
  }, [quoteId]);
  if (!quoteId) return <div className="px-note">Linked documents are shown once the quotation is saved.</div>;
  if (error) return <div className="px-error">{error}</div>;
  if (!data) return <div className="px-empty">Loading…</div>;
  const nodes = [...data.nodes].sort((a: any, b: any) => (ORDER.indexOf(a.type) - ORDER.indexOf(b.type)) || String(a.date || '').localeCompare(String(b.date || '')));
  const href = (n: any) => n.type === 'SALES_ORDER' ? `/dashboard/transactions/sales-order?id=${n.id}` : n.type === 'PURCHASE_ORDER' ? `/dashboard/transactions/purchase-order?id=${n.id}` : n.page;
  return (
    <div className="px-table-wrap">
      <table className="px-table">
        <thead><tr><th style={{ width: 210 }}>Document</th><th style={{ width: 170 }}>Number</th><th style={{ width: 110 }}>Date</th><th className="num" style={{ width: 150 }}>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {nodes.map((n: any) => {
            const self = n.type === 'QUOTATION' && String(n.id) === String(quoteId);
            return (
              <tr key={n.key} className={self ? 'is-selected' : ''} title={self ? 'This document' : 'Double-click to open'} style={{ cursor: self ? 'default' : 'pointer' }}
                onDoubleClick={() => { if (self) return; if (n.type === 'QUOTATION') onOpenQuote(String(n.id)); else onOpen(href(n)); }}>
                <td>{TYPE_NAME[n.type] || n.type}</td><td>{self ? <b>{n.number}</b> : n.number}</td><td>{fmtDate(n.date)}</td>
                <td className="num">{n.amount !== undefined ? fmtNum(n.amount) : ''}</td><td>{String(n.status || '').replace(/_/g, ' ')}</td>
              </tr>);
          })}
        </tbody>
      </table>
    </div>
  );
}
