'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, Plus, Download, FileCheck2 } from 'lucide-react';
import { DocCard, Dialog, Field, Pill, useMsgBox, fmtDate, fmtNum } from '@/components/workspace/controls';

// HSN / SAC master: search the codes, add or correct one, and load the whole list from a file.
// The GST portal publishes the HSN/SAC list as an Excel file; a rate sheet or a CSV with code, description
// and GST rate works too. A file is always checked first; nothing is saved until Import is pressed.

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'FINANCE_MANAGER'];

interface Summary { read: number; codes: number; added: number; updated: number; withRate: number; repeated: number; problems: number; issues: { sheet: string; line: number; message: string }[]; dryRun: boolean }

export default function HsnMasterScreen() {
  const msg = useMsgBox();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [res, setRes] = useState<{ rows: any[]; total: number; all: number } | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<null | { code: string; description: string; gstRate: string; isNew: boolean }>(null);
  const [importing, setImporting] = useState(false);

  const canWrite = WRITE_ROLES.includes(role);

  const search = useCallback(async (query: string, k: string) => {
    const r = await fetch(`/api/hsn?q=${encodeURIComponent(query.trim())}&kind=${k}&limit=200`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || `Search failed (${r.status}).`); return; }
    setError('');
    setRes(d);
  }, []);

  useEffect(() => { fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { search(q, kind); }, 250); return () => clearTimeout(t); }, [q, kind, search]);

  const saveOne = async () => {
    if (!editing) return;
    const r = await fetch('/api/hsn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [{ code: editing.code, description: editing.description, gstRate: editing.gstRate }] }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { msg.error(d.error || `Not saved (${r.status}).`); return; }
    setEditing(null);
    await search(q, kind);
    msg.info(`HSN/SAC ${editing.code} ${d.added ? 'added' : 'saved'}.`);
  };

  return (
    <DocCard kind="Master" number="HSN / SAC Codes" status={res ? <Pill tone="info">{res.all.toLocaleString('en-IN')} codes</Pill> : undefined}
      meta="Used by the HSN search on items">
      <div className="px-doc__section px-actions">
        <input className="px-input" style={{ maxWidth: 380 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by code (8714) or words (bicycle)" aria-label="Search" />
        <select className="px-input" style={{ width: 150 }} value={kind} onChange={e => setKind(e.target.value)} aria-label="HSN or SAC">
          <option value="">HSN and SAC</option><option value="HSN">HSN (goods)</option><option value="SAC">SAC (services)</option>
        </select>
        <span style={{ marginLeft: 'auto' }} />
        <a className="px-btn" href="/api/hsn?template=1"><Download />CSV template</a>
        {canWrite && <button className="px-btn" onClick={() => setEditing({ code: '', description: '', gstRate: '', isNew: true })}><Plus />Add code</button>}
        {canWrite && <button className="px-btn px-btn--accent" onClick={() => setImporting(true)}><Upload />Import from file</button>}
      </div>

      <div className="px-doc__section">
        {error && <div className="px-error mb-2">{error}</div>}
        {res && res.all === 0 && (
          <div className="px-note mb-2">
            The list is empty. Download the HSN/SAC master Excel published on the GST portal and press <b>Import from file</b>. A rate sheet from your tax consultant, or our CSV template, works too.
          </div>)}
        <div className="px-table-wrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
          <table className="px-table">
            <thead><tr><th style={{ width: 110 }}>Code</th><th style={{ width: 70 }}>Type</th><th>Description</th><th className="num" style={{ width: 90 }}>GST %</th><th style={{ width: 200 }}>Source</th><th style={{ width: 100 }}>Updated</th></tr></thead>
            <tbody>
              {(res?.rows || []).map(h => (
                <tr key={h.code} style={{ cursor: canWrite ? 'pointer' : 'default' }} title={canWrite ? 'Double-click to change' : undefined}
                  onDoubleClick={() => canWrite && setEditing({ code: h.code, description: h.description || '', gstRate: h.gstRate === undefined || h.gstRate === null ? '' : String(h.gstRate), isNew: false })}>
                  <td><b>{h.code}</b></td><td>{h.kind}</td><td style={{ whiteSpace: 'normal' }}>{h.description || '—'}</td>
                  <td className="num">{h.gstRate === undefined || h.gstRate === null ? '—' : fmtNum(h.gstRate, 2).replace(/\.00$/, '')}</td>
                  <td title={h.source}>{h.source || ''}</td><td>{fmtDate(h.updatedAt)}</td>
                </tr>))}
            </tbody>
          </table>
          {res && res.all > 0 && !res.rows.length && <div className="px-empty">No code matches.</div>}
        </div>
        {res && res.total > res.rows.length && <div className="px-hint mt-2">{res.total.toLocaleString('en-IN')} match; the first {res.rows.length} are shown. Type more to narrow it down.</div>}
      </div>

      {editing && (
        <Dialog title={editing.isNew ? 'Add HSN / SAC Code' : `HSN / SAC ${editing.code}`} onClose={() => setEditing(null)} width={560}
          buttons={<><button className="px-btn" onClick={() => setEditing(null)}>Cancel</button><button className="px-btn px-btn--primary" onClick={saveOne}>Save</button></>}>
          <div className="px-fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Code"><input className="px-input" readOnly={!editing.isNew} autoFocus={editing.isNew} value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} placeholder="2 to 8 digits" /></Field>
            <Field label="GST Rate (%)"><input className="px-input" inputMode="decimal" value={editing.gstRate} onChange={e => setEditing({ ...editing, gstRate: e.target.value })} placeholder="Leave blank if not known" /></Field>
            <Field label="Description" wide><textarea className="px-input" style={{ minHeight: 90 }} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></Field>
          </div>
        </Dialog>)}

      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); search(q, kind); }} />}
    </DocCard>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const msg = useMsgBox();
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (dryRun) fd.append('dryRun', '1');
      const r = await fetch('/api/hsn', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `The file could not be imported (${r.status}).`); setCheck(null); return; }
      if (dryRun) { setCheck(d); return; }
      onDone();
      msg.info(`Imported from ${file.name}:\n${d.added.toLocaleString('en-IN')} codes added, ${d.updated.toLocaleString('en-IN')} updated${d.problems ? `, ${d.problems} lines skipped` : ''}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Import HSN / SAC Codes" onClose={onClose} width={760}
      buttons={<>
        <button className="px-btn" onClick={onClose}>Close</button>
        <button className="px-btn" disabled={!file || busy} onClick={() => send(true)}><FileCheck2 />Check file</button>
        <button className="px-btn px-btn--primary" disabled={!check || busy || !check.codes} onClick={() => send(false)}><Upload />{check ? `Import ${check.codes.toLocaleString('en-IN')} codes` : 'Import'}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="px-hint">
          Excel (.xlsx) or CSV. Needs a column for the code (HSN, SAC, HSN_CD, Code…) and one for the description; a GST rate column is optional.
          Every sheet is read, so the GST portal file with its HSN and SAC sheets loads in one go. Existing codes are updated; a rate is only changed when the file has one.
        </div>
        <input type="file" accept=".xlsx,.csv" aria-label="HSN file" onChange={e => { setFile(e.target.files?.[0] || null); setCheck(null); setError(''); }} />
        {busy && <div className="px-note">Reading the file… a full HSN list takes a few seconds.</div>}
        {error && <div className="px-error">{error}</div>}
        {check && (
          <>
            <div className="px-summary" style={{ minWidth: 0 }}>
              <div><span>Codes read</span><b>{check.read.toLocaleString('en-IN')}</b></div>
              <div><span>New codes to add</span><b>{check.added.toLocaleString('en-IN')}</b></div>
              <div><span>Existing codes to update</span><b>{check.updated.toLocaleString('en-IN')}</b></div>
              <div><span>Codes with a GST rate</span><b>{check.withRate.toLocaleString('en-IN')}</b></div>
              {check.repeated > 0 && <div><span>Repeated in the file (last one kept)</span><b>{check.repeated.toLocaleString('en-IN')}</b></div>}
              <div><span>Lines that will be skipped</span><b style={{ color: check.problems ? 'var(--px-bad)' : undefined }}>{check.problems.toLocaleString('en-IN')}</b></div>
            </div>
            {check.issues.length > 0 && (
              <div className="px-table-wrap" style={{ maxHeight: 200 }}>
                <table className="px-table"><thead><tr><th style={{ width: 110 }}>Sheet</th><th style={{ width: 70 }}>Line</th><th>Problem</th></tr></thead>
                  <tbody>{check.issues.map((i, n) => <tr key={n}><td>{i.sheet}</td><td>{i.line}</td><td style={{ whiteSpace: 'normal' }}>{i.message}</td></tr>)}</tbody></table>
              </div>)}
            {check.problems > check.issues.length && <div className="px-hint">Only the first {check.issues.length} problems are listed.</div>}
          </>)}
      </div>
    </Dialog>
  );
}
