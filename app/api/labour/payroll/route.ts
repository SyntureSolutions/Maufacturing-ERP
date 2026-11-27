import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { demoMode } from '@/lib/demoMode';

const SAMPLE_PAYROLL = [
  {
    _id: 'pay-1',
    payrollId: 'PAY-202603-001',
    worker: { _id: 'wrk-1', name: 'Ramesh Patil', employeeId: 'WRK-BIK-001', department: 'Frame Assembly' },
    payPeriod: '2026-03',
    baseSalary: 45000,
    overtimeHours: 12,
    overtimePay: 5250,
    allowances: 3000,
    deductions: 2500,
    netPayable: 50750,
    status: 'PAID',
    paymentDate: '2026-04-01',
    paymentMethod: 'Bank Direct Transfer'
  },
  {
    _id: 'pay-2',
    payrollId: 'PAY-202603-002',
    worker: { _id: 'wrk-2', name: 'Suresh Deshmukh', employeeId: 'WRK-BIK-002', department: 'Transmission Line' },
    payPeriod: '2026-03',
    baseSalary: 42000,
    overtimeHours: 8,
    overtimePay: 3200,
    allowances: 2500,
    deductions: 2200,
    netPayable: 45500,
    status: 'PAID',
    paymentDate: '2026-04-01',
    paymentMethod: 'Bank Direct Transfer'
  },
  {
    _id: 'pay-3',
    payrollId: 'PAY-202603-003',
    worker: { _id: 'wrk-3', name: 'Pooja Kulkarni', employeeId: 'WRK-BIK-003', department: 'Wheel Truing' },
    payPeriod: '2026-03',
    baseSalary: 38000,
    overtimeHours: 15,
    overtimePay: 5625,
    allowances: 2000,
    deductions: 1900,
    netPayable: 43725,
    status: 'PAID',
    paymentDate: '2026-04-01',
    paymentMethod: 'Bank Direct Transfer'
  },
  {
    _id: 'pay-4',
    payrollId: 'PAY-202603-004',
    worker: { _id: 'wrk-4', name: 'Amitabh Joshi', employeeId: 'WRK-BIK-004', department: 'Quality Assurance' },
    payPeriod: '2026-03',
    baseSalary: 52000,
    overtimeHours: 10,
    overtimePay: 5000,
    allowances: 3500,
    deductions: 3100,
    netPayable: 57400,
    status: 'PAID',
    paymentDate: '2026-04-01',
    paymentMethod: 'Bank Direct Transfer'
  }
];

export async function GET(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','MANAGER','HR_MANAGER','FINANCE_MANAGER','VIEWER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot view this data.' }, { status: 403 });
    // payroll is not stored in the database yet: show nothing rather than invented salaries (samples only in demo mode)
    return NextResponse.json(demoMode() ? SAMPLE_PAYROLL : []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await verifyAuth(req);
    if (!authedUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN','HR_MANAGER','FINANCE_MANAGER'].includes(authedUser.role)) return NextResponse.json({ error: 'Forbidden: your role cannot change this data.' }, { status: 403 });
    // nothing would be kept: refuse instead of pretending (in demo mode the entry lives in memory only)
    if (!demoMode()) return NextResponse.json({ error: 'Payroll is not stored in the system yet, so this entry cannot be saved. Record salaries in Accounts (payment voucher) meanwhile.' }, { status: 501 });
    const body = await req.json();
    const newEntry = {
      _id: `pay-${Date.now()}`,
      payrollId: `PAY-202604-${Math.floor(Math.random() * 1000)}`,
      worker: body.worker || { name: body.workerName || 'Employee', employeeId: 'WRK-001', department: 'Assembly' },
      payPeriod: body.payPeriod || '2026-04',
      baseSalary: body.baseSalary || 40000,
      overtimeHours: body.overtimeHours || 0,
      overtimePay: (body.overtimeHours || 0) * 350,
      allowances: body.allowances || 2000,
      deductions: body.deductions || 2000,
      netPayable: (body.baseSalary || 40000) + ((body.overtimeHours || 0) * 350) + (body.allowances || 2000) - (body.deductions || 2000),
      status: body.status || 'PAID',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: body.paymentMethod || 'Bank Direct Transfer'
    };

    SAMPLE_PAYROLL.unshift(newEntry);
    return NextResponse.json(newEntry, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
