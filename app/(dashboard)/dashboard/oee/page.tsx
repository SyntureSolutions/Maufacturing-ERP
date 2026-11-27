'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Alert } from '@/components/ui';
import { DOWNTIME_CATEGORIES, WORLD_CLASS_OEE, aggregate, categoryLabel, oeeBand, runFigures, validateRun } from '@/lib/oee';
import MachineModal from '@/components/modals/MachineModal';

const field = 'input';
const btn = 'btn btn-sm';
const pct = (v?: number | null) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
const BAND: Record<string, { text: string; bar: string; chip: string }> = {
  'world-class': { text: 'text-emerald-700', bar: 'bg-emerald-500', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  acceptable: { text: 'text-amber-700', bar: 'bg-amber-500', chip: 'border-amber-200 bg-amber-50 text-amber-800' },
  low: { text: 'text-red-700', bar: 'bg-red-500', chip: 'border-red-200 bg-red-50 text-red-700' },
};
const BAND_LABEL: Record<string, string> = { 'world-class': 'World class', acceptable: 'Room to improve', low: 'Needs attention' };

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86400000));
const blankRun = () => ({ machine: '', day: isoDay(new Date()), shift: 'A', scheduledMinutes: '480', idealRatePerHour: '', workOrder: '', totalCount: '', rejectCount: '0', operator: '', notes: '', downtimes: [] as { category: string; minutes: string; notes: string }[] });

