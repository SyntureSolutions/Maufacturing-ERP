'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Alert } from '@/components/ui';

const field = 'input';
const btn = 'btn btn-sm';
const EDIT_ROLES = ['ADMIN', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'];
const blank = { code: '', name: '', plant: '', zones: '', racks: '', bins: '' };
const joined = (v: string[] | undefined) => (v || []).join(', ');

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Storage locations for put-away and batch moves. QUARANTINE, SFG, FG and SCRAP are fixed system stores and are not listed here.
export default function StorageLocationsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [form, setForm] = useState<any>(blank);
  const [editing, setEditing] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = EDIT_ROLES.includes(role);

  const load = useCallback(async () => {
    const d = await api('/api/storage-locations?all=1').catch(() => []);
    setRows(Array.isArray(d) ? d : []);
  }, []);
  useEffect(() => { load(); api('/api/auth/session').then(s => setRole(s?.user?.role || '')).catch(() => {}); }, [load]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null); setBusy(true);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) run(async () => { await api(`/api/storage-locations/${editing._id}`, 'PATCH', { name: form.name, plant: form.plant, zones: form.zones, racks: form.racks, bins: form.bins }); setEditing(null); setForm(blank); }, `${editing.code} updated.`);
    else run(async () => { await api('/api/storage-locations', 'POST', form); setForm(blank); }, `Storage location ${form.code.toUpperCase()} created.`);
  };
  const startEdit = (l: any) => { setEditing(l); setForm({ code: l.code, name: l.name, plant: l.plant || '', zones: joined(l.zones), racks: joined(l.racks), bins: joined(l.bins) }); };
  const toggle = (l: any) => run(() => api(`/api/storage-locations/${l._id}`, 'PATCH', { isActive: !l.isActive }), l.isActive ? `${l.code} taken out of use.` : `${l.code} is in use again.`);

  return (
    <div className="ui-page">
      <PageHeader title="Storage Locations" subtitle="Where accepted stock is put away. Zones, racks and bins are optional: leave a list empty when a location does not use that level. The process stores (Quarantine, SFG, FG, Scrap) are fixed by the system." />
      {msg && <Alert ok={msg.ok}>{msg.text}</Alert>}

      {canEdit && (
        <form onSubmit={save} className="card space-y-3">
          <h2 className="text-[15px] font-bold">{editing ? `Change ${editing.code}` : 'New storage location'}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="lbl">Code<input required className={field} disabled={!!editing} placeholder="e.g. W4 or 1106" maxLength={12} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
            <label className="lbl">Name<input required className={field} placeholder="e.g. Consumables Store" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="lbl">Plant<input className={field} placeholder="e.g. PL01" value={form.plant} onChange={e => setForm({ ...form, plant: e.target.value.toUpperCase() })} /></label>
            <label className="lbl">Zones<input className={field} placeholder="A, B, C" value={form.zones} onChange={e => setForm({ ...form, zones: e.target.value })} /></label>
            <label className="lbl">Racks<input className={field} placeholder="R1, R2" value={form.racks} onChange={e => setForm({ ...form, racks: e.target.value })} /></label>
            <label className="lbl">Bins<input className={field} placeholder="B1, B2" value={form.bins} onChange={e => setForm({ ...form, bins: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2">
            {editing && <button type="button" className={`${btn} btn-secondary`} onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
            <button className={`${btn} btn-primary`} disabled={busy}>{editing ? 'Save' : 'Create'}</button>
          </div>
        </form>)}

      <div className="table-wrap">
        <table className="text-left text-sm">
          <thead><tr><th>Code</th><th>Name</th><th>Plant</th><th>Zones</th><th>Racks</th><th>Bins</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map(l => (
              <tr key={l._id} className={l.isActive ? '' : 'text-slate-400'}>
                <td className="font-bold num">{l.code}</td><td>{l.name}</td><td>{l.plant || '—'}</td>
                <td className="text-xs">{joined(l.zones) || 'not used'}</td>
                <td className="text-xs">{l.racks?.length ? `${l.racks.length} (${l.racks[0]}–${l.racks.at(-1)})` : 'not used'}</td>
                <td className="text-xs">{l.bins?.length ? `${l.bins.length} (${l.bins[0]}–${l.bins.at(-1)})` : 'not used'}</td>
                <td><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${l.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{l.isActive ? 'In use' : 'Out of use'}</span></td>
                <td>{canEdit && <div className="flex justify-end gap-1.5">
                  <button className={`${btn} btn-secondary`} onClick={() => startEdit(l)}>Edit</button>
                  <button className={`${btn} ${l.isActive ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => toggle(l)}>{l.isActive ? 'Take out of use' : 'Put in use'}</button>
                </div>}</td>
              </tr>))}
            {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
