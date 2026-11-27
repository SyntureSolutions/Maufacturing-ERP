'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TCS_GOODS } from '@/lib/tcs';
import { DocCard, Field, PickButton, Pill, TabStrip, FindDialog, useMsgBox, fmtDate, fmtNum, isoDay } from '@/components/workspace/controls';
import { useDocToolbar, type DocMode } from '@/components/workspace/toolbar';
import { DocList } from '@/components/workspace/DocList';
import { HsnPicker } from '@/components/workspace/HsnPicker';

// Item master: one screen for an item's identity, how it is sold and bought (units, conversion, rates, ledgers),
// how it is stocked and planned, and its GST classification. Saving goes to /api/products, which checks every field.
// Units of sale/purchase, conversions, stock type, scrap flag, rack and ledgers are stored here and shown on the item;
// documents (PO, GRN, SO) and postings do not use them yet (see docs/Pending-UI-and-API.md).

const WRITE_ROLES = ['ADMIN', 'MANAGER'];
const TYPES: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material', SEMI_FINISHED: 'Semi-finished', FINISHED_GOOD: 'Finished Good', PACKAGING: 'Packing Material',
  TRADING_GOOD: 'Trading Good', SPARE_PART: 'Spare / Stores', SERVICE: 'Service',
};
const UNITS = ['pcs', 'nos', 'unit', 'set', 'pair', 'box', 'carton', 'roll', 'sheet', 'kg', 'g', 'ton', 'ltr', 'ml', 'm', 'cm', 'mm', 'sq m'];
const GST_RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40]; // 40% is the slab added in the September 2025 rate change
const MRP_TYPES: Record<string, string> = { PD: 'Plan by MRP', VB: 'Reorder point', ND: 'Do not plan' };
const TABS = ['General', 'Sales & Purchase', 'Stock & Planning', 'Tax', 'Stock on Hand'];

type Draft = Record<string, string | boolean>;
const TEXT = ['sku', 'name', 'category', 'description', 'remarks', 'barcode', 'oemName', 'oemPartNumber', 'deactivatedFrom', 'salesUom', 'salesAccount',
  'purchaseUom', 'purchaseAccount', 'uom', 'stockType', 'storageBin', 'rackNo', 'mrpType', 'plant', 'hsnCode', 'hsnDescription', 'valuationClass', 'priceControl', 'productType', 'tcsGoods'];
const NUMS = ['grossWeight', 'netWeight', 'salesConversion', 'price', 'minSellingPrice', 'purchaseConversion', 'purchasePrice', 'minStockLevel', 'safetyStock', 'plannedDeliveryDays', 'gstRate', 'tcsRate'];
const FLAGS = ['isActive', 'includeInValuation', 'isScrap', 'batchManaged'];

const emptyDraft = (): Draft => ({
  productType: 'RAW_MATERIAL', sku: '', name: '', category: '', description: '', remarks: '', barcode: '', oemName: '', oemPartNumber: '', grossWeight: '', netWeight: '',
  isActive: true, deactivatedFrom: '', salesUom: '', salesConversion: '1', price: '', minSellingPrice: '', salesAccount: '', purchaseUom: '', purchaseConversion: '1',
  purchasePrice: '', purchaseAccount: '', uom: 'pcs', stockType: 'STOCKABLE', includeInValuation: true, isScrap: false, batchManaged: true, storageBin: '', rackNo: '',
  minStockLevel: '0', safetyStock: '0', plannedDeliveryDays: '', mrpType: 'PD', plant: '', hsnCode: '', hsnDescription: '', gstRate: '18', valuationClass: '', priceControl: 'V', tcsGoods: '', tcsRate: '',
});

function toDraft(p: any): Draft {
  const d = emptyDraft();
  // a field the item does not have yet (made before it existed) keeps the default, e.g. stockType STOCKABLE
  for (const k of TEXT) d[k] = k === 'deactivatedFrom' ? isoDay(p[k]) : k === 'category' ? String(p.category?._id || p.category || '') : p[k] ?? d[k];
  for (const k of NUMS) d[k] = p[k] === undefined || p[k] === null ? '' : String(p[k]);
  for (const k of FLAGS) d[k] = p[k] === undefined ? (d[k] as boolean) : !!p[k];
  if (!d.salesConversion) d.salesConversion = '1';
  if (!d.purchaseConversion) d.purchaseConversion = '1';
  return d;
}

