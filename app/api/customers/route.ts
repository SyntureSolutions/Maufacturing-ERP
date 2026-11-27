import { statusOf } from '@/lib/httpError';
import { NextRequest, NextResponse } from 'next/server';
import { canViewParties } from '@/lib/accessRoles';
import dbConnect from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { CUSTOMER_WRITE_ROLES, customerData } from '@/lib/customerMaster';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { demoMode } from '@/lib/demoMode';

const SAMPLE_CUSTOMERS: any[] = [
  {
    _id: 'cust-1',
    name: 'Decathlon Sports India Pvt Ltd',
    code: 'CUST-001',
    gstin: '29AABCD1234E1Z6',
    contactPerson: 'Aditi Rao',
    email: 'orders@decathlon.in',
    phone: '+91 80 4099 2200',
    billingAddress: 'Survey No 78/10, Chikkajala Village, Bengaluru, Karnataka',
    city: 'Bengaluru',
    pincode: '562157',
    stateCode: '29',
    paymentTerms: 'Net 30',
    isActive: true
  },
  {
    _id: 'cust-2',
    name: 'Firefox Cycles Retail Ltd',
    code: 'CUST-002',
    gstin: '07AAACF4567M1ZV',
    contactPerson: 'Vikas Malhotra',
    email: 'procurement@firefoxbikes.com',
    phone: '+91 11 4100 8822',
    billingAddress: 'Plot 18, Okhla Industrial Area Phase 3, New Delhi',
    city: 'New Delhi',
    pincode: '110020',
    stateCode: '07',
    paymentTerms: 'Net 45',
    isActive: true
  },
  {
    _id: 'cust-3',
    name: 'ProBike Hub Mumbai',
    code: 'CUST-003',
    gstin: '27AABCP7890N1Z2',
    contactPerson: 'Siddharth Patil',
    email: 'store@probikehub.com',
    phone: '+91 22 2640 1122',
    billingAddress: 'Shop 4, Linking Road, Bandra West, Mumbai, Maharashtra',
    city: 'Mumbai',
    pincode: '400050',
    stateCode: '27',
    paymentTerms: 'Immediate',
    isActive: true
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canViewParties(user.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    
    await dbConnect(); // an unreachable database is an error, not an empty list
    const customers = await Customer.find().sort({ name: 1 }).lean();
    // sample customers only in DEMO_MODE: their ids are not real, so they cannot be put on a document
    return NextResponse.json(customers.length === 0 && demoMode() ? SAMPLE_CUSTOMERS : customers);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
}

// Create a customer, or update one when `_id` is supplied. GSTIN drives the GST state code.
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!CUSTOMER_WRITE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const b = await req.json();
    await dbConnect();
    const existing: any = b._id ? await Customer.findById(b._id).select('country gstin').lean() : null;
    if (b._id && !existing) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    const data = customerData(b, existing);
    if (b._id) {
      const updated = await Customer.findByIdAndUpdate(b._id, { $set: data }, { new: true, runValidators: true });
      return NextResponse.json(updated);
    }
    // A Customer ID from the template is kept; otherwise the next CUST number is used.
    const code = String(b.code || '').trim() || await nextDocNumber(Customer, 'CUST', 'code');
    const created = await Customer.create({ ...data, code });
    return NextResponse.json(created, { status: 201 }); // a failed save is an error, never a pretend customer
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
