import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import { backfillLineage } from '@/lib/lineageBackfill';
import { logAuditEvent } from '@/lib/audit';

// One-time job: turns the document numbers older records carry as text into real links. Defaults to a dry run.
export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only an Admin can run the lineage backfill.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    await dbConnect();
    const report = await backfillLineage(dryRun);
    if (!dryRun) await logAuditEvent({ userId: user.id, userName: user.name, userRole: user.role, action: 'EDIT', resource: 'LINEAGE', resourceName: 'Document lineage backfill', details: report.map(r => `${r.link}: ${r.linked}/${r.checked}`).join('; ') });
    return NextResponse.json({ dryRun, report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
