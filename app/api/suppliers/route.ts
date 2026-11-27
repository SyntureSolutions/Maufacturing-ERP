import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Supplier from '@/models/Supplier';
import { statusOf } from '@/lib/httpError';
import { nextDocNumber } from '@/lib/docNumber';
import { SUPPLIER_WRITE_ROLES, supplierData } from '@/lib/supplierMaster';
import { demoMode, demoOrThrow } from '@/lib/demoMode';

const SAMPLE_SUPPLIERS = [
  {
    _id: 'sup-1',
    name: 'Apex Alloy Frames Ltd.',
    code: 'SUP-FRM-001',
    contactPerson: 'Rajesh Sharma',
    email: 'procurement@apexalloy.com',
    phone: '+91 98230 11223',
    address: 'Plot 42, Chakan Industrial Area, Pune, Maharashtra',
    category: 'Frames & Chassis Raw Material',
    rating: 4.8,
    gstin: '27AAACA1234F1Z5'
  },
  {
    _id: 'sup-2',
    name: 'Shimano Component Imports',
    code: 'SUP-DRV-002',
    contactPerson: 'Kenji Sato',
    email: 'orders@shimano-india.com',
    phone: '+91 22 4567 8900',
    address: 'Trade Tower 8th Floor, BKC, Mumbai',
    category: 'Drivetrains & Gear Transmission',
    rating: 4.9,
    gstin: '27AAACS5678G2Z1'
  },
  {
    _id: 'sup-3',
    name: 'Maxxis Rubber Tech Ltd.',
    code: 'SUP-TIR-003',
    contactPerson: 'Anil Mehta',
    email: 'sales@maxxisrubber.in',
    phone: '+91 79 3321 4455',
    address: 'GIDC Phase 3, Sanand, Gujarat',
    category: 'Tires, Tubes & Rubber Molded Goods',
    rating: 4.6,
    gstin: '24AAACM9012H1Z9'
  },
  {
    _id: 'sup-4',
    name: 'Tektro Brake Systems Corp',
    code: 'SUP-BRK-004',
    contactPerson: 'Suresh Kumar',
    email: 'brakes@tektro-india.com',
    phone: '+91 44 2890 1234',
    address: 'SIPCOT Industrial Park, Sriperumbudur, Tamil Nadu',
    category: 'Hydraulic Disc Brake Assemblies',
    rating: 4.7,
    gstin: '33AAACT3456I1Z2'
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await dbConnect();
      const suppliers = await Supplier.find({}).sort({ name: 1 });
      // sample suppliers only in DEMO_MODE: their ids are not real, so they cannot be put on a document
      return NextResponse.json(suppliers.length === 0 && demoMode() ? SAMPLE_SUPPLIERS : suppliers);
    } catch (dbErr) {
      demoOrThrow(dbErr);
    }

    return NextResponse.json(SAMPLE_SUPPLIERS);
  } catch (error: any) {
    return NextResponse.json({ error: 'The database is not reachable. Try again in a moment.', detail: error.message }, { status: 503 });
  }
}

// Create a supplier from the form or a row of the ERP Vendor Master Template. A Vendor ID that is sent is kept.
export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!SUPPLIER_WRITE_ROLES.includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    await dbConnect();
    const data = await supplierData(body);
    const code = String(body.code || '').trim() || await nextDocNumber(Supplier, 'SUP', 'code');
    const supplier = await Supplier.create({ ...data, code });
    return NextResponse.json(supplier, { status: 201 }); // a failed save is an error, never a made-up supplier
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
