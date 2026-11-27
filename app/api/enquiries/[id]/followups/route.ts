import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Enquiry from '@/models/Enquiry';
import { verifyAuth } from '@/lib/auth';

const ROLES = ['ADMIN', 'MANAGER', 'SALES', 'STAFF'];

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid enquiry.' }, { status: 400 });
    const { dueAt, mode, notes } = await req.json();
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return NextResponse.json({ error: 'Choose a valid follow-up date.' }, { status: 400 });
    if (!['CALL', 'SMS', 'EMAIL'].includes(mode)) return NextResponse.json({ error: 'Mode must be Call, SMS or Email.' }, { status: 400 });

    await dbConnect();
    const enquiry: any = await Enquiry.findById(id);
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
    enquiry.followUps.push({ dueAt: due, mode, notes, status: 'PENDING', createdBy: user.name });
    await enquiry.save();
    return NextResponse.json(enquiry, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await context.params;
    const { followUpId, action, outcome } = await req.json();
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Invalid enquiry.' }, { status: 400 });
    if (!['complete', 'cancel'].includes(action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    if (action === 'complete' && !String(outcome || '').trim()) return NextResponse.json({ error: 'Record the outcome of the contact.' }, { status: 400 });

    await dbConnect();
    const enquiry: any = await Enquiry.findById(id);
    const f = enquiry?.followUps.id(followUpId);
    if (!f) return NextResponse.json({ error: 'Follow-up not found.' }, { status: 404 });
    if (f.status !== 'PENDING') return NextResponse.json({ error: `Follow-up is already ${f.status}.` }, { status: 409 });
    f.status = action === 'complete' ? 'DONE' : 'CANCELLED';
    f.doneAt = new Date();
    if (outcome) f.outcome = outcome;
    await enquiry.save();
    return NextResponse.json(enquiry);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
