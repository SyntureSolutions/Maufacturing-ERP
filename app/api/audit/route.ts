import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getAuditLogs, logAuditEvent } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RBAC: Super Admin, Operations Manager, and HR Manager can inspect the corporate audit trail
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'HR_MANAGER') {
      return NextResponse.json(
        { error: 'Forbidden: Corporate Audit Trail inspection is restricted to Super Admin, Operations Leadership, and HR.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || undefined;
    const resource = searchParams.get('resource') || undefined;
    const userRole = searchParams.get('userRole') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100;

    const logs = await getAuditLogs({ action, resource, userRole, limit });
    return NextResponse.json(logs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch audit logs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // VIEWER cannot write audit logs directly
    if (user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Forbidden: Executive Viewer is read-only.' }, { status: 403 });
    }

    const body = await req.json();
    const { action, resource, resourceId, resourceName, details, reason } = body;

    if (!action || !resource || !details) {
      return NextResponse.json({ error: 'action, resource, and details are required' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    const entry = await logAuditEvent({
      userId: user.id || user._id,
      userName: user.name || 'Corporate User',
      userRole: user.role,
      action,
      resource,
      resourceId,
      resourceName,
      details,
      reason,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, log: entry }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to record audit event' }, { status: 500 });
  }
}
