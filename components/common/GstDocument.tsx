'use client';

import { amountInWords } from '@/lib/gst';

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface GstDocProps {
  title: string; // e.g. "TAX INVOICE"
  copyLabel?: string; // e.g. "Original for Consignee"
  number: string;
  date: string | Date;
  refs?: { label: string; value?: string }[];
  parties: { seller: any; buyer: any };
  placeOfSupply?: string;
  items: any[];
  totals?: { subTotal: number; totalCGST: number; totalSGST: number; totalIGST: number; totalAmount: number };
  hsnSummary?: any[];
  bank?: any;
  terms?: string;
  transport?: { transporterName?: string; vehicleNo?: string; lrNo?: string };
  showPrices?: boolean; // challans may omit totals
  irn?: string;
  signedQr?: string;
  ewayBillNumber?: string;
  footerNote?: string;
}

export default function GstDocument(p: GstDocProps) {
  const { seller, buyer } = p.parties;
  const showPrices = p.showPrices !== false;
  return (
    <div className="gst-doc break-after-page space-y-3 border border-slate-800 bg-white p-6 text-[12px] text-black">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-extrabold">{seller.name}</div>
          <div>{[seller.address1, seller.address2, seller.city, seller.pincode].filter(Boolean).join(', ')}</div>
          <div>GSTIN: <b>{seller.gstin}</b> · State code {seller.stateCode}</div>
          {(seller.phone || seller.email) && <div>{[seller.phone, seller.email].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{p.title}</div>
          {p.copyLabel && <div className="font-semibold uppercase">{p.copyLabel}</div>}
          <div>No: <b>{p.number}</b></div>
          <div>Date: {new Date(p.date).toLocaleDateString('en-GB')}</div>
          {p.refs?.filter(r => r.value).map(r => <div key={r.label}>{r.label}: {r.value}</div>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-slate-400 py-2">
        <div><div className="font-bold uppercase">Bill to / Consignee</div><div className="font-semibold">{buyer.name}</div>
          <div>{[buyer.address1, buyer.city, buyer.pincode].filter(Boolean).join(', ')}</div><div>GSTIN: {buyer.gstin || 'Unregistered'} · State code {buyer.stateCode}</div></div>
        <div><div className="font-bold uppercase">Supply details</div><div>Place of supply: {p.placeOfSupply}</div>
          {p.transport && <><div>Transporter: {p.transport.transporterName}</div><div>Vehicle: {p.transport.vehicleNo} · LR No: {p.transport.lrNo}</div></>}</div>
      </div>

      <table className="w-full border-collapse text-left">
        <thead><tr className="border-b border-slate-800 text-[11px] uppercase">
          <th className="py-1">#</th><th>Description</th><th>HSN</th><th className="text-right">Qty</th>
          {showPrices && <><th className="text-right">Rate</th><th className="text-right">Taxable</th><th className="text-right">GST %</th><th className="text-right">Amount</th></>}
        </tr></thead>
        <tbody>{p.items.map((i, n) => {
          const rate = (i.cgstRate || 0) + (i.sgstRate || 0) + (i.igstRate || 0);
          return <tr key={n} className="border-b border-slate-200">
            <td className="py-1">{n + 1}</td><td>{i.description}</td><td>{i.hsnCode}</td><td className="text-right">{i.quantity}</td>
            {showPrices && <><td className="text-right">{inr(i.unitPrice)}</td><td className="text-right">{inr(i.taxableValue)}</td><td className="text-right">{rate}%</td><td className="text-right">{inr(i.totalAmount)}</td></>}
          </tr>;
        })}</tbody>
      </table>

      {showPrices && p.totals && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            {p.hsnSummary && p.hsnSummary.length > 0 && (
              <table className="w-full border-collapse text-[11px]">
                <thead><tr className="border-b border-slate-600"><th className="text-left">HSN</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th></tr></thead>
                <tbody>{p.hsnSummary.map(h => <tr key={h.hsnCode}><td>{h.hsnCode}</td><td className="text-right">{inr(h.taxableValue)}</td><td className="text-right">{inr(h.cgst)}</td><td className="text-right">{inr(h.sgst)}</td><td className="text-right">{inr(h.igst)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="space-y-0.5 text-right">
            <div>Taxable value: {inr(p.totals.subTotal)}</div>
            {p.totals.totalCGST > 0 && <><div>CGST: {inr(p.totals.totalCGST)}</div><div>SGST: {inr(p.totals.totalSGST)}</div></>}
            {p.totals.totalIGST > 0 && <div>IGST: {inr(p.totals.totalIGST)}</div>}
            <div className="text-sm font-extrabold">Total: {inr(p.totals.totalAmount)}</div>
          </div>
          <div className="col-span-2 italic">Amount in words: {amountInWords(p.totals.totalAmount)}</div>
        </div>
      )}

      {(p.irn || p.ewayBillNumber) && (
        <div className="break-all border border-slate-400 p-2 text-[10px]">
          {p.irn && <div>IRN: {p.irn}</div>}{p.ewayBillNumber && <div>E-way bill: {p.ewayBillNumber}</div>}
          {p.signedQr && <div className="mt-1 text-slate-500">Signed QR data on file.</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>{p.bank?.accountNo && <><div className="font-bold">Bank details</div><div>{p.bank.name} · A/c {p.bank.accountNo} · IFSC {p.bank.ifsc}{p.bank.branch ? ` · ${p.bank.branch}` : ''}</div></>}
          {p.terms && <div className="mt-1 text-[10px]">{p.terms}</div>}{p.footerNote && <div className="mt-1 text-[10px]">{p.footerNote}</div>}</div>
        <div className="pt-8 text-right">For {seller.name}<div className="pt-6">Authorised signatory</div></div>
      </div>
    </div>
  );
}
