import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import JobWorkOrder from '@/models/JobWorkOrder';
import SalesOrder from '@/models/SalesOrder';
import Product from '@/models/Product';
import Category from '@/models/Category';
import { verifyAuth } from '@/lib/auth';
import { createNumbered } from '@/lib/docNumber';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'PRODUCTION_MANAGER'];

/** The service every job-work sales order is raised against (created on first use) */
async function serviceProduct() {
  const category: any = await Category.findOneAndUpdate({ slug: 'services' }, { $setOnInsert: { name: 'Services', slug: 'services' } }, { upsert: true, new: true });
  return Product.findOneAndUpdate({ sku: 'JOBWORK-SVC' }, { $setOnInsert: { name: 'Job Work Service', sku: 'JOBWORK-SVC', category: category._id, uom: 'pcs', productType: 'FINISHED_GOOD', hsnCode: '9988', gstRate: 18, price: 0 } }, { upsert: true, new: true });
}

// For job work done for a customer: record the customer's purchase order and prepare the sales order for the service
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to prepare a sales order for job work.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Job work order not found.' }, { status: 404 });
    const b = await req.json().catch(() => ({}));
    const customerPo = String(b?.customerPoNumber || '').trim();
    if (!customerPo) return NextResponse.json({ error: "Enter the customer's purchase order number." }, { status: 400 });
    await dbConnect();
    const job: any = await JobWorkOrder.findById(id).lean();
    if (!job) return NextResponse.json({ error: 'Job work order not found.' }, { status: 404 });
    if (job.kind !== 'INWARD') throw new HttpError(400, 'A sales order is prepared for job work received from a customer.');
    if (job.salesOrder) throw new HttpError(409, 'A sales order has already been prepared for this job.');
    if (!(job.serviceRate > 0)) throw new HttpError(400, 'The job has no charge per unit.');

    const qty = job.items.reduce((s: number, i: any) => s + i.quantity, 0);
    const svc: any = await serviceProduct();
    // claim the job first so two people cannot prepare two orders
    const claim = await JobWorkOrder.findOneAndUpdate({ _id: id, salesOrder: { $exists: false }, customerPoNumber: { $exists: false } }, { customerPoNumber: customerPo }, { new: true });
    if (!claim) throw new HttpError(409, 'A sales order has already been prepared for this job.');
    try {
      const so: any = await createNumbered(SalesOrder, 'SO', 'soNumber', (soNumber) => SalesOrder.create({
        soNumber, customer: job.party, customerName: job.partyName, poNumber: customerPo, status: 'DRAFT', creditCheckPassed: true,
        items: [{ product: svc._id, quantity: qty, unitPrice: job.serviceRate, totalPrice: Math.round(qty * job.serviceRate * 100) / 100 }],
        totalAmount: Math.round(qty * job.serviceRate * 100) / 100, paymentTerms: 'NET 30',
        terms: `Job work service for ${job.number}${job.natureOfJob ? ` (${job.natureOfJob})` : ''}. The customer's material is not sold; the service is invoiced from the job work screen.`,
      }));
      await JobWorkOrder.updateOne({ _id: id }, { salesOrder: so._id });
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'SALES_ORDER', resourceId: String(so._id), resourceName: so.soNumber, details: `Prepared from job work ${job.number} and customer PO ${customerPo}.` }).catch(() => {});
      return NextResponse.json({ salesOrder: so, job: await JobWorkOrder.findById(id).lean() }, { status: 201 });
    } catch (err) {
      await JobWorkOrder.updateOne({ _id: id }, { $unset: { customerPoNumber: 1 } });
      throw err;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
