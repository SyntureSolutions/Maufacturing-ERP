import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { NotificationTemplate, NOTIFY_EVENTS } from '@/models/Notification';
import { verifyAuth } from '@/lib/auth';
import { EVENT_VARIABLES, unknownVariables } from '@/lib/notifyTemplate';
import { channelConfigured, ensureDefaultTemplates } from '@/lib/notify';

export async function GET(req: NextRequest) {
  try {
    if (!(await verifyAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await dbConnect();
    await ensureDefaultTemplates();
    return NextResponse.json({
      variables: EVENT_VARIABLES,
      providers: { EMAIL: channelConfigured('EMAIL'), SMS: channelConfigured('SMS'), WHATSAPP: channelConfigured('WHATSAPP') },
      templates: await NotificationTemplate.find().sort({ event: 1, channel: 1 }).lean(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { event, channel, subject, body, enabled } = await req.json();
    if (!(NOTIFY_EVENTS as readonly string[]).includes(event) || !['EMAIL', 'SMS', 'WHATSAPP'].includes(channel)) return NextResponse.json({ error: 'Invalid event or channel.' }, { status: 400 });
    if (!String(body || '').trim()) return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    const bad = unknownVariables(`${subject || ''} ${body}`, event);
    if (bad.length) return NextResponse.json({ error: `Unknown variable(s) for this event: ${bad.map(b => `{{${b}}}`).join(', ')}` }, { status: 400 });
    await dbConnect();
    const doc = await NotificationTemplate.findOneAndUpdate({ event, channel }, { $set: { subject, body, enabled: enabled !== false } }, { upsert: true, new: true });
    return NextResponse.json(doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
