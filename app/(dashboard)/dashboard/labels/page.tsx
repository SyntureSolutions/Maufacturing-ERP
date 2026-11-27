'use client';

import { PageHeader } from '@/components/ui';
import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { buildGs1, LABEL_SIZES, LabelSize, serialRange } from '@/lib/labels';

const field = 'input';

function Label({ size, data, serial }: { size: LabelSize; data: any; serial: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [qr, setQr] = useState('');
  const s = LABEL_SIZES[size];
  const { encoded, human } = buildGs1({ sku: data.sku, gtin: data.gtin, batchNo: data.batchNo, serialNo: serial, mfgDate: new Date(data.mfgDate), mrp: Number(data.mrp) || undefined });

  useEffect(() => {
    try {
      if (svg.current) JsBarcode(svg.current, encoded, { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: 1.4 });
    } catch { /* invalid data renders an empty barcode */ }
    QRCode.toDataURL(human, { margin: 0, width: 160 }).then(setQr).catch(() => setQr(''));
  }, [encoded, human]);

  const big = size === '100x50';
  return (
    <div className="label-sheet break-inside-avoid overflow-hidden border border-slate-300 bg-white p-[2mm] text-black" style={{ width: `${s.w}mm`, height: `${s.h}mm` }}>
      <div className="flex h-full gap-[2mm]">
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="truncate font-bold" style={{ fontSize: big ? '11pt' : '7pt' }}>{data.name}</div>
            <div style={{ fontSize: big ? '8pt' : '5.5pt' }}>SKU {data.sku} · Batch {data.batchNo}</div>
            <div style={{ fontSize: big ? '8pt' : '5.5pt' }}>Mfg {new Date(data.mfgDate).toLocaleDateString('en-GB')}{data.mrp ? ` · MRP ₹${data.mrp}` : ''}</div>
            <div className="font-semibold" style={{ fontSize: big ? '8pt' : '5.5pt' }}>S/N {serial}</div>
          </div>
          <div>
            <svg ref={svg} className="w-full" style={{ height: big ? '14mm' : '7mm' }} preserveAspectRatio="none" />
            <div className="truncate font-mono" style={{ fontSize: big ? '6pt' : '4pt' }}>{human}</div>
          </div>
        </div>
        {qr && <img src={qr} alt="QR" style={{ width: big ? '28mm' : '14mm', height: big ? '28mm' : '14mm' }} className="self-center" />}
      </div>
    </div>
  );
}

export default function LabelsPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [size, setSize] = useState<LabelSize>('50x25');
  const [data, setData] = useState({ name: '', sku: '', gtin: '', batchNo: '', mfgDate: new Date().toISOString().slice(0, 10), mrp: '' });
  const [prefix, setPrefix] = useState('S');
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(4);

  useEffect(() => {
    fetch('/api/inventory/batches').then(r => (r.ok ? r.json() : [])).then(d => setBatches(Array.isArray(d) ? d : [])).catch(() => setBatches([]));
  }, []);

  const pick = (id: string) => {
    const b = batches.find(x => x._id === id);
    if (!b) return;
    setData({ ...data, name: b.product?.name || '', sku: b.product?.sku || '', gtin: b.product?.barcode || '', batchNo: b.batchNumber, mfgDate: new Date(b.manufacturingDate || b.createdAt || Date.now()).toISOString().slice(0, 10) });
  };

  const serials = data.sku && data.batchNo ? serialRange(prefix, start, Math.min(Math.max(count, 1), 200)) : [];
  return (
    <div className="ui-page">
      <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; } .label-sheet { border: 0 !important; page-break-after: always; } @page { size: ${LABEL_SIZES[size].w}mm ${LABEL_SIZES[size].h}mm; margin: 0; } }`}</style>
      <div className="print:hidden space-y-4">
        <PageHeader title="Barcode / QR Labels" subtitle="GS1-128 barcode and QR code encoding batch, serial, SKU, manufacturing date and MRP for thermal sticker printers." />
        <div className="grid grid-cols-1 gap-3 card md:grid-cols-3">
          <select className={`${field} md:col-span-3`} defaultValue="" onChange={e => pick(e.target.value)}>
            <option value="">Fill from a stock batch…</option>{batches.map(b => <option key={b._id} value={b._id}>{b.batchNumber} · {b.product?.name}</option>)}
          </select>
          <input className={field} placeholder="Product name" value={data.name} onChange={e => setData({ ...data, name: e.target.value })} />
          <input className={field} placeholder="SKU" value={data.sku} onChange={e => setData({ ...data, sku: e.target.value })} />
          <input className={field} placeholder="GTIN (optional, 8–14 digits)" value={data.gtin} onChange={e => setData({ ...data, gtin: e.target.value })} />
          <input className={field} placeholder="Batch no." value={data.batchNo} onChange={e => setData({ ...data, batchNo: e.target.value })} />
          <input type="date" className={field} value={data.mfgDate} onChange={e => setData({ ...data, mfgDate: e.target.value })} />
          <input type="number" min="0" className={field} placeholder="MRP (₹)" value={data.mrp} onChange={e => setData({ ...data, mrp: e.target.value })} />
          <input className={field} placeholder="Serial prefix" value={prefix} onChange={e => setPrefix(e.target.value)} />
          <input type="number" min="1" className={field} value={start} onChange={e => setStart(Number(e.target.value))} title="First serial" />
          <input type="number" min="1" max="200" className={field} value={count} onChange={e => setCount(Number(e.target.value))} title="Number of labels" />
          <select className={field} value={size} onChange={e => setSize(e.target.value as LabelSize)}>{Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <button disabled={!serials.length} onClick={() => window.print()} className="btn btn-sm btn-primary">Print {serials.length} label(s)</button>
        </div>
        <p className="text-xs text-slate-500">Without a numeric GTIN the SKU is encoded under GS1 AI 91 (company internal). Check the first printed label with your scanner before running a full batch.</p>
      </div>
      <div className="print-area flex flex-wrap gap-3">
        {serials.map(s => <Label key={s} size={size} data={data} serial={s} />)}
      </div>
    </div>
  );
}
