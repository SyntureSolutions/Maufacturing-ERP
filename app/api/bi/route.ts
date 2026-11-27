import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import PurchaseOrder from '@/models/PurchaseOrder';
import WorkOrder from '@/models/WorkOrder';
import GRN from '@/models/GRN';
import ScrapEntry from '@/models/ScrapEntry';
import MachineRun from '@/models/MachineRun';
import '@/models/Machine';
import { runFigures } from '@/lib/oee';
import '@/models/Product';
import '@/models/Supplier';
import '@/models/Customer';
import { verifyAuth } from '@/lib/auth';
import type { Metric } from '@/lib/pivot';

const month = (d: any) => (d ? new Date(d).toISOString().slice(0, 7) : '');
type Field = { key: string; label: string };

interface Source { label: string; dimensions: Field[]; metrics: Metric[]; load: () => Promise<Record<string, any>[]> }

const SOURCES: Record<string, Source> = {
  sales: {
    label: 'Sales (invoice lines)',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'customer', label: 'Customer' }, { key: 'product', label: 'Product' }, { key: 'hsn', label: 'HSN' }, { key: 'status', label: 'Invoice status' }],
    metrics: [{ key: 'taxable', label: 'Taxable sales', agg: 'sum', field: 'taxable', format: 'currency' }, { key: 'quantity', label: 'Quantity sold', agg: 'sum', field: 'quantity' }, { key: 'total', label: 'Invoice value', agg: 'sum', field: 'total', format: 'currency' }, { key: 'avgPrice', label: 'Average selling price', agg: 'ratio', num: 'taxable', den: 'quantity', format: 'currency' }, { key: 'lines', label: 'Invoice lines', agg: 'count' }],
    async load() {
      const inv = await Invoice.find({ type: 'SALES', status: { $nin: ['CANCELLED', 'DRAFT'] } }).populate('customer', 'name').lean() as any[];
      return inv.flatMap(i => i.items.map((l: any) => ({ month: month(i.date), customer: i.customer?.name || i.parties?.buyer?.name, product: l.description, hsn: l.hsnCode, status: i.status, taxable: l.taxableValue, quantity: l.quantity, total: l.totalAmount })));
    },
  },
  purchases: {
    label: 'Purchases (PO lines)',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'supplier', label: 'Supplier' }, { key: 'product', label: 'Product' }, { key: 'status', label: 'PO status' }],
    metrics: [{ key: 'amount', label: 'Purchase value', agg: 'sum', field: 'amount', format: 'currency' }, { key: 'quantity', label: 'Quantity ordered', agg: 'sum', field: 'quantity' }, { key: 'unitCost', label: 'Cost per unit', agg: 'ratio', num: 'amount', den: 'quantity', format: 'currency' }, { key: 'lines', label: 'PO lines', agg: 'count' }],
    async load() {
      const pos = await PurchaseOrder.find({ status: { $ne: 'CANCELLED' } }).populate('supplier', 'name').populate('items.product', 'name').lean() as any[];
      return pos.flatMap(p => p.items.map((i: any) => ({ month: month(p.orderDate), supplier: p.supplier?.name, product: i.product?.name, status: p.status, amount: i.totalPrice, quantity: i.quantity })));
    },
  },
  production: {
    label: 'Production (work orders)',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'product', label: 'Product' }, { key: 'status', label: 'Status' }, { key: 'demandType', label: 'MTO / MTS' }, { key: 'priority', label: 'Priority' }],
    metrics: [{ key: 'planned', label: 'Planned qty', agg: 'sum', field: 'planned' }, { key: 'approved', label: 'FG approved qty', agg: 'sum', field: 'approved' }, { key: 'rejected', label: 'FG rejected qty', agg: 'sum', field: 'rejected' }, { key: 'yield', label: 'First-pass yield', agg: 'ratio', num: 'approved', den: 'received', format: 'percent' }, { key: 'orders', label: 'Work orders', agg: 'count' }],
    async load() {
      const wos = await WorkOrder.find().populate('product', 'name').lean() as any[];
      return wos.map(w => ({ month: month(w.plannedStartDate || w.createdAt), product: w.product?.name, status: w.status, demandType: w.demandType, priority: w.priority, planned: w.quantity, approved: w.fgApprovedQty || 0, rejected: w.fgScrapQty || 0, received: w.fgReceivedQty || 0 }));
    },
  },
  stages: {
    label: 'WIP stage output',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'stage', label: 'Stage' }, { key: 'operator', label: 'Operator' }, { key: 'workOrder', label: 'Work order' }],
    metrics: [{ key: 'good', label: 'Good qty', agg: 'sum', field: 'good' }, { key: 'scrap', label: 'Scrap qty', agg: 'sum', field: 'scrap' }, { key: 'rework', label: 'Rework qty', agg: 'sum', field: 'rework' }, { key: 'scrapRate', label: 'Scrap rate', agg: 'ratio', num: 'scrap', den: 'input', format: 'percent' }],
    async load() {
      const wos = await WorkOrder.find({ 'stageLogs.0': { $exists: true } }).lean() as any[];
      return wos.flatMap(w => w.stageLogs.map((l: any) => ({ month: month(l.at), stage: l.stageName, operator: l.operator, workOrder: w.woNumber, input: l.input, good: l.good, scrap: l.scrap, rework: l.rework })));
    },
  },
  supplierQuality: {
    label: 'Supplier quality (GRN inspections)',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'supplier', label: 'Supplier' }, { key: 'product', label: 'Product' }],
    metrics: [{ key: 'received', label: 'Received qty', agg: 'sum', field: 'received' }, { key: 'accepted', label: 'Accepted qty', agg: 'sum', field: 'accepted' }, { key: 'rejected', label: 'Rejected qty', agg: 'sum', field: 'rejected' }, { key: 'quality', label: 'Supplier quality rating', agg: 'ratio', num: 'accepted', den: 'inspected', format: 'percent' }],
    async load() {
      const grns = await GRN.find().populate('supplier', 'name').populate('items.product', 'name').lean() as any[];
      return grns.flatMap(g => g.items.filter((i: any) => i.inspection !== 'PENDING').map((i: any) => ({ month: month(g.createdAt), supplier: g.supplier?.name, product: i.product?.name, received: i.receivedQty, inspected: i.receivedQty, accepted: i.acceptedQty, rejected: i.scrapQty + i.returnQty })));
    },
  },
  oee: {
    label: 'Machine OEE (shift runs)',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'day', label: 'Day' }, { key: 'machine', label: 'Machine' }, { key: 'shift', label: 'Shift' }, { key: 'operator', label: 'Operator' }, { key: 'workOrder', label: 'Work order' }],
    metrics: [
      { key: 'oee', label: 'OEE', agg: 'oee', format: 'percent' },
      { key: 'availability', label: 'Availability', agg: 'ratio', num: 'runtime', den: 'planned', format: 'percent' },
      { key: 'performance', label: 'Performance', agg: 'ratio', num: 'eff', den: 'ideal', format: 'percent' },
      { key: 'quality', label: 'Quality', agg: 'ratio', num: 'good', den: 'count', format: 'percent' },
      { key: 'downtime', label: 'Unplanned downtime (min)', agg: 'sum', field: 'downtime' },
      { key: 'units', label: 'Units produced', agg: 'sum', field: 'count' },
      { key: 'rejects', label: 'Rejected units', agg: 'sum', field: 'rejected' },
      { key: 'runs', label: 'Shift runs', agg: 'count' },
    ],
    async load() {
      const runs = await MachineRun.find().populate('machine', 'name').populate('workOrder', 'woNumber').lean() as any[];
      return runs.map(r => {
        const f = runFigures(r);
        return { month: String(r.day).slice(0, 7), day: r.day, machine: r.machine?.name, shift: r.shift, operator: r.operator, workOrder: r.workOrder?.woNumber,
          planned: f.plannedProduction, runtime: f.runtime, ideal: f.ideal, eff: f.effCount, count: f.count, good: f.good, rejected: f.rejected, downtime: f.unplannedStops };
      });
    },
  },
  scrap: {
    label: 'Scrap stores',
    dimensions: [{ key: 'month', label: 'Month' }, { key: 'store', label: 'Scrap store' }, { key: 'stage', label: 'Stage' }, { key: 'product', label: 'Product' }],
    metrics: [{ key: 'quantity', label: 'Scrap qty', agg: 'sum', field: 'quantity' }, { key: 'entries', label: 'Entries', agg: 'count' }],
    async load() {
      const rows = await ScrapEntry.find().populate('product', 'name').lean() as any[];
      return rows.map(s => ({ month: month(s.createdAt), store: s.store, stage: s.stageName, product: s.product?.name, quantity: s.quantity }));
    },
  },
};

// GET /api/bi            -> source catalogue
// GET /api/bi?source=ID  -> fields + flat rows for the client-side pivot builder
export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = req.nextUrl.searchParams.get('source');
    if (!id) return NextResponse.json(Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label })));
    const src = SOURCES[id];
    if (!src) return NextResponse.json({ error: 'Unknown source.' }, { status: 404 });
    await dbConnect();
    return NextResponse.json({ dimensions: src.dimensions, metrics: src.metrics, rows: await src.load() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
