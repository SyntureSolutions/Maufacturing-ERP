import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PurchaseIndent from '@/models/PurchaseIndent';
import { verifyAuth } from '@/lib/auth';
import { statusOf } from '@/lib/httpError';
import { withOrderedQuantities } from '@/lib/indentLines';
import PurchaseOrder from '@/models/PurchaseOrder';
import Supplier from '@/models/Supplier';
import SalesOrder from '@/models/SalesOrder';
import RFQ from '@/models/RFQ';
import '@/models/Product';

const APPROVER_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];

// One requisition with ordered / open quantity per line and the purchase orders that order it (object page).
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await dbConnect();
    const indent = await PurchaseIndent.findById(id)
      .populate('items.product', 'name sku uom hsnCode productType purchasePrice')
      .populate({ path: 'items.preferredSupplier', select: 'name code', model: Supplier })
      .populate({ path: 'salesOrder', select: 'soNumber customerName', model: SalesOrder })
      .populate({ path: 'rfq', select: 'number status', model: RFQ });
    if (!indent) return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 });
    const [withQty] = await withOrderedQuantities([indent]);
    const pos: any[] = await PurchaseOrder.find({ 'items.sources.indent': indent._id }).select('poNumber status supplier items.lineNo items.sources items.product').populate({ path: 'supplier', select: 'name code', model: Supplier }).lean();
    const orderedBy = pos.flatMap(po => po.items.flatMap((it: any) => (it.sources || [])
      .filter((s: any) => String(s.indent) === String(indent._id))
      .map((s: any) => ({ poId: po._id, poNumber: po.poNumber, status: po.status, supplier: po.supplier?.name, poLine: it.lineNo, reqLine: s.lineNo, quantity: s.quantity }))));
    return NextResponse.json({ ...withQty, orderedBy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!APPROVER_ROLES.includes(user.role)) return NextResponse.json({ error: 'Not permitted to approve indents.' }, { status: 403 });

    const { id } = await context.params;
    const { action, remarks } = await req.json();
    if (!['approve', 'reject'].includes(action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });

    await dbConnect();
    const indent = await PurchaseIndent.findById(id);
    if (!indent) return NextResponse.json({ error: 'Indent not found.' }, { status: 404 });
    if (indent.status !== 'PENDING') return NextResponse.json({ error: `Indent is already ${indent.status}.` }, { status: 409 });

    indent.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    indent.approvedBy = user.name;
    if (remarks) indent.remarks = remarks;
    await indent.save();
    return NextResponse.json(indent);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
