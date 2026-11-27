import { NextRequest, NextResponse } from 'next/server';
import { canViewParties } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import CompanySettings from '@/models/CompanySettings';
import { verifyAuth } from '@/lib/auth';
import { isValidGstin } from '@/lib/gst';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewParties(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    await dbConnect();
    const doc = await CompanySettings.findOne({ key: 'company' }).lean();
    return NextResponse.json(doc || {});
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const b = await req.json();
    const gstin = String(b.gstin || '').toUpperCase();
    if (gstin && !isValidGstin(gstin)) return NextResponse.json({ error: 'GSTIN format is invalid.' }, { status: 400 });
    await dbConnect();
    const doc = await CompanySettings.findOneAndUpdate(
      { key: 'company' },
      { $set: { legalName: b.legalName, gstin, pan: b.pan, address1: b.address1, address2: b.address2, city: b.city, pincode: b.pincode, stateCode: gstin ? gstin.slice(0, 2) : b.stateCode, phone: b.phone, email: b.email, bank: b.bank, invoiceTerms: b.invoiceTerms, ...(b.usePickLists !== undefined ? { usePickLists: Boolean(b.usePickLists) } : {}) } },
      { upsert: true, new: true }
    );
    return NextResponse.json(doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
