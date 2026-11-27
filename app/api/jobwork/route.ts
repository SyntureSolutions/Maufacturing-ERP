import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import JobWorkOrder from '@/models/JobWorkOrder';
import Customer from '@/models/Customer';
import { verifyAuth } from '@/lib/auth';
import { nextDocNumber } from '@/lib/docNumber';
import { planOutward, commitOutward } from '@/lib/jobworkOutward';
import { requestApproval } from '@/lib/approvals';
import { statusOf } from '@/lib/httpError';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'SUPPLY_CHAIN_MANAGER'];

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const kind = req.nextUrl.searchParams.get('kind');
    return NextResponse.json(await JobWorkOrder.find(kind ? { kind } : {}).sort({ createdAt: -1 }).limit(300).lean());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const b = await req.json();
    await dbConnect();

    if (b.kind === 'OUTWARD') {
      const plan = await planOutward(b); // validates and prices the stock; changes nothing yet

      // Material above a configured value waits for approval; no stock leaves until then
      const approval = await requestApproval({
        module: 'JOB_WORK_OUTWARD', refNumber: `Outward job work - ${plan.supplier.name}`, amount: plan.totalValue, requestedBy: user.name, requestedById: user.id, requestedByRole: user.role,
        summary: `${plan.supplier.name}: ${plan.plans.map(p => `${p.product.name} x ${p.qty}`).join(', ')} (${String(b.natureOfJob).trim()})`,
        payload: { ...b, date: b.date || new Date().toISOString() }, // dated when raised, not when approved
      });
      if (approval) {
        return NextResponse.json({
          message: `Sent for approval (${approval.levels.map((l: any) => l.role.replace(/_/g, ' ').toLowerCase()).join(' → ')}). No stock leaves until it is approved.`,
          pendingApproval: true, approvalId: approval._id,
        }, { status: 202 });
      }
      return NextResponse.json(await commitOutward(plan, b, user.name), { status: 201 });
    }

    if (b.kind === 'INWARD') {
      const customer: any = await Customer.findById(b.party);
      if (!customer) return NextResponse.json({ error: 'Select a customer.' }, { status: 400 });
      const lines = (b.items || []).filter((i: any) => String(i.description || '').trim() && Number(i.quantity) > 0);
      if (!lines.length) return NextResponse.json({ error: 'Add the customer material received.' }, { status: 400 });
      if (!(Number(b.serviceRate) > 0)) return NextResponse.json({ error: 'Enter the job work charge per unit.' }, { status: 400 });
      // No batch or valuation: the material stays the customer's property and is only tracked in the custody register
      const job = await JobWorkOrder.create({
        kind: 'INWARD', number: await nextDocNumber(JobWorkOrder, 'IJW', 'number'), party: customer._id, partyName: customer.name, partyGstin: customer.gstin,
        date: b.date ? new Date(b.date) : new Date(), natureOfJob: b.natureOfJob || '', serviceRate: Number(b.serviceRate), sac: b.sac || '9988', gstRate: Number(b.gstRate ?? 18), createdBy: user.name,
        items: lines.map((l: any) => ({ description: l.description.trim(), quantity: Number(l.quantity), uom: l.uom, value: 0 })),
      });
      return NextResponse.json(job, { status: 201 });
    }
    return NextResponse.json({ error: 'kind must be OUTWARD or INWARD.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: statusOf(err) });
  }
}
