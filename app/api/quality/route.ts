import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import QualityCheck from '@/models/QualityCheck';
import Batch from '@/models/Batch';
import WorkOrder from '@/models/WorkOrder';
import NonConformance from '@/models/NonConformance';
import '@/models/User'; // registered so populate('inspector') works on a cold server
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { HttpError, statusOf } from '@/lib/httpError';
import { applyCheckToBatch, QcOutcome } from '@/lib/stockRules';

const QC_ROLES = ['ADMIN', 'MANAGER', 'QUALITY_INSPECTOR'];

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    const checks = await QualityCheck.find({})
      .populate('workOrder', 'woNumber')
      .populate('batch', 'batchNumber product qualityStatus')
      .populate('inspector', 'name')
      .sort({ createdAt: -1 });
    return NextResponse.json(checks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

/** What a finished check does to the work order it belongs to (the batch side is handled by applyCheckToBatch). */
async function syncWorkOrder(check: any) {
  if (!check.workOrder) return;
  if (check.status === 'FAILED') {
    await WorkOrder.findByIdAndUpdate(check.workOrder, { qcStatus: 'FAILED', qcGatePassed: false, status: 'ON_HOLD', qcNotes: `QC Gate BLOCKED: Inspection ${check.checkNumber} FAILED.`, $addToSet: { qualityChecks: check._id } });
  } else if (check.status === 'PASSED') {
    await WorkOrder.findByIdAndUpdate(check.workOrder, { qcStatus: 'PASSED', qcGatePassed: true, qcNotes: `QC Gate CLEARED: Inspection ${check.checkNumber} PASSED.`, $addToSet: { qualityChecks: check._id } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!QC_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await dbConnect();

    const body = await req.json();
    if (!['INCOMING', 'IN_PROCESS', 'FINAL'].includes(body.type)) throw new HttpError(400, 'Type must be INCOMING, IN_PROCESS or FINAL.');
    const status = body.status || 'PENDING';
    if (!['PENDING', 'PASSED', 'FAILED'].includes(status)) throw new HttpError(400, 'Status must be PENDING, PASSED or FAILED.');
    for (const f of ['batch', 'workOrder']) if (body[f] && !mongoose.isValidObjectId(String(body[f]))) throw new HttpError(400, `Invalid ${f}.`);
    if (!body.batch && !body.workOrder) throw new HttpError(400, 'A check must be against a batch or a work order.');
    // A check that already carries a result must be consistent with its own parameters
    const params: any[] = Array.isArray(body.parameters) ? body.parameters : [];
    if (status === 'PASSED' && params.some(p => p.result === 'FAIL')) throw new HttpError(400, 'A check cannot PASS while one of its parameters failed.');

    const date = new Date();
    const prefix = `QC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    let check: any;
    for (let attempt = 0; ; attempt++) {
      const count = await QualityCheck.countDocuments({ checkNumber: new RegExp(`^${prefix}`) });
      try {
        check = await QualityCheck.create({
          checkNumber: `${prefix}-${String(count + 1 + attempt).padStart(3, '0')}`, inspector: user.id,
          type: body.type, workOrder: body.workOrder || undefined, batch: body.batch || undefined, parameters: params, notes: body.notes,
          status, assignedDate: body.assignedDate || date, completedDate: status === 'PENDING' ? undefined : date,
        });
        break;
      } catch (e: any) { if (e?.code !== 11000 || attempt >= 6) throw e; }
    }

    let batchOutcome: QcOutcome | null = null;
    if (check.batch && (status === 'PASSED' || status === 'FAILED')) batchOutcome = await applyCheckToBatch(check.batch, status, check._id);
    else if (check.batch) await Batch.updateOne({ _id: check.batch }, { $addToSet: { qualityChecks: check._id } });
    await syncWorkOrder(check);

    if (status === 'FAILED') {
      try {
        const d = new Date();
        const ncrPrefix = `NCR-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
        const ncrCount = await NonConformance.countDocuments({ ncrNumber: new RegExp(`^${ncrPrefix}`) });
        await NonConformance.create({
          ncrNumber: `${ncrPrefix}-${String(ncrCount + 1).padStart(3, '0')}`, qualityCheck: check._id, batch: check.batch,
          type: body.ncrType || (check.type === 'INCOMING' ? 'MATERIAL' : check.type === 'FINAL' ? 'PRODUCT' : 'PROCESS'),
          severity: body.severity || 'MAJOR', correctiveAction: body.correctiveAction || 'Logged non-conformance for engineering disposition.',
          dispositionDecision: body.dispositionDecision || 'REWORK', status: 'OPEN',
        });
      } catch (ncrErr) { console.warn('Could not auto-generate NonConformance:', ncrErr); }
    }

    await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'QualityCheck', resourceId: String(check._id), resourceName: check.checkNumber, details: `Quality check ${check.checkNumber} (${check.type}) saved as ${status}.${batchOutcome ? ` Batch: ${batchOutcome.changed ? `now ${batchOutcome.status}` : `unchanged${batchOutcome.reason ? ` (${batchOutcome.reason})` : ''}`}.` : ''}` });
    return NextResponse.json({ ...check.toObject(), batchOutcome }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!QC_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id, status, assignedDate } = await req.json();
    if (!id || !mongoose.isValidObjectId(String(id))) throw new HttpError(400, 'A valid check id is required.');
    if (status !== undefined && !['PASSED', 'FAILED', 'PENDING'].includes(status)) throw new HttpError(400, 'Status must be PASSED or FAILED.');
    await dbConnect();

    const existing: any = await QualityCheck.findById(id);
    if (!existing) throw new HttpError(404, 'Quality check not found');
    if (status === 'PENDING' && existing.status !== 'PENDING') throw new HttpError(409, 'A completed check cannot be re-opened. Record a new check instead.');
    if (existing.status !== 'PENDING' && (status || assignedDate)) throw new HttpError(409, `The check is already ${existing.status}. Record a new check instead of changing it.`);
    if (status === 'PASSED' && (existing.parameters || []).some((p: any) => p.result === 'FAIL')) throw new HttpError(400, 'A check cannot PASS while one of its parameters failed.');

    const set: any = {};
    if (assignedDate) set.assignedDate = new Date(assignedDate);
    if (status === 'PASSED' || status === 'FAILED') { set.status = status; set.completedDate = new Date(); }
    // PENDING -> result happens once; a repeat finds it already decided and gets 409
    const check: any = await QualityCheck.findOneAndUpdate({ _id: id, status: 'PENDING' }, set, { new: true });
    if (!check) throw new HttpError(409, 'The check was decided by someone else a moment ago.');

    let batchOutcome: QcOutcome | null = null;
    if (check.batch && (status === 'PASSED' || status === 'FAILED')) batchOutcome = await applyCheckToBatch(check.batch, status, check._id);
    if (status === 'PASSED' || status === 'FAILED') await syncWorkOrder(check);
    if (status) await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'QualityCheck', resourceId: String(check._id), resourceName: check.checkNumber, details: `Quality check ${check.checkNumber} marked ${status}.${batchOutcome ? ` Batch: ${batchOutcome.changed ? `now ${batchOutcome.status}` : `unchanged${batchOutcome.reason ? ` (${batchOutcome.reason})` : ''}`}.` : ''}` });
    await check.populate('inspector', 'name');
    return NextResponse.json({ ...check.toObject(), batchOutcome });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
