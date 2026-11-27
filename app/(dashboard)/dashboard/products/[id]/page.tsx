'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pencil, ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import ProductModal from '@/components/modals/ProductModal';

// Material master as an object page: header strip, then collapsible Header (tabs) and Stock by Batch.
// Layout follows the ERP Material Master Template: basic data, plant data (MRP, storage) and accounting.

const TABS = ['Basic data', 'Sales', 'Plant / MRP', 'Storage', 'Accounting'];
const MRP_TYPES: Record<string, string> = { PD: 'MRP', VB: 'Reorder Point', ND: 'No Planning' };
const PRICE_CONTROLS: Record<string, string> = { V: 'Moving Average', S: 'Standard Price' };
const kind = (t: string) => String(t || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

export default function MaterialObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, stock: true });
  const [tab, setTab] = useState(TABS[0]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/products/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setP(data); else setError(data.error || 'Could not load the material.');
    fetch('/api/inventory/batches').then(r => (r.ok ? r.json() : [])).then(all => setBatches((Array.isArray(all) ? all : []).filter((b: any) => String(b.product?._id || b.product) === String(id)))).catch(() => setBatches([]));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/products" className="btn btn-secondary btn-sm w-fit">Back to materials</Link></div>;
  if (!p) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;
  const inStock = batches.filter(b => (b.currentQuantity || 0) > 0);
  const total = inStock.reduce((a, b) => a + (b.currentQuantity || 0), 0);
  const reserved = inStock.reduce((a, b) => a + (b.allocatedQuantity || 0), 0);

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/products" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Materials</Link>
        <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Change</button>
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {fmtDay(p.createdAt)} · changed {fmtDay(p.updatedAt)}</span>
      </div>

      <div className="obj-header">
        <Field label="Material">{p.sku}</Field>
        <Field label="Description">{p.name}</Field>
        <Field label="Material Type">{kind(p.productType)}</Field>
        <Field label="Material Group">{p.category?.name}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${p.isActive === false ? 'negative' : 'positive'}`}>{p.isActive === false ? 'Inactive' : 'Active'}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'Basic data' && <div className="form-grid">
            <Field label="Base Unit">{p.uom}</Field><Field label="Barcode / EAN">{p.barcode}</Field>
            <Field label="HSN Code">{p.hsnCode}</Field><Field label="GST Rate">{p.gstRate != null ? `${p.gstRate}%` : '—'}</Field>
            <Field label="Gross Weight">{p.grossWeight != null ? `${fmtQty(p.grossWeight)} KG` : '—'}</Field><Field label="Net Weight">{p.netWeight != null ? `${fmtQty(p.netWeight)} KG` : '—'}</Field>
            <Field label="OEM">{p.oemName}</Field><Field label="OEM Part Number">{p.oemPartNumber}</Field>
            <Field label="Description Text">{p.description}</Field>
          </div>}
          {tab === 'Sales' && <div className="form-grid">
            <Field label="Selling Price">{fmtInr(p.price)}</Field>
            <Field label="Minimum Selling Price">{p.minSellingPrice != null ? fmtInr(p.minSellingPrice) : 'No minimum'}</Field>
          </div>}
          {tab === 'Plant / MRP' && <div className="form-grid">
            <Field label="Plant">{p.plant}</Field><Field label="MRP Type">{p.mrpType ? `${p.mrpType} (${MRP_TYPES[p.mrpType] || ''})` : ''}</Field>
            <Field label="Reorder Point">{fmtQty(p.minStockLevel)}</Field><Field label="Safety Stock">{fmtQty(p.safetyStock)}</Field>
            <Field label="Planned Delivery Days">{p.plannedDeliveryDays != null ? String(p.plannedDeliveryDays) : '—'}</Field>
          </div>}
          {tab === 'Storage' && <div className="form-grid">
            <Field label="Storage Bin">{p.storageBin}</Field><Field label="Batch Managed">{p.batchManaged === false ? 'No' : 'Yes'}</Field>
          </div>}
          {tab === 'Accounting' && <div className="form-grid">
            <Field label="Valuation Class">{p.valuationClass}</Field><Field label="Price Control">{p.priceControl ? `${p.priceControl} (${PRICE_CONTROLS[p.priceControl] || ''})` : ''}</Field>
            <Field label="Standard / Purchase Price">{fmtInr(p.purchasePrice)}</Field>
          </div>}
        </div>
      </Section>

      <Section title={`Stock by Batch (${fmtQty(total)} ${p.uom || ''} in ${inStock.length} batch${inStock.length === 1 ? '' : 'es'})`} open={open.stock} onToggle={() => setOpen({ ...open, stock: !open.stock })}>
        {inStock.length
          ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
              <thead><tr><th>Batch</th><th>Storage</th><th>QC</th><th>Expiry</th><th className="text-right">On Hand</th><th className="text-right">Reserved</th><th className="text-right">Free</th></tr></thead>
              <tbody>{inStock.map(b => <tr key={b._id}><td className="num">{b.batchNumber}</td><td>{b.store || b.location || '—'}</td><td>{String(b.qualityStatus || '').replace(/_/g, ' ')}</td><td className="num">{fmtDay(b.expiryDate)}</td><td className="text-right num">{fmtQty(b.currentQuantity)}</td><td className="text-right num">{fmtQty(b.allocatedQuantity)}</td><td className="text-right num">{fmtQty((b.currentQuantity || 0) - (b.allocatedQuantity || 0))}</td></tr>)}
                <tr><td className="font-semibold" colSpan={4}>Total</td><td className="text-right num font-semibold">{fmtQty(total)}</td><td className="text-right num font-semibold">{fmtQty(reserved)}</td><td className="text-right num font-semibold">{fmtQty(total - reserved)}</td></tr></tbody></table></div>
          : <p className="px-4 py-3 text-sm text-[var(--erp-muted)]">No stock of this material.</p>}
      </Section>

      <ProductModal isOpen={editing} product={p} onClose={() => setEditing(false)} onSuccess={() => { setEditing(false); load(); }} />
    </div>
  );
}
