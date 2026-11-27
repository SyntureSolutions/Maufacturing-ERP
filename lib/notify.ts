import nodemailer from 'nodemailer';
import dbConnect from '@/lib/mongodb';
import { NotificationTemplate, NotificationLog, NotifyChannel, NotifyEvent } from '@/models/Notification';
import { DEFAULT_TEMPLATES, renderTemplate } from '@/lib/notifyTemplate';
import CompanySettings from '@/models/CompanySettings';

export async function companyName() {
  const c: any = await CompanySettings.findOne({ key: 'company' }).select('legalName').lean();
  return c?.legalName || 'Our company';
}

/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null when it cannot be a valid number. */
export function toE164(raw?: string) {
  const d = String(raw || '').replace(/[^\d+]/g, '');
  if (/^\+\d{10,14}$/.test(d)) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

export function channelConfigured(channel: NotifyChannel) {
  const e = process.env;
  if (channel === 'EMAIL') return !!(e.SMTP_HOST && e.SMTP_FROM);
  if (channel === 'SMS') return !!(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_FROM);
  return !!(e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_ID);
}

export interface MailAttachment { filename: string; content: Buffer | Uint8Array; contentType?: string }

async function deliver(channel: NotifyChannel, to: string, subject: string | undefined, body: string, attachments?: MailAttachment[]) {
  const e = process.env;
  if (channel === 'EMAIL') {
    const transport = nodemailer.createTransport({ host: e.SMTP_HOST, port: Number(e.SMTP_PORT) || 587, secure: Number(e.SMTP_PORT) === 465, auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined });
    await transport.sendMail({ from: e.SMTP_FROM, to, subject: subject || '(no subject)', text: body, attachments: attachments?.map(a => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })) });
    return;
  }
  const phone = toE164(to);
  if (!phone) throw new Error(`"${to}" is not a valid mobile number.`);
  if (channel === 'SMS') {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, From: e.TWILIO_FROM!, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  // WhatsApp Cloud API. Free-form text is delivered only inside the 24h customer-service window; first contact needs an approved template.
  const res = await fetch(`https://graph.facebook.com/v19.0/${e.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${e.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.slice(1), type: 'text', text: { body } }),
  });
  if (!res.ok) throw new Error(`WhatsApp error ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let defaultsEnsured = false;
// Adds any default template that is missing (new events ship with new releases) without touching edited ones
async function ensureDefaults() {
  if (defaultsEnsured) return;
  for (const t of DEFAULT_TEMPLATES) {
    await NotificationTemplate.updateOne({ event: t.event, channel: t.channel }, { $setOnInsert: { ...t, enabled: true } }, { upsert: true }).catch(() => {});
  }
  defaultsEnsured = true;
}

export { ensureDefaults as ensureDefaultTemplates };

/**
 * Sends one notification using the event's template for the channel and records it in the communication log.
 * Never throws: a delivery problem must not fail the business transaction that triggered it.
 */
export async function notify(input: { event: NotifyEvent; channel: NotifyChannel; to?: string; vars: Record<string, string | number | undefined>; refType?: string; refNumber?: string; attachments?: MailAttachment[] }) {
  try {
    if (!input.to) return { status: 'SKIPPED' as const, reason: 'No recipient address on file.' };
    await dbConnect();
    await ensureDefaults();
    const tpl: any = await NotificationTemplate.findOne({ event: input.event, channel: input.channel, enabled: true }).lean();
    if (!tpl) return { status: 'SKIPPED' as const, reason: 'No enabled template.' };
    const subject = tpl.subject ? renderTemplate(tpl.subject, input.vars) : undefined;
    const body = renderTemplate(tpl.body, input.vars);
    // attachments are only sent by email; other channels carry the link in the message
    const attachments = input.channel === 'EMAIL' ? input.attachments : undefined;
    const log = { event: input.event, channel: input.channel, to: input.to, subject, body, refType: input.refType, refNumber: input.refNumber };
    const attached = attachments?.map(a => a.filename);
    if (!channelConfigured(input.channel)) {
      await NotificationLog.create({ ...log, status: 'SKIPPED', error: `${input.channel} provider is not configured (see environment variables).` });
      return { status: 'SKIPPED' as const, reason: 'Provider not configured.' };
    }
    try {
      await deliver(input.channel, input.to, subject, body, attachments);
      await NotificationLog.create({ ...log, attachments: attached, status: 'SENT' });
      return { status: 'SENT' as const };
    } catch (err: any) {
      await NotificationLog.create({ ...log, attachments: attached, status: 'FAILED', error: String(err.message).slice(0, 500) });
      return { status: 'FAILED' as const, reason: err.message as string };
    }
  } catch (err: any) {
    console.warn('Notification skipped:', err?.message);
    return { status: 'FAILED' as const, reason: err?.message as string };
  }
}
