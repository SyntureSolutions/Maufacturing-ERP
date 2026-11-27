import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import dbConnect from '@/lib/mongodb';
import Enquiry from '@/models/Enquiry';
import { notify, companyName } from '@/lib/notify';

// Scheduled trigger (call from cron / a scheduler with header x-cron-secret = CRON_SECRET).
// Sends one reminder per overdue follow-up to FOLLOWUP_ALERT_EMAIL.
function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-secret') || '';
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await dbConnect();
    const to = process.env.FOLLOWUP_ALERT_EMAIL;
    const now = new Date();
    const enquiries: any[] = await Enquiry.find({ followUps: { $elemMatch: { status: 'PENDING', dueAt: { $lte: now }, alertedAt: { $exists: false } } } });
    const company = await companyName();
    let sent = 0, skipped = 0;
    for (const e of enquiries) {
      for (const f of e.followUps) {
        if (f.status !== 'PENDING' || f.alertedAt || f.dueAt > now) continue;
        const r = await notify({ event: 'FOLLOWUP_DUE', channel: 'EMAIL', to, vars: { enquiryNumber: e.enquiryNumber, customerName: e.customerName, mode: f.mode, dueAt: new Date(f.dueAt).toLocaleString('en-IN'), notes: f.notes, companyName: company }, refType: 'ENQUIRY', refNumber: e.enquiryNumber });
        if (r.status === 'SENT') { f.alertedAt = now; sent++; } else skipped++;
      }
      await e.save();
    }
    return NextResponse.json({ checked: enquiries.length, sent, skipped });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
