import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import Batch from '@/models/Batch';
import { deallocateStock, finalizeAllocation } from '@/lib/allocation';
import { verifyAuth } from '@/lib/auth';
import { sanitizeForViewer } from '@/lib/pii';
import { logAuditEvent } from '@/lib/audit';
import { demoMode, demoOrThrow } from '@/lib/demoMode';

const SAMPLE_ORDER_DETAILS: Record<string, any> = {
  'ord-1': {
    _id: 'ord-1',
    orderNumber: 'ORD-20260405-001',
    customerName: 'Decathlon Retail India',
    shippingAddress: 'Logistics Center, Chakan, Pune',
    phone: '+91 98765 11111',
    email: 'procurement@decathlon.in',
    status: 'SHIPPED',
    totalAmount: 925000,
    createdAt: new Date('2026-04-02').toISOString(),
    items: [
      { product: { name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001' }, quantity: 50, price: 18500 }
    ],
    allocations: [
      { batch: { batchNumber: 'BAT-BIK-202603-01', location: 'Main Bike Assembly Bay 1', expiryDate: '2027-03-15', qualityStatus: 'APPROVED' }, quantity: 50 }
    ]
  },
  'ord-2': {
    _id: 'ord-2',
    orderNumber: 'ORD-20260405-002',
    customerName: 'Metro Wheels & Distributors',
    shippingAddress: '45 GIDC Industrial Estate, Vadodara',
    phone: '+91 98888 22222',
    email: 'orders@metrowheels.com',
    status: 'PICKED', // In Picked status ready to test shipping attempt
    totalAmount: 1120000,
    createdAt: new Date('2026-04-04').toISOString(),
    items: [
      { product: { name: 'Velocity Trail Mountain Bike 29er', sku: 'BIK-MTB-002' }, quantity: 20, price: 32000 },
      { product: { name: 'E-Glide Electric Hybrid Bike 250W', sku: 'BIK-ELE-004' }, quantity: 10, price: 48000 }
    ],
    allocations: [
      { batch: { batchNumber: 'BAT-MTB-202603-02', location: 'Quarantine Rack Q-01', expiryDate: '2027-03-20', qualityStatus: 'ON_HOLD', qcNotes: 'Quarantined: Frame alignment non-conformance NCR-2026-014.' }, quantity: 20 },
      { batch: { batchNumber: 'BAT-ELE-202603-03', location: 'E-Bike Vault Bay 2', expiryDate: '2027-04-10', qualityStatus: 'APPROVED' }, quantity: 10 }
    ]
  },
  'ord-3': {
    _id: 'ord-3',
    orderNumber: 'ORD-20260405-003',
    customerName: 'National Sports Logistics Ltd',
    shippingAddress: 'Transport Nagar, New Delhi',
    phone: '+91 91234 33333',
    email: 'dispatch@nationalsports.in',
    status: 'PENDING',
    totalAmount: 975000,
    createdAt: new Date('2026-04-05').toISOString(),
    items: [
      { product: { name: 'AeroPro Carbon Road Bike', sku: 'BIK-ROD-003' }, quantity: 15, price: 65000 }
    ],
    allocations: [
      { batch: { batchNumber: 'BAT-ROD-202603-04', location: 'High-End Assembly Bay 3', expiryDate: '2027-05-01', qualityStatus: 'APPROVED' }, quantity: 15 }
    ]
  }
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuth(req);

    try {
      await dbConnect();
      const order = await Order.findById(id)
        .populate('items.product')
        .populate('allocations.batch');

      if (order) {
        const orderData = order.toObject ? order.toObject() : order;
        return NextResponse.json(user?.role === 'VIEWER' ? sanitizeForViewer(orderData, user.role) : orderData);
      }
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    if (demoMode() && SAMPLE_ORDER_DETAILS[id]) {
      const orderData = SAMPLE_ORDER_DETAILS[id];
      return NextResponse.json(user?.role === 'VIEWER' ? sanitizeForViewer(orderData, user.role) : orderData);
    }

    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Executive Viewer is strictly read-only
    if (user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Forbidden: Executive Viewer has read-only access and cannot modify orders.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { status, overrideQcGate, overrideReason } = body;

    try {
      await dbConnect();
      const order = await Order.findById(id).populate('allocations.batch');
      if (order) {
        if (status === 'SHIPPED' && order.status !== 'SHIPPED') {
          // QC HARD GATE: Check if any allocated batch is quarantined or rejected
          const quarantinedBatches = (order.allocations || []).filter((a: any) => {
            const b = a.batch;
            return b && (b.qualityStatus === 'REJECTED' || b.qualityStatus === 'ON_HOLD' || b.qualityStatus === 'PENDING_QC');
          });

          if (quarantinedBatches.length > 0 && !overrideQcGate) {
            const batchDetails = quarantinedBatches.map((a: any) => `${a.batch?.batchNumber || 'Batch'} (${a.batch?.qualityStatus || 'QUARANTINED'})`).join(', ');
            return NextResponse.json(
              {
                error: `QC Dispatch Hard Gate Blocked: Cannot ship Order ${order.orderNumber}. Allocated batch(es) [${batchDetails}] are QUARANTINED or REJECTED by Quality Control. Warehouse dispatch is strictly prohibited until stock is released or reallocated.`,
                gateStatus: 'BLOCKED',
                reason: 'BATCH_QUARANTINED',
                quarantinedBatches: quarantinedBatches.map((a: any) => ({
                  batchNumber: a.batch?.batchNumber,
                  qualityStatus: a.batch?.qualityStatus
                }))
              },
              { status: 422 }
            );
          }

          if (overrideQcGate) {
            if (!['ADMIN', 'QUALITY_INSPECTOR'].includes(user.role)) {
              return NextResponse.json(
                { error: 'Forbidden: Only Quality Inspector or Super Admin can authorize an override on quarantined stock dispatch.' },
                { status: 403 }
              );
            }
          }

          const allocationList = order.allocations.map((a: any) => ({
            batchId: (a.batch?._id || a.batch).toString(),
            quantity: a.quantity
          }));
          await finalizeAllocation(allocationList);
        } else if (status === 'CANCELLED' && order.status !== 'CANCELLED' && order.status !== 'SHIPPED') {
          const allocationList = order.allocations.map((a: any) => ({
            batchId: (a.batch?._id || a.batch).toString(),
            quantity: a.quantity
          }));
          await deallocateStock(allocationList);
        }

        order.status = status;
        await order.save();
        await logAuditEvent({
          userId: user.id || user._id,
          userName: user.name,
          userRole: user.role,
          action: overrideQcGate ? 'OVERRIDE' : status === 'SHIPPED' ? 'APPROVE' : status === 'CANCELLED' ? 'DELETE' : 'EDIT',
          resource: 'Order',
          resourceId: id,
          resourceName: `Order #${order.orderNumber}`,
          details: `Order status updated to '${status}'.`,
          reason: overrideReason,
        });
        return NextResponse.json(order);
      }
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    if (demoMode() && SAMPLE_ORDER_DETAILS[id]) {
      const order = SAMPLE_ORDER_DETAILS[id];
      if (status === 'SHIPPED' && order.status !== 'SHIPPED') {
        const quarantinedBatches = (order.allocations || []).filter((a: any) => {
          const b = a.batch;
          return b && (b.qualityStatus === 'REJECTED' || b.qualityStatus === 'ON_HOLD' || b.qualityStatus === 'PENDING_QC');
        });

        if (quarantinedBatches.length > 0 && !overrideQcGate) {
          const batchDetails = quarantinedBatches.map((a: any) => `${a.batch?.batchNumber} (${a.batch?.qualityStatus})`).join(', ');
          return NextResponse.json(
            {
              error: `QC Dispatch Hard Gate Blocked: Cannot ship Order ${order.orderNumber}. Allocated batch(es) [${batchDetails}] are QUARANTINED or REJECTED by Quality Control. Warehouse dispatch is strictly prohibited until stock is released or reallocated.`,
              gateStatus: 'BLOCKED',
              reason: 'BATCH_QUARANTINED',
              quarantinedBatches: quarantinedBatches.map((a: any) => ({
                batchNumber: a.batch?.batchNumber,
                qualityStatus: a.batch?.qualityStatus
              }))
            },
            { status: 422 }
          );
        }

        if (overrideQcGate && !['ADMIN', 'QUALITY_INSPECTOR'].includes(user.role)) {
          return NextResponse.json(
            { error: 'Forbidden: Only Quality Inspector or Super Admin can authorize an override on quarantined stock dispatch.' },
            { status: 403 }
          );
        }
      }

      SAMPLE_ORDER_DETAILS[id].status = status;
      await logAuditEvent({
        userId: user.id || user._id,
        userName: user.name,
        userRole: user.role,
        action: overrideQcGate ? 'OVERRIDE' : status === 'SHIPPED' ? 'APPROVE' : status === 'CANCELLED' ? 'DELETE' : 'EDIT',
        resource: 'Order',
        resourceId: id,
        resourceName: `Order #${order.orderNumber}`,
        details: `Order status updated to '${status}'.`,
        reason: overrideReason,
      });
      return NextResponse.json(SAMPLE_ORDER_DETAILS[id]);
    }

    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
