import { statusOf } from '@/lib/httpError';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Enquiry from '@/models/Enquiry';
import Quotation from '@/models/Quotation';
import { verifyAuth } from '@/lib/auth';
import { createNumbered } from '@/lib/docNumber';
import { ENQUIRY_ROLES, enquiryFields } from '@/lib/enquiryInput';
import { logAuditEvent } from '@/lib/audit';
import { demoMode } from '@/lib/demoMode';

const SAMPLE_ENQUIRIES = [
  {
    _id: 'enq-1',
    enquiryNumber: 'ENQ-2026-001',
    customerName: 'Reliance Retail Logistics',
    email: 'procurement@relianceretail.com',
    phone: '+91 98200 11223',
    source: 'WEBSITE',
    items: [{ productName: 'Apex Urban Commuter Bicycle', estimatedQuantity: 100 }],
    notes: 'Inquiring for Q3 festive distribution in Western Region.',
    status: 'NEW',
    createdAt: new Date('2026-04-10T10:00:00Z').toISOString(),
  },
  {
    _id: 'enq-2',
    enquiryNumber: 'ENQ-2026-002',
    customerName: 'Kalyan Sports Fleet Ltd',
    email: 'orders@kalyansports.in',
    phone: '+91 98765 43210',
    source: 'TRADE_SHOW',
    items: [{ productName: 'Velocity Trail Mountain Bike 29er', estimatedQuantity: 40 }],
    notes: 'Met at India Cycle Expo 2026. Needs alloy frame spec compliance.',
    status: 'NEW',
    createdAt: new Date('2026-04-12T14:30:00Z').toISOString(),
  },
  {
    _id: 'enq-3',
    enquiryNumber: 'ENQ-2026-003',
    customerName: 'Track & Trail Corporate Outlets',
    email: 'purchasing@trackandtrail.co.in',
    phone: '+91 91234 56789',
    source: 'EMAIL',
    items: [{ productName: 'E-Glide Electric Hybrid Bike 250W', estimatedQuantity: 25 }],
    notes: 'Requires custom battery enclosure branding.',
    status: 'QUALIFIED',
    convertedQuotationRef: 'QT-2026-003',
    createdAt: new Date('2026-04-14T09:15:00Z').toISOString(),
  },
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await dbConnect();
      const enquiries = await Enquiry.find({}).sort({ createdAt: -1 });
      if (enquiries && enquiries.length > 0 || !demoMode()) return NextResponse.json(enquiries);
    } catch (dbErr) {
      throw dbErr; // an unreachable database is an error, not an empty list
    }

    return NextResponse.json(SAMPLE_ENQUIRIES); // reachable but empty: demo data
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ENQUIRY_ROLES.includes(user.role)) return NextResponse.json({ error: 'You do not have permission to add enquiries.' }, { status: 403 });
    const fields = enquiryFields(await req.json().catch(() => null), true);

    await dbConnect();
    const created: any = await createNumbered(Enquiry, 'ENQ', 'enquiryNumber', (enquiryNumber) => Enquiry.create({ ...fields, enquiryNumber, status: 'NEW' })); // a failed save is an error, never a pretend enquiry
    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'ENQUIRY', resourceId: String(created._id), resourceName: created.enquiryNumber, details: `Enquiry from ${created.customerName} (${created.source}).` });
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: statusOf(error) });
  }
}
