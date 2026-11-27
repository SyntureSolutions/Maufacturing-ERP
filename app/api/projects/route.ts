import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Project from '@/models/Project';
import { demoOrThrow, demoMode } from '@/lib/demoMode';

const SAMPLE_PROJECTS = [
  {
    _id: 'prj-1',
    projectNumber: 'PRJ-202604-001',
    name: 'Decathlon Annual Bulk Bike Supply Contract',
    customer: { name: 'Decathlon Retail India', code: 'CUST-DEC-01' },
    manager: { name: 'Vikram Singh (Production Lead)' },
    status: 'IN_PROGRESS',
    startDate: '2026-03-01',
    targetEndDate: '2026-06-30',
    budget: 4500000,
    spent: 1850000,
    description: 'Bulk manufacturing and crate packing of 500 Apex Urban Commuter Bicycles for Decathlon logistics hubs.'
  },
  {
    _id: 'prj-2',
    projectNumber: 'PRJ-202604-002',
    name: 'Metro Wheels Trail MTB Delivery Batch 1',
    customer: { name: 'Metro Wheels & Distributors', code: 'CUST-MET-02' },
    manager: { name: 'Anita Roy (Operations Mgr)' },
    status: 'IN_PROGRESS',
    startDate: '2026-03-15',
    targetEndDate: '2026-05-15',
    budget: 3200000,
    spent: 1120000,
    description: 'Assembly line run of 200 Velocity Trail 29er Mountain Bikes with Shimano 11-speed drivetrains.'
  },
  {
    _id: 'prj-3',
    projectNumber: 'PRJ-202604-003',
    name: 'E-Glide Electric Bike Line Setup & Testing',
    customer: { name: 'Internal R&D / National Logistics', code: 'CUST-INT-03' },
    manager: { name: 'Rajesh Sharma (Chief Engineer)' },
    status: 'PLANNING',
    startDate: '2026-04-01',
    targetEndDate: '2026-07-15',
    budget: 1800000,
    spent: 450000,
    description: 'Specialized tooling and torque calibration setup for 250W Mid-Drive Motor assembly line.'
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await dbConnect();
      const projects = await Project.find({})
        .populate('customer', 'name code')
        .populate('manager', 'name')
        .sort({ startDate: -1 });

      if (projects.length > 0 || !demoMode()) return NextResponse.json(projects);
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
    }

    return NextResponse.json(SAMPLE_PROJECTS);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();

    try {
      await dbConnect();
      const date = new Date();
      const prefix = `PRJ-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const count = await Project.countDocuments({ projectNumber: new RegExp(`^${prefix}`) });
      const projectNumber = `${prefix}-${String(count + 1).padStart(3, '0')}`;

      const project = await Project.create({
        projectNumber,
        ...body
      });

      return NextResponse.json(project, { status: 201 });
    } catch (dbErr) {
      demoOrThrow(dbErr); // sample data only in demo mode
      const newPrj = {
        _id: `prj-${Date.now()}`,
        projectNumber: `PRJ-202604-${Math.floor(Math.random() * 1000)}`,
        name: body.name || 'New Bicycle Contract',
        customer: { name: body.customerName || 'Bulk Distributor', code: 'CUST-GEN' },
        manager: { name: 'Production Manager' },
        status: body.status || 'PLANNING',
        startDate: body.startDate || new Date().toISOString().split('T')[0],
        targetEndDate: body.targetEndDate || '2026-08-30',
        budget: body.budget || 2500000,
        spent: 0,
        description: body.description || 'Bicycle manufacturing contract'
      };
      SAMPLE_PROJECTS.unshift(newPrj);
      return NextResponse.json(newPrj, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