/** The draft as the API takes it: numbers as numbers, blanks left out (or cleared when editing). */
function toBody(d: Draft, editing: boolean) {
  const body: Record<string, any> = {};
  for (const k of TEXT) { const v = String(d[k] ?? '').trim(); if (v || editing) body[k] = v === '' && k === 'deactivatedFrom' ? null : v; }
  for (const k of NUMS) {
    const v = String(d[k] ?? '').trim();
    if (v !== '') body[k] = Number(v);
    // a cleared amount or level is zero (other code reads these as numbers); a cleared weight or lead time is unknown
    else if (['minStockLevel', 'safetyStock', 'price', 'purchasePrice'].includes(k)) body[k] = 0;
    else if (editing && !['salesConversion', 'purchaseConversion', 'gstRate'].includes(k)) body[k] = null;
  }
  for (const k of FLAGS) body[k] = !!d[k];
  if (!body.category) delete body.category;
  return body;
}

async function call(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function ItemMasterScreen() {
  const msg = useMsgBox();
  const [role, setRole] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[] | null>(null); // null: this role cannot read the chart of accounts
  const [doc, setDoc] = useState<any>(null);
  const [mode, setMode] = useState<DocMode>('view');
  const [d, setD] = useState<Draft>(emptyDraft);
  const [tab, setTab] = useState(TABS[0]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<null | 'locate' | 'hsn'>(null);
  const [listing, setListing] = useState(false);     // showing the list of items, not one item
  const [batches, setBatches] = useState<any[] | null>(null);
  const [stock, setStock] = useState<any>(null); // this item's line from Stock by Item

  const editing = mode !== 'view';
  const canWrite = WRITE_ROLES.includes(role);
  const set = (patch: Draft) => setD(x => ({ ...x, ...patch }));

  const loadList = useCallback(async () => {
    const r = await call('/api/products');
    if (!r.ok) throw new Error(r.data?.error || `Items could not be loaded (${r.status}).`);
    const sorted = [...r.data].sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    setList(sorted);
    return sorted;
  }, []);

  const show = useCallback(async (id: string) => {
    const r = await call(`/api/products/${id}`);
    if (!r.ok) throw new Error(r.data?.error || 'Item not found.');
    setDoc(r.data);
    setD(toDraft(r.data));
    setMode('view');
    setListing(false);
    setBatches(null);
    setStock(null);
    call(`/api/inventory/stock?product=${r.data._id}`).then(x => setStock(x.ok && Array.isArray(x.data) ? x.data[0] || null : null));
    window.history.replaceState(null, '', `?id=${r.data._id}`);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, cats, accs] = await Promise.all([
          fetch('/api/auth/session').then(r => r.json()).catch(() => ({})),
          call('/api/categories'),
          call('/api/accounts'),
        ]);
        const myRole = session?.user?.role || '';
        setRole(myRole);
        setCategories(cats.ok && Array.isArray(cats.data) ? cats.data : []);
        setAccounts(accs.ok && Array.isArray(accs.data) ? accs.data : null);
        const all = await loadList();
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') === '1' && WRITE_ROLES.includes(myRole)) { setD(emptyDraft()); setMode('new'); return; }
        const wanted = params.get('id');
        const start = wanted && all.find(p => String(p._id) === wanted);
        if (start) await show(String(start._id)); else setListing(true);
      } catch (e: any) {
        setLoadError(e.message);
      }
    })();
  }, [loadList, show]);

  // stock on hand is read when its tab is opened
  useEffect(() => {
    if (tab !== 'Stock on Hand' || !doc || batches) return;
    call(`/api/inventory/batches?product=${doc._id}`).then(r => setBatches(r.ok && Array.isArray(r.data) ? r.data.filter((b: any) => String(b.product?._id || b.product) === String(doc._id)) : []));
  }, [tab, doc, batches]);

  const isService = d.productType === 'SERVICE';
  const setKind = (service: boolean) => service
    ? set({ productType: 'SERVICE', stockType: 'NON_STOCK', includeInValuation: false, batchManaged: false })
    : set({ productType: d.productType === 'SERVICE' ? 'RAW_MATERIAL' : d.productType, stockType: 'STOCKABLE', includeInValuation: true });

  // ---------- save / delete ----------

  const save = async () => {
    for (const [k, label] of [['sku', 'Item code'], ['name', 'Item name'], ['category', 'Category'], ['uom', 'Stock unit']] as const) {
      if (!String(d[k] || '').trim()) { msg.error(`${label} is required.`); return; }
    }
    for (const [k, label] of [['salesConversion', 'Sales'], ['purchaseConversion', 'Purchase']] as const) {
      if (!(Number(d[k]) > 0)) { msg.error(`${label} conversion must be more than zero: how many ${d.uom || 'stock units'} are in one ${label.toLowerCase()} unit.`); return; }
    }
    setBusy(true);
    try {
      const r = mode === 'new' ? await call('/api/products', 'POST', toBody(d, false)) : await call(`/api/products/${doc._id}`, 'PATCH', toBody(d, true));
      if (!r.ok) { msg.error(r.data?.error || `Not saved (${r.status}).`, 'Not saved'); return; }
      await loadList();
      await show(String(r.data._id));
      msg.info(`Item ${r.data.sku} saved.`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!doc || !(await msg.confirm(`Delete item ${doc.sku} – ${doc.name}?`))) return;
    setBusy(true);
    try {
      const r = await call(`/api/products/${doc._id}`, 'DELETE');
      if (r.ok) {
        await loadList();
        setDoc(null); setD(emptyDraft()); setListing(true);
        window.history.replaceState(null, '', '?view=list');
        msg.info(`Item ${doc.sku} deleted.`);
        return;
      }
      if (r.status === 409 && (await msg.confirm(`${r.data.error}\n\nMark it inactive from today instead?`))) {
        const u = await call(`/api/products/${doc._id}`, 'PATCH', { isActive: false, deactivatedFrom: isoDay(new Date()) });
        if (!u.ok) { msg.error(u.data?.error || 'Not changed.'); return; }
        await loadList();
        await show(String(doc._id));
        return;
      }
      if (!r.ok && r.status !== 409) msg.error(r.data?.error || `Not deleted (${r.status}).`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- command bar ----------

  const pos = doc ? list.findIndex(p => String(p._id) === String(doc._id)) : -1;
  const go = (i: number) => { const p = list[i]; if (p) show(String(p._id)).catch(e => msg.error(e.message)); };
  const viewing = !editing && !busy;
  const findByNumber = (no: string) => {
    const q = no.toLowerCase();
    const hit = list.find(p => String(p.sku).toLowerCase() === q) || list.find(p => String(p.sku).toLowerCase().includes(q) || String(p.name).toLowerCase().includes(q));
    if (hit) show(String(hit._id)).catch(e => msg.error(e.message));
    else msg.error(`No item with code or name "${no}".`);
  };
  const listed = listing && !editing;   // New leaves the list by switching to new mode; Discard comes back to it
  useDocToolbar(listed ? {
    mode, listing: true, position: `${list.length} items`, findByNumber,
    actions: { new: !busy && canWrite && (() => { setD(emptyDraft()); setMode('new'); setTab(TABS[0]); }), list: !!doc && (() => show(String(doc._id)).catch(e => msg.error(e.message))) },
  } : {
    mode,
    position: pos >= 0 ? `${pos + 1} of ${list.length}` : list.length ? `${list.length} items` : '',
    deleteLabel: 'Delete',
    actions: {
      first: viewing && pos > 0 && (() => go(0)),
      prev: viewing && pos > 0 && (() => go(pos - 1)),
      next: viewing && pos >= 0 && pos < list.length - 1 && (() => go(pos + 1)),
      last: viewing && pos >= 0 && pos < list.length - 1 && (() => go(list.length - 1)),
      locate: viewing && (() => setDialog('locate')),
      new: viewing && canWrite && (() => { setD(emptyDraft()); setMode('new'); setTab(TABS[0]); }),
      edit: viewing && canWrite && !!doc && (() => setMode('edit')),
      save: editing && !busy && save,
      cancel: editing && !busy && (async () => { if (await msg.confirm('Discard the changes made to this item?')) { setD(doc ? toDraft(doc) : emptyDraft()); setMode('view'); } }),
      delete: viewing && canWrite && !!doc && remove,
      copy: viewing && canWrite && !!doc && (() => { setD({ ...toDraft(doc), sku: '', barcode: '', name: `${doc.name} (copy)` }); setMode('new'); setTab(TABS[0]); }),
      list: viewing && (() => { setListing(true); window.history.replaceState(null, '', '?view=list'); }),
    },
    findByNumber,
  });

  // ---------- small field helpers ----------

  const ro = !editing;
  const text = (k: string, props: Record<string, any> = {}) => <input className="px-input" readOnly={ro} value={String(d[k] ?? '')} onChange={e => set({ [k]: e.target.value })} {...props} />;
  const numIn = (k: string, props: Record<string, any> = {}) => <input className="px-input" inputMode="decimal" style={{ textAlign: 'right' }} readOnly={ro} value={String(d[k] ?? '')} onChange={e => set({ [k]: e.target.value })} {...props} />;
  const check = (k: string, label: string, disabled = false) => (
    <label className="px-check"><input type="checkbox" disabled={ro || disabled} checked={!!d[k]} onChange={e => set({ [k]: e.target.checked })} />{label}</label>);
  const unitList = <datalist id="item-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>;
  const ledger = (k: 'salesAccount' | 'purchaseAccount', types: string[]) => accounts && !ro
    ? <select className="px-input" value={String(d[k] || '')} onChange={e => set({ [k]: e.target.value })}>
      <option value="">— not set —</option>
      {accounts.filter(a => types.includes(a.type)).map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
    </select>
    : <input className="px-input" readOnly={ro} placeholder={ro ? '—' : 'Ledger code'} value={String(d[k] || '')} onChange={e => set({ [k]: e.target.value })}
      title={accounts ? accounts.find(a => a.code === d[k])?.name : undefined} />;
  const ledgerName = (code: any) => accounts?.find(a => a.code === code)?.name;
  const conv = (k: 'salesConversion' | 'purchaseConversion', unitKey: 'salesUom' | 'purchaseUom') =>
    `1 ${d[unitKey] || d.uom || 'unit'} = ${Number(d[k]) > 0 ? fmtNum(Number(d[k]), 3).replace(/\.?0+$/, '') : '?'} ${d.uom || 'stock units'}`;
  const category = categories.find(c => String(c._id) === d.category);

  // ---------- render ----------

  const pills = mode === 'new' ? <Pill tone="new">New</Pill> : doc ? <>
    <Pill tone={doc.isActive === false ? 'bad' : 'ok'}>{doc.isActive === false ? `Inactive${doc.deactivatedFrom ? ` from ${fmtDate(doc.deactivatedFrom)}` : ''}` : 'Active'}</Pill>
    <Pill tone="info">{doc.productType === 'SERVICE' ? 'Service' : 'Goods'}</Pill>
    {doc.stockType === 'NON_STOCK' && doc.productType !== 'SERVICE' && <Pill>Non-stock</Pill>}
    {doc.isScrap && <Pill tone="warn">Scrap</Pill>}
    {stock && stock.status === 'OUT' && <Pill tone="bad">Out of stock</Pill>}
    {stock && stock.status === 'BELOW_REORDER' && <Pill tone="warn">Below reorder</Pill>}
    {stock && stock.status === 'NOT_RELEASED' && <Pill tone="warn">Waiting for QC / on hold</Pill>}
    {stock && stock.status === 'ALL_RESERVED' && <Pill tone="warn">All reserved</Pill>}
  </> : undefined;
  const stockLine = stock && stock.status !== 'NON_STOCK'
    ? <> · Available <b>{fmtNum(stock.available, 3).replace(/\.?0+$/, '')} {doc.uom}</b>{stock.onOrder ? ` · on order ${fmtNum(stock.onOrder, 3).replace(/\.?0+$/, '')}` : ''}{stock.reorderLevel ? ` · reorder at ${stock.reorderLevel}` : ''} · <Link href="/dashboard/inventory/items">Stock by Item</Link></>
    : null;

  const onHand = (batches || []).reduce((s, b) => s + (b.currentQuantity || 0), 0);

  // the chips filter by item type
  if (listed) return (
    <>
      {loadError && <div className="px-error">{loadError}</div>}
      <DocList title="Items" fileName="items" rows={list}
        onOpen={p => show(String(p._id)).catch(e => msg.error(e.message))}
        statusOf={p => p.productType} statuses={Object.fromEntries(Object.entries(TYPES).map(([k, label]) => [k, { label, tone: 'info' as const }]))}
        empty={<>No items yet. Press <b>New</b> (Ctrl+N) to add the first one.</>}
        columns={[
          { label: 'Code', width: 140, value: p => <b>{p.sku}</b>, text: p => p.sku },
          { label: 'Item', value: p => p.name },
          { label: 'Type', width: 150, value: p => TYPES[p.productType] || p.productType },
          { label: 'Category', width: 150, value: p => p.category?.name || '' },
          { label: 'Unit', width: 60, value: p => p.uom },
          { label: 'HSN', width: 90, value: p => p.hsnCode || '' },
          { label: 'GST %', width: 70, num: true, value: p => p.gstRate ?? '' },
          { label: 'Purchase Rate', width: 120, num: true, value: p => fmtNum(p.purchasePrice), text: p => Number(p.purchasePrice) || 0 },
          { label: 'Active', width: 80, value: p => <Pill tone={p.isActive === false ? 'bad' : 'ok'}>{p.isActive === false ? 'No' : 'Yes'}</Pill>, text: p => (p.isActive === false ? 'No' : 'Yes') },
        ]} />
    </>);

  return (
    <DocCard kind="Item" number={mode === 'new' ? 'New item' : doc ? `${doc.sku}` : 'Items'} status={pills}
      meta={doc && mode !== 'new' ? <>{doc.name} · {TYPES[doc.productType] || doc.productType}{stockLine}</> : undefined}>
      {loadError && <div className="px-doc__section"><div className="px-error">{loadError}</div></div>}
      {!loadError && !doc && mode === 'view' && list.length === 0 && <div className="px-doc__section"><div className="px-note">No items yet. Press <b>New</b> (Ctrl+N) to add the first one.</div></div>}

      <div className="px-doc__section px-fields">
        <Field label="Goods or Service">
          <div className="px-seg" role="radiogroup" aria-label="Goods or service">
            <button className={!isService ? 'is-on' : ''} disabled={ro} onClick={() => setKind(false)} aria-pressed={!isService}>Goods</button>
            <button className={isService ? 'is-on' : ''} disabled={ro} onClick={() => setKind(true)} aria-pressed={isService}>Service</button>
          </div>
        </Field>
        <Field label="Item Code">{text('sku', { placeholder: ro ? '' : 'e.g. RM-STL-010' })}</Field>
        <Field label="Item Name" wide>{text('name')}</Field>
        <Field label="Category">
          {ro ? <input className="px-input" readOnly value={category?.name || doc?.category?.name || '—'} />
            : <select className="px-input" value={String(d.category || '')} onChange={e => set({ category: e.target.value })}>
              <option value="">— choose —</option>
              {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>}
        </Field>
        <Field label="Item Type">
          {ro ? <input className="px-input" readOnly value={TYPES[String(d.productType)] || String(d.productType)} />
            : <select className="px-input" value={String(d.productType)} onChange={e => set({ productType: e.target.value, ...(e.target.value === 'SERVICE' ? { stockType: 'NON_STOCK', includeInValuation: false, batchManaged: false } : {}) })}>
              {Object.entries(TYPES).filter(([k]) => (isService ? k === 'SERVICE' : k !== 'SERVICE')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>}
        </Field>
        <Field label="Stock Unit">{text('uom', { list: 'item-units' })}{unitList}</Field>
        <Field label="Barcode">{text('barcode', { placeholder: ro ? '—' : '' })}</Field>
      </div>

      <TabStrip tabs={TABS} active={tab} onChange={setTab} />
      <div className="px-tabpanel">
        {tab === 'General' && (
          <div className="px-fields">
            <Field label="Description" wide><textarea className="px-input" style={{ minHeight: 84 }} readOnly={ro} value={String(d.description)} onChange={e => set({ description: e.target.value })} /></Field>
            <Field label="Remarks" wide><textarea className="px-input" style={{ minHeight: 84 }} readOnly={ro} value={String(d.remarks)} onChange={e => set({ remarks: e.target.value })} /></Field>
            <Field label="Maker (OEM)">{text('oemName')}</Field>
            <Field label="Maker Part No.">{text('oemPartNumber')}</Field>
            <Field label="Gross Weight (kg)">{numIn('grossWeight')}</Field>
            <Field label="Net Weight (kg)">{numIn('netWeight')}</Field>
            <Field label="Status">{check('isActive', 'Active')}</Field>
            <Field label="Inactive From">{ro ? <input className="px-input" readOnly value={fmtDate(String(d.deactivatedFrom)) || '—'} /> : <input type="date" className="px-input" value={String(d.deactivatedFrom)} onChange={e => set({ deactivatedFrom: e.target.value })} />}</Field>
          </div>)}

        {tab === 'Sales & Purchase' && (
          <div className="flex flex-col gap-2">
            <div className="px-table-wrap px-units">
              <table className="px-table">
                <thead><tr><th /><th>When selling</th><th>When buying</th></tr></thead>
                <tbody>
                  <tr><td>Unit</td><td>{text('salesUom', { list: 'item-units', placeholder: ro ? String(d.uom) : `Same as stock unit (${d.uom})` })}</td><td>{text('purchaseUom', { list: 'item-units', placeholder: ro ? String(d.uom) : `Same as stock unit (${d.uom})` })}</td></tr>
                  <tr><td>{`Stock units (${d.uom || "units"}) in one unit`}</td>
                    <td>{numIn('salesConversion')}<div className="px-hint">{conv('salesConversion', 'salesUom')}</div></td>
                    <td>{numIn('purchaseConversion')}<div className="px-hint">{conv('purchaseConversion', 'purchaseUom')}</div></td></tr>
                  <tr><td>Rate (₹ per {d.uom || 'stock unit'})</td><td>{numIn('price')}</td><td>{numIn('purchasePrice')}</td></tr>
                  <tr><td>Minimum selling rate (₹)</td><td>{numIn('minSellingPrice', { placeholder: ro ? '—' : 'Below this needs approval' })}</td><td className="px-hint">—</td></tr>
                  <tr><td>Ledger</td>
                    <td>{ledger('salesAccount', ['REVENUE'])}{ro && d.salesAccount ? <div className="px-hint">{ledgerName(d.salesAccount)}</div> : null}</td>
                    <td>{ledger('purchaseAccount', ['EXPENSE', 'ASSET'])}{ro && d.purchaseAccount ? <div className="px-hint">{ledgerName(d.purchaseAccount)}</div> : null}</td></tr>
                </tbody>
              </table>
            </div>
            {unitList}
            <div className="px-note">Units, conversions and ledgers are saved on the item. Purchase orders, receipts and sales orders still use the stock unit; using these on documents comes with the receipt and invoice screens.</div>
          </div>)}

        {tab === 'Stock & Planning' && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="px-section-title">Stock</div>
              <div className="px-fields">
                <Field label="Stock Type">
                  {ro ? <input className="px-input" readOnly value={d.stockType === 'NON_STOCK' ? 'Non-stock (not kept in stock)' : 'Stockable'} />
                    : <select className="px-input" value={String(d.stockType)} onChange={e => set({ stockType: e.target.value, ...(e.target.value === 'NON_STOCK' ? { includeInValuation: false } : {}) })}>
                      <option value="STOCKABLE">Stockable</option><option value="NON_STOCK">Non-stock (not kept in stock)</option>
                    </select>}
                </Field>
                <Field label="Valuation">{check('includeInValuation', 'Include in stock value', d.stockType === 'NON_STOCK')}</Field>
                <Field label="Scrap">{check('isScrap', 'This is a scrap item')}</Field>
                <Field label="Batches">{check('batchManaged', 'Track by batch', isService)}</Field>
                <Field label="Storage Bin">{text('storageBin')}</Field>
                <Field label="Rack No.">{text('rackNo')}</Field>
                <Field label="Plant">{text('plant')}</Field>
              </div>
            </div>
            <div>
              <div className="px-section-title">Planning</div>
              <div className="px-fields">
                <Field label="Planning Method">
                  {ro ? <input className="px-input" readOnly value={MRP_TYPES[String(d.mrpType)] || String(d.mrpType)} />
                    : <select className="px-input" value={String(d.mrpType)} onChange={e => set({ mrpType: e.target.value })}>{Object.entries(MRP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                </Field>
                <Field label={`Reorder Level (${d.uom || 'units'})`}>{numIn('minStockLevel')}</Field>
                <Field label={`Safety Stock (${d.uom || 'units'})`}>{numIn('safetyStock')}</Field>
                <Field label="Lead Time (days)">{numIn('plannedDeliveryDays')}</Field>
              </div>
            </div>
          </div>)}

        {tab === 'Tax' && (
          <div className="px-fields">
            <Field label="HSN / SAC Code" pick={!ro ? <PickButton onClick={() => setDialog('hsn')} title="Search HSN / SAC" /> : undefined}>{text('hsnCode')}</Field>
            <Field label="GST Rate">
              {ro ? <input className="px-input" readOnly value={`${d.gstRate}%`} />
                : <select className="px-input" value={String(d.gstRate)} onChange={e => set({ gstRate: e.target.value })}>{GST_RATES.map(r => <option key={r} value={String(r)}>{r}%</option>)}</select>}
            </Field>
            <Field label="TCS on sale (sec 206C(1))">
              {ro ? <input className="px-input" readOnly value={d.tcsGoods ? TCS_GOODS[d.tcsGoods as keyof typeof TCS_GOODS]?.label || String(d.tcsGoods) : 'None'} />
                : <select className="px-input" value={String(d.tcsGoods)} onChange={e => set({ tcsGoods: e.target.value, tcsRate: e.target.value ? String(TCS_GOODS[e.target.value as keyof typeof TCS_GOODS].rate) : '' })}>
                  <option value="">None</option>{Object.entries(TCS_GOODS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</select>}
            </Field>
            {d.tcsGoods ? <Field label="TCS Rate (%)">{numIn('tcsRate')}</Field> : null}
            <Field label="HSN Description" wide>{text('hsnDescription', { placeholder: ro ? '—' : 'As in the GST tariff' })}</Field>
            <Field label="Valuation Class">{text('valuationClass')}</Field>
            <Field label="Costing">
              {ro ? <input className="px-input" readOnly value={d.priceControl === 'S' ? 'Standard price' : 'Moving average'} />
                : <select className="px-input" value={String(d.priceControl)} onChange={e => set({ priceControl: e.target.value })}><option value="V">Moving average</option><option value="S">Standard price</option></select>}
            </Field>
          </div>)}

        {tab === 'Stock on Hand' && (
          !doc || mode === 'new' ? <div className="px-note">Stock is shown once the item is saved.</div>
            : !batches ? <div className="px-empty">Loading…</div>
              : <div className="px-table-wrap">
                <table className="px-table">
                  <thead><tr><th>Batch</th><th>Store</th><th>Rack / Bin</th><th>Quality</th><th className="num">On Hand</th><th className="num">Reserved</th><th>Expiry</th><th className="num">Cost (₹)</th></tr></thead>
                  <tbody>{batches.map(b => (
                    <tr key={b._id}><td>{b.batchNumber}</td><td>{b.store || b.location || '—'}</td><td>{[b.rack, b.bin].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{String(b.qualityStatus || '—').replace(/_/g, ' ').toLowerCase()}</td><td className="num">{fmtNum(b.currentQuantity, 3)}</td><td className="num">{fmtNum(b.allocatedQuantity, 3)}</td>
                      <td>{fmtDate(b.expiryDate)}</td><td className="num">{fmtNum(b.purchasePrice)}</td></tr>))}</tbody>
                </table>
                {!batches.length ? <div className="px-empty">No stock of this item.</div> : <div className="px-empty" style={{ textAlign: 'right' }}>Total on hand: <b>{fmtNum(onHand, 3)} {doc.uom}</b></div>}
              </div>)}
      </div>

      {dialog === 'locate' && (
        <FindDialog title="Find Item" rows={list} onClose={() => setDialog(null)} onPick={p => { setDialog(null); show(String(p._id)).catch(e => msg.error(e.message)); }}
          columns={[
            { label: 'Code', width: 140, value: p => p.sku },
            { label: 'Item', value: p => p.name },
            { label: 'Type', width: 140, value: p => TYPES[p.productType] || p.productType },
            { label: 'Category', width: 160, value: p => p.category?.name || '' },
            { label: 'Unit', width: 60, value: p => p.uom },
            { label: 'Active', width: 70, value: p => (p.isActive === false ? 'No' : 'Yes') },
          ]} />)}

      {dialog === 'hsn' && (
        <HsnPicker initial={String(d.hsnCode || '')} onClose={() => setDialog(null)}
          onPick={h => { set({ hsnCode: h.code, hsnDescription: h.description || String(d.hsnDescription || ''), ...(h.gstRate !== undefined && h.gstRate !== null ? { gstRate: String(h.gstRate) } : {}) }); setDialog(null); }} />)}
    </DocCard>
  );
}
