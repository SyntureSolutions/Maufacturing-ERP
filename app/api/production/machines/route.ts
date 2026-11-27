import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Machine from '@/models/Machine';
import { verifyAuth } from '@/lib/auth';
import { demoOrThrow, demoMode } from '@/lib/demoMode';

const SAMPLE_MACHINES = [
  {
    _id: 'mach-1',
    name: 'Panasonic Robotic TIG Frame Welder 6-Axis',
    code: 'MCH-WLD-001',
    type: 'Robotic Welding Cell',
    location: 'Bay 1 - Frame Fabrication Shop',
    status: 'IN_USE',
    capacity: 25,
    maintenanceSchedule: new Date('2026-11-15')
  },
  {
    _id: 'mach-2',
    name: 'Giesse CNC Rim Automated Truing & Spoking Rig',
    code: 'MCH-TRU-002',
    type: 'Automated Truing Rig',
    location: 'Bay 2 - Wheelset Assembly',
    status: 'AVAILABLE',
    capacity: 40,
    maintenanceSchedule: new Date('2026-11-20')
  },
  {
    _id: 'mach-3',
    name: 'Nordson Automated Electrostatic Powder Coating Line',
    code: 'MCH-PNT-003',
    type: 'Powder Coat Conveyor',
    location: 'Bay 3 - Finishing Shop',
    status: 'AVAILABLE',
    capacity: 30,
    maintenanceSchedule: new Date('2026-12-01')
  },
  {
    _id: 'mach-4',
    name: 'Bosch Torque-Controlled Final Bike Assembly Line',
    code: 'MCH-ASM-004',
    type: 'Conveyor Assembly Line',
    location: 'Bay 4 - Final Assembly & Packaging',
    status: 'IN_USE',
    capacity: 20,
    maintenanceSchedule: new Date('2026-11-10')
  }
];

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await dbConnect();
      const machines = await Machine.find({}).sort({ name: 1 });
      if (machines.length > 0 || !demoMode()) return NextResponse.json(machines);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }
    return NextResponse.json(SAMPLE_MACHINES);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    try {
      await dbConnect();
      const machine = await Machine.create(body);
      return NextResponse.json(machine, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
      const newMach = {
        _id: `mach-${Date.now()}`,
        name: body.name || 'CNC Milling Unit',
        code: body.code || `MCH-GEN-${Math.floor(Math.random() * 1000)}`,
        type: body.type || 'General Fabrication',
        location: body.location || 'Factory Floor Bay',
        status: body.status || 'AVAILABLE',
        capacity: body.capacity ? Number(body.capacity) : 20,
        maintenanceSchedule: body.maintenanceSchedule ? new Date(body.maintenanceSchedule) : new Date(Date.now() + 30 * 86400000)
      };
      SAMPLE_MACHINES.unshift(newMach);
      return NextResponse.json(newMach, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