function Meter({ label, value, hint }: { label: string; value: number | null | undefined; hint?: string }) {
  const band = value === null || value === undefined ? 'low' : value >= 0.95 ? 'world-class' : value >= 0.8 ? 'acceptable' : 'low';
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold num ${value === null || value === undefined ? 'text-slate-300' : BAND[band].text}`}>{pct(value)}</div>
      <div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${BAND[band].bar}`} style={{ width: `${Math.min(100, (value || 0) * 100)}%` }} /></div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function OeePage() {
  const [range, setRange] = useState(30);
  const [machineId, setMachineId] = useState('');
  const [machines, setMachines] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);

  const query = `from=${daysAgo(range)}&to=${isoDay(new Date())}${machineId ? `&machine=${machineId}` : ''}`;
  const load = useCallback(async () => {
    const get = (u: string) => api(u).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
    const [m, w, rep, rs] = await Promise.all([get('/api/production/machines'), get('/api/production'), api(`/api/oee?${query}`).catch(() => null), get(`/api/machine-runs?${query}`)]);
    setMachines(m.filter((x: any) => x && x._id)); setWorkOrders(w.filter((x: any) => /^[a-f0-9]{24}$/.test(String(x._id)))); setReport(rep); setRuns(rs);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const preview = useMemo(() => {
    if (!form) return null;
    const input = {
      scheduledMinutes: Number(form.scheduledMinutes), totalCount: Number(form.totalCount) || 0, rejectCount: Number(form.rejectCount) || 0, idealRatePerHour: Number(form.idealRatePerHour) || 0,
      downtimes: form.downtimes.map((d: any) => ({ category: d.category, minutes: Number(d.minutes) || 0 })),
    };
    const errors = validateRun(input);
    return { errors, result: errors.length ? null : aggregate([runFigures(input)]) };
  }, [form]);

  const openForm = () => setForm(blankRun());
  const pickMachine = (id: string) => {
    const m = machines.find(x => x._id === id);
    setForm((f: any) => ({ ...f, machine: id, idealRatePerHour: m?.capacity ? String(m.capacity) : f.idealRatePerHour }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try {
      await api('/api/machine-runs', 'POST', form);
      setForm(null); setMsg({ ok: true, text: 'Shift run recorded.' }); await load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this shift record? OEE figures will change.')) return;
    try { await api(`/api/machine-runs/${id}`, 'DELETE'); await load(); } catch (err: any) { setMsg({ ok: false, text: err.message }); }
  };

  const o = report?.overall;
  const band = o ? oeeBand(o.oee) : 'low';
  const maxDown = Math.max(1, ...(report?.downtime || []).map((d: any) => d.minutes));
  const scheduledTotal = report?.losses?.find((l: any) => l.key === 'scheduled')?.minutes || 1;

  return (
    <div className="ui-page">
      <PageHeader title="Machine OEE" subtitle="Overall equipment effectiveness from shift runs: availability × performance × quality, with where the time was lost."
        actions={
          <div className="flex items-center gap-2">
            <button className={`${btn} btn-secondary`} onClick={() => setIsMachineModalOpen(true)}>+ Add Machine</button>
            <button className={`${btn} btn-primary`} onClick={openForm}>Log shift run</button>
          </div>
        } />

      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map(n => <button key={n} className={range === n ? 'tab tab-active' : 'tab'} onClick={() => setRange(n)}>Last {n} days</button>)}
        <select className={`${field} !w-56`} value={machineId} onChange={e => setMachineId(e.target.value)}>
          <option value="">All machines</option>{machines.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
        </select>
      </div>

      {!o ? (
        <p className="empty">No shift runs in this period. Use “Log shift run” to record scheduled time, stops and units for a machine.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="card md:col-span-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">OEE</div>
              <div className={`mt-1 text-4xl font-bold num ${BAND[band].text}`}>{pct(o.oee)}</div>
              <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${BAND[band].chip}`}>{BAND_LABEL[band]}</span>
              <div className="mt-3 text-xs text-slate-500">World-class benchmark {Math.round(WORLD_CLASS_OEE * 100)}% · {o.runs} shift {o.runs === 1 ? 'run' : 'runs'}</div>
            </div>
            <Meter label="Availability" value={o.availability} hint={`${Math.round(o.runtime)} of ${Math.round(o.plannedProduction)} planned minutes running`} />
            <Meter label="Performance" value={o.performance} hint="Output vs. ideal rate while running" />
            <Meter label="Quality" value={o.quality} hint={`${o.good} good of ${o.units} units`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 text-[15px] font-bold">Where the time went</h2>
              <div className="space-y-2.5">
                {report.losses.map((l: any) => {
                  const share = l.minutes / scheduledTotal;
                  const good = l.key === 'productive', neutral = l.key === 'scheduled';
                  return (
                    <div key={l.key}>
                      <div className="flex items-baseline justify-between text-sm"><span className={good ? 'font-semibold text-emerald-700' : 'text-slate-700'}>{l.label}</span><span className="num text-slate-500">{l.minutes.toLocaleString('en-IN')} min · {(share * 100).toFixed(1)}%</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${good ? 'bg-emerald-500' : neutral ? 'bg-slate-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h2 className="mb-3 text-[15px] font-bold">Downtime by reason</h2>
              {report.downtime.length === 0 ? <p className="text-sm text-slate-400">No stops recorded.</p> : (
                <div className="space-y-2.5">
                  {report.downtime.map((d: any) => (
                    <div key={d.category}>
                      <div className="flex items-baseline justify-between text-sm"><span className="text-slate-700">{d.label}{d.planned && <span className="ml-2 text-[11px] text-slate-400">planned</span>}</span><span className="num text-slate-500">{d.minutes} min</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${d.planned ? 'bg-slate-300' : 'bg-amber-500'}`} style={{ width: `${(d.minutes / maxDown) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-[15px] font-bold">Daily OEE</h2>
            <div className="flex h-40 items-end gap-1.5 overflow-x-auto">
              {report.trend.map((t: any) => (
                <div key={t.day} className="group flex min-w-[22px] flex-1 flex-col items-center justify-end" title={`${t.day}: OEE ${pct(t.oee)} (A ${pct(t.availability)} · P ${pct(t.performance)} · Q ${pct(t.quality)})`}>
                  <div className={`w-full rounded-t ${BAND[oeeBand(t.oee)].bar} opacity-80 group-hover:opacity-100`} style={{ height: `${Math.max(3, t.oee * 100)}%` }} />
                  <div className="mt-1 text-[10px] text-slate-400 num">{t.day.slice(8)}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500">Green ≥ {Math.round(WORLD_CLASS_OEE * 100)}% · amber 60–85% · red below 60%. Hover a bar for the breakdown.</div>
          </div>

          <div className="table-wrap">
            <table className="text-left text-sm">
              <thead><tr><th>Machine</th><th>OEE</th><th className="text-right">Availability</th><th className="text-right">Performance</th><th className="text-right">Quality</th><th className="text-right">Runs</th><th className="text-right">Unplanned downtime</th></tr></thead>
              <tbody>{report.machines.map((m: any) => (
                <tr key={m.machine}>
                  <td className="font-semibold">{m.name} <span className="text-xs font-normal text-slate-400">{m.code}</span></td>
                  <td className="min-w-[170px]"><div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${BAND[oeeBand(m.oee)].bar}`} style={{ width: `${m.oee * 100}%` }} /></div><span className={`num font-semibold ${BAND[oeeBand(m.oee)].text}`}>{pct(m.oee)}</span></div></td>
                  <td className="text-right num">{pct(m.availability)}</td><td className="text-right num">{pct(m.performance)}</td><td className="text-right num">{pct(m.quality)}</td>
                  <td className="text-right num">{m.runs}</td><td className="text-right num">{(m.downtimeMinutes / 60).toFixed(1)} h</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}

      <div className="space-y-3">
        <h2 className="text-[15px] font-bold">Recent shift runs</h2>
        <div className="table-wrap">
          <table className="text-left text-sm">
            <thead><tr><th>Date</th><th>Machine</th><th>Shift</th><th className="text-right">Scheduled</th><th className="text-right">Units</th><th className="text-right">Rejects</th><th className="text-right">OEE</th><th>Operator</th><th></th></tr></thead>
            <tbody>
              {runs.slice(0, 25).map(r => {
                const a = aggregate([r.figures]);
                return (
                  <tr key={r._id}>
                    <td className="whitespace-nowrap num">{r.day}</td><td>{r.machine?.name}{r.workOrder?.woNumber && <span className="ml-2 text-xs text-slate-400">{r.workOrder.woNumber}</span>}</td><td>{r.shift}</td>
                    <td className="text-right num">{r.scheduledMinutes} min</td><td className="text-right num">{r.totalCount}</td><td className="text-right num">{r.rejectCount}</td>
                    <td className={`text-right font-semibold num ${a ? BAND[oeeBand(a.oee)].text : ''}`}>{pct(a?.oee)}</td><td>{r.operator}</td>
                    <td className="text-right"><button className={`${btn} btn-ghost`} onClick={() => remove(r._id)}>Delete</button></td>
                  </tr>
                );
              })}
              {!runs.length && <tr><td colSpan={9} className="p-8 text-center text-sm text-slate-400">No runs recorded in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="modal-overlay">
          <form onSubmit={submit} className="my-6 w-full max-w-2xl space-y-4 modal">
            <h2>Log shift run</h2>
            {machines.length === 0 && <Alert ok={false}>No machines found. An Admin or Manager can add machines first (Production → machines).</Alert>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="lbl md:col-span-2">Machine<select required className={field} value={form.machine} onChange={e => pickMachine(e.target.value)}><option value="">Select…</option>{machines.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}</select></label>
              <label className="lbl">Date<input required type="date" max={isoDay(new Date())} className={field} value={form.day} onChange={e => setForm({ ...form, day: e.target.value })} /></label>
              <label className="lbl">Shift<input required className={field} value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })} /></label>
              <label className="lbl">Scheduled minutes<input required type="number" min="1" max="1440" className={field} value={form.scheduledMinutes} onChange={e => setForm({ ...form, scheduledMinutes: e.target.value })} /></label>
              <label className="lbl">Ideal rate (units / hour)<input required type="number" min="0" step="any" className={field} value={form.idealRatePerHour} onChange={e => setForm({ ...form, idealRatePerHour: e.target.value })} /></label>
              <label className="lbl">Units produced<input required type="number" min="0" className={field} value={form.totalCount} onChange={e => setForm({ ...form, totalCount: e.target.value })} /></label>
              <label className="lbl">Rejected units<input type="number" min="0" className={field} value={form.rejectCount} onChange={e => setForm({ ...form, rejectCount: e.target.value })} /></label>
              <label className="lbl md:col-span-2">Work order (optional)<select className={field} value={form.workOrder} onChange={e => setForm({ ...form, workOrder: e.target.value })}><option value="">None</option>{workOrders.map(w => <option key={w._id} value={w._id}>{w.woNumber}</option>)}</select></label>
              <label className="lbl md:col-span-2">Operator<input className={field} value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} /></label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Stops</span><button type="button" className={`${btn} btn-secondary`} onClick={() => setForm({ ...form, downtimes: [...form.downtimes, { category: 'BREAKDOWN', minutes: '', notes: '' }] })}>Add stop</button></div>
              {form.downtimes.map((d: any, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_100px_1fr_auto] gap-2">
                  <select className={field} value={d.category} onChange={e => setForm({ ...form, downtimes: form.downtimes.map((x: any, n: number) => (n === i ? { ...x, category: e.target.value } : x)) })}>{DOWNTIME_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}{c.planned ? ' (planned)' : ''}</option>)}</select>
                  <input type="number" min="0" placeholder="Minutes" className={field} value={d.minutes} onChange={e => setForm({ ...form, downtimes: form.downtimes.map((x: any, n: number) => (n === i ? { ...x, minutes: e.target.value } : x)) })} />
                  <input placeholder="Note" className={field} value={d.notes} onChange={e => setForm({ ...form, downtimes: form.downtimes.map((x: any, n: number) => (n === i ? { ...x, notes: e.target.value } : x)) })} />
                  <button type="button" className={`${btn} btn-ghost`} onClick={() => setForm({ ...form, downtimes: form.downtimes.filter((_: any, n: number) => n !== i) })}>Remove</button>
                </div>
              ))}
              {!form.downtimes.length && <p className="text-xs text-slate-400">No stops. Add breakdowns, changeovers and waiting time; planned stops (breaks, maintenance) are excluded from planned production time.</p>}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              {preview?.errors.length ? <span className="text-red-700">{preview.errors[0]}</span> : preview?.result ? (
                <span>Availability <b className="num">{pct(preview.result.availability)}</b> · Performance <b className="num">{pct(preview.result.performance)}</b> · Quality <b className="num">{pct(preview.result.quality)}</b> → OEE <b className={`num ${BAND[oeeBand(preview.result.oee)].text}`}>{pct(preview.result.oee)}</b></span>
              ) : <span className="text-slate-400">Enter the figures to preview OEE.</span>}
            </div>

            <div className="flex justify-end gap-2"><button type="button" className={`${btn} btn-ghost`} onClick={() => setForm(null)}>Cancel</button><button className={`${btn} btn-primary`} disabled={!!preview?.errors.length}>Save run</button></div>
          </form>
        </div>
      )}

      <MachineModal
        isOpen={isMachineModalOpen}
        onClose={() => setIsMachineModalOpen(false)}
        onSuccess={() => load()}
      />
    </div>
  );
}
