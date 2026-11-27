import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { ApprovalRule, APPROVAL_MODULES } from '@/models/ApprovalMatrix';
import { verifyAuth } from '@/lib/auth';
import { MODULE_INFO } from '@/lib/approvalModules';

const ROLES = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'PRODUCTION_MANAGER', 'HR_MANAGER'];

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    return NextResponse.json({ modules: APPROVAL_MODULES, moduleInfo: MODULE_INFO, roles: ROLES, rules: await ApprovalRule.find().sort({ module: 1, minAmount: 1 }).lean() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Replaces the rule set for one module: { module, rules: [{ minAmount, levels: [role, ...] }] }
export async function PUT(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only an Admin can change approval rules.' }, { status: 403 });
    const { module, rules } = await req.json();
    if (!(APPROVAL_MODULES as readonly string[]).includes(module)) return NextResponse.json({ error: 'Unknown module.' }, { status: 400 });
    if (!Array.isArray(rules)) return NextResponse.json({ error: 'rules must be a list.' }, { status: 400 });
    if (MODULE_INFO[module as keyof typeof MODULE_INFO].noAmount && (rules.length > 1 || rules.some((r: any) => Number(r.minAmount) !== 0))) {
      return NextResponse.json({ error: `${MODULE_INFO[module as keyof typeof MODULE_INFO].label} has no amount: give one rule, from 0.` }, { status: 400 });
    }
    const seen = new Set<number>();
    for (const r of rules) {
      if (!(Number(r.minAmount) >= 0)) return NextResponse.json({ error: 'Each rule needs a non-negative threshold.' }, { status: 400 });
      if (seen.has(Number(r.minAmount))) return NextResponse.json({ error: 'Two rules share the same threshold.' }, { status: 400 });
      seen.add(Number(r.minAmount));
      if (!Array.isArray(r.levels) || !r.levels.length || r.levels.some((l: string) => !ROLES.includes(l))) return NextResponse.json({ error: 'Each rule needs one or more valid approver roles.' }, { status: 400 });
    }
    await dbConnect();
    await ApprovalRule.deleteMany({ module });
    await ApprovalRule.insertMany(rules.map((r: any) => ({ module, minAmount: Number(r.minAmount), levels: r.levels, updatedBy: user.name })));
    return NextResponse.json({ saved: rules.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
