import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import QualityCheck from '@/models/QualityCheck';
import BillOfMaterials from '@/models/BillOfMaterials';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { statusOf } from '@/lib/httpError';
import { materialReadiness, releaseWorkOrderReservations } from '@/lib/mrn';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Executive Viewer is strictly read-only
    if (user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Forbidden: Executive Viewer has read-only access and cannot modify work orders.' },
        { status: 403 }
      );
    }

    // Moving a work order through its stages consumes material and books output: only production-side roles may do it
    if (!['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_INSPECTOR', 'STAFF'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden: your role cannot change work orders.' }, { status: 403 });
    }

    const body = await req.json();
    const { status, overrideQcGate, overrideReason } = body;

    try {
      await dbConnect();
      const workOrder = await WorkOrder.findById(id);
      if (workOrder) {
        if (status === 'COMPLETED' && workOrder.status !== 'COMPLETED') {
          // the scrap and by-products the BOM lists must be recorded first (0 is fine); a QC override does not skip this
          const bom: any = await BillOfMaterials.findById(workOrder.bom).select('outputs').lean();
          if (bom?.outputs?.length && !workOrder.otherOutputsRecordedAt) {
            return NextResponse.json({ error: `Record the scrap and by-products of ${workOrder.woNumber} before completing it (enter 0 where there were none).`, reason: 'OUTPUTS_NOT_RECORDED', woNumber: workOrder.woNumber }, { status: 422 });
          }

          // QC HARD GATE: Check for failed or pending Quality Checks
          const failedQCs = await QualityCheck.find({ workOrder: workOrder._id, status: 'FAILED' });
          const pendingQCs = await QualityCheck.find({ workOrder: workOrder._id, status: 'PENDING' });

          const isQcBlocked = failedQCs.length > 0 || workOrder.qcStatus === 'FAILED';
          const isQcPending = pendingQCs.length > 0 || workOrder.qcStatus === 'PENDING';

          if (isQcBlocked && !overrideQcGate) {
            return NextResponse.json(
              {
                error: `QC Hard Gate Blocked: Work Order ${workOrder.woNumber} has ${failedQCs.length || 1} FAILED Quality Check(s). Production cannot close this order until the defect is resolved or cleared by Quality.`,
                gateStatus: 'BLOCKED',
                reason: 'QC_FAILED',
                qcStatus: 'FAILED',
                woNumber: workOrder.woNumber
              },
              { status: 422 }
            );
          }

          if (isQcPending && !overrideQcGate) {
            return NextResponse.json(
              {
                error: `QC Hard Gate Blocked: Work Order ${workOrder.woNumber} has mandatory Quality Checks that are still PENDING. Quality Inspector sign-off is required before completion.`,
                gateStatus: 'BLOCKED',
                reason: 'QC_PENDING',
                qcStatus: 'PENDING',
                woNumber: workOrder.woNumber
              },
              { status: 422 }
            );
          }

          if (overrideQcGate) {
            if (!['ADMIN', 'QUALITY_INSPECTOR'].includes(user.role)) {
              return NextResponse.json(
                { error: 'Forbidden: Only Quality Inspector or Super Admin can override a QC Gate.' },
                { status: 403 }
              );
            }
            workOrder.qcNotes = `QC Gate Overridden by ${user.name} (${user.role}). Reason: ${overrideReason || 'Authorized executive dispensation'}`;
          }

          workOrder.status = 'COMPLETED';
          workOrder.actualEndDate = new Date();
        } else if (status === 'IN_PROGRESS' && workOrder.status === 'PLANNED') {
          // work for a customer order does not start while its material requisition is known to be short
          if (workOrder.salesOrder) {
            const ready = await materialReadiness(workOrder._id);
            if (ready.status === 'SHORTFALL') {
              const reason = String(body.overrideReason || '').trim();
              if (!(body.overrideMaterial && ['ADMIN', 'MANAGER'].includes(user.role) && reason.length >= 10)) {
                return NextResponse.json({ error: `Material is short for ${workOrder.woNumber} (requisition ${ready.mrn?.number}). Receive the stock and reserve again, or ask a Manager/Admin to override with a written reason.` }, { status: 409 });
              }
              await logAuditEvent({ userId: user.id || user._id, userName: user.name, userRole: user.role, action: 'OVERRIDE', resource: 'WorkOrder', resourceId: id, resourceName: `Work Order ${workOrder.woNumber}`, details: 'Started with material short.', reason });
            }
          }
          workOrder.status = 'IN_PROGRESS';
          workOrder.actualStartDate = new Date();
        } else if (status) {
          // a cancelled work order gives its reserved material back
          if (status === 'CANCELLED' && workOrder.status !== 'CANCELLED') await releaseWorkOrderReservations(workOrder._id);
          workOrder.status = status;
        }
        await workOrder.save();
        await logAuditEvent({
          userId: user.id || user._id,
          userName: user.name,
          userRole: user.role,
          action: overrideQcGate ? 'OVERRIDE' : status === 'COMPLETED' ? 'APPROVE' : 'EDIT',
          resource: 'WorkOrder',
          resourceId: id,
          resourceName: `Work Order ${workOrder.woNumber}`,
          details: `Work Order status updated to '${status}'.`,
          reason: overrideReason,
        });
        return NextResponse.json(workOrder);
      }
    } catch (dbErr) {
      throw dbErr; // an unreachable database is an error, never a pretend status change
    }

    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    await dbConnect();
    const workOrder = await WorkOrder.findById(id)
      .populate('product')
      .populate('bom')
      .populate('assignedMachine');
    if (!workOrder) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    return NextResponse.json({ ...workOrder.toObject(), readiness: await materialReadiness(workOrder._id) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: statusOf(error) });
  }
}
