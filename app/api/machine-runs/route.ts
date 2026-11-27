import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import MachineRun from '@/models/MachineRun';
import Machine from '@/models/Machine';
import '@/models/WorkOrder';
import { verifyAuth } from '@/lib/auth';
import { DOWNTIME_CATEGORIES, runFigures, validateRun } from '@/lib/oee';

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'STAFF'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const q = req.nextUrl.searchParams;
    const filter: any = {};
    if (q.get('machine') && mongoose.isValidObjectId(q.get('machine'))) filter.machine = q.get('machine');
    if (q.get('from') || q.get('to')) filter.day = { ...(q.get('from') ? { $gte: q.get('from') } : {}), ...(q.get('to') ? { $lte: q.get('to') } : {}) };
    await dbConnect();
    const runs = await MachineRun.find(filter).populate('machine', 'name code').populate('workOrder', 'woNumber').sort({ day: -1, shift: 1 }).limit(500).lean() as any[];
    return NextResponse.json(runs.map(r => ({ ...r, figures: runFigures(r) })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const b = await req.json();

    if (!mongoose.isValidObjectId(b.machine)) return NextResponse.json({ error: 'Select a machine.' }, { status: 400 });
    if (!DAY_RE.test(String(b.day)) || Number.isNaN(Date.parse(b.day))) return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
    if (new Date(`${b.day}T00:00:00Z`).getTime() > Date.now() + 86400000) return NextResponse.json({ error: 'Runs cannot be logged for a future date.' }, { status: 400 });
    if (!String(b.shift || '').trim()) return NextResponse.json({ error: 'Enter the shift.' }, { status: 400 });

    const valid = DOWNTIME_CATEGORIES.map(c => c.key) as string[];
    const downtimes = (b.downtimes || []).filter((d: any) => Number(d.minutes) > 0).map((d: any) => ({ category: String(d.category), minutes: Number(d.minutes), notes: d.notes }));
    if (downtimes.some((d: any) => !valid.includes(d.category))) return NextResponse.json({ error: 'Unknown downtime reason.' }, { status: 400 });

    await dbConnect();
    const machine: any = await Machine.findById(b.machine).lean();
    if (!machine) return NextResponse.json({ error: 'Machine not found.' }, { status: 404 });

    const input = {
      scheduledMinutes: Number(b.scheduledMinutes), downtimes, totalCount: Number(b.totalCount), rejectCount: Number(b.rejectCount) || 0,
      idealRatePerHour: Number(b.idealRatePerHour) || Number(machine.capacity) || 0,
    };
    const errors = validateRun(input);
    if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

    const run = await MachineRun.create({
      machine: machine._id, workOrder: mongoose.isValidObjectId(b.workOrder) ? b.workOrder : undefined, day: b.day, shift: String(b.shift).trim(),
      ...input, operator: b.operator, notes: b.notes, createdBy: user.name,
    });
    return NextResponse.json({ ...run.toObject(), figures: runFigures(input) }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 11000) return NextResponse.json({ error: 'This machine already has a record for that date and shift.' }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
