'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, PackageOpen, Undo2, RotateCcw } from 'lucide-react';
import { DocCard, Field, PickButton, Pill, TabStrip, Dialog, FindDialog, useMsgBox, fmtDate, fmtNum, isoDay, type PillTone } from '@/components/workspace/controls';
import { useDocToolbar, type DocMode } from '@/components/workspace/toolbar';
import { PdfPreview, type PdfRequest } from '@/components/workspace/PdfPreview';
import { DocList } from '@/components/workspace/DocList';
import { DocumentFlow } from '@/components/workspace/DocumentFlow';

// Goods Receipt (GRN) screen: opens on the list of receipts. New receives goods against an ordered purchase order:
// the pending quantity of each line is filled in and can be lowered for a short delivery. Received goods wait in
// quarantine until inward QC splits each line into accepted, scrap and return; accepted goods are then put away
// into a storage location. Goods already in stock can be sent back to the vendor (a debit note is posted).
// A GRN is not edited once saved: what arrived is a fact; corrections go through QC or a return.

const RECEIVE_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'SUPPLY_CHAIN_MANAGER', 'QUALITY_INSPECTOR'];
const QC_ROLES = ['ADMIN', 'MANAGER', 'QUALITY_INSPECTOR'];
const RETURN_ROLES = ['ADMIN', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const STATUS_TEXT: Record<string, string> = { QUARANTINE: 'In Quarantine', QC_DONE: 'QC Done', PUT_AWAY: 'Put Away' };
const TONE: Record<string, PillTone> = { QUARANTINE: 'warn', QC_DONE: 'info', PUT_AWAY: 'ok' };
const QC_TEXT: Record<string, string> = { PENDING: 'QC pending', ACCEPTED: 'Accepted', PARTIAL: 'Part accepted', REJECTED: 'Rejected' };
const QC_TONE: Record<string, PillTone> = { PENDING: 'warn', ACCEPTED: 'ok', PARTIAL: 'info', REJECTED: 'bad' };
const TABS = ['Items', 'Tests', 'Returns', 'Linked Documents'];
const DEFAULT_TESTS = ['Dimensions', 'Tensile', 'Visual'];
const CHECKS = [['quantityVerified', 'Quantity verified'], ['packingIntact', 'Packing intact'], ['documentsVerified', 'Documents verified']] as const;

type Check = typeof CHECKS[number][0];
interface Entry { qty: string; lot: string; mfg: string; expiry: string }
interface Draft { poId: string; gateEntryNo: string; vendorChallanNo: string; vehicleNo: string; checklist: Record<Check, boolean>; lines: Record<string, Entry> }
interface QcRow { index: number; accepted: string; scrap: string; ret: string; tests: { name: string; standard: string; actual: string; result: string }[] }

const idOf = (v: any) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : '');
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const q3 = (n: number) => fmtNum(n, 3).replace(/\.?0+$/, '');
const emptyDraft = (): Draft => ({ poId: '', gateEntryNo: '', vendorChallanNo: '', vehicleNo: '', checklist: { quantityVerified: false, packingIntact: false, documentsVerified: false }, lines: {} });
const nonStock = (p: any) => p?.stockType === 'NON_STOCK' || p?.productType === 'SERVICE';
const openLinesOf = (po: any): any[] => (po?.items || []).map((i: any) => ({ ...i, received: i.receivedQuantity || 0, open: r4(i.quantity - (i.receivedQuantity || 0)) })).filter((i: any) => i.open > 0);
/** the pending quantity of every open line, as the quantity to receive */
const prefill = (po: any): Record<string, Entry> => Object.fromEntries(openLinesOf(po).map((l: any) => [idOf(l.product), { qty: String(l.open), lot: '', mfg: '', expiry: '' }]));
const where = (i: any) => (i.putAway?.warehouse ? [i.putAway.warehouse, i.putAway.zone, i.putAway.rack, i.putAway.bin].filter(Boolean).join(' / ') : '');

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `The server answered ${res.status}.`);
  return data;
}
const send = (url: string, method: string, body: any) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(readJson);

