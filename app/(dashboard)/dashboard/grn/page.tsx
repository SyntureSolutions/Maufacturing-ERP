'use client';

import { PageHeader } from '@/components/ui';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

// Returns to vendor (RTV challans). Goods receipts themselves, with inward QC, put-away and the Return to Vendor
// action, are on the Goods Receipt screen; old links to this page for receipts are sent there.

const btn = 'btn btn-sm';

export default function ReturnsToVendorPage() {
  const [returns, setReturns] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('tab') !== 'RTV') { window.location.replace(`/dashboard/transactions/grn${q.get('po') ? `?po=${q.get('po')}` : ''}`); return; }
    fetch('/api/purchase-returns')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Returns could not be loaded.'); return d; })
      .then(d => setReturns(Array.isArray(d) ? d : [])).catch(e => setError(e.message));
  }, []);

  return (
    <div className="ui-page">
      <PageHeader title="Returns to Vendor" subtitle="Goods sent back after receipt, each with its RTV challan and debit note. Raise a return from the goods receipt it came in on." />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="space-y-4">
        {(returns || []).map(r => (
          <div key={r._id} className="space-y-2 card">
            <div className="flex items-center justify-between"><div><span className="font-bold">RTV Challan {r.number}</span>
              <div className="text-xs text-slate-500">GRN <Link href={`/dashboard/transactions/grn?id=${r.grn?._id || r.grn}`} className="text-[var(--erp-accent)] hover:underline">{r.grnNumber}</Link> · {r.supplier?.name} · Debit note {r.debitNoteNumber}</div></div>
              <div className="flex gap-2"><AttachmentDrawer entityType="PURCHASE_RETURN" entityId={r._id} label="Files" /><PdfButton url={pdfUrl.print('purchase-return', r._id)} title={`Purchase return ${r.number}`} label="Print" className={`${btn} btn-secondary`} /></div></div>
            <table className="w-full text-sm"><tbody>{r.items.map((i: any, n: number) => <tr key={n} className="border-t border-slate-100"><td className="py-1">{i.product?.name}</td><td>{i.quantity}</td><td>₹{i.unitPrice}</td><td className="text-right">₹{(i.quantity * i.unitPrice).toLocaleString('en-IN')}</td></tr>)}</tbody></table>
            <div className="text-right text-sm">Base ₹{r.baseAmount?.toLocaleString('en-IN')}{r.afterBilling ? ` (after billing, credited on ${r.billNumber})` : ''} + GST {r.gstPercent}% ₹{r.gstAmount?.toLocaleString('en-IN')} = <b>₹{r.totalAmount?.toLocaleString('en-IN')}</b></div>
          </div>
        ))}
        {returns && !returns.length && <p className="empty">No purchase returns yet. Raise one from the goods receipt the goods came in on.</p>}
      </div>
    </div>
  );
}
