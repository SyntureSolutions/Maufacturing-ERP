'use client';

import { PageHeader, Alert } from '@/components/ui';
import { APPROVAL_MODULES, MODULE_INFO, type ApprovalModule } from '@/lib/approvalModules';
import { useCallback, useEffect, useState } from 'react';

const field = 'input input-auto';
const btn = 'btn btn-sm';
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function ApprovalMatrixPage() {
  const [tab, setTab] = useState<'INBOX' | 'ALL' | 'RULES'>('INBOX');
  const [requests, setRequests] = useState<any[]>([]);
  const [cfg, setCfg] = useState<{ modules: string[]; roles: string[]; rules: any[] }>({ modules: [], roles: [], rules: [] });
  const [rules, setRules] = useState<any[]>([]);
  const [module, setModule] = useState<ApprovalModule>('PURCHASE_ORDER');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([api('/api/approvals/requests').catch(() => []), api('/api/approvals/rules').catch(() => ({ modules: [], roles: [], rules: [] }))]);
    api('/api/purchase').then(p => setDrafts((Array.isArray(p) ? p : []).filter((x: any) => x.status === 'DRAFT' && /^[a-f0-9]{24}$/.test(String(x._id))))).catch(() => setDrafts([]));
    setRequests(Array.isArray(r) ? r : []); setCfg(c); setRules((c.rules || []).filter((x: any) => x.module === module).map((x: any) => ({ minAmount: String(x.minAmount), levels: x.levels })));
  }, [module]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setMsg(null);
    let remarks = '';
    if (action === 'reject') { remarks = window.prompt('Reason for rejection (sent back to the requester for re-draft)') || ''; if (!remarks.trim()) return; }
    try { await api(`/api/approvals/requests/${id}`, 'PATCH', { action, remarks }); setMsg({ ok: true, text: action === 'approve' ? 'Approved.' : 'Rejected and returned for re-draft.' }); load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const saveRules = async () => {
    setMsg(null);
    try { await api('/api/approvals/rules', 'PUT', { module, rules: rules.map(r => ({ minAmount: Number(r.minAmount), levels: r.levels })) }); setMsg({ ok: true, text: 'Rules saved.' }); load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const noAmount = !!MODULE_INFO[module].noAmount; // e.g. BOM activation: one rule, for every document
  const inbox = requests.filter(r => r.canAct);
  const list = tab === 'INBOX' ? inbox : requests;

  return (
    <div className="ui-page">
      <PageHeader title="Approval Matrix" subtitle="Value-based, multi-level approvals. A rejected purchase order goes back to draft for amendment and resubmission." />
      <div className="flex gap-2">{([['INBOX', `Pending my approval (${inbox.length})`], ['ALL', 'All requests'], ['RULES', 'Rules']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}</div>
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {tab === 'ALL' && drafts.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-bold">Draft purchase orders</div>
          {drafts.map(p => <div key={p._id} className="flex items-center justify-between text-sm"><span>{p.poNumber} · {inr(p.totalAmount)}{p.notes ? ` · ${p.notes}` : ''}</span>
            <button className={`${btn} btn-primary`} onClick={async () => { setMsg(null); try { await api('/api/approvals/requests', 'POST', { module: 'PURCHASE_ORDER', refId: p._id }); setMsg({ ok: true, text: 'Submitted for approval.' }); load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } }}>Submit for approval</button></div>)}</div>
      )}

      {tab !== 'RULES' && <>
        {list.map(r => (
          <div key={r._id} className="space-y-2 card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b>{r.refNumber}</b> <span className="text-xs text-slate-500">{(MODULE_INFO as any)[r.module]?.label || r.module} {(MODULE_INFO as any)[r.module]?.noAmount ? '' : ` · ${inr(r.amount)}`} · requested by {r.requestedBy}</span>
                <span className={`ml-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : r.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{r.status}</span></div>
              <div className="space-x-2"><button className={`${btn} btn-secondary`} onClick={() => setExpanded(expanded === r._id ? null : r._id)}>History</button>
                {r.canAct && <><button className={`${btn} btn-success`} onClick={() => act(r._id, 'approve')}>Approve</button><button className={`${btn} btn-danger`} onClick={() => act(r._id, 'reject')}>Reject</button></>}</div>
            </div>
            {r.summary && <div className="text-sm text-slate-600">{r.summary}</div>}
            {r.resultRef && <div className="text-xs font-semibold text-emerald-700">Created: {r.resultRef}</div>}
            {expanded === r._id && <ol className="space-y-1 text-xs">{r.levels.map((l: any, i: number) => <li key={i} className="rounded-lg bg-slate-50 p-2">Level {i + 1} · {l.role.replaceAll('_', ' ')} — <b>{l.status}</b>{l.actedBy ? ` by ${l.actedBy} on ${new Date(l.actedAt).toLocaleString('en-IN')}` : i === r.currentLevel && r.status === 'PENDING' ? ' (waiting)' : ''}{l.remarks ? ` — "${l.remarks}"` : ''}</li>)}</ol>}
          </div>))}
        {!list.length && <p className="empty">{tab === 'INBOX' ? 'Nothing is waiting for your approval.' : 'No approval requests yet.'}</p>}
      </>}

      {tab === 'RULES' && (
        <div className="max-w-2xl space-y-3 card">
          <div className="flex flex-wrap gap-2">{APPROVAL_MODULES.map(m => <button key={m} className={m === module ? 'tab tab-active' : 'tab'} onClick={() => setModule(m)}>{MODULE_INFO[m].label}</button>)}</div>
          <h2 className="font-bold">{MODULE_INFO[module].label}: approval rules</h2>
          <p className="text-sm text-slate-500">Compared with: <b>{MODULE_INFO[module].basis}</b>. {MODULE_INFO[module].holds} With no rule, documents are approved or posted exactly as before.</p>
          <p className="text-xs text-slate-500">{noAmount ? 'One rule covers every document of this type. Approvers act in the order listed.' : 'The rule with the highest threshold at or below the document amount applies. Approvers act in the order listed.'}</p>
          {rules.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-sm">{noAmount ? <span>Every new version</span> : <><span>From ₹</span><input type="number" min="0" className={`${field} w-40`} value={r.minAmount} onChange={e => setRules(rules.map((x, n) => (n === i ? { ...x, minAmount: e.target.value } : x)))} /></>}
                <button className={`${btn} ml-auto btn-danger`} onClick={() => setRules(rules.filter((_, n) => n !== i))}>Remove</button></div>
              <div className="flex flex-wrap items-center gap-2 text-sm">{r.levels.map((l: string, n: number) => (
                <span key={n} className="flex items-center gap-1">{n + 1}.<select className={field} value={l} onChange={e => setRules(rules.map((x, m) => (m === i ? { ...x, levels: x.levels.map((y: string, k: number) => (k === n ? e.target.value : y)) } : x)))}>{cfg.roles.map(ro => <option key={ro}>{ro}</option>)}</select>
                  {r.levels.length > 1 && <button className="text-xs text-red-600" onClick={() => setRules(rules.map((x, m) => (m === i ? { ...x, levels: x.levels.filter((_: string, k: number) => k !== n) } : x)))}>×</button>}</span>))}
                <button className={`${btn} btn-secondary`} onClick={() => setRules(rules.map((x, m) => (m === i ? { ...x, levels: [...x.levels, cfg.roles[0]] } : x)))}>+ level</button></div>
            </div>))}
          <div className="flex gap-2">{!(noAmount && rules.length) && <button className={`${btn} btn-secondary`} onClick={() => setRules([...rules, { minAmount: noAmount ? '0' : '', levels: [noAmount ? 'PRODUCTION_MANAGER' : 'SUPPLY_CHAIN_MANAGER'] }])}>Add rule</button>}<button className={`${btn} btn-primary`} onClick={saveRules}>Save rules</button></div>
          <p className="text-xs text-slate-500">Only Admins can change rules. The person who raised a document cannot approve it themselves (Admins excepted).</p>
        </div>
      )}
    </div>
  );
}
