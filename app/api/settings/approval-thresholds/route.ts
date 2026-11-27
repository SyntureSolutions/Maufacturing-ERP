import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ApprovalThreshold from '@/models/ApprovalThreshold';
import { verifyAuth } from '@/lib/auth';
import { demoOrThrow } from '@/lib/demoMode';

// In-memory fallback configuration when MongoDB is not connected
export let memoryThresholds = {
  _id: 'default-approval-thresholds',
  poSupplyChainLimit: 50000,
  poFinanceLimit: 500000,
  discountSalesLimitPercent: 10,
  discountFinanceLimitPercent: 25,
  discountAmountLimit: 50000,
  writeOffFloorLimit: 15000,
  writeOffFinanceLimit: 100000,
  lastUpdatedBy: 'System Initializer',
  lastUpdatedRole: 'ADMIN',
  updatedAt: new Date().toISOString()
};

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await dbConnect();
      let thresholdDoc = await ApprovalThreshold.findOne().sort({ updatedAt: -1 });
      if (!thresholdDoc) {
        thresholdDoc = await ApprovalThreshold.create({
          poSupplyChainLimit: 50000,
          poFinanceLimit: 500000,
          discountSalesLimitPercent: 10,
          discountFinanceLimitPercent: 25,
          discountAmountLimit: 50000,
          writeOffFloorLimit: 15000,
          writeOffFinanceLimit: 100000,
          lastUpdatedBy: 'System Initializer',
          lastUpdatedRole: 'ADMIN'
        });
      }
      return NextResponse.json(thresholdDoc);
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB query for ApprovalThreshold failed, using in-memory store:', dbErr);
    }

    return NextResponse.json(memoryThresholds);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Authorization check: Super Admin and Finance Manager ONLY
    if (!['ADMIN', 'FINANCE_MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin and Finance Manager are authorized to configure approval threshold limits.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updatedValues = {
      poSupplyChainLimit: Number(body.poSupplyChainLimit ?? memoryThresholds.poSupplyChainLimit),
      poFinanceLimit: Number(body.poFinanceLimit ?? memoryThresholds.poFinanceLimit),
      discountSalesLimitPercent: Number(body.discountSalesLimitPercent ?? memoryThresholds.discountSalesLimitPercent),
      discountFinanceLimitPercent: Number(body.discountFinanceLimitPercent ?? memoryThresholds.discountFinanceLimitPercent),
      discountAmountLimit: Number(body.discountAmountLimit ?? memoryThresholds.discountAmountLimit),
      writeOffFloorLimit: Number(body.writeOffFloorLimit ?? memoryThresholds.writeOffFloorLimit),
      writeOffFinanceLimit: Number(body.writeOffFinanceLimit ?? memoryThresholds.writeOffFinanceLimit),
      lastUpdatedBy: user.name || 'Finance Executive',
      lastUpdatedRole: user.role,
      updatedAt: new Date()
    };

    try {
      await dbConnect();
      let thresholdDoc = await ApprovalThreshold.findOne().sort({ updatedAt: -1 });
      if (thresholdDoc) {
        Object.assign(thresholdDoc, updatedValues);
        await thresholdDoc.save();
      } else {
        thresholdDoc = await ApprovalThreshold.create(updatedValues);
      }
      return NextResponse.json(thresholdDoc);
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB save for ApprovalThreshold failed, updating in-memory store:', dbErr);
    }

    memoryThresholds = {
      ...memoryThresholds,
      ...updatedValues,
      updatedAt: new Date().toISOString()
    };

    return NextResponse.json(memoryThresholds);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
