import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Worker from '@/models/Worker';
import { demoOrThrow, demoMode } from '@/lib/demoMode';

const SAMPLE_WORKERS = [
  {
    _id: 'wrk-1',
    workerId: 'WRK-BIK-001',
    name: 'Ramesh Patil',
    skillLevel: 'MASTER_WELDER',
    station: 'Frame Robotic Welding Line',
    shift: 'MORNING',
    hourlyRate: 350,
    status: 'ACTIVE'
  },
  {
    _id: 'wrk-2',
    workerId: 'WRK-BIK-002',
    name: 'Suresh Deshmukh',
    skillLevel: 'DRIVETRAIN_SPECIALIST',
    station: 'Transmission Indexing Bay',
    shift: 'MORNING',
    hourlyRate: 320,
    status: 'ACTIVE'
  },
  {
    _id: 'wrk-3',
    workerId: 'WRK-BIK-003',
    name: 'Pooja Kulkarni',
    skillLevel: 'WHEEL_TRUING_TECH',
    station: 'Rim & Spoke Automated Truing Station',
    shift: 'EVENING',
    hourlyRate: 300,
    status: 'ACTIVE'
  },
  {
    _id: 'wrk-4',
    workerId: 'WRK-BIK-004',
    name: 'Amitabh Joshi',
    skillLevel: 'QC_INSPECTOR',
    station: '5km Track Test Roll Bay',
    shift: 'MORNING',
    hourlyRate: 400,
    status: 'ACTIVE'
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','MANAGER','HR_MANAGER','PRODUCTION_MANAGER','VIEWER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    try {
      await dbConnect();
      const workers = await Worker.find({}).sort({ name: 1 });
      if (workers.length > 0 || !demoMode()) return NextResponse.json(workers);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json(SAMPLE_WORKERS);
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
      const worker = await Worker.create(body);
      return NextResponse.json(worker, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
      const newWrk = {
        _id: `wrk-${Date.now()}`,
        workerId: body.workerId || body.employeeId || `WRK-BIK-${Math.floor(Math.random() * 1000)}`,
        employeeId: body.employeeId || body.workerId || `EMP-${Math.floor(Math.random() * 1000)}`,
        name: body.name || 'Assembly Line Technician',
        skillLevel: body.skillLevel || 'ASSEMBLER',
        station: body.station || body.department || 'Final Packaging Station',
        department: body.department || body.station || 'Assembly',
        skills: body.skills || (body.skillLevel ? [body.skillLevel] : ['ASSEMBLY']),
        shift: body.shift || 'MORNING',
        hourlyRate: body.hourlyRate ? Number(body.hourlyRate) : 280,
        dailyRate: body.dailyRate ? Number(body.dailyRate) : 2240,
        overtimeRate: body.overtimeRate ? Number(body.overtimeRate) : 420,
        status: body.status || 'ACTIVE'
      };
      SAMPLE_WORKERS.unshift(newWrk);
      return NextResponse.json(newWrk, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
