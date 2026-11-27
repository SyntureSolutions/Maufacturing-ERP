import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import AttendanceRecord from '@/models/AttendanceRecord';
import Worker from '@/models/Worker';
import { verifyAuth } from '@/lib/auth';
import { demoOrThrow } from '@/lib/demoMode';

const inMemoryAttendanceStore = [
  {
    _id: 'att-1',
    worker: { _id: 'wrk-1', name: 'Ramesh Kumar', employeeId: 'EMP-101', department: 'Assembly' },
    date: new Date().toISOString(),
    checkIn: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
    checkOut: new Date(new Date().setHours(17, 30, 0, 0)).toISOString(),
    shift: 'MORNING',
    status: 'PRESENT',
    overtimeHours: 1.5,
  },
  {
    _id: 'att-2',
    worker: { _id: 'wrk-2', name: 'Suresh Patel', employeeId: 'EMP-102', department: 'Welding' },
    date: new Date().toISOString(),
    checkIn: new Date(new Date().setHours(8, 15, 0, 0)).toISOString(),
    checkOut: undefined as string | undefined,
    shift: 'MORNING',
    status: 'PRESENT',
    overtimeHours: 0,
  },
  {
    _id: 'att-3',
    worker: { _id: 'wrk-3', name: 'Anita Sharma', employeeId: 'EMP-103', department: 'Quality Assurance' },
    date: new Date().toISOString(),
    checkIn: undefined as string | undefined,
    checkOut: undefined as string | undefined,
    shift: 'MORNING',
    status: 'LEAVE',
    overtimeHours: 0,
  },
  {
    _id: 'att-4',
    worker: { _id: 'wrk-4', name: 'Vikram Singh', employeeId: 'EMP-104', department: 'Paint & Coating' },
    date: new Date().toISOString(),
    checkIn: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
    checkOut: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(),
    shift: 'MORNING',
    status: 'PRESENT',
    overtimeHours: 2.0,
  },
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];

    try {
      await dbConnect();

      const startDate = new Date(dateParam);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateParam);
      endDate.setHours(23, 59, 59, 999);

      let records = await AttendanceRecord.find({
        date: { $gte: startDate, $lte: endDate },
      }).populate('worker', 'name employeeId department shift status');

      if (!records || records.length === 0) {
        const activeWorkers = await Worker.find({ status: 'ACTIVE' });
        if (activeWorkers && activeWorkers.length > 0) {
          const draftRecords = activeWorkers.map(w => ({
            worker: w._id,
            date: startDate,
            shift: w.shift || 'MORNING',
            status: 'PRESENT',
            overtimeHours: 0,
          }));
          await AttendanceRecord.insertMany(draftRecords);

          records = await AttendanceRecord.find({
            date: { $gte: startDate, $lte: endDate },
          }).populate('worker', 'name employeeId department shift status');
        }
      }

      if (records && records.length > 0) {
        return NextResponse.json(records);
      }
    } catch (dbErr) {
      demoOrThrow(dbErr);
      console.warn('MongoDB query for Attendance failed, returning in-memory records:', dbErr);
    }

    return NextResponse.json(inMemoryAttendanceStore);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { recordId, workerId, date, action, status, shift, overtimeHours } = body;
    const nowIso = new Date().toISOString();

    // First try DB update if recordId is a valid ObjectId
    if (recordId && mongoose.Types.ObjectId.isValid(recordId)) {
      try {
        await dbConnect();
        const record = await AttendanceRecord.findById(recordId);
        if (record) {
          if (action === 'CLOCK_IN') {
            record.checkIn = new Date();
            record.status = 'PRESENT';
          } else if (action === 'CLOCK_OUT') {
            record.checkOut = new Date();
            if (record.checkIn) {
              const diffMs = record.checkOut.getTime() - record.checkIn.getTime();
              const diffHours = diffMs / (1000 * 60 * 60);
              if (diffHours > 8) {
                record.overtimeHours = Number((diffHours - 8).toFixed(1));
              }
            }
          } else if (status) {
            record.status = status;
            if (status === 'ABSENT' || status === 'LEAVE') {
              record.checkIn = undefined;
              record.checkOut = undefined;
              record.overtimeHours = 0;
            }
          }

          if (overtimeHours !== undefined) {
            record.overtimeHours = Number(overtimeHours);
          }

          await record.save();
          const populated = await AttendanceRecord.findById(record._id).populate('worker', 'name employeeId department');
          return NextResponse.json(populated);
        }
      } catch (dbErr) {
        demoOrThrow(dbErr);
        console.warn('MongoDB POST update failed, updating in-memory store:', dbErr);
      }
    }

    // In-memory store fallback update
    const foundIndex = inMemoryAttendanceStore.findIndex(
      r => r._id === recordId || (r.worker && (r.worker._id === workerId || r.worker === workerId))
    );

    if (foundIndex !== -1) {
      const rec = { ...inMemoryAttendanceStore[foundIndex] };

      if (action === 'CLOCK_IN') {
        rec.checkIn = nowIso;
        rec.status = 'PRESENT';
      } else if (action === 'CLOCK_OUT') {
        rec.checkOut = nowIso;
        if (rec.checkIn) {
          const diffMs = new Date(nowIso).getTime() - new Date(rec.checkIn).getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours > 8) {
            rec.overtimeHours = Number((diffHours - 8).toFixed(1));
          }
        }
      } else if (status) {
        rec.status = status;
        if (status === 'ABSENT' || status === 'LEAVE') {
          rec.checkIn = undefined;
          rec.checkOut = undefined;
          rec.overtimeHours = 0;
        }
      }

      if (overtimeHours !== undefined) {
        rec.overtimeHours = Number(overtimeHours);
      }

      inMemoryAttendanceStore[foundIndex] = rec;
      return NextResponse.json(rec);
    }

    // Create new in-memory record if not found
    const newRec = {
      _id: recordId || `att-${Date.now()}`,
      worker: { _id: workerId || `wrk-${Date.now()}`, name: 'Technician', employeeId: 'EMP-NEW', department: 'Assembly' },
      date: date || nowIso,
      shift: shift || 'MORNING',
      checkIn: action === 'CLOCK_IN' ? nowIso : undefined,
      checkOut: action === 'CLOCK_OUT' ? nowIso : undefined,
      status: status || (action === 'CLOCK_IN' ? 'PRESENT' : 'PRESENT'),
      overtimeHours: overtimeHours || 0,
    };

    inMemoryAttendanceStore.push(newRec);
    return NextResponse.json(newRec, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}
