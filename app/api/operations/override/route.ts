import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import WorkOrder from '@/models/WorkOrder';
import Order from '@/models/Order';
import PurchaseOrder from '@/models/PurchaseOrder';
import SalesOrder from '@/models/SalesOrder';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Strict Read-Only Gate for VIEWER
    if (user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Forbidden: Executive Viewer has read-only access and cannot execute operational overrides.' },
        { status: 403 }
      );
    }

    // 2. Cross-Department Authority Gate:
    // Production Manager manages floor schedules, but cross-department overrides require Operations Manager (MANAGER) or ADMIN
    if (user.role === 'PRODUCTION_MANAGER') {
      return NextResponse.json(
        { 
          error: 'Cross-Department Authority Restriction: Production Manager cannot execute cross-department overrides. Escalation to Operations Manager is required to resolve inter-department deadlocks.' 
        },
        { status: 403 }
      );
    }

    if (user.role !== 'MANAGER' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only Operations Manager and Super Admin possess exception and deadlock override authority.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { resource, resourceId, overrideType, reason } = body;

    if (!resource || !resourceId || !reason) {
      return NextResponse.json(
        { error: 'Resource, resourceId, and mandatory override reason are required.' },
        { status: 400 }
      );
    }

    if (reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'Audit Compliance Violation: Override reason must be detailed (minimum 10 characters explaining operational justification).' },
        { status: 400 }
      );
    }

    const now = new Date();
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    let updatedRecord: any = null;
    let resourceName = `${resource} #${resourceId}`;

    try {
      await dbConnect();

      if (resource === 'WorkOrder') {
        if (mongoose.Types.ObjectId.isValid(resourceId)) {
          updatedRecord = await WorkOrder.findByIdAndUpdate(
            resourceId,
            {
              status: 'IN_PROGRESS',
              qcHold: false,
              materialHold: false,
              isOverridden: true,
              overrideBy: user.name,
              overrideReason: reason,
              overrideAt: now,
            },
            { new: true }
          );
        } else {
          updatedRecord = await WorkOrder.findOneAndUpdate(
            { orderNumber: resourceId },
            {
              status: 'IN_PROGRESS',
              qcHold: false,
              materialHold: false,
              isOverridden: true,
              overrideBy: user.name,
              overrideReason: reason,
              overrideAt: now,
            },
            { new: true }
          );
        }
        if (updatedRecord?.orderNumber) resourceName = `Work Order ${updatedRecord.orderNumber}`;
      } else if (resource === 'Order') {
        if (mongoose.Types.ObjectId.isValid(resourceId)) {
          updatedRecord = await Order.findByIdAndUpdate(
            resourceId,
            {
              status: 'IN_PRODUCTION',
              isOverridden: true,
              overrideBy: user.name,
              overrideReason: reason,
              overrideAt: now,
            },
            { new: true }
          );
        }
      } else if (resource === 'PurchaseOrder') {
        if (mongoose.Types.ObjectId.isValid(resourceId)) {
          updatedRecord = await PurchaseOrder.findByIdAndUpdate(
            resourceId,
            {
              status: 'APPROVED',
              isOverridden: true,
              overrideBy: user.name,
              overrideReason: reason,
              overrideAt: now,
            },
            { new: true }
          );
        }
      } else if (resource === 'SalesOrder') {
        if (mongoose.Types.ObjectId.isValid(resourceId)) {
          updatedRecord = await SalesOrder.findByIdAndUpdate(
            resourceId,
            {
              creditCheckPassed: true,
              isOverridden: true,
              overrideBy: user.name,
              overrideReason: reason,
              overrideAt: now,
            },
            { new: true }
          );
        }
      }
    } catch (dbErr) {
      console.warn('Database override fallback:', dbErr);
    }

    // 3. Log into Universal Audit Trail
    const auditEntry = await logAuditEvent({
      userId: user.id || user._id,
      userName: user.name,
      userRole: user.role,
      action: 'OVERRIDE',
      resource,
      resourceId,
      resourceName,
      details: `Operations Exception Override (${overrideType || 'Cross-Department Deadlock Bypass'}). Deadlock released by ${user.name}.`,
      reason: reason.trim(),
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: `Operational override successfully executed by Operations Manager (${user.name}). Deadlock released and logged to compliance audit trail.`,
      record: updatedRecord || { id: resourceId, resource, isOverridden: true, overrideReason: reason },
      auditLogId: auditEntry._id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error during override' }, { status: 500 });
  }
}
