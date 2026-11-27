'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props { entityType: string; entityId: string; label?: string }

const isPreviewable = (m: string) => m === 'application/pdf' || m.startsWith('image/');
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Drag-and-drop attachment drawer. Use on any transaction: <AttachmentDrawer entityType="GRN" entityId={grn._id} />
export default function AttachmentDrawer({ entityType, entityId, label = 'Attachments' }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/attachments?entityType=${entityType}&entityId=${entityId}`);
    setFiles(res.ok ? await res.json() : []);
  }, [entityType, entityId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const upload = async (list: FileList | File[]) => {
    setError(''); setBusy(true);
    for (const f of Array.from(list)) {
      const fd = new FormData();
      fd.append('file', f); fd.append('entityType', entityType); fd.append('entityId', entityId);
      const res = await fetch('/api/attachments', { method: 'POST', body: fd });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error || `Could not upload ${f.name}`);
    }
    setBusy(false); load();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || 'Delete failed');
    setPreview(null); load();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-sm btn-secondary">📎 {label}</button>
      {open && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40 backdrop-blur-sm print:hidden" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Attachments</h2><button className="text-sm font-bold text-slate-500" onClick={() => setOpen(false)}>Close</button></div>
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
              onClick={() => input.current?.click()} className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center text-sm ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}`}>
              {busy ? 'Uploading…' : 'Drop files here or click to browse (max 5 MB each)'}
              <input ref={input} type="file" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
            </div>
            {error && <div className="rounded-xl bg-red-50 p-2 text-xs font-semibold text-red-700">{error}</div>}
            {files.map(f => (
              <div key={f._id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2 text-sm">
                <div className="min-w-0"><div className="truncate font-semibold">{f.filename}</div><div className="text-xs text-slate-500">{size(f.size)} · {f.uploadedBy} · {new Date(f.createdAt).toLocaleDateString('en-IN')}</div></div>
                <div className="flex shrink-0 gap-1">
                  {isPreviewable(f.mimeType) && <button className="btn btn-sm btn-secondary" onClick={() => setPreview(f)}>Preview</button>}
                  <a className="btn btn-sm btn-secondary" href={`/api/attachments/${f._id}`} download={f.filename}>Download</a>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(f._id)}>Delete</button>
                </div>
              </div>))}
            {!files.length && <p className="text-center text-sm text-slate-400">No files attached.</p>}
            {preview && (
              <div className="space-y-2"><div className="text-xs font-bold">{preview.filename}</div>
                {preview.mimeType.startsWith('image/') ? <img src={`/api/attachments/${preview._id}`} alt={preview.filename} className="max-h-96 w-full rounded-xl object-contain" />
                  : <iframe title="preview" src={`/api/attachments/${preview._id}`} className="h-96 w-full rounded-xl border" sandbox="" />}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
