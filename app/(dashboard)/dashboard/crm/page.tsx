'use client';

import EnquiryModal from '@/components/modals/EnquiryModal';
import Link from 'next/link';
import { PageHeader, Alert } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';
import { TERMS_PRESETS, INCOTERMS, rev } from '@/lib/quoteTerms';
import { useUrlTab } from '@/components/workspace/useUrlTab';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';

const field = 'input';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const MODE_ICON: Record<string, string> = { CALL: '📞', SMS: '💬', EMAIL: '✉️' };
const isDbId = (id: unknown) => /^[a-f0-9]{24}$/.test(String(id));
const OPEN = ['ENQUIRY_RECEIVED', 'QUOTATION_SENT', 'UNDER_REVIEW'];
// who may decide a discount request, by the tier it needs (Approval Policies discount limits)
const DECIDERS: Record<string, string[]> = { SALES: ['SALES', 'MANAGER', 'FINANCE_MANAGER', 'ADMIN'], MANAGER: ['MANAGER', 'FINANCE_MANAGER', 'ADMIN'], ADMIN: ['ADMIN'] };
const TIER_LABEL: Record<string, string> = { SALES: 'Sales', MANAGER: 'Manager / Finance Manager', ADMIN: 'Admin' };

export default function CrmPage() {
  const [tab, setTab] = useState<'FOLLOW' | 'QUOTES'>('FOLLOW');
  useUrlTab(['FOLLOW', 'QUOTES'] as const, setTab);
  const [region, setRegion] = useState<'DOMESTIC' | 'EXPORT'>('DOMESTIC');
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [fu, setFu] = useState<{ overdue: any[]; upcoming: any[]; history: any[] }>({ overdue: [], upcoming: [], history: [] });
  const [quotes, setQuotes] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sched, setSched] = useState<any | null>(null);
  const [enqForm, setEnqForm] = useState<{ enquiry?: any } | null>(null);
  const [revise, setRevise] = useState<any | null>(null);
  const [compare, setCompare] = useState<any | null>(null);
  const [disc, setDisc] = useState<{ q: any; percent: string; reason: string; error?: string } | null>(null);
  const [me, setMe] = useState<{ id: string; role: string }>({ id: '', role: '' });
  useEffect(() => { api('/api/auth/session').then(s => setMe({ id: s?.user?.id || '', role: s?.user?.role || '' })).catch(() => {}); }, []);
  const cancelEnquiry = (e: any) => {
    const reason = window.prompt(`Why is ${e.enquiryNumber} (${e.customerName}) being cancelled?`);
    if (reason) run(async () => { await api(`/api/enquiries/${e._id}`, 'PATCH', { action: 'cancel', reason }); }, `${e.enquiryNumber} cancelled.`);
  };
  const decide = (q: any, approve: boolean) => {
    const remarks = window.prompt(approve ? 'Note for approving this discount (optional)' : 'Why is the discount rejected?', '');
    if (remarks === null) return;
    run(async () => { await api(`/api/quotations/${q._id}/discount`, 'POST', { action: approve ? 'approve' : 'reject', remarks }); }, approve ? 'Discount approved and applied as a new revision.' : 'Discount rejected.');
  };

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [e, q, f] = await Promise.all([get('/api/enquiries'), get('/api/quotations'), api('/api/followups').catch(() => ({ overdue: [], upcoming: [], history: [] }))]);
    setEnquiries(e.filter((x: any) => isDbId(x._id))); setQuotes(q.filter((x: any) => isDbId(x._id))); setFu(f);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const complete = (f: any) => {
    const outcome = window.prompt(`Outcome of the ${f.mode.toLowerCase()} with ${f.customerName}?`);
    if (outcome?.trim()) run(async () => { await api(`/api/enquiries/${f.enquiryId}/followups`, 'PATCH', { followUpId: f._id, action: 'complete', outcome }); }, 'Follow-up logged.');
  };

  const list = enquiries.filter(e => (e.region || 'DOMESTIC') === region);
  const widget = (title: string, rows: any[], tone: string) => (
    <div className={`rounded-2xl border p-3 ${tone}`}><div className="mb-1 text-xs font-bold uppercase">{title} ({rows.length})</div>
      {rows.slice(0, 6).map(f => <div key={f._id} className="flex items-center justify-between gap-2 py-1 text-sm"><span>{MODE_ICON[f.mode]} {f.customerName} <span className="text-xs text-slate-500">{new Date(f.dueAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></span><button className={`${btn} btn-secondary`} onClick={() => complete(f)}>Done</button></div>)}
      {!rows.length && <div className="text-xs text-slate-400">Nothing here.</div>}</div>
  );

  const openRevise = (q: any) => setRevise({
    q, note: '', paymentTerms: q.paymentTerms || 'NET 30', validUntil: q.validUntil ? String(q.validUntil).slice(0, 10) : '', terms: q.terms || TERMS_PRESETS[0].text,
    orderType: q.orderType || 'DOMESTIC', currency: q.currency && q.currency !== 'INR' ? q.currency : 'USD', exchangeRate: q.exchangeRate || '', incoterm: q.incoterm || 'FOB', portOfLoading: q.portOfLoading || '', portOfDischarge: q.portOfDischarge || '', country: q.country || '',
    items: q.items.map((i: any) => ({ product: i.product, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
  });

  return (
    <div className="ui-page">
      <style>{`@media print { body * { visibility: hidden; } .print-root, .print-root * { visibility: visible; } .print-root { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <EnquiryModal isOpen={!!enqForm} enquiry={enqForm?.enquiry} onClose={() => setEnqForm(null)} onSaved={(saved) => { setRegion(saved.region === 'EXPORT' ? 'EXPORT' : 'DOMESTIC'); setMsg({ ok: true, text: `Enquiry ${saved.enquiryNumber} ${enqForm?.enquiry ? 'updated' : 'captured'}.` }); load(); }} />
      <div className="space-y-6 print:hidden">
        <PageHeader title="CRM: Follow-ups &amp; Quotation Revisions" subtitle="Schedule customer contacts, track communication history, and manage quotation revisions with GST and export terms." />
        <div className="flex gap-2">{([['FOLLOW', 'Enquiry follow-ups'], ['QUOTES', 'Quotation revisions']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}</div>
        {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

        {tab === 'FOLLOW' && <>
          <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Leads (enquiries) start here. Quote one from Sales Pipeline once the customer is ready.</p><button className={`${btn} btn-primary`} onClick={() => setEnqForm({})}>+ New enquiry</button></div>
          <div className="grid gap-3 md:grid-cols-2">{widget('Overdue', fu.overdue, 'border-red-200 bg-red-50')}{widget('Upcoming', fu.upcoming, 'border-slate-200 bg-white')}</div>
          <div className="flex gap-2">{(['DOMESTIC', 'EXPORT'] as const).map(r => <button key={r} onClick={() => setRegion(r)} className={`${region === r ? 'tab tab-active' : 'tab'}`}>{r === 'DOMESTIC' ? 'Domestic' : 'Export'} ({enquiries.filter(e => (e.region || 'DOMESTIC') === r).length})</button>)}</div>
          {list.map(e => (
            <div key={e._id} className="space-y-2 card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><b>{e.customerName}</b> <span className="text-xs text-slate-500">{e.enquiryNumber} · {e.source}{e.country ? ` · ${e.country}` : ''} · {e.status === 'REJECTED' ? 'CANCELLED' : e.status === 'QUALIFIED' ? `QUOTED ${e.convertedQuotationRef || ''}` : e.status}</span>{e.status === 'REJECTED' && e.cancelReason && <div className="text-xs text-red-700">Cancelled by {e.cancelledBy}: {e.cancelReason}</div>}{(e.items || []).length > 0 && <div className="text-xs text-slate-600">{e.items.map((i: any) => `${i.productName} × ${i.estimatedQuantity}`).join(' · ')}</div>}</div>
                <div className="flex flex-wrap gap-2">{e.status === 'NEW' && <><button className={`${btn} btn-secondary`} onClick={() => setEnqForm({ enquiry: e })}>Edit</button><button className={`${btn} btn-danger`} onClick={() => cancelEnquiry(e)}>Cancel</button></>}
                  {e.status !== 'REJECTED' && <button className={`${btn} btn-primary`} onClick={() => setSched({ enquiry: e, dueAt: '', mode: 'CALL', notes: '' })}>Schedule follow-up</button>}</div>
              </div>
              {(e.followUps || []).length > 0 && <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs">{[...e.followUps].sort((a: any, b: any) => +new Date(b.dueAt) - +new Date(a.dueAt)).map((f: any) => (
                <li key={f._id}>{MODE_ICON[f.mode]} <b>{new Date(f.dueAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b> — {f.status}{f.notes ? ` · ${f.notes}` : ''}{f.outcome ? ` → ${f.outcome}` : ''}
                  {f.status === 'PENDING' && <button className="ml-2 font-bold text-blue-700" onClick={() => complete({ ...f, enquiryId: e._id, customerName: e.customerName })}>mark done</button>}</li>))}</ol>}
            </div>))}
          {!list.length && <p className="empty">No {region.toLowerCase()} enquiries.</p>}
          <div className="card"><div className="mb-2 text-sm font-bold">Recent customer communication</div>
            {fu.history.slice(0, 15).map(f => <div key={f._id} className="border-b border-slate-100 py-1 text-xs">{MODE_ICON[f.mode]} {f.customerName} ({f.enquiryNumber}) · {new Date(f.doneAt || f.dueAt).toLocaleDateString('en-IN')} · {f.status}{f.outcome ? ` — ${f.outcome}` : ''}</div>)}
            {!fu.history.length && <div className="text-xs text-slate-400">No completed contacts yet.</div>}</div>
        </>}

        {tab === 'QUOTES' && quotes.map(q => (
          <div key={q._id} className="flex flex-wrap items-center justify-between gap-2 card">
            <div><Link href={`/dashboard/transactions/quotation?id=${q._id}`} className="font-bold text-[var(--erp-accent)] hover:underline">{q.quoteNumber}</Link> <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold">{rev(q.revision || 1)}</span> <span className="ml-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{q.orderType || 'DOMESTIC'}</span>
              <div className="text-xs text-slate-500">{q.customerName} · {q.stage.replaceAll('_', ' ')} · {inr(q.totalAmount)}{q.taxSummary ? ` + GST = ${inr(q.taxSummary.grandTotal)}` : ''}</div>
              {(() => { const d = (q.discountRequests || []).at(-1); if (!d) return null; return (
                <div className={`mt-1 text-xs font-semibold ${d.status === 'PENDING' ? 'text-amber-700' : d.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}`}>
                  Discount {d.percent}% ({inr(d.amount)}) · {d.status === 'PENDING' ? `waiting for ${TIER_LABEL[d.requiredRole]} approval` : `${d.status.toLowerCase()} by ${d.decidedBy}`} · asked by {d.requestedBy}: {d.reason}{d.remarks ? ` · ${d.remarks}` : ''}
                </div>); })()}</div>
            <div className="space-x-2">
              <button className={`${btn} btn-secondary`} onClick={async () => { try { setCompare(await api(`/api/quotations/${q._id}/revise`)); } catch (e: any) { setMsg({ ok: false, text: e.message }); } }}>Revisions</button>
              <PdfButton url={pdfUrl.quotation(q._id)} title={`Quotation ${q.quoteNumber}`} label="Print" className={`${btn} btn-secondary`} />
              {(() => {
                const d = (q.discountRequests || []).at(-1), pending = d?.status === 'PENDING';
                const mayDecide = pending && DECIDERS[d.requiredRole]?.includes(me.role) && (me.role === 'ADMIN' || d.requestedById !== me.id);
                return <>
                  {mayDecide && <><button className={`${btn} btn-success`} onClick={() => decide(q, true)}>Approve discount</button><button className={`${btn} btn-danger`} onClick={() => decide(q, false)}>Reject discount</button></>}
                  {OPEN.includes(q.stage) && !pending && ['ADMIN', 'MANAGER', 'SALES'].includes(me.role) && <button className={`${btn} btn-secondary`} onClick={() => setDisc({ q, percent: '', reason: '' })}>Request discount</button>}
                  {OPEN.includes(q.stage) && !pending && <button className={`${btn} btn-primary`} onClick={() => openRevise(q)}>Revise</button>}
                </>;
              })()}
            </div>
          </div>))}
        {tab === 'QUOTES' && !quotes.length && <p className="empty">No quotations yet.</p>}
      </div>


      {disc && (
        <div className="modal-overlay print:hidden">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={async e => {
            e.preventDefault();
            try {
              const r = await api(`/api/quotations/${disc.q._id}/discount`, 'POST', { action: 'request', percent: Number(disc.percent), reason: disc.reason });
              setDisc(null);
              setMsg({ ok: true, text: r.request?.status === 'PENDING' ? `Discount request sent for ${TIER_LABEL[r.request.requiredRole]} approval.` : 'Discount applied as a new revision.' });
              await load();
            } catch (err: any) { setDisc({ ...disc, error: err.message }); }
          }}>
            <h2 className="text-lg font-bold">Request discount · {disc.q.quoteNumber}</h2>
            {disc.error && <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">{disc.error}</div>}
            <p className="text-sm text-slate-500">Current value {inr(disc.q.totalAmount)} before GST. Within the Sales limit it is applied at once; above it, a Manager, Finance Manager or Admin must approve. An applied discount becomes a new revision.</p>
            <label className="lbl">Discount %<input required type="number" min="0.01" max="99.99" step="0.01" className={field} value={disc.percent} onChange={e => setDisc({ ...disc, percent: e.target.value })} /></label>
            {Number(disc.percent) > 0 && <div className="text-xs text-slate-600">Discount {inr(disc.q.totalAmount * Number(disc.percent) / 100)} · new value {inr(disc.q.totalAmount * (1 - Number(disc.percent) / 100))}</div>}
            <label className="lbl">Reason<input required minLength={5} className={field} placeholder="Why the customer gets this discount" value={disc.reason} onChange={e => setDisc({ ...disc, reason: e.target.value })} /></label>
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setDisc(null)}>Cancel</button><button className={`${btn} btn-primary`}>Submit</button></div>
          </form>
        </div>
      )}

      {sched && (
        <div className="modal-overlay print:hidden">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/enquiries/${sched.enquiry._id}/followups`, 'POST', sched); setSched(null); }, 'Follow-up scheduled.'); }}>
            <h2 className="text-lg font-bold">Schedule follow-up · {sched.enquiry.customerName}</h2>
            <input required type="datetime-local" className={field} value={sched.dueAt} onChange={e => setSched({ ...sched, dueAt: e.target.value })} />
            <select className={field} value={sched.mode} onChange={e => setSched({ ...sched, mode: e.target.value })}><option value="CALL">Call</option><option value="SMS">SMS</option><option value="EMAIL">Email</option></select>
            <textarea className={field} placeholder="Notes" value={sched.notes} onChange={e => setSched({ ...sched, notes: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setSched(null)}>Cancel</button><button className={`${btn} btn-primary`}>Schedule</button></div>
          </form>
        </div>
      )}

      {revise && (
        <div className="modal-overlay print:hidden">
          <form className="my-6 w-full max-w-3xl space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/quotations/${revise.q._id}/revise`, 'POST', revise); setRevise(null); }, 'New revision saved.'); }}>
            <h2 className="text-lg font-bold">Revise {revise.q.quoteNumber} → {rev((revise.q.revision || 1) + 1)}</h2>
            {revise.items.map((i: any, n: number) => (
              <div key={n} className="grid grid-cols-[1fr_90px_120px] gap-2 text-sm"><span className="self-center font-semibold">{i.productName}</span>
                <input type="number" min="1" className={field} value={i.quantity} onChange={e => setRevise({ ...revise, items: revise.items.map((x: any, m: number) => (m === n ? { ...x, quantity: e.target.value } : x)) })} />
                <input type="number" min="0" step="0.01" className={field} value={i.unitPrice} onChange={e => setRevise({ ...revise, items: revise.items.map((x: any, m: number) => (m === n ? { ...x, unitPrice: e.target.value } : x)) })} /></div>))}
            <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
              <label>Payment terms<input className={field} value={revise.paymentTerms} onChange={e => setRevise({ ...revise, paymentTerms: e.target.value })} /></label>
              <label>Valid until<input type="date" className={field} value={revise.validUntil} onChange={e => setRevise({ ...revise, validUntil: e.target.value })} /></label>
              <label>Order type<select className={field} value={revise.orderType} onChange={e => setRevise({ ...revise, orderType: e.target.value, terms: e.target.value === 'EXPORT' ? TERMS_PRESETS[1].text : revise.terms })}><option value="DOMESTIC">Domestic (GST invoice)</option><option value="EXPORT">Export (shipping order)</option></select></label>
              <label>T&amp;C preset<select className={field} defaultValue="" onChange={e => { const p = TERMS_PRESETS.find(x => x.key === e.target.value); if (p) setRevise({ ...revise, terms: p.text }); }}><option value="">Choose a preset…</option>{TERMS_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
            </div>
            {revise.orderType === 'EXPORT' && (
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-blue-50 p-3 text-xs font-semibold">
                <label>Currency<input className={field} value={revise.currency} onChange={e => setRevise({ ...revise, currency: e.target.value.toUpperCase() })} /></label>
                <label>Exchange rate (₹)<input type="number" min="0" step="0.0001" className={field} value={revise.exchangeRate} onChange={e => setRevise({ ...revise, exchangeRate: e.target.value })} /></label>
                <label>Incoterm<select className={field} value={revise.incoterm} onChange={e => setRevise({ ...revise, incoterm: e.target.value })}>{INCOTERMS.map(i => <option key={i}>{i}</option>)}</select></label>
                <label>Port of loading<input className={field} value={revise.portOfLoading} onChange={e => setRevise({ ...revise, portOfLoading: e.target.value })} /></label>
                <label>Port of discharge<input className={field} value={revise.portOfDischarge} onChange={e => setRevise({ ...revise, portOfDischarge: e.target.value })} /></label>
                <label>Country<input className={field} value={revise.country} onChange={e => setRevise({ ...revise, country: e.target.value })} /></label>
              </div>)}
            <textarea rows={5} className={`${field} font-mono text-xs`} value={revise.terms} onChange={e => setRevise({ ...revise, terms: e.target.value })} />
            <input required className={field} placeholder="What changed in this revision? (required)" value={revise.note} onChange={e => setRevise({ ...revise, note: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setRevise(null)}>Cancel</button><button className={`${btn} btn-primary`}>Save revision</button></div>
          </form>
        </div>
      )}

      {compare && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/40 backdrop-blur-sm print:hidden" onClick={() => setCompare(null)}>
          <div className="h-full w-full max-w-3xl space-y-3 overflow-y-auto bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{compare.quoteNumber} · revision history</h2><button className="text-sm font-bold text-slate-500" onClick={() => setCompare(null)}>Close</button></div>
            <div className="flex gap-3 overflow-x-auto">{compare.revisions.map((r: any, idx: number) => {
              const prev = compare.revisions[idx - 1];
              return (
                <div key={r.rev} className="min-w-[230px] flex-1 space-y-2 rounded-2xl border border-slate-200 p-3 text-xs">
                  <div className="text-sm font-bold">{rev(r.rev)}{r.current ? ' (current)' : ''}</div>
                  {r.note && <div className="rounded bg-slate-50 p-1.5 italic">Next revision note: {r.note}</div>}
                  {r.items.map((i: any, n: number) => {
                    const p = prev?.items.find((x: any) => x.productName === i.productName);
                    const changed = prev && (!p || p.quantity !== i.quantity || p.unitPrice !== i.unitPrice);
                    return <div key={n} className={changed ? 'rounded bg-amber-100 p-1' : 'p-1'}>{i.productName}<div>{i.quantity} × {inr(i.unitPrice)}</div></div>;
                  })}
                  <div className={`font-bold ${prev && prev.totalAmount !== r.totalAmount ? 'text-amber-700' : ''}`}>Total {inr(r.totalAmount)}</div>
                  <div>{r.paymentTerms}</div>
                </div>);
            })}</div>
          </div>
        </div>
      )}
    </div>
  );
}