export default function GoodsReceiptScreen() {
  const msg = useMsgBox();
  const router = useRouter();
  const [role, setRole] = useState('');
  const [list, setList] = useState<any[]>([]);          // every GRN, oldest first
  const [pos, setPos] = useState<any[]>([]);            // purchase orders that can still be received
  const [locations, setLocations] = useState<any[]>([]);
  const [doc, setDoc] = useState<any>(null);
  const [mode, setMode] = useState<DocMode>('view');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [tab, setTab] = useState(TABS[0]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [listing, setListing] = useState(false);
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const [dialog, setDialog] = useState<null | 'locate' | 'po'>(null);
  const [qc, setQc] = useState<QcRow[] | null>(null);
  const [place, setPlace] = useState<{ index: number; w: string; zone: string; rack: string; bin: string } | null>(null);
  const [ret, setRet] = useState<{ qty: Record<number, string>; billId: string; reason: string; bills: any[] } | null>(null);

  const editing = mode !== 'view';
  const canReceive = RECEIVE_ROLES.includes(role);

  // ---------- loading ----------

  const loadList = useCallback(async () => {
    const data = await readJson(await fetch('/api/grn'));
    const asc = [...data].reverse();
    setList(asc);
    return asc;
  }, []);
  const loadPos = useCallback(async () => {
    const data = await readJson(await fetch('/api/purchase')).catch(() => []);
    const open = (Array.isArray(data) ? data : []).filter((p: any) => ['ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status));
    setPos(open);
    return open;
  }, []);

  const show = useCallback(async (id: string) => {
    const g = await readJson(await fetch(`/api/grn/${id}`));
    setDoc(g);
    setMode('view');
    setListing(false);
    window.history.replaceState(null, '', `?id=${g._id}`);
  }, []);

  const startNew = useCallback((po?: any) => {
    setDraft({ ...emptyDraft(), poId: po ? String(po._id) : '', lines: po ? prefill(po) : {} });
    setMode('new');
    setListing(false);
    setTab(TABS[0]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, locs] = await Promise.all([
          fetch('/api/auth/session').then(r => r.json()).catch(() => ({})),
          fetch('/api/storage-locations').then(readJson).catch(() => []),
        ]);
        const myRole = session?.user?.role || '';
        setRole(myRole);
        setLocations((Array.isArray(locs) ? locs : []).filter((l: any) => l.isActive !== false));
        const [all, open] = await Promise.all([loadList(), loadPos()]);
        const q = new URLSearchParams(window.location.search);
        // ?po=<id> (Receive from a purchase order) opens a new receipt for that order
        const po = q.get('po') && open.find((p: any) => String(p._id) === q.get('po'));
        if (po && RECEIVE_ROLES.includes(myRole)) { startNew(po); return; }
        const start = q.get('id') && all.find(g => String(g._id) === q.get('id'));
        if (start) await show(String(start._id)); else setListing(true);
      } catch (e: any) {
        setLoadError(e.message);
      }
    })();
  }, [loadList, loadPos, show, startNew]);

  const reload = async (id: string) => { await Promise.all([loadList(), loadPos()]); await show(id); };

  // ---------- receiving ----------

  const po = pos.find(p => String(p._id) === draft.poId);
  const openLines = useMemo<any[]>(() => openLinesOf(po), [po]);
  const setEntry = (pid: string, patch: Partial<Entry>) => setDraft(d => ({ ...d, lines: { ...d.lines, [pid]: { ...d.lines[pid], ...patch } } }));

  const save = async () => {
    if (!draft.poId) { msg.error('Choose the purchase order the goods came against.'); return; }
    for (const [k, label] of [['gateEntryNo', 'Gate entry no.'], ['vendorChallanNo', 'Vendor challan no.'], ['vehicleNo', 'Vehicle no.']] as const) {
      if (!draft[k].trim()) { msg.error(`Enter the ${label}`); return; }
    }
    if (CHECKS.some(([k]) => !draft.checklist[k])) { msg.error('Complete the physical check first: tick Quantity verified, Packing intact and Documents verified.'); return; }
    const items = openLines.map((l: any) => {
      const e = draft.lines[idOf(l.product)] || { qty: '', lot: '', mfg: '', expiry: '' };
      return { line: l, receivedQty: Number(e.qty) || 0, entry: e };
    });
    if (!items.some(i => i.receivedQty > 0)) { msg.error('Enter the quantity received on at least one line.'); return; }
    const over = items.find(i => i.receivedQty > i.line.open + 1e-9);
    if (over) { msg.error(`${over.line.product?.name}: ${q3(over.receivedQty)} is more than the ${q3(over.line.open)} still pending on the order.`); return; }
    setBusy(true);
    try {
      const saved = await send('/api/grn', 'POST', { poId: draft.poId, gateEntryNo: draft.gateEntryNo.trim(), vendorChallanNo: draft.vendorChallanNo.trim(), vehicleNo: draft.vehicleNo.trim(), checklist: draft.checklist, items: items.map(({ line, receivedQty, entry: e }) => ({ product: idOf(line.product), receivedQty, expiryDate: e.expiry || undefined, supplierBatchNo: e.lot.trim() || undefined, manufacturingDate: e.mfg || undefined })) });
      await reload(String(saved._id));
      msg.info(`Goods receipt ${saved.number} saved.\nThe goods are in quarantine until inward QC decides.`);
    } catch (e: any) {
      msg.error(e.message, 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!(await msg.confirm('Discard this goods receipt?'))) return;
    setMode('view');
    setDraft(emptyDraft());
    if (!doc) setListing(true);
  };

  // ---------- QC, put-away, return ----------

  const items: any[] = doc?.items || [];
  const pendingQc = items.some(i => i.inspection === 'PENDING');
  const canReturn = items.some(i => i.inspection !== 'PENDING' && i.acceptedQty > 0 && !i.nonStock);
  const locOf = (code: string) => locations.find(l => l.code === code);
  const firstPlace = (code: string) => { const l = locOf(code); return { w: code, zone: l?.zones?.[0] || '', rack: l?.racks?.[0] || '', bin: l?.bins?.[0] || '' }; };

  const openQc = () => setQc(items.map((it, index) => ({ index, it })).filter(x => x.it.inspection === 'PENDING')
    .map(({ index, it }) => ({ index, accepted: String(it.receivedQty), scrap: '0', ret: '0', tests: DEFAULT_TESTS.map(name => ({ name, standard: '', actual: '', result: 'PASS' })) })));
  const setQcRow = (n: number, patch: Partial<QcRow>) => setQc(rows => rows && rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  const submitQc = async () => {
    if (!qc) return;
    for (const r of qc) {
      const it = items[r.index], sum = Number(r.accepted) + Number(r.scrap) + Number(r.ret);
      if ([r.accepted, r.scrap, r.ret].some(v => !(Number(v) >= 0))) { msg.error(`${it.product?.name}: enter accepted, scrap and return as numbers, 0 or more.`); return; }
      if (Math.abs(sum - it.receivedQty) > 1e-6) { msg.error(`${it.product?.name}: accepted + scrap + return is ${q3(sum)}; it must equal the ${q3(it.receivedQty)} received.`); return; }
    }
    setBusy(true);
    try {
      await send(`/api/grn/${doc._id}`, 'PATCH', { action: 'inspect', items: qc.map(r => ({ index: r.index, acceptedQty: Number(r.accepted), scrapQty: Number(r.scrap), returnQty: Number(r.ret), tests: r.tests })) });
      setQc(null);
      await reload(String(doc._id));
      msg.info('Inspection recorded.\nReturned quantities raised a return challan and a debit note.');
    } catch (e: any) {
      msg.error(e.message, 'Not recorded');
    } finally {
      setBusy(false);
    }
  };

  const submitPlace = async () => {
    if (!place) return;
    setBusy(true);
    try {
      await send(`/api/grn/${doc._id}`, 'PATCH', { action: 'putaway', index: place.index, warehouse: place.w, zone: place.zone, rack: place.rack, bin: place.bin });
      setPlace(null);
      await reload(String(doc._id));
    } catch (e: any) {
      msg.error(e.message, 'Not put away');
    } finally {
      setBusy(false);
    }
  };

  const openReturn = async () => {
    const bills = await fetch('/api/vendor-bills').then(readJson).catch(() => []);
    setRet({ qty: {}, billId: '', reason: '', bills: (Array.isArray(bills) ? bills : []).filter((b: any) => b.poNumber === doc.poNumber && b.status !== 'CANCELLED') });
  };
  const submitReturn = async () => {
    if (!ret) return;
    const lines = Object.entries(ret.qty).filter(([, q]) => Number(q) > 0).map(([index, q]) => ({ index: Number(index), quantity: Number(q) }));
    if (!lines.length) { msg.error('Enter the quantity to return on at least one line.'); return; }
    if (!ret.reason.trim()) { msg.error('Enter why the goods are going back.'); return; }
    setBusy(true);
    try {
      const r = await send('/api/purchase-returns', 'POST', { grnId: doc._id, billId: ret.billId || undefined, reason: ret.reason.trim(), lines });
      setRet(null);
      await reload(String(doc._id));
      setTab('Returns');
      msg.info(`Return ${r.number || ''} made.\nStock is reduced and a debit note was posted to the vendor.`);
    } catch (e: any) {
      msg.error(e.message, 'Not returned');
    } finally {
      setBusy(false);
    }
  };

  // ---------- command bar ----------

  const at = doc ? list.findIndex(g => String(g._id) === String(doc._id)) : -1;
  const go = (i: number) => { const g = list[i]; if (g) show(String(g._id)).catch(e => msg.error(e.message)); };
  const viewing = !editing && !busy;
  const listed = listing && !editing;
  const findByNumber = (no: string) => {
    const q = no.toLowerCase();
    const hit = list.find(g => String(g.number).toLowerCase() === q) || list.find(g => String(g.number).toLowerCase().endsWith(q));
    if (hit) show(String(hit._id)).catch(e => msg.error(e.message));
    else msg.error(`No goods receipt numbered ${no}.`);
  };
  const pdfReq = (print = false): PdfRequest => ({ url: `/api/grn/${doc._id}/pdf`, title: `Goods receipt ${doc.number}`, print });
  useDocToolbar(listed ? {
    mode, listing: true, position: `${list.length} receipts`, findByNumber,
    actions: { new: !busy && canReceive && (() => startNew()), list: !!doc && (() => show(String(doc._id)).catch(e => msg.error(e.message))) },
  } : {
    mode,
    position: at >= 0 ? `${at + 1} of ${list.length}` : list.length ? `${list.length} receipts` : '',
    actions: {
      first: viewing && list.length > 0 && at !== 0 && (() => go(0)),
      prev: viewing && at > 0 && (() => go(at - 1)),
      next: viewing && at >= 0 && at < list.length - 1 && (() => go(at + 1)),
      last: viewing && list.length > 0 && at !== list.length - 1 && (() => go(list.length - 1)),
      locate: viewing && (() => setDialog('locate')),
      new: viewing && canReceive && (() => startNew()),
      save: editing && !busy && save,
      cancel: editing && !busy && discard,
      preview: viewing && !!doc && (() => setPdf(pdfReq())),
      print: viewing && !!doc && (() => setPdf(pdfReq(true))),
      list: viewing && (() => { setListing(true); window.history.replaceState(null, '', '?view=list'); }),
    },
    findByNumber,
  });

  // ---------- render ----------

  if (listed) return (
    <>
      {loadError && <div className="px-error">{loadError}</div>}
      <DocList title="Goods Receipts (GRN)" fileName="goods-receipts" rows={[...list].reverse()}
        onOpen={g => show(String(g._id)).catch(e => msg.error(e.message))}
        statusOf={g => g.status} statuses={Object.fromEntries(Object.entries(STATUS_TEXT).map(([k, label]) => [k, { label, tone: TONE[k] }]))}
        dateOf={g => g.createdAt}
        empty={<>No goods receipts yet. Press <b>New</b> (Ctrl+N) to receive goods against a purchase order.</>}
        columns={[
          { label: 'GRN No.', width: 150, value: g => <b>{g.number}</b>, text: g => g.number },
          { label: 'Date', width: 100, value: g => fmtDate(g.createdAt), text: g => isoDay(g.createdAt) },
          { label: 'PO No.', width: 150, value: g => g.poNumber },
          { label: 'Vendor', value: g => g.supplier?.name || '' },
          { label: 'Challan No.', width: 130, value: g => g.vendorChallanNo || '' },
          { label: 'Vehicle', width: 120, value: g => g.vehicleNo || '' },
          { label: 'QC Pending', width: 100, num: true, value: g => (g.items || []).filter((i: any) => i.inspection === 'PENDING').length || '' },
          { label: 'Status', width: 140, value: g => <Pill tone={TONE[g.status] || 'plain'}>{STATUS_TEXT[g.status] || g.status}</Pill>, text: g => STATUS_TEXT[g.status] || g.status },
        ]} />
    </>);

  const supplier = mode === 'new' ? po?.supplier : doc?.supplier;
  const statusPill = mode === 'new' ? <Pill tone="new">New</Pill> : doc ? <>
    <Pill tone={TONE[doc.status] || 'plain'}>{STATUS_TEXT[doc.status] || doc.status}</Pill>
    {pendingQc && <Pill tone="warn">Waiting for QC</Pill>}
  </> : undefined;
  const header = (k: 'gateEntryNo' | 'vendorChallanNo' | 'vehicleNo', label: string) => (
    <Field label={label}>
      {mode === 'new'
        ? <input className="px-input" value={draft[k]} maxLength={40} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />
        : <input className="px-input" readOnly value={doc?.[k] || '—'} />}
    </Field>);
  const totalReceived = items.reduce((s, i) => s + (i.receivedQty || 0), 0);
  const value = items.reduce((s, i) => s + (i.receivedQty || 0) * (i.unitPrice || 0), 0);

  return (
    <DocCard kind="Goods Receipt" number={mode === 'new' ? 'New goods receipt' : doc?.number || 'Goods receipts'} status={statusPill}
      meta={doc && mode !== 'new' ? `Received ${fmtDate(doc.createdAt)}${doc.createdBy ? ` by ${doc.createdBy}` : ''}${doc.inspectedBy ? ` · inspected by ${doc.inspectedBy}` : ''}` : undefined}>
      {loadError && <div className="px-doc__section"><div className="px-error">{loadError}</div></div>}

      <div className="px-doc__section px-fields">
        <Field label="Purchase Order" pick={mode === 'new' ? <PickButton onClick={() => setDialog('po')} title="Choose purchase order" /> : undefined}>
          <input className="px-input" readOnly value={mode === 'new' ? po?.poNumber || '' : doc?.poNumber || ''} placeholder={mode === 'new' ? 'Choose the order' : ''}
            onDoubleClick={() => mode === 'new' && setDialog('po')} />
        </Field>
        <Field label="Vendor" wide><input className="px-input" readOnly value={supplier ? `${supplier.name}${supplier.code ? ` (${supplier.code})` : ''}` : ''} /></Field>
        <Field label="Vendor GSTIN"><input className="px-input" readOnly value={supplier?.gstin || '—'} /></Field>
        {header('gateEntryNo', 'Gate Entry No.')}
        {header('vendorChallanNo', 'Vendor Challan No.')}
        {header('vehicleNo', 'Vehicle No.')}
        <Field label="Receipt Date"><input className="px-input" readOnly value={mode === 'new' ? fmtDate(new Date()) : fmtDate(doc?.createdAt)} /></Field>
      </div>

      <div className="px-doc__section px-actions">
        {CHECKS.map(([k, label]) => (
          <label key={k} className="px-check">
            <input type="checkbox" disabled={mode !== 'new'} checked={mode === 'new' ? draft.checklist[k] : !!doc?.checklist?.[k]}
              onChange={e => setDraft(d => ({ ...d, checklist: { ...d.checklist, [k]: e.target.checked } }))} />{label}
          </label>))}
        {mode === 'new' && po && <button className="px-btn" style={{ marginLeft: 'auto' }} onClick={() => setDraft(d => ({ ...d, lines: prefill(po) }))}><RotateCcw />Reset to pending</button>}
        {!editing && doc && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {pendingQc && QC_ROLES.includes(role) && <button className="px-btn px-btn--accent" disabled={busy} onClick={openQc}><ClipboardCheck />Inward QC</button>}
          {canReturn && RETURN_ROLES.includes(role) && <button className="px-btn" disabled={busy} onClick={openReturn}><Undo2 />Return to Vendor</button>}
        </span>}
      </div>

      {mode === 'new' && po && openLines.some((l: any) => l.received > 0) && (
        <div className="px-doc__section"><div className="px-note">Part of this order was received earlier. Only what is still pending is shown; the order is fully received when nothing is left pending.</div></div>)}

      <TabStrip tabs={mode === 'new' ? ['Items'] : TABS} active={mode === 'new' ? 'Items' : tab} onChange={setTab} />
      <div className="px-tabpanel">
        {(mode === 'new' || tab === 'Items') && (mode === 'new' ? (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead><tr>
                <th className="ctr" style={{ width: 44 }}>#</th><th style={{ minWidth: 240 }}>Item</th><th className="num">Ordered</th><th className="num">Received Before</th><th className="num">Pending</th>
                <th className="num" style={{ width: 130 }}>Receiving Now</th><th style={{ width: 150 }}>Supplier Batch</th><th style={{ width: 150 }}>Mfg Date</th><th style={{ width: 150 }}>Expiry</th>
              </tr></thead>
              <tbody>
                {openLines.map((l: any, n: number) => {
                  const pid = idOf(l.product), e = draft.lines[pid] || { qty: '', lot: '', mfg: '', expiry: '' }, got = Number(e.qty) || 0, stocked = !nonStock(l.product);
                  return (
                    <tr key={pid}>
                      <td className="ctr">{n + 1}</td>
                      <td><span className="px-item"><b>{l.product?.name}</b><small>{l.product?.sku}{!stocked ? ' · not stocked (expensed)' : ''}</small></span></td>
                      <td className="num" title={l.orderFactor ? `${q3(l.quantity / l.orderFactor)} ${l.orderUnit}` : undefined}>{q3(l.quantity)} {l.product?.uom}</td>
                      <td className="num">{q3(l.received)}</td>
                      <td className="num"><b>{q3(l.open)}</b></td>
                      <td className="edit" title={got > l.open ? `More than the ${q3(l.open)} pending` : got > 0 && got < l.open ? `${q3(l.open - got)} will stay pending` : undefined}>
                        <input className="num" inputMode="decimal" value={e.qty} onChange={ev => setEntry(pid, { qty: ev.target.value })} aria-label={`${l.product?.name} receiving now`}
                          style={got > l.open ? { color: 'var(--px-bad)' } : undefined} />
                      </td>
                      <td className={stocked ? 'edit' : ''}>{stocked ? <input value={e.lot} maxLength={40} placeholder="as on label" onChange={ev => setEntry(pid, { lot: ev.target.value })} aria-label={`${l.product?.name} supplier batch`} /> : '—'}</td>
                      <td className={stocked ? 'edit' : ''}>{stocked ? <input type="date" value={e.mfg} max={isoDay(new Date())} onChange={ev => setEntry(pid, { mfg: ev.target.value })} aria-label={`${l.product?.name} manufacturing date`} /> : '—'}</td>
                      <td className={stocked ? 'edit' : ''}>{stocked ? <input type="date" value={e.expiry} onChange={ev => setEntry(pid, { expiry: ev.target.value })} aria-label={`${l.product?.name} expiry`} /> : '—'}</td>
                    </tr>);
                })}
              </tbody>
            </table>
            {!po && <div className="px-empty">Choose the purchase order first. Its pending lines are filled in here.</div>}
            {po && !openLines.length && <div className="px-empty">Nothing is pending on {po.poNumber}.</div>}
          </div>
        ) : (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead><tr>
                <th className="ctr" style={{ width: 44 }}>#</th><th style={{ minWidth: 220 }}>Item</th><th className="num">Received</th><th>Batch</th><th>Supplier Batch</th><th>Mfg</th><th>Expiry</th>
                <th>QC</th><th className="num">Accepted</th><th className="num">Scrap</th><th className="num">Return</th><th>Location</th>
              </tr></thead>
              <tbody>
                {items.map((it, n) => (
                  <tr key={n}>
                    <td className="ctr">{n + 1}</td>
                    <td><span className="px-item"><b>{it.product?.name}</b><small>{it.product?.sku}{it.product?.hsnCode ? ` · HSN ${it.product.hsnCode}` : ''}</small></span></td>
                    <td className="num">{q3(it.receivedQty)} {it.product?.uom}</td>
                    <td>{it.batch?.batchNumber || '—'}</td>
                    <td>{it.supplierBatchNo || it.batch?.supplierBatchNo || '—'}</td>
                    <td>{fmtDate(it.manufacturingDate) || '—'}</td>
                    <td>{fmtDate(it.batch?.expiryDate || it.expiryDate) || '—'}</td>
                    <td><Pill tone={QC_TONE[it.inspection] || 'plain'}>{QC_TEXT[it.inspection] || it.inspection}</Pill></td>
                    <td className="num">{it.inspection === 'PENDING' ? '' : q3(it.acceptedQty)}</td>
                    <td className="num">{it.inspection === 'PENDING' ? '' : q3(it.scrapQty)}</td>
                    <td className="num">{it.inspection === 'PENDING' ? '' : q3(it.returnQty)}</td>
                    <td>{where(it) || (it.inspection === 'PENDING' ? <span className="px-muted">Quarantine</span>
                      : it.nonStock ? <span className="px-muted">Not stocked</span>
                      : it.acceptedQty > 0 ? <button className="px-btn" disabled={busy || !locations.length || !RECEIVE_ROLES.includes(role)} title={locations.length ? undefined : 'No active storage location. Add one in Masters.'}
                        onClick={() => setPlace({ index: n, ...firstPlace(locations[0].code) })}><PackageOpen />Put away</button> : '—')}</td>
                  </tr>))}
              </tbody>
            </table>
            {!items.length && <div className="px-empty">{list.length ? 'Choose a goods receipt from the list.' : 'No goods receipts yet.'}</div>}
          </div>))}

        {mode !== 'new' && tab === 'Tests' && (items.some(i => (i.tests || []).length) ? (
          <div className="px-table-wrap">
            <table className="px-table">
              <thead><tr><th>Item</th><th>Test</th><th>Standard</th><th>Actual</th><th>Result</th></tr></thead>
              <tbody>{items.flatMap((it, n) => (it.tests || []).map((t: any, k: number) => (
                <tr key={`${n}-${k}`}><td>{k === 0 ? it.product?.name : ''}</td><td>{t.name}</td><td>{t.standard || '—'}</td><td>{t.actual || '—'}</td>
                  <td><Pill tone={t.result === 'FAIL' ? 'bad' : 'ok'}>{t.result}</Pill></td></tr>)))}</tbody>
            </table>
          </div>) : <div className="px-note">{pendingQc ? 'Test results are recorded at inward QC.' : 'No test results were recorded for this receipt.'}</div>)}

        {mode !== 'new' && tab === 'Returns' && ((doc?.returns || []).length ? (
          <div className="px-table-wrap" style={{ maxWidth: 820 }}>
            <table className="px-table">
              <thead><tr><th>Return No.</th><th>Date</th><th>After Billing</th><th>Status</th><th className="num">Value (₹)</th></tr></thead>
              <tbody>{doc.returns.map((r: any) => (
                <tr key={r._id} onDoubleClick={() => setPdf({ url: `/api/print/purchase-return/${r._id}`, title: `Return ${r.number}` })} style={{ cursor: 'pointer' }} title="Double-click to view">
                  <td><b>{r.number}</b></td><td>{fmtDate(r.createdAt)}</td><td>{r.afterBilling ? 'Yes' : 'No'}</td><td>{String(r.status || '').replace(/_/g, ' ')}</td><td className="num">{fmtNum(r.totalAmount)}</td>
                </tr>))}</tbody>
            </table>
          </div>) : <div className="px-note">Nothing from this receipt has been returned to the vendor.</div>)}

        {mode !== 'new' && tab === 'Linked Documents' && <DocumentFlow key={doc?._id || 'none'} type="GRN" what="goods receipt" id={doc?._id || null}
          onOpenSelf={id => show(id).catch(e => msg.error(e.message))} onOpen={href => router.push(href)} />}
      </div>

      {mode !== 'new' && doc && (
        <div className="px-bottom">
          <div />
          <div className="px-summary" aria-label="Totals">
            <div><span>{items.length} line{items.length === 1 ? '' : 's'}, total quantity received</span><b>{q3(totalReceived)}</b></div>
            <div className="is-total"><span>Value at order rate</span><span>₹ {fmtNum(value)}</span></div>
          </div>
        </div>)}

      {/* ---------- dialogs ---------- */}

      {pdf && <PdfPreview req={pdf} onClose={() => setPdf(null)} />}
      {dialog === 'locate' && (
        <FindDialog title="Find Goods Receipt" rows={[...list].reverse()} onClose={() => setDialog(null)}
          onPick={g => { setDialog(null); show(String(g._id)).catch(e => msg.error(e.message)); }}
          columns={[
            { label: 'GRN No.', width: 150, value: g => g.number },
            { label: 'Date', width: 95, value: g => fmtDate(g.createdAt) },
            { label: 'PO No.', width: 150, value: g => g.poNumber },
            { label: 'Vendor', value: g => g.supplier?.name || '' },
            { label: 'Status', width: 130, value: g => STATUS_TEXT[g.status] || g.status },
          ]} />)}
      {dialog === 'po' && (
        <FindDialog title="Choose Purchase Order" rows={pos} onClose={() => setDialog(null)} empty="No purchase order is waiting for goods. Orders must be approved before goods can be received."
          onPick={p => { setDraft(d => ({ ...d, poId: String(p._id), lines: prefill(p) })); setDialog(null); }}
          columns={[
            { label: 'PO No.', width: 150, value: p => p.poNumber },
            { label: 'Date', width: 95, value: p => fmtDate(p.orderDate) },
            { label: 'Vendor', value: p => p.supplier?.name || '' },
            { label: 'Expected', width: 100, value: p => fmtDate(p.expectedDeliveryDate) || '—' },
            { label: 'Lines Pending', width: 110, num: true, value: p => openLinesOf(p).length },
          ]} />)}

      {qc && (
        <Dialog title={`Inward QC · ${doc.number}`} onClose={() => setQc(null)} width={860}
          buttons={<><button className="px-btn" onClick={() => setQc(null)}>Cancel</button><button className="px-btn px-btn--primary" disabled={busy} onClick={submitQc}>Record inspection</button></>}>
          <div className="flex flex-col gap-3">
            <div className="px-note">Split each line into accepted (goes to stock after put-away), scrap (kept out, not returnable) and return (goes back with a debit note). The three must add up to what was received.</div>
            {qc.map((r, n) => {
              const it = items[r.index], sum = Number(r.accepted) + Number(r.scrap) + Number(r.ret);
              return (
                <div key={r.index} className="px-table-wrap" style={{ padding: 10 }}>
                  <div style={{ marginBottom: 8 }}><b>{it.product?.name}</b> <span className="px-muted">received {q3(it.receivedQty)} {it.product?.uom}</span>
                    {Math.abs(sum - it.receivedQty) > 1e-6 && <span style={{ color: 'var(--px-bad)', marginLeft: 8 }}>adds up to {q3(sum)}</span>}</div>
                  <div className="px-fields" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    <Field label="Accepted"><input className="px-input" inputMode="decimal" value={r.accepted} onChange={e => setQcRow(n, { accepted: e.target.value })} /></Field>
                    <Field label="Scrap (not returnable)"><input className="px-input" inputMode="decimal" value={r.scrap} onChange={e => setQcRow(n, { scrap: e.target.value })} /></Field>
                    <Field label="Return to vendor"><input className="px-input" inputMode="decimal" value={r.ret} onChange={e => setQcRow(n, { ret: e.target.value })} /></Field>
                  </div>
                  <table className="px-table" style={{ marginTop: 8 }}>
                    <thead><tr><th style={{ width: 140 }}>Test</th><th>Standard</th><th>Actual</th><th style={{ width: 100 }}>Result</th></tr></thead>
                    <tbody>{r.tests.map((t, k) => {
                      const setT = (patch: Partial<typeof t>) => setQcRow(n, { tests: r.tests.map((x, m) => (m === k ? { ...x, ...patch } : x)) });
                      return (
                        <tr key={k}>
                          <td className="edit"><input value={t.name} onChange={e => setT({ name: e.target.value })} aria-label="Test" /></td>
                          <td className="edit"><input value={t.standard} onChange={e => setT({ standard: e.target.value })} aria-label={`${t.name} standard`} /></td>
                          <td className="edit"><input value={t.actual} onChange={e => setT({ actual: e.target.value })} aria-label={`${t.name} actual`} /></td>
                          <td className="edit"><select value={t.result} onChange={e => setT({ result: e.target.value })} aria-label={`${t.name} result`}><option>PASS</option><option>FAIL</option></select></td>
                        </tr>);
                    })}</tbody>
                  </table>
                </div>);
            })}
          </div>
        </Dialog>)}

      {place && (
        <Dialog title={`Put away · ${items[place.index]?.product?.name}`} onClose={() => setPlace(null)} width={520}
          buttons={<><button className="px-btn" onClick={() => setPlace(null)}>Cancel</button><button className="px-btn px-btn--primary" disabled={busy} onClick={submitPlace}>Put away</button></>}>
          <div className="px-fields" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <Field label="Storage Location">
              <select className="px-input" value={place.w} onChange={e => setPlace({ ...place, ...firstPlace(e.target.value) })}>
                {locations.map(l => <option key={l.code} value={l.code}>{l.code} · {l.name}</option>)}
              </select>
            </Field>
            {(['zone', 'rack', 'bin'] as const).map(level => {
              const options: string[] = locOf(place.w)?.[`${level}s`] || [];
              return (
                <Field key={level} label={level[0].toUpperCase() + level.slice(1)}>
                  {options.length
                    ? <select className="px-input" value={place[level]} onChange={e => setPlace({ ...place, [level]: e.target.value })}>{options.map(o => <option key={o}>{o}</option>)}</select>
                    : <input className="px-input" value={place[level]} placeholder="not used" onChange={e => setPlace({ ...place, [level]: e.target.value })} />}
                </Field>);
            })}
          </div>
          <div className="px-note" style={{ marginTop: 10 }}>The accepted quantity is released for use once it is put away.</div>
        </Dialog>)}

      {ret && (
        <Dialog title={`Return to Vendor · ${doc.number}`} onClose={() => setRet(null)} width={680}
          buttons={<><button className="px-btn" onClick={() => setRet(null)}>Cancel</button><button className="px-btn px-btn--primary" disabled={busy} onClick={submitReturn}>Return goods</button></>}>
          <div className="flex flex-col gap-3">
            <div className="px-note">Goods already billed need the bill they were billed on, so its GST is credited back.</div>
            <div className="px-table-wrap">
              <table className="px-table">
                <thead><tr><th>Item</th><th className="num">Accepted from this receipt</th><th className="num" style={{ width: 140 }}>Return</th></tr></thead>
                <tbody>{items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.product?.name}</td><td className="num">{q3(it.acceptedQty)} {it.product?.uom}</td>
                    <td className={it.inspection !== 'PENDING' && it.acceptedQty > 0 && !it.nonStock ? 'edit' : 'num'}>{it.inspection !== 'PENDING' && it.acceptedQty > 0 && !it.nonStock
                      ? <input className="num" inputMode="decimal" value={ret.qty[i] ?? ''} onChange={e => setRet({ ...ret, qty: { ...ret.qty, [i]: e.target.value } })} aria-label={`${it.product?.name} return quantity`} />
                      : '—'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="px-fields" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Field label="Vendor Bill (if billed)">
                <select className="px-input" value={ret.billId} onChange={e => setRet({ ...ret, billId: e.target.value })}>
                  <option value="">Not billed yet</option>
                  {ret.bills.map((b: any) => <option key={b._id} value={b._id}>{b.invoiceNumber}{b.vendorBillNumber ? ` · their ${b.vendorBillNumber}` : ''} · ₹{fmtNum(b.totalAmount)}</option>)}
                </select>
              </Field>
              <Field label="Reason"><input className="px-input" value={ret.reason} maxLength={200} onChange={e => setRet({ ...ret, reason: e.target.value })} /></Field>
            </div>
          </div>
        </Dialog>)}
    </DocCard>
  );
}
