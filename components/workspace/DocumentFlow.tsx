'use client';

import { useEffect, useState } from 'react';
import { fmtDate, fmtNum } from '@/components/workspace/controls';

// The Linked Documents tab: every document in this one's chain (indent → PO → GRN → bill → payment ...), oldest step
// first. Double-click opens a document; the one on screen is highlighted.

const TYPE_NAME: Record<string, string> = {
  ENQUIRY: 'Enquiry', QUOTATION: 'Quotation', SALES_ORDER: 'Sales Order', WORK_ORDER: 'Work Order', DELIVERY_CHALLAN: 'Delivery Challan', INVOICE: 'Tax Invoice', RECEIPT: 'Receipt',
  MRP_RUN: 'MRP Run', PURCHASE_INDENT: 'Purchase Indent', RFQ: 'Request for Quotation', PURCHASE_ORDER: 'Purchase Order', GRN: 'Goods Receipt Note',
  VENDOR_BILL: 'Purchase (Vendor Bill)', PAYMENT: 'Payment', BILL_OF_ENTRY: 'Bill of Entry',
};
const ORDER = ['MRP_RUN', 'ENQUIRY', 'QUOTATION', 'SALES_ORDER', 'WORK_ORDER', 'PURCHASE_INDENT', 'RFQ', 'PURCHASE_ORDER', 'GRN', 'BILL_OF_ENTRY', 'VENDOR_BILL', 'PAYMENT', 'DELIVERY_CHALLAN', 'INVOICE', 'RECEIPT'];

export function DocumentFlow({ type, id, what, onOpenSelf, onOpen }: {
  type: string; id: string | null; what: string;
  /** Open another document of the same kind on this screen */
  onOpenSelf: (id: string) => void;
  onOpen: (href: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    fetch(`/api/lineage?type=${type}&id=${id}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error || `The server answered ${r.status}.`); return d; })
      .then(setData).catch(e => setError(e.message));
  }, [type, id]);
  if (!id) return <div className="px-note">Linked documents are shown once the {what} is saved.</div>;
  if (error) return <div className="px-error">{error}</div>;
  if (!data) return <div>Loading…</div>;
  const nodes = [...data.nodes].sort((a: any, b: any) => (ORDER.indexOf(a.type) - ORDER.indexOf(b.type)) || String(a.date || '').localeCompare(String(b.date || '')));
  return (
    <div className="px-table-wrap" style={{ flex: 1 }}>
      <table className="px-table" style={{ width: '100%' }}>
        <thead><tr><th style={{ width: 210 }}>Document</th><th style={{ width: 170 }}>Number</th><th style={{ width: 110 }}>Date</th><th className="num" style={{ width: 150 }}>Amount (₹)</th><th>Status</th></tr></thead>
        <tbody>
          {nodes.map((n: any) => {
            const self = n.type === type && String(n.id) === String(id);
            return (
              <tr key={n.key} className={self ? 'is-selected' : ''} onDoubleClick={() => { if (self) return; if (n.type === type) onOpenSelf(String(n.id)); else onOpen(n.page); }} title={self ? 'This document' : 'Double-click to open'} style={{ cursor: self ? 'default' : 'pointer' }}>
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
