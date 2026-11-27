import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import PurchaseOrder from '@/models/PurchaseOrder';
import SalesOrder from '@/models/SalesOrder';
import Invoice from '@/models/Invoice';
import WorkOrder from '@/models/WorkOrder';
import '@/models/Supplier'; // registered so populate('supplier') works on a cold server
import '@/models/Product';
import { stockByItem } from '@/lib/stockSummary';
import { canViewFinance } from '@/lib/accessRoles';

// Executive dashboard figures, all from the documents themselves:
//   open purchase orders, sales orders still to fulfil, items short of their reorder level and active work orders (as of now);
//   revenue = taxable value of sales invoices issued in the period (this week / this month / this financial-year quarter),
//   with the change against the period before; the chart splits the period; the feed lists the latest documents.

type Period = 'week' | 'month' | 'quarter';
const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function windowOf(period: Period, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const start = new Date(today.getTime() - 6 * DAY);
    return { start, end: new Date(today.getTime() + DAY), prevStart: new Date(start.getTime() - 7 * DAY), buckets: Array.from({ length: 7 }, (_, i) => {
      const s = new Date(start.getTime() + i * DAY);
      return { name: s.toLocaleDateString('en-IN', { weekday: 'short' }), start: s, end: new Date(s.getTime() + DAY) };
    }) };
  }
  if (period === 'quarter') {
    // financial-year quarters: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar
    const q = Math.floor(((now.getMonth() + 9) % 12) / 3);
    const firstMonth = (q * 3 + 3) % 12;
    const year = now.getMonth() < 3 && firstMonth >= 3 ? now.getFullYear() - 1 : now.getFullYear();
    const start = new Date(year, firstMonth, 1), end = new Date(year, firstMonth + 3, 1);
    return { start, end, prevStart: new Date(year, firstMonth - 3, 1), buckets: [0, 1, 2].map(i => {
      const s = new Date(year, firstMonth + i, 1);
      return { name: s.toLocaleDateString('en-IN', { month: 'short' }), start: s, end: new Date(year, firstMonth + i + 1, 1) };
    }) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1), end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const buckets = [];
  for (let s = start, w = 1; s < end; s = new Date(s.getTime() + 7 * DAY), w++) buckets.push({ name: `Week ${w}`, start: s, end: new Date(Math.min(s.getTime() + 7 * DAY, end.getTime())) });
  return { start, end, prevStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), buckets };
}

