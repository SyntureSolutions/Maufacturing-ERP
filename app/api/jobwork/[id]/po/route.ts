import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import JobWorkOrder from '@/models/JobWorkOrder';
import { verifyAuth } from '@/lib/auth';
import { createNumbered } from '@/lib/docNumber';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER'];

// Issue the purchase order to the job worker for an outward job: agreed charge per unit, GST and terms. One per job; asking again returns it.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to issue job work purchase orders.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Job work order not found.' }, { status: 404 });
    const b = await req.json().catch(() => ({}));
    await dbConnect();
    const job: any = await JobWorkOrder.findById(id).lean();
    if (!job) return NextResponse.json({ error: 'Job work order not found.' }, { status: 404 });
    if (job.kind !== 'OUTWARD') throw new HttpError(400, 'A purchase order to a job worker applies to outward job work.');
    if (job.poNumber) return NextResponse.json(job);                 // already issued

    const charge = Number(b?.processingCharge), gst = b?.gstRate === undefined || b?.gstRate === '' ? 18 : Number(b.gstRate);
    if (!Number.isFinite(charge) || charge <= 0) throw new HttpError(400, 'Enter the processing charge per unit.');
    if (!Number.isFinite(gst) || gst < 0 || gst > 40) throw new HttpError(400, 'GST rate must be between 0 and 40.');

    // issue it once even if two people press the button at the same moment
    const issued: any = await createNumbered(JobWorkOrder, 'JWPO', 'poNumber', async (poNumber) => {
      const done = await JobWorkOrder.findOneAndUpdate({ _id: id, poNumber: { $exists: false } }, { poNumber, poIssuedAt: new Date(), processingCharge: charge, poGstRate: gst, poTerms: String(b?.terms || '').trim() || undefined }, { new: true });
      if (!done) throw new HttpError(409, 'A purchase order was just issued for this job. Reload.');
      return done;
    });
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'JOB_WORK_PO', resourceId: id, resourceName: issued.poNumber, details: `Purchase order to ${issued.partyName} for ${issued.number} at ${charge} per unit.` }).catch(() => {});
    return NextResponse.json(issued, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
