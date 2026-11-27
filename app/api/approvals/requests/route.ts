import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { ApprovalRequest } from '@/models/ApprovalMatrix';
import { verifyAuth } from '@/lib/auth';
import { canAct, requestApproval } from '@/lib/approvals';
import PurchaseOrder from '@/models/PurchaseOrder';

// ?inbox=1 returns only requests the signed-in user can act on right now
export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const all = await ApprovalRequest.find().select('-payload').sort({ createdAt: -1 }).limit(200).lean() as any[];
    // The stored document details never leave the server. You see a request if you raised it, you are an Admin,
    // or your role is one of its approval levels.
    const visible = all.filter(r => user.role === 'ADMIN' || r.requestedBy === user.name || r.levels.some((l: any) => l.role === user.role));
    const rows = visible.map(r => ({ ...r, canAct: canAct(r, user.role) }));
    return NextResponse.json(req.nextUrl.searchParams.get('inbox') ? rows.filter(r => r.canAct) : rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Submit (or resubmit after a rejection) a draft purchase order for approval
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden: Executive Viewer has read-only access' }, { status: 403 });
    const { module, refId } = await req.json();
    if (module !== 'PURCHASE_ORDER') return NextResponse.json({ error: 'Unsupported module.' }, { status: 400 });
    await dbConnect();
    const po: any = await PurchaseOrder.findById(refId);
    if (!po) return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
    if (po.status !== 'DRAFT') return NextResponse.json({ error: 'Only draft purchase orders can be submitted.' }, { status: 409 });
    const request = await requestApproval({ module, refId: String(po._id), refNumber: po.poNumber, amount: po.totalAmount, requestedBy: user.name });
    if (!request) return NextResponse.json({ error: 'No approval rule covers this amount. Add a rule in the approval matrix.' }, { status: 409 });
    return NextResponse.json(request, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
