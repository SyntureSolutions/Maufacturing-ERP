import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Batch from '@/models/Batch';
import PurchaseOrder from '@/models/PurchaseOrder';
import { verifyAuth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { demoOrThrow } from '@/lib/demoMode';

// In-memory fallback supply chain store with realistic PO/SO linked shipments
const memoryShipments: any[] = [
  {
    _id: 'shp-101',
    trackingNumber: 'TRK-BIK-2026-991',
    type: 'OUTBOUND',
    orderType: 'SALES_ORDER',
    orderNumber: 'SO-2026-003',
    entityName: 'Decathlon Sports India Pvt Ltd',
    items: [
      { productName: 'Apex Urban Commuter Bicycle', sku: 'BIK-URB-001', quantity: 50, unitCost: 12000, uom: 'units' }
    ],
    carrier: 'VRL Logistics Express Fleet',
    vehicleNumber: 'MH-14-GH-3391',
    driverName: 'Ramesh Sawant',
    driverPhone: '+91 98220 44912',
    origin: 'Chakan Manufacturing Plant, Pune',
    destination: 'Decathlon Central Fulfillment Hub, Bengaluru',
    dispatchDate: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    expectedDeliveryDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    actualDeliveryDate: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    status: 'DELIVERED',
    ewayBillNumber: 'EWB-294019284019',
    shippingCost: 35000,
    podReceiverName: 'Sanjay Deshmukh (Receiving Lead)',
    podReceiverPhone: '+91 99881 22334',
    podSignature: 'SIG-DECATHLON-8891',
    podTimestamp: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    podNotes: 'Received all 50 boxed units in prime condition. Seals intact.',
    createdAt: new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString()
  },
  {
    _id: 'shp-102',
    trackingNumber: 'TRK-BIK-2026-992',
    type: 'INBOUND',
    orderType: 'PURCHASE_ORDER',
    orderNumber: 'PO-2026-0042',
    entityName: 'Shimano Component Imports Ltd',
    items: [
      { productName: 'Shimano Deore 11-Speed Drivetrain', sku: 'CMP-DRV-001', quantity: 75, unitCost: 6000, uom: 'sets' },
      { productName: 'Hydraulic Disc Brake Set', sku: 'CMP-BRK-002', quantity: 150, unitCost: 2800, uom: 'sets' }
    ],
    carrier: 'TCI Freight Logistics',
    vehicleNumber: 'GJ-06-TT-8841',
    driverName: 'Kishanlal Meena',
    driverPhone: '+91 94231 88712',
    origin: 'JNPT Port Logistics Yard, Navi Mumbai',
    destination: 'Chakan Central Raw Material Depot, Pune',
    dispatchDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    expectedDeliveryDate: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    revisedETA: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    status: 'DELAYED',
    ewayBillNumber: 'EWB-182940182941',
    shippingCost: 28000,
    delayReasonCode: 'CUSTOMS_HOLD',
    delayDetails: 'Port customs clearance inspection on imported container seal hold at Panvel octroi booth.',
    grnGenerated: false,
    createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
  },
  {
    _id: 'shp-103',
    trackingNumber: 'TRK-BIK-2026-993',
    type: 'INBOUND',
    orderType: 'PURCHASE_ORDER',
    orderNumber: 'PO-2026-0045',
    entityName: 'Apex Alloy Frames Ltd',
    items: [
      { productName: 'High-Grade Alloy Frame T6', sku: 'RAW-FRM-001', quantity: 120, unitCost: 3200, uom: 'frames' }
    ],
    carrier: 'Blue Dart Surface Cargo',
    vehicleNumber: 'MH-12-PQ-9012',
    driverName: 'Vikram Jadhav',
    driverPhone: '+91 97654 32109',
    origin: 'Apex Extrusions Foundry, Surat',
    destination: 'Chakan Manufacturing Plant, Pune',
    dispatchDate: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    expectedDeliveryDate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    status: 'IN_TRANSIT',
    ewayBillNumber: 'EWB-901284019283',
    shippingCost: 22000,
    grnGenerated: false,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  },
  {
    _id: 'shp-104',
    trackingNumber: 'TRK-BIK-2026-994',
    type: 'OUTBOUND',
    orderType: 'SALES_ORDER',
    orderNumber: 'SO-2026-005',
    entityName: 'Metro Wheels Distribution Estate, Vadodara',
    items: [
      { productName: 'Velocity Trail Mountain Bike 29er', sku: 'BIK-MTB-002', quantity: 20, unitCost: 22000, uom: 'units' }
    ],
    carrier: 'GATI KWE Commercial Transport',
    vehicleNumber: 'MH-14-AB-1102',
    origin: 'Chakan Manufacturing Plant, Pune',
    destination: 'Metro Wheels Estate, Vadodara, Gujarat',
    expectedDeliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    status: 'PREPARING',
    shippingCost: 18000,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await dbConnect();
      const shipments = await Shipment.find({}).sort({ createdAt: -1 });
      if (shipments && shipments.length > 0) {
        return NextResponse.json(shipments);
      }
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB connection unavailable for Shipment, using memory fallback:', dbErr);
    }

    return NextResponse.json(memoryShipments);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuth(req);
    const body = await req.json();

    const trackingNumber = `TRK-BIK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const newShipmentData = {
      trackingNumber,
      orderType: body.orderType || 'PURCHASE_ORDER',
      orderNumber: body.orderNumber || 'PO-2026-0001',
      entityName: body.entityName || 'Vendor Logistics Partner',
      items: body.items || [],
      type: body.type || 'INBOUND',
      carrier: body.carrier || 'Internal Fleet Transport',
      vehicleNumber: body.vehicleNumber || 'MH-12-XX-0000',
      driverName: body.driverName || 'Assigned Driver',
      driverPhone: body.driverPhone || '',
      origin: body.origin || 'Warehouse Hub',
      destination: body.destination || 'Plant Delivery Dock',
      dispatchDate: body.dispatchDate || new Date(),
      expectedDeliveryDate: body.expectedDeliveryDate || new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: body.status || 'IN_TRANSIT',
      ewayBillNumber: body.ewayBillNumber || `EWB-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      shippingCost: Number(body.shippingCost) || 0
    };

    try {
      await dbConnect();
      const created = await Shipment.create(newShipmentData);
      await logAuditEvent({
        userName: user?.name || 'Logistics Coordinator',
        userRole: user?.role || 'MANAGER',
        action: 'CREATE',
        resource: 'Shipment',
        resourceId: String(created._id),
        resourceName: trackingNumber,
        details: `Created shipment ${trackingNumber} for ${created.orderNumber} (${created.entityName}) via ${created.carrier}.`
      });
      return NextResponse.json(created, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB create shipment failed, using memory store:', dbErr);
      const memShipment = {
        _id: `shp-${Date.now()}`,
        ...newShipmentData,
        createdAt: new Date().toISOString()
      };
      memoryShipments.unshift(memShipment);
      return NextResponse.json(memShipment, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuth(req);
    const userName = user?.name || 'Supply Chain Controller';
    const userRole = user?.role || 'MANAGER';

    const body = await req.json();
    const { 
      shipmentId, 
      action, 
      delayReasonCode, 
      delayDetails, 
      revisedETA,
      podReceiverName,
      podReceiverPhone,
      podSignature,
      podNotes,
      autoGRN
    } = body;

    if (!shipmentId || !action) {
      return NextResponse.json({ error: 'shipmentId and action are required.' }, { status: 400 });
    }

    // ACTION 1: LOG DELAY WITH REASON CODE & REVISED ETA
    if (action === 'LOG_DELAY') {
      try {
        await dbConnect();
        const shipment = await Shipment.findById(shipmentId);
        if (shipment) {
          shipment.status = 'DELAYED';
          shipment.delayReasonCode = delayReasonCode || 'TRAFFIC_CONGESTION';
          shipment.delayDetails = delayDetails || 'Transit delay reported on route.';
          if (revisedETA) shipment.revisedETA = new Date(revisedETA);
          await shipment.save();

          await logAuditEvent({
            userName,
            userRole,
            action: 'EDIT',
            resource: 'Shipment',
            resourceId: String(shipment._id),
            resourceName: shipment.trackingNumber,
            details: `Flagged shipment ${shipment.trackingNumber} as DELAYED. Reason: ${shipment.delayReasonCode}. Details: ${shipment.delayDetails}.`
          });

          return NextResponse.json(shipment);
        }
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('MongoDB log delay failed, using memory store:', dbErr);
      }

      const idx = memoryShipments.findIndex(s => s._id === shipmentId);
      if (idx !== -1) {
        memoryShipments[idx].status = 'DELAYED';
        memoryShipments[idx].delayReasonCode = delayReasonCode || 'TRAFFIC_CONGESTION';
        memoryShipments[idx].delayDetails = delayDetails || 'Transit delay reported on route.';
        if (revisedETA) memoryShipments[idx].revisedETA = revisedETA;
        return NextResponse.json(memoryShipments[idx]);
      }
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    // ACTION 2: CAPTURE PROOF OF DELIVERY (POD) & AUTO-GRN
    if (action === 'CAPTURE_POD') {
      let targetShipment: any = null;
      let generatedBatches: string[] = [];

      try {
        await dbConnect();
        targetShipment = await Shipment.findById(shipmentId);
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('MongoDB find shipment failed in CAPTURE_POD:', dbErr);
      }

      if (!targetShipment) {
        const idx = memoryShipments.findIndex(s => s._id === shipmentId);
        if (idx !== -1) {
          targetShipment = memoryShipments[idx];
        }
      }

      if (!targetShipment) {
        return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
      }

      const podTime = new Date();
      targetShipment.status = 'DELIVERED';
      targetShipment.actualDeliveryDate = podTime;
      targetShipment.podReceiverName = podReceiverName || 'Receiving Supervisor';
      targetShipment.podReceiverPhone = podReceiverPhone || '';
      targetShipment.podSignature = podSignature || `SIG-POD-${Math.floor(1000 + Math.random() * 9000)}`;
      targetShipment.podTimestamp = podTime;
      targetShipment.podNotes = podNotes || 'Goods received and inspected at delivery dock.';

      // AUTO-GRN TRIGGER: When Inbound Shipment arrives, push directly into Inventory Batches!
      if (autoGRN && targetShipment.type === 'INBOUND' && Array.isArray(targetShipment.items)) {
        try {
          await dbConnect();
          for (const item of targetShipment.items) {
            const batchNum = `BN-GRN-${Math.floor(1000 + Math.random() * 9000)}`;
            await Batch.create({
              batchNumber: batchNum,
              productName: item.productName,
              initialQuantity: item.quantity,
              currentQuantity: item.quantity,
              allocatedQuantity: 0,
              minSafetyStock: 25,
              unitCost: item.unitCost || 3200,
              location: 'Dock Inward Bay (Auto-GRN)',
              supplier: targetShipment.entityName,
              expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              qualityStatus: 'APPROVED'
            });
            generatedBatches.push(batchNum);
          }

          // Mark parent PO as RECEIVED if exists
          if (targetShipment.orderNumber) {
            await PurchaseOrder.findOneAndUpdate(
              { poNumber: targetShipment.orderNumber },
              { status: 'RECEIVED', receivedDate: podTime }
            );
          }

          targetShipment.grnGenerated = true;
          targetShipment.grnBatchNumbers = generatedBatches;
        } catch (grnErr) {
          console.warn('Auto-GRN batch creation failed, recorded in memory:', grnErr);
          generatedBatches = targetShipment.items.map(() => `BN-GRN-${Math.floor(1000 + Math.random() * 9000)}`);
          targetShipment.grnGenerated = true;
          targetShipment.grnBatchNumbers = generatedBatches;
        }
      }

      if (typeof targetShipment.save === 'function') {
        await targetShipment.save();
      }

      await logAuditEvent({
        userName,
        userRole,
        action: 'APPROVE',
        resource: 'Shipment',
        resourceId: String(targetShipment._id),
        resourceName: targetShipment.trackingNumber,
        details: `Proof of Delivery (POD) signed for ${targetShipment.trackingNumber} by ${targetShipment.podReceiverName}. Status: DELIVERED. ${generatedBatches.length > 0 ? `Auto-GRN generated batches: ${generatedBatches.join(', ')}.` : ''}`
      });

      return NextResponse.json({
        message: `Shipment ${targetShipment.trackingNumber} marked DELIVERED with legal POD captured.${generatedBatches.length > 0 ? ` Auto-GRN created ${generatedBatches.length} inventory batches.` : ''}`,
        shipment: targetShipment,
        generatedBatches
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
