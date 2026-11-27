'use client';

import { PageHeader, Alert } from '@/components/ui';
import JobCardButton from '@/components/common/JobCardButton';
import { PdfButton, pdfUrl } from '@/components/workspace/PdfButton';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import OtherOutputsPanel from '@/components/production/OtherOutputsPanel';
import { useCallback, useEffect, useState } from 'react';

const field = 'input';
const btn = 'btn btn-sm';
const FG_CHECKS = ['Frame alignment', 'Brake & gear function', 'Finish & paint', 'Packaging'];

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function WipPage() {
  const [tab, setTab] = useState<'BOARD' | 'SFG' | 'SCRAP'>('BOARD');
  const [orders, setOrders] = useState<any[]>([]);
  const [woId, setWoId] = useState('');
  const [sfg, setSfg] = useState<any[]>([]);
  const [finishedSfg, setFinishedSfg] = useState<any[]>([]);
  const [reissue, setReissue] = useState<{ lot: any; workOrderId: string; quantity: string } | null>(null);
  const [scrap, setScrap] = useState<any[]>([]);
  const [qc, setQc] = useState<{ lot: any; rejectedQty: string; reason: string; signature: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [routing, setRouting] = useState('Cutting, Welding, Powder Coating, Assembly');
  const [logStage, setLogStage] = useState<any | null>(null);
  const [log, setLog] = useState({ input: '', good: '', scrap: '', rework: '', operator: '', notes: '' });
  const [fgOpen, setFgOpen] = useState(false);
  const [fg, setFg] = useState<any>({ approvedQty: '', scrapQty: '0', reason: '', signature: '', checks: FG_CHECKS.map(name => ({ name, result: 'PASS' })) });

  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [o, s, c, f] = await Promise.all([get('/api/production'), get('/api/sfg'), get('/api/scrap'), get('/api/sfg/finished')]);
    setOrders(o.filter((w: any) => w.stages !== undefined || !['CANCELLED'].includes(w.status)));
    setSfg(s); setScrap(c); setFinishedSfg(f);
  }, []);
  useEffect(() => { load(); }, [load]);

  const wo = orders.find(o => o._id === woId);
  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const stages: any[] = wo?.stages || [];
  const fgPending = wo ? (wo.fgReceivedQty || 0) - (wo.fgApprovedQty || 0) - (wo.fgScrapQty || 0) : 0;
  const held = (s: any) => s.inQty - s.good - s.scrap;

  return (
    <div className="ui-page">
      <PageHeader title="WIP Board &amp; Finished Goods QC" subtitle="Stage routing, stage-wise output and rejection, SFG store, and the final FG quality gate." />
      <div className="flex gap-2">
        {([['BOARD', 'WIP board'], ['SFG', 'SFG store'], ['SCRAP', 'Scrap stores']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'tab tab-active' : 'tab'}`}>{l}</button>)}
      </div>
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {tab === 'BOARD' && (
        <div className="space-y-4">
          <select className={`${field} md:w-[28rem]`} value={woId} onChange={e => setWoId(e.target.value)}>
            <option value="">Select a work order…</option>{orders.map(o => <option key={o._id} value={o._id}>{o.woNumber} · {o.product?.name} × {o.quantity} · {o.status}</option>)}
          </select>

          {wo && (
            <div className="flex flex-wrap gap-2"><JobCardButton workOrderId={wo._id} /><LineageDrawer type="WORK_ORDER" id={wo._id} label="Chain" /><AttachmentDrawer entityType="WORK_ORDER" entityId={wo._id} label="Files" /></div>)}

          {wo && !stages.length && (
            <div className="space-y-2 card">
              <h3 className="font-bold">Configure routing</h3>
              <input className={field} value={routing} onChange={e => setRouting(e.target.value)} />
              <div className="flex gap-2">
                <button className={`${btn} btn-primary`} onClick={() => run(async () => { await api(`/api/production/${wo._id}/routing`, 'POST', { stages: routing.split(',') }); }, 'Routing saved.')}>Save routing</button>
                <button className={`${btn} btn-secondary`} onClick={() => run(async () => { await api(`/api/production/${wo._id}/routing`, 'POST', { fromBom: true }); }, 'Routing loaded from BOM.')}>Use BOM routing</button>
              </div>
            </div>
          )}
          {wo && wo.status === 'PLANNED' && stages.length > 0 && (
            <button className={`${btn} btn-success`} onClick={() => run(async () => { await api(`/api/production/${wo._id}`, 'PATCH', { status: 'IN_PROGRESS' }); }, 'Work order started.')}>Start work order</button>
          )}

          {stages.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {stages.map(s => (
                <div key={s.seq} className="min-w-[200px] flex-1 space-y-2 card">
                  <div className="text-xs font-bold uppercase text-slate-500">Stage {s.seq}</div>
                  <div className="font-bold text-slate-900">{s.name}</div>
                  <div className="text-3xl font-extrabold text-blue-700">{held(s)}</div>
                  <div className="text-xs text-slate-500">held at station</div>
                  <div className="grid grid-cols-3 gap-1 text-center text-[11px] font-semibold">
                    <span className="rounded bg-emerald-50 p-1 text-emerald-700">Good {s.good}</span><span className="rounded bg-red-50 p-1 text-red-700">Scrap {s.scrap}</span><span className="rounded bg-amber-50 p-1 text-amber-700">Rework {s.rework}</span>
                  </div>
                  <button disabled={held(s) <= 0 || wo.status !== 'IN_PROGRESS'} className={`${btn} w-full btn-primary disabled:opacity-30`} onClick={() => { setLogStage(s); setLog({ input: String(held(s)), good: String(held(s)), scrap: '0', rework: '0', operator: '', notes: '' }); }}>Log stage output</button>
                </div>
              ))}
              <div className="min-w-[220px] flex-1 space-y-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-3">
                <div className="text-xs font-bold uppercase text-emerald-700">Finished goods</div>
                <div className="text-3xl font-extrabold text-emerald-700">{fgPending}</div>
                <div className="text-xs text-slate-500">awaiting final QC</div>
                <div className="text-[11px] font-semibold">Received {wo.fgReceivedQty || 0} · Approved {wo.fgApprovedQty || 0} · Rejected {wo.fgScrapQty || 0}</div>
                <button disabled={fgPending <= 0} className={`${btn} w-full btn-success disabled:opacity-30`} onClick={() => { setFg({ ...fg, approvedQty: String(fgPending), scrapQty: '0' }); setFgOpen(true); }}>FG QC sign-off</button>
                {wo.fgQc?.certificateNo && <PdfButton url={pdfUrl.print('qc-certificate', wo._id)} title={`QC certificate ${wo.fgQc.certificateNo}`} label={`Certificate ${wo.fgQc.certificateNo}`} className={`${btn} w-full btn-secondary text-slate-700`} />}
              </div>
            </div>
          )}

          {wo && <OtherOutputsPanel workOrder={wo} onDone={text => { setMsg({ ok: true, text }); load(); }} />}

          {((wo?.sfgReceived?.length || 0) > 0 || (wo?.sfgIssuedOut?.length || 0) > 0) && (
            <div className="card space-y-2">
              <h3 className="text-[15px] font-bold">Re-issued semi-finished units</h3>
              {wo.sfgReceived?.map((r: any, i: number) => (
                <div key={`in${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><span className="badge bg-emerald-50 text-emerald-700">Received</span> <b className="num">{r.quantity}</b> from {r.fromWorkOrder} <span className="text-slate-400">· lot {r.batchCode}</span></span><span className="text-xs text-slate-500">joined at stage {r.atStage} · {new Date(r.at).toLocaleDateString('en-IN')}</span></div>))}
              {wo.sfgIssuedOut?.map((r: any, i: number) => (
                <div key={`out${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><span className="badge bg-amber-50 text-amber-800">Issued out</span> <b className="num">{r.quantity}</b> to {r.toWorkOrder} <span className="text-slate-400">· lot {r.batchCode}</span></span><span className="text-xs text-slate-500">left at stage {r.atStage} · {new Date(r.at).toLocaleDateString('en-IN')}</span></div>))}
            </div>
          )}

          {wo?.fgQc?.certificateNo && (
            <div className="hidden space-y-2 border border-black p-8 print:block">
              <h2 className="text-center text-xl font-bold">Pre-Dispatch Inspection Certificate</h2>
              <p>Certificate: {wo.fgQc.certificateNo} · Work order {wo.woNumber} · {wo.product?.name}</p>
              <p>Approved {wo.fgApprovedQty} · Rejected {wo.fgScrapQty} · Result <b className="border border-black px-2">{wo.fgQc.status === 'FAILED' ? 'FAIL' : 'PASS'}</b></p>
              <ul>{wo.fgQc.checks?.map((c: any, i: number) => <li key={i}>{c.name}: {c.result}</li>)}</ul>
              <p className="pt-8">Inspector: {wo.fgQc.inspector} — signed: <i>{wo.fgQc.signature}</i> on {wo.fgQc.at ? new Date(wo.fgQc.at).toLocaleString('en-IN') : ''}</p>
            </div>
          )}
          {wo?.stageLogs?.length > 0 && (
            <div className="table-wrap">
              <table className="w-full text-left text-xs"><thead className=""><tr><th className="p-2">When</th><th>Stage</th><th>Input</th><th>Good</th><th>Scrap</th><th>Rework</th><th>Operator</th><th>Notes</th></tr></thead>
                <tbody>{[...wo.stageLogs].reverse().map((l: any, i: number) => <tr key={i} className="border-t border-slate-100"><td className="p-2">{new Date(l.at).toLocaleString('en-IN')}</td><td>{l.stageName}</td><td>{l.input}</td><td>{l.good}</td><td>{l.scrap}</td><td>{l.rework}</td><td>{l.operator}</td><td>{l.notes}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      )}

      {tab === 'SFG' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-[15px] font-bold">In-process lots</h2>
            <p className="text-sm text-slate-500">Semi-finished units waiting between stages. A quality inspector approves each lot (rejected units go to the SFG reject store); only approved lots can be re-issued. Surplus can be re-issued to another work order of the same product; the units skip the stages they have already passed.</p>
            <div className="table-wrap">
              <table className="text-left text-sm">
                <thead><tr><th>Batch code</th><th>Work order</th><th>Product</th><th>From stage</th><th className="text-right">Lot qty</th><th className="text-right">In store</th><th className="text-right">Yield</th><th>Quality</th><th>Re-issued to</th><th></th></tr></thead>
                <tbody>{sfg.map(s => (
                  <tr key={s._id}>
                    <td className="num text-xs">{s.batchCode}</td><td>{s.woNumber}</td><td>{s.product?.name}</td><td>{s.stageName}</td>
                    <td className="text-right num">{s.quantity}</td><td className="text-right num font-semibold">{s.remainingQty}</td><td className="text-right num">{Math.round(s.conversionRatio * 100)}%</td>
                    <td className="text-xs">{s.qcStatus === 'PENDING' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Awaiting QC</span> : s.qcStatus === 'REJECTED' ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Rejected</span> : <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Approved{s.qcRejectedQty > 0 ? ` (${s.qcRejectedQty} rejected)` : ''}</span>}</td>
                    <td className="text-xs text-slate-500">{(s.reissues || []).map((r: any) => `${r.woNumber} (${r.quantity})`).join(', ') || '—'}</td>
                    <td className="text-right"><div className="flex justify-end gap-1.5">{s.qcStatus === 'PENDING' && s.remainingQty > 0 && <button className={`${btn} btn-accent`} onClick={() => setQc({ lot: s, rejectedQty: '0', reason: '', signature: '' })}>QC</button>}{s.remainingQty > 0 && s.qcStatus !== 'PENDING' && s.qcStatus !== 'REJECTED' && <button className={`${btn} btn-secondary`} onClick={() => setReissue({ lot: s, workOrderId: '', quantity: String(s.remainingQty) })}>Re-issue</button>}</div></td>
                  </tr>))}
                  {!sfg.length && <tr><td colSpan={10} className="p-8 text-center text-sm text-slate-400">No semi-finished lots yet.</td></tr>}</tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-[15px] font-bold">Finished sub-assemblies</h2>
            <p className="text-sm text-slate-500">Approved sub-assemblies in the SFG store. A parent assembly's material requisition reserves these automatically.</p>
            <div className="table-wrap">
              <table className="text-left text-sm">
                <thead><tr><th>Batch</th><th>Sub-assembly</th><th className="text-right">In store</th><th className="text-right">Reserved</th><th className="text-right">Available</th></tr></thead>
                <tbody>{finishedSfg.map(b => (
                  <tr key={b._id}><td className="num text-xs">{b.batchNumber}</td><td>{b.product?.name}</td><td className="text-right num">{b.currentQuantity}</td><td className="text-right num">{b.allocatedQuantity || 0}</td><td className="text-right num font-semibold">{b.available}</td></tr>))}
                  {!finishedSfg.length && <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-400">No finished sub-assemblies in store.</td></tr>}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'SCRAP' && (
        <div className="table-wrap">
          <table className="w-full text-left text-sm"><thead className=""><tr><th className="p-3">Store</th><th>Work order</th><th>Stage</th><th>Product</th><th>Qty</th><th>Reason</th><th>Operator</th><th>Date</th></tr></thead>
            <tbody>{scrap.map(s => <tr key={s._id} className="border-t border-slate-100"><td className="p-3 font-semibold">{s.store === 'SFG_REJECT' ? 'SFG reject store' : s.store.replace('_', ' ')}</td><td>{s.woNumber}</td><td>{s.stageName}</td><td>{s.product?.name}</td><td>{s.quantity}</td><td>{s.reason}</td><td>{s.operator}</td><td>{new Date(s.createdAt).toLocaleDateString('en-IN')}</td></tr>)}
              {!scrap.length && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">No scrap recorded.</td></tr>}</tbody></table>
        </div>
      )}

      {logStage && (
        <div className="modal-overlay">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/production/${wo._id}/stage-output`, 'POST', { seq: logStage.seq, ...log }); setLogStage(null); }, 'Stage output logged.'); }}>
            <h2 className="text-lg font-bold">Log output · {logStage.name}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
              {(['input', 'good', 'scrap', 'rework'] as const).map(k => <label key={k} className="capitalize">{k === 'input' ? 'Input qty' : `${k} qty`}<input type="number" min="0" step="any" required className={field} value={(log as any)[k]} onChange={e => setLog({ ...log, [k]: e.target.value })} /></label>)}
            </div>
            <input required placeholder="Operator" className={field} value={log.operator} onChange={e => setLog({ ...log, operator: e.target.value })} />
            <input placeholder="Reason / notes (required if scrap)" className={field} value={log.notes} onChange={e => setLog({ ...log, notes: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setLogStage(null)}>Cancel</button><button className={`${btn} btn-primary`}>Save</button></div>
          </form>
        </div>
      )}

      {fgOpen && wo && (
        <div className="modal-overlay">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/production/${wo._id}/fg-qc`, 'POST', fg); setFgOpen(false); }, 'FG sign-off recorded. Approved units are in the FG store.'); }}>
            <h2 className="text-lg font-bold">Final FG quality sign-off</h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
              <label>Approved qty<input type="number" min="0" step="any" className={field} value={fg.approvedQty} onChange={e => setFg({ ...fg, approvedQty: e.target.value })} /></label>
              <label>Rejected qty (FG scrap)<input type="number" min="0" step="any" className={field} value={fg.scrapQty} onChange={e => setFg({ ...fg, scrapQty: e.target.value })} /></label>
            </div>
            {fg.checks.map((c: any, i: number) => (
              <div key={c.name} className="flex items-center justify-between text-sm"><span>{c.name}</span>
                <select className="rounded-lg border border-slate-200 p-1.5" value={c.result} onChange={e => setFg({ ...fg, checks: fg.checks.map((x: any, n: number) => (n === i ? { ...x, result: e.target.value } : x)) })}><option>PASS</option><option>FAIL</option></select></div>))}
            <input placeholder="Reason for rejected units" className={field} value={fg.reason} onChange={e => setFg({ ...fg, reason: e.target.value })} />
            <input required placeholder="Inspector digital signature (type full name)" className={field} value={fg.signature} onChange={e => setFg({ ...fg, signature: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setFgOpen(false)}>Cancel</button><button className={`${btn} btn-success`}>Sign off</button></div>
          </form>
        </div>
      )}
      {qc && (
        <div className="modal-overlay">
          <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/sfg/${qc.lot._id}/qc`, 'POST', { rejectedQty: Number(qc.rejectedQty) || 0, reason: qc.reason, signature: qc.signature }); setQc(null); }, 'Lot inspected. Approved units stay in the SFG store; rejected units moved to the SFG reject store.'); }}>
            <h2>Quality inspection of {qc.lot.batchCode}</h2>
            <p className="text-sm text-slate-500">{qc.lot.product?.name} · {qc.lot.remainingQty} unit(s) in store after {qc.lot.stageName}. Units you do not reject are approved.</p>
            <label className="lbl">Units to reject<input type="number" min="0" max={qc.lot.remainingQty} step="any" className={field} value={qc.rejectedQty} onChange={e => setQc({ ...qc, rejectedQty: e.target.value })} /></label>
            {Number(qc.rejectedQty) > 0 && <label className="lbl">Reason for rejection<input required className={field} value={qc.reason} onChange={e => setQc({ ...qc, reason: e.target.value })} /></label>}
            <label className="lbl">Inspector signature (typed name)<input required className={field} value={qc.signature} onChange={e => setQc({ ...qc, signature: e.target.value })} /></label>
            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setQc(null)}>Cancel</button><button className={`${btn} btn-primary`}>Record decision</button></div>
          </form>
        </div>)}

      {reissue && (() => {
        const lotProduct = String(reissue.lot.product?._id || reissue.lot.product);
        const targets = orders.filter(o => String(o.product?._id || o.product) === lotProduct && o._id !== String(reissue.lot.workOrder) && ['PLANNED', 'IN_PROGRESS'].includes(o.status) && (o.stages || []).length > reissue.lot.stageSeq);
        const target = targets.find(o => o._id === reissue.workOrderId);
        const waiting = target ? target.stages[0].inQty - target.stages[0].good - target.stages[0].scrap : 0;
        return (
          <div className="modal-overlay">
            <form className="w-full max-w-md space-y-3 modal" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/sfg/${reissue.lot._id}/reissue`, 'POST', { workOrderId: reissue.workOrderId, quantity: Number(reissue.quantity) }); setReissue(null); }, 'Units re-issued. The target work order will skip the stages already done.'); }}>
              <h2>Re-issue {reissue.lot.batchCode}</h2>
              <p className="text-sm text-slate-500">{reissue.lot.product?.name} · {reissue.lot.remainingQty} unit(s) in store after {reissue.lot.stageName}.</p>
              <label className="lbl">Target work order
                <select required className={field} value={reissue.workOrderId} onChange={e => {
                    const t = targets.find(o => o._id === e.target.value);
                    const room = t ? Math.max(0, t.stages[0].inQty - t.stages[0].good - t.stages[0].scrap) : reissue.lot.remainingQty;
                    setReissue({ ...reissue, workOrderId: e.target.value, quantity: String(Math.min(reissue.lot.remainingQty, room)) });
                  }}>
                  <option value="">Select…</option>{targets.map(o => <option key={o._id} value={o._id}>{o.woNumber} · {o.quantity} units · {o.status}</option>)}
                </select>
              </label>
              {!targets.length && <p className="text-xs text-amber-700">No other open work order for this product has a routing with a stage after {reissue.lot.stageName}.</p>}
              {target && (waiting > 0
                ? <p className="text-xs text-slate-500">{waiting} unit(s) are still waiting at the target's first stage; the re-issued units replace them.</p>
                : <p className="text-xs text-red-600">Nothing is waiting at the target's first stage, so it cannot take re-issued units.</p>)}
              <label className="lbl">Quantity<input required type="number" min="0" step="any" max={target ? Math.min(reissue.lot.remainingQty, waiting) : reissue.lot.remainingQty} className={field} value={reissue.quantity} onChange={e => setReissue({ ...reissue, quantity: e.target.value })} /></label>
              <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setReissue(null)}>Cancel</button><button className={`${btn} btn-primary`} disabled={!reissue.workOrderId || !(Number(reissue.quantity) > 0) || (!!target && waiting <= 0)}>Re-issue</button></div>
            </form>
          </div>
        );
      })()}
    </div>
  );
}
