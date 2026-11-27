import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import WorkOrder from '@/models/WorkOrder';
import SalesOrder from '@/models/SalesOrder';
import mongoose from 'mongoose';
import { nextWoNumber } from '@/lib/woNumber';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import Machine from '@/models/Machine';
import BillOfMaterials from '@/models/BillOfMaterials';
import { statusOf } from '@/lib/httpError';
import { demoOrThrow, demoMode } from '@/lib/demoMode';
import { assertItemsActive } from '@/lib/itemRules';

export const SAMPLE_WORK_ORDERS: any[] = [
  {
    _id: 'wo-1',
    woNumber: 'WO-BIK-2026-001',
    product: { _id: 'p1', name: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001', uom: 'unit' },
    quantity: 50,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    plannedStartDate: '2026-04-01',
    plannedEndDate: '2026-04-10',
    assignedMachine: { _id: 'm1', name: 'Assembly Line #1 (Frame & Wheel Fit)', code: 'ASM-01' },
    qcStatus: 'PENDING',
    qcGatePassed: false,
    qcNotes: 'QC Gate Pending: Mandatory Final Track & Roll Inspection QC-20260405-003 is still PENDING sign-off.',
    createdAt: new Date('2026-04-01').toISOString()
  },
  {
    _id: 'wo-2',
    woNumber: 'WO-BIK-2026-002',
    product: { _id: 'p2', name: 'Velocity Trail Mountain Bike 29er', sku: 'BIK-MTB-002', uom: 'unit' },
    quantity: 25,
    priority: 'MEDIUM',
    status: 'IN_PROGRESS', // Move to In Progress to test closure attempt
    plannedStartDate: '2026-03-15',
    plannedEndDate: '2026-03-25', // Overdue for demo
    assignedMachine: { _id: 'm2', name: 'Robot Welding Station A', code: 'WLD-01' },
    qcStatus: 'FAILED',
    qcGatePassed: false,
    qcNotes: 'QC Gate BLOCKED: Inspection QC-20260405-002 FAILED (Gear Shift Indexing Speed Lag 0.40s). Non-conformance disposition required.',
    createdAt: new Date('2026-03-15').toISOString()
  },
  {
    _id: 'wo-3',
    woNumber: 'WO-BIK-2026-003',
    product: { _id: 'p4', name: 'E-Glide Electric Hybrid Bike 250W', sku: 'BIK-ELE-004', uom: 'unit' },
    quantity: 30,
    priority: 'CRITICAL',
    status: 'PLANNED',
    plannedStartDate: '2026-04-05',
    plannedEndDate: '2026-04-15',
    assignedMachine: { _id: 'm3', name: 'Battery & Motor Integration Bay', code: 'ELE-01' },
    qcStatus: 'PENDING',
    qcGatePassed: false,
    qcNotes: 'Pre-production battery insulation test pending.',
    createdAt: new Date('2026-04-04').toISOString()
  },
  {
    _id: 'wo-4',
    woNumber: 'WO-BIK-2026-004',
    product: { _id: 'p3', name: 'AeroPro Carbon Road Bike', sku: 'BIK-ROD-003', uom: 'unit' },
    quantity: 15,
    priority: 'HIGH',
    status: 'COMPLETED',
    plannedStartDate: '2026-03-20',
    plannedEndDate: '2026-03-30',
    actualStartDate: '2026-03-20',
    actualEndDate: '2026-03-29',
    assignedMachine: { _id: 'm4', name: 'Precision Carbon Mold & Finishing', code: 'CRB-01' },
    qcStatus: 'PASSED',
    qcGatePassed: true,
    qcNotes: 'All 3 Quality Parameters PASSED inspection.',
    createdAt: new Date('2026-03-20').toISOString()
  },
  {
    _id: 'wo-5',
    woNumber: 'WO-BIK-2026-005',
    product: { _id: 'p5', name: 'High-Grade Alloy Frame T6', sku: 'RAW-FRM-001', uom: 'pcs' },
    quantity: 100,
    priority: 'LOW',
    status: 'COMPLETED',
    plannedStartDate: '2026-03-10',
    plannedEndDate: '2026-03-18',
    actualStartDate: '2026-03-10',
    actualEndDate: '2026-03-18',
    assignedMachine: { _id: 'm5', name: 'CNC Tube Cutting & Hydroforming', code: 'CNC-01' },
    qcStatus: 'PASSED',
    qcGatePassed: true,
    qcNotes: 'Dimensions, weld joints and metallurgy certified PASSED.',
    createdAt: new Date('2026-03-10').toISOString()
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await dbConnect();
      const workOrders = await WorkOrder.find({})
        .populate('product', 'name sku uom')
        .populate('bom', 'version')
        .populate('assignedMachine', 'name code')
        .sort({ createdAt: -1 });

      if (workOrders.length > 0 || !demoMode()) return NextResponse.json(workOrders);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json(SAMPLE_WORK_ORDERS);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuth(req);
    if (!user || !['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    const demandType = body.demandType || 'MTS';
    if (!['MTO', 'MTS'].includes(demandType)) return NextResponse.json({ error: 'Demand type must be MTO or MTS.' }, { status: 400 });
    if (demandType === 'MTO' && !String(body.salesOrderRef || '').trim()) return NextResponse.json({ error: 'A sales order is required for Make to Order work.' }, { status: 400 });

    // Only these fields are taken from the request. Everything else (status, parent work order, MRP run, quality fields...) is set by the system.
    const qty = Number(body.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: 'Quantity must be more than zero.' }, { status: 400 }); // kg and litres can be part quantities
    if (!mongoose.isValidObjectId(body.product)) return NextResponse.json({ error: 'Choose a product.' }, { status: 400 });
    if (!mongoose.isValidObjectId(body.bom)) return NextResponse.json({ error: 'Choose a bill of materials.' }, { status: 400 });
    if (body.priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(body.priority)) return NextResponse.json({ error: 'Priority must be LOW, MEDIUM, HIGH or CRITICAL.' }, { status: 400 });
    if (body.assignedMachine && !mongoose.isValidObjectId(body.assignedMachine)) return NextResponse.json({ error: 'Choose a valid production line.' }, { status: 400 });
    const startDate = body.plannedStartDate ? new Date(body.plannedStartDate) : undefined;
    const endDate = body.plannedEndDate ? new Date(body.plannedEndDate) : undefined;
    if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) return NextResponse.json({ error: 'Planned dates are not valid.' }, { status: 400 });
    if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: 'The planned end cannot be before the planned start.' }, { status: 400 });

    const payload: any = {
      product: body.product, bom: body.bom, quantity: qty, priority: body.priority || 'MEDIUM', demandType,
      salesOrderRef: demandType === 'MTO' ? String(body.salesOrderRef).trim() : undefined,
      assignedMachine: body.assignedMachine || undefined, plannedStartDate: startDate, plannedEndDate: endDate,
    };

    try {
      await dbConnect();
    } catch (dbErr) {
      throw dbErr; // an unreachable database is an error, never a pretend work order
    }

    await assertItemsActive([payload.product], 'work order');

    // only an active BOM of this very item can be built from: never a draft, one waiting for approval, or a retired one
    const bom: any = await BillOfMaterials.findById(payload.bom).select('product status version').lean();
    if (!bom || String(bom.product) !== String(payload.product)) return NextResponse.json({ error: 'That bill of materials is not for this item.' }, { status: 400 });
    if (bom.status !== 'ACTIVE') return NextResponse.json({ error: `BOM version ${bom.version} is ${String(bom.status).toLowerCase().replace('_', ' ')}. Only an active BOM can be used for a work order.` }, { status: 409 });

    // the link to the customer order comes from its number; a salesOrder sent in the request is never used
    const linkedSo: any = payload.salesOrderRef ? await SalesOrder.findOne({ soNumber: payload.salesOrderRef }).select('_id').lean() : null;
    if (demandType === 'MTO' && !linkedSo) return NextResponse.json({ error: `Sales order ${payload.salesOrderRef} was not found.` }, { status: 404 });
    if (linkedSo) payload.salesOrder = linkedSo._id;

    // Auto-assign to the least-loaded production line (machines that are available and not in maintenance)
    if (body.autoAssign && !payload.assignedMachine) {
      const machines: any[] = await Machine.find({ status: { $in: ['AVAILABLE', 'IN_USE'] } }).lean();
      if (!machines.length) return NextResponse.json({ error: 'No production line is available for auto-assignment.' }, { status: 409 });
      const loads = await WorkOrder.aggregate([{ $match: { status: { $in: ['PLANNED', 'IN_PROGRESS'] }, assignedMachine: { $in: machines.map(m => m._id) } } }, { $group: { _id: '$assignedMachine', n: { $sum: 1 }, qty: { $sum: '$quantity' } } }]);
      const load = (id: any) => loads.find((l: any) => String(l._id) === String(id)) || { n: 0, qty: 0 };
      payload.assignedMachine = machines.sort((x, y) => load(x._id).qty - load(y._id).qty || load(x._id).n - load(y._id).n)[0]._id;
    }

    // two people creating at once can be given the same number; the unique index refuses the second, which then asks again
    let workOrder: any;
    for (let attempt = 1; ; attempt++) {
      const woNumber = await nextWoNumber();
      try { workOrder = await WorkOrder.create({ woNumber, ...payload }); break; } catch (err: any) {
        if (!(err?.code === 11000 && attempt < 8)) throw err;
      }
    }

    await logAuditEvent({
      userId: user.id || user._id, userName: user.name, userRole: user.role, action: 'CREATE', resource: 'WorkOrder', resourceId: workOrder._id, resourceName: `Work Order ${workOrder.woNumber}`,
      details: `Work order created for quantity ${payload.quantity} units (${payload.priority} priority).`,
    });
    return NextResponse.json(workOrder, { status: 201 });
  } catch (error: any) {
    const bad = error?.name === 'ValidationError' || error?.name === 'CastError';
    return NextResponse.json({ error: error.message }, { status: bad ? 400 : statusOf(error) });
  }
}
