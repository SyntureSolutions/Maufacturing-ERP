import { fmtInr, fmtQty } from '@/components/common/ObjectPage';

// Item overview for documents that carry GST per line (tax invoice, pro-forma, vendor bill, delivery challan).
// A line is { description | product, hsnCode, quantity, unitPrice, taxableValue, cgst/sgst/igst Rate and Amount, totalAmount }.
export default function TaxItemsTable({ items, extra }: { items: any[]; extra?: { head: string; cell: (i: any) => React.ReactNode } }) {
  const gst = (i: any) => (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0);
  const rate = (i: any) => (i.igstRate ? i.igstRate : (i.cgstRate || 0) + (i.sgstRate || 0));
  const hasTax = items.some(i => i.totalAmount != null || i.cgstAmount != null || i.igstAmount != null);
  return (
    <div className="table-wrap !shadow-none"><table className="text-left text-sm">
      <thead><tr><th>Item</th><th>Description</th><th>HSN</th><th className="text-right">Quantity</th><th className="text-right">Net Price</th><th className="text-right">Taxable Value</th>
        {hasTax && <><th className="text-right">GST %</th><th className="text-right">GST</th><th className="text-right">Total</th></>}{extra && <th>{extra.head}</th>}</tr></thead>
      <tbody>{items.map((i, n) => (
        <tr key={n}>
          <td className="num">{(n + 1) * 10}</td><td className="max-w-[18rem] truncate">{i.description || i.product?.name || i.productName}{i.product?.sku ? <span className="ml-1 text-xs text-[var(--erp-muted)]">{i.product.sku}</span> : null}</td>
          <td className="num">{i.hsnCode || '—'}</td><td className="text-right num">{fmtQty(i.quantity)}</td><td className="text-right num">{i.unitPrice != null ? fmtInr(i.unitPrice) : '—'}</td>
          <td className="text-right num">{fmtInr(i.taxableValue ?? (i.quantity || 0) * (i.unitPrice || 0))}</td>
          {hasTax && <><td className="text-right num">{rate(i)}%</td><td className="text-right num">{fmtInr(gst(i))}</td><td className="text-right num">{fmtInr(i.totalAmount)}</td></>}
          {extra && <td>{extra.cell(i)}</td>}
        </tr>))}</tbody></table></div>
  );
}
