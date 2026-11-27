import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import ExportDocument from '@/models/ExportDocument';
import { demoOrThrow, demoMode } from '@/lib/demoMode';

const SAMPLE_EXPORT_DOCS = [
  {
    _id: 'exp-1',
    documentNumber: 'EXP-202604-001',
    type: 'BILL_OF_LADING',
    shippingLine: 'Maersk Logistics India',
    vesselName: 'Maersk Sealand v.204E',
    originPort: 'Jawaharlal Nehru Port (JNPT), Nhava Sheva, India',
    destinationPort: 'Port of Rotterdam, Netherlands',
    consignee: 'Decathlon International Logistics B.V.',
    goodsDescription: '100x AeroPro Carbon Road Bikes in Wooden Packaging Crates',
    totalValueUSD: 85000,
    status: 'IN_TRANSIT',
    shippedDate: '2026-03-28'
  },
  {
    _id: 'exp-2',
    documentNumber: 'IMP-202603-002',
    type: 'CUSTOMS_DECLARATION',
    shippingLine: 'Ocean Network Express (ONE)',
    vesselName: 'ONE Commitment v.102W',
    originPort: 'Kobe Port, Japan',
    destinationPort: 'JNPT Nhava Sheva, Mumbai',
    consignee: 'Bicycle Manufacturing Works Ltd.',
    goodsDescription: '500x Shimano Deore 11-Speed Transmission Sets & Shifters',
    totalValueUSD: 42000,
    status: 'CUSTOMS_CLEARED',
    shippedDate: '2026-03-15'
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await dbConnect();
      const docs = await ExportDocument.find({}).populate('invoice', 'invoiceNumber').sort({ createdAt: -1 });
      if (docs.length > 0 || !demoMode()) return NextResponse.json(docs);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json(SAMPLE_EXPORT_DOCS);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