const ago = (d: Date) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  return m < 60 ? `${m} min${m === 1 ? '' : 's'} ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'} ago`;
};
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const p = new URL(req.url).searchParams.get('period');
    const period: Period = p === 'week' || p === 'quarter' ? p : 'month';
    const money = canViewFinance(user.role);
    const w = windowOf(period);

    await dbConnect();
    const live = { status: { $nin: ['CANCELLED', 'DRAFT'] } };
    const [openPOs, pendingSOs, activeWOs, stock, invoices, latestPO, latestSO, latestInv, latestWO] = await Promise.all([
      PurchaseOrder.countDocuments({ status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] } }),
      SalesOrder.countDocuments({ status: { $in: ['DRAFT', 'APPROVED', 'IN_FULFILLMENT', 'ON_HOLD'] } }),
      WorkOrder.countDocuments({ status: { $in: ['PLANNED', 'IN_PROGRESS'] } }),
      stockByItem(),
      Invoice.find({ type: 'SALES', ...live, date: { $gte: w.prevStart, $lt: w.end } }).select('date subTotal totalAmount').lean() as Promise<any[]>,
      PurchaseOrder.find({}).sort({ createdAt: -1 }).limit(3).populate('supplier', 'name').select('poNumber status totalAmount createdAt supplier').lean() as Promise<any[]>,
      SalesOrder.find({}).sort({ createdAt: -1 }).limit(3).select('soNumber status totalAmount customerName createdAt').lean() as Promise<any[]>,
      Invoice.find({ type: 'SALES', ...live }).sort({ createdAt: -1 }).limit(3).select('invoiceNumber totalAmount createdAt parties').lean() as Promise<any[]>,
      WorkOrder.find({}).sort({ updatedAt: -1 }).limit(3).populate('product', 'name').select('woNumber status quantity updatedAt product').lean() as Promise<any[]>,
    ]);

    const lowStock = stock.filter(s => s.isActive && s.reorderLevel > 0 && ['OUT', 'NOT_RELEASED', 'ALL_RESERVED', 'BELOW_REORDER'].includes(s.status)).length;
    const value = (i: any) => i.subTotal ?? i.totalAmount ?? 0;
    const inWin = (i: any, a: Date, b: Date) => new Date(i.date) >= a && new Date(i.date) < b;
    const revenue = r2(invoices.filter(i => inWin(i, w.start, w.end)).reduce((t, i) => t + value(i), 0));
    const before = r2(invoices.filter(i => inWin(i, w.prevStart, w.start)).reduce((t, i) => t + value(i), 0));
    const change = before > 0 ? Math.round(((revenue - before) / before) * 1000) / 10 : null;

    const activities = [
      ...latestPO.map(d => ({ at: d.createdAt, id: `po-${d._id}`, type: 'PO', title: `Purchase order ${d.poNumber}`, description: `${d.supplier?.name || 'Supplier'}${money ? ` · ${inr(d.totalAmount)}` : ''}`, status: d.status === 'PENDING_APPROVAL' ? 'warning' : 'info', badge: String(d.status).replace(/_/g, ' ').toLowerCase(), href: `/dashboard/purchase/${d._id}` })),
      ...latestSO.map(d => ({ at: d.createdAt, id: `so-${d._id}`, type: 'SALES', title: `Sales order ${d.soNumber}`, description: `${d.customerName || 'Customer'}${money ? ` · ${inr(d.totalAmount)}` : ''}`, status: d.status === 'ON_HOLD' ? 'danger' : 'success', badge: String(d.status).replace(/_/g, ' ').toLowerCase(), href: `/dashboard/order-desk/${d._id}` })),
      ...(money ? latestInv.map(d => ({ at: d.createdAt, id: `inv-${d._id}`, type: 'INVOICE', title: `Tax invoice ${d.invoiceNumber}`, description: `${d.parties?.buyer?.name || 'Customer'} · ${inr(d.totalAmount)}`, status: 'success', badge: 'issued', href: `/dashboard/dispatch/invoices/${d._id}` })) : []),
      ...latestWO.map(d => ({ at: d.updatedAt, id: `wo-${d._id}`, type: 'WORK_ORDER', title: `Work order ${d.woNumber}`, description: `${d.quantity} × ${d.product?.name || 'item'}`, status: d.status === 'COMPLETED' ? 'success' : 'info', badge: String(d.status).replace(/_/g, ' ').toLowerCase(), href: `/dashboard/production/${d._id}` })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6).map(({ at, ...a }) => ({ ...a, time: ago(at) }));

    const label = period === 'week' ? 'Revenue (last 7 days)' : period === 'quarter' ? 'Revenue This Quarter' : 'Revenue This Month';
    return NextResponse.json({
      period,
      kpis: {
        openPOs: { value: openPOs, trend: null, isUp: true, label: 'Open Purchase Orders' },
        pendingSalesOrders: { value: pendingSOs, trend: null, isUp: true, label: 'Pending Sales Orders' },
        lowStockItems: { value: lowStock, trend: null, isUp: false, label: 'Low Stock Items' },
        revenueThisMonth: money
          ? { value: revenue, trend: change === null ? null : `${change >= 0 ? '+' : ''}${change}%`, isUp: (change ?? 0) >= 0, label }
          : { value: null, trend: null, isUp: true, label },
        activeWorkOrders: { value: activeWOs, trend: null, isUp: true, label: 'Active Work Orders' },
      },
      chartData: money ? w.buckets.map(b => ({ name: b.name, revenue: r2(invoices.filter(i => inWin(i, b.start, b.end)).reduce((t, i) => t + value(i), 0)) })) : [],
      activities,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
