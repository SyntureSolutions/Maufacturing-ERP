import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Enquiry from '@/models/Enquiry';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';
import { ENQUIRY_ROLES, enquiryFields } from '@/lib/enquiryInput';

const notFound = () => NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    await dbConnect();
    const enquiry = await Enquiry.findById(id).lean();
    return enquiry ? NextResponse.json(enquiry) : notFound();
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}

/**
 * Correct or cancel an enquiry that has not been quoted yet.
 *   { customerName?, email?, phone?, source?, notes?, region?, country?, items? }   change only what is sent
 *   { action: 'cancel', reason }                                                     cancel it; its pending follow-ups are cancelled too
 * Once a quotation has been made from it (status QUALIFIED) or it was cancelled, it is locked: revise the quotation instead.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ENQUIRY_ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to change enquiries.' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    const body = await req.json().catch(() => null);
    await dbConnect();
    const existing: any = await Enquiry.findById(id).lean();
    if (!existing) return notFound();
    if (existing.status !== 'NEW') throw new HttpError(409, existing.status === 'QUALIFIED'
      ? `${existing.enquiryNumber} has already been quoted (${existing.convertedQuotationRef || 'quotation'}). Revise the quotation instead.`
      : `${existing.enquiryNumber} is ${String(existing.status).toLowerCase()} and can no longer be changed.`);

    if (body?.action === 'cancel') {
      const reason = String(body.reason || '').trim();
      if (reason.length < 5) throw new HttpError(400, 'Give a reason for cancelling (at least 5 characters).');
      // claim NEW -> REJECTED first, so a conversion and a cancellation at the same moment cannot both succeed
      const claimed = await Enquiry.updateOne({ _id: id, status: 'NEW' }, {
        $set: { status: 'REJECTED', cancelReason: reason, cancelledBy: user.name, cancelledAt: new Date(), 'followUps.$[f].status': 'CANCELLED' },
      }, { arrayFilters: [{ 'f.status': 'PENDING' }] });
      if (!claimed.modifiedCount) throw new HttpError(409, 'The enquiry was changed by someone else. Reload and try again.');
      await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'DELETE', resource: 'ENQUIRY', resourceId: id, resourceName: existing.enquiryNumber, details: `Cancelled: ${reason}`, reason });
      return NextResponse.json(await Enquiry.findById(id).lean());
    }

    const change = enquiryFields(body, false);
    if (!Object.keys(change).length) throw new HttpError(400, 'Send the fields to change.');
    const saved = await Enquiry.findOneAndUpdate({ _id: id, status: 'NEW' }, { $set: change }, { new: true, runValidators: true });
    if (!saved) throw new HttpError(409, 'The enquiry was changed by someone else. Reload and try again.');
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'ENQUIRY', resourceId: id, resourceName: existing.enquiryNumber, details: `Edited ${Object.keys(change).join(', ')}.` });
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
