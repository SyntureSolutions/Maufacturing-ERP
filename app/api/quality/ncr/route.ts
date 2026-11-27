import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NonConformance from '@/models/NonConformance';
import '@/models/QualityCheck';
import '@/models/Batch';
import { verifyAuth } from '@/lib/auth';
import { demoOrThrow, demoMode } from '@/lib/demoMode';

const SAMPLE_NCRS: any[] = [
  {
    _id: 'ncr-1',
    ncrNumber: 'NCR-202604-001',
    qualityCheck: { checkNumber: 'QC-20260405-002' },
    type: 'PROCESS',
    severity: 'MAJOR',
    correctiveAction: 'Re-index Shimano gear cable tension and re-test on 5km roll simulator.',
    dispositionDecision: 'REWORK',
    status: 'IN_PROGRESS',
    createdAt: new Date('2026-04-03').toISOString()
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await dbConnect();
      const ncrs = await NonConformance.find({})
        .populate('qualityCheck', 'checkNumber type status')
        .populate('batch', 'batchNumber')
        .sort({ createdAt: -1 });
      if (ncrs.length > 0 || !demoMode()) return NextResponse.json(ncrs);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json(SAMPLE_NCRS);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER', 'QUALITY_INSPECTOR'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const date = new Date();
    const prefix = `NCR-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;

    try {
      await dbConnect();
      const count = await NonConformance.countDocuments({ ncrNumber: new RegExp(`^${prefix}`) });
      const ncrNumber = `${prefix}-${String(count + 1).padStart(3, '0')}`;
      const ncr = await NonConformance.create({ ...body, ncrNumber });
      return NextResponse.json(ncr, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
      const newNcr = {
        _id: `ncr-${Date.now()}`,
        ncrNumber: `${prefix}-${String(SAMPLE_NCRS.length + 1).padStart(3, '0')}`,
        qualityCheck: body.qualityCheck || { checkNumber: 'QC-INSPECTION' },
        type: body.type || 'PROCESS',
        severity: body.severity || 'MAJOR',
        correctiveAction: body.correctiveAction || 'Quarantined for engineering review.',
        dispositionDecision: body.dispositionDecision || 'REWORK',
        status: body.status || 'OPEN',
        createdAt: new Date().toISOString()
      };
      SAMPLE_NCRS.unshift(newNcr);
      return NextResponse.json(newNcr, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
