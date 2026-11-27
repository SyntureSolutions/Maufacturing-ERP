'use client';

import { PageHeader, Alert } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

const field = 'input';
const btn = 'btn btn-sm';

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const STATUS: Record<string, string> = { SENT: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', SKIPPED: 'bg-slate-100 text-slate-600' };

export default function NotificationsPage() {
  const [tab, setTab] = useState<'TEMPLATES' | 'LOG' | 'PO'>('TEMPLATES');
  const [cfg, setCfg] = useState<any>({ variables: {}, providers: {}, templates: [] });
  const [log, setLog] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<any | null>(null);

  const load = useCallback(async () => {
    const [c, l, p] = await Promise.all([api('/api/notifications/templates').catch(() => ({ variables: {}, providers: {}, templates: [] })), api('/api/notifications/log').catch(() => []), api('/api/purchase').catch(() => [])]);
    setCfg(c); setLog(Array.isArray(l) ? l : []);
    setPos((Array.isArray(p) ? p : []).filter((x: any) => ['ORDERED', 'PARTIALLY_RECEIVED'].includes(x.status) && /^[a-f0-9]{24}$/.test(String(x._id))));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { await api('/api/notifications/templates', 'PUT', edit); setEdit(null); setMsg({ ok: true, text: 'Template saved.' }); load(); } catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  const send = async (po: any) => {
    setMsg(null);
    try {
      const r = await api(`/api/purchase/${po._id}/dispatch`, 'POST');
      const sent = r.results.some((x: any) => x.status === 'SENT');
      setMsg({ ok: sent || !r.results.some((x: any) => x.status === 'FAILED'), text: `${po.poNumber}: ${r.results.map((x: any) => `${x.channel} ${x.status.toLowerCase()}${x.reason ? ` (${x.reason})` : ''}`).join(' · ')}${r.attachment ? ` · PDF attached (${r.attachment})` : ''}${r.attachmentError ? ` · PDF could not be attached: ${r.attachmentError}` : ''}${r.pdfWarning ? ` · ${r.pdfWarning}` : ''}` }); setPreview(null); load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <div className="ui-page">
      <PageHeader title="Notifications" subtitle="Email, SMS and WhatsApp messages for PO dispatch, order confirmation and dispatch alerts." />
      <div className="flex flex-wrap items-center gap-2">
        {([['TEMPLATES', 'Templates'], ['LOG', 'Communication log'], ['PO', 'Send PO to vendor']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}
        {(['EMAIL', 'SMS', 'WHATSAPP'] as const).map(c => <span key={c} className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cfg.providers[c] ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{c} {cfg.providers[c] ? 'connected' : 'not configured'}</span>)}
      </div>
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}
      {!cfg.providers.EMAIL && !cfg.providers.SMS && !cfg.providers.WHATSAPP && <p className="text-xs text-slate-500">No provider is configured, so messages are recorded as SKIPPED. Set SMTP_HOST / SMTP_FROM, TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM, or WHATSAPP_TOKEN / WHATSAPP_PHONE_ID in the environment.</p>}

      {tab === 'TEMPLATES' && <>
        {cfg.templates.map((t: any) => (
          <div key={t._id} className="flex flex-wrap items-start justify-between gap-2 card">
            <div className="min-w-0 flex-1"><b>{t.event.replaceAll('_', ' ')}</b> <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{t.channel}</span>{!t.enabled && <span className="ml-1 text-xs font-bold text-red-600">disabled</span>}
              {t.subject && <div className="text-sm font-semibold">{t.subject}</div>}<pre className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{t.body}</pre></div>
            <button className={`${btn} btn-secondary`} onClick={() => setEdit({ ...t })}>Edit</button>
          </div>))}
        {edit && (
          <form onSubmit={save} className="max-w-2xl space-y-3 rounded-2xl border border-blue-200 bg-white p-4">
            <h2 className="font-bold">{edit.event.replaceAll('_', ' ')} · {edit.channel}</h2>
            {edit.channel === 'EMAIL' && <input className={field} placeholder="Subject" value={edit.subject || ''} onChange={e => setEdit({ ...edit, subject: e.target.value })} />}
            <textarea required rows={7} className={field} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} />
            <div className="flex flex-wrap gap-1 text-xs">Variables: {(cfg.variables[edit.event] || []).map((v: string) => <button type="button" key={v} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono" onClick={() => setEdit({ ...edit, body: `${edit.body}{{${v}}}` })}>{`{{${v}}}`}</button>)}</div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={edit.enabled !== false} onChange={e => setEdit({ ...edit, enabled: e.target.checked })} />Enabled</label>
            <div className="flex gap-2"><button className={`${btn} btn-primary`}>Save template</button><button type="button" className={`${btn} btn-ghost`} onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        )}
      </>}

      {tab === 'LOG' && (
        <div className="table-wrap"><table className="w-full text-left text-xs"><thead className=""><tr><th className="p-2">When</th><th>Event</th><th>Channel</th><th>To</th><th>Reference</th><th>Attachment</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>{log.map(l => <tr key={l._id} className="border-t border-slate-100"><td className="p-2">{new Date(l.createdAt).toLocaleString('en-IN')}</td><td>{l.event.replaceAll('_', ' ')}</td><td>{l.channel}</td><td>{l.to}</td><td>{l.refNumber}</td><td className="whitespace-nowrap">{(l.attachments || []).join(', ') || '—'}</td><td><span className={`rounded-full px-2 py-0.5 font-bold ${STATUS[l.status]}`}>{l.status}</span></td><td className="max-w-xs truncate" title={l.error || l.body}>{l.error || l.body}</td></tr>)}
            {!log.length && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">No messages yet.</td></tr>}</tbody></table></div>
      )}

      {tab === 'PO' && <>
        {pos.map(po => (
          <div key={po._id} className="flex flex-wrap items-center justify-between gap-2 card">
            <div><b>{po.poNumber}</b> <span className="text-xs text-slate-500">{po.supplier?.name} · ₹{po.totalAmount?.toLocaleString('en-IN')}</span>
              <div className="text-xs text-slate-500">{po.dispatch?.at ? `${po.dispatch.channels?.length ? 'Sent' : 'Attempted'} ${new Date(po.dispatch.at).toLocaleString('en-IN')} ${po.dispatch.channels?.length ? `via ${po.dispatch.channels.join(', ')}${po.dispatch.channels.includes('EMAIL') ? ' with PDF' : ''}` : '— nothing was delivered (provider not configured, no address, or a send error; see the communication log)'}${po.dispatch.ackAt ? ` · acknowledged by ${po.dispatch.ackBy}` : ' · awaiting acknowledgement'}` : 'Not sent yet'}</div></div>
            <div className="space-x-2"><button className={`${btn} btn-secondary`} onClick={() => setPreview(po)}>Preview</button><button className={`${btn} btn-primary`} onClick={() => send(po)}>Send to vendor</button></div>
          </div>))}
        {!pos.length && <p className="empty">No approved purchase orders to send.</p>}
        {preview && (
          <div className="modal-overlay"><div className="w-full max-w-4xl space-y-3 modal">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2>Send {preview.poNumber} to {preview.supplier?.name || 'vendor'}</h2>
              <a className={`${btn} btn-secondary`} href={`/api/purchase/${preview._id}/pdf?download=1`}>Download PDF</a>
            </div>
            <p className="text-sm text-slate-500">This PDF is attached to the email, together with a link the vendor uses to acknowledge the order online. WhatsApp carries the link only.</p>
            <iframe title={`Purchase order ${preview.poNumber}`} src={`/api/purchase/${preview._id}/pdf`} className="h-[60vh] w-full rounded-xl border border-slate-200 bg-slate-50" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>To: {preview.supplier?.email || <b className="text-amber-700">no email address on the supplier record: email will be skipped</b>}</span>
              <span className="flex gap-2"><button className={`${btn} btn-ghost`} onClick={() => setPreview(null)}>Close</button><button className={`${btn} btn-primary`} onClick={() => send(preview)}>Send with PDF</button></span>
            </div>
          </div></div>
        )}
      </>}
    </div>
  );
}
