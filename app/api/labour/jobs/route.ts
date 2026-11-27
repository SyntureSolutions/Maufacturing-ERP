import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import LabourJob from '@/models/LabourJob';
import { demoOrThrow, demoMode } from '@/lib/demoMode';

const SAMPLE_JOBS = [
  {
    _id: 'job-1',
    jobNumber: 'JOB-202604-001',
    date: '2026-04-02',
    shift: 'MORNING',
    workOrder: { woNumber: 'WO-BIK-2026-001' },
    totalCost: 14000,
    status: 'COMPLETED',
    workers: [
      { worker: { name: 'Ramesh Patil', employeeId: 'WRK-BIK-001' }, hoursWorked: 8, rate: 350 },
      { worker: { name: 'Suresh Deshmukh', employeeId: 'WRK-BIK-002' }, hoursWorked: 8, rate: 320 }
    ]
  },
  {
    _id: 'job-2',
    jobNumber: 'JOB-202604-002',
    date: '2026-04-04',
    shift: 'EVENING',
    workOrder: { woNumber: 'WO-BIK-2026-002' },
    totalCost: 18500,
    status: 'IN_PROGRESS',
    workers: [
      { worker: { name: 'Pooja Kulkarni', employeeId: 'WRK-BIK-003' }, hoursWorked: 8, rate: 300 },
      { worker: { name: 'Amitabh Joshi', employeeId: 'WRK-BIK-004' }, hoursWorked: 8, rate: 400 }
    ]
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','MANAGER','HR_MANAGER','PRODUCTION_MANAGER','VIEWER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    try {
      await dbConnect();
      const jobs = await LabourJob.find({})
        .populate('workOrder', 'woNumber')
        .populate('workers.worker', 'name employeeId')
        .sort({ createdAt: -1 });

      if (jobs.length > 0 || !demoMode()) return NextResponse.json(jobs);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json(SAMPLE_JOBS);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','MANAGER','HR_MANAGER','PRODUCTION_MANAGER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot change this data.' }, { status: 403 });
    const body = await req.json();

    try {
      await dbConnect();
      const date = new Date();
      const prefix = `JOB-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const count = await LabourJob.countDocuments({ jobNumber: new RegExp(`^${prefix}`) });
      const jobNumber = `${prefix}-${String(count + 1).padStart(3, '0')}`;

      let totalCost = 0;
      if (body.workers && Array.isArray(body.workers)) {
        for (const w of body.workers) {
          totalCost += (w.hoursWorked || 0) * (w.rate || 0);
        }
      }

      const job = await LabourJob.create({
        jobNumber,
        ...body,
        totalCost
      });

      return NextResponse.json(job, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
      const newJob = {
        _id: `job-${Date.now()}`,
        jobNumber: `JOB-202604-${Math.floor(Math.random() * 1000)}`,
        date: new Date().toISOString().split('T')[0],
        shift: body.shift || 'MORNING',
        workOrder: { woNumber: 'WO-BIK-2026-001' },
        totalCost: 15000,
        status: 'IN_PROGRESS',
        workers: []
      };
      SAMPLE_JOBS.unshift(newJob);
      return NextResponse.json(newJob, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
