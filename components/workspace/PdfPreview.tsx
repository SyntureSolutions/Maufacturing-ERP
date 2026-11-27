'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Loader2, Printer, X } from 'lucide-react';

export interface PdfRequest { url: string; title: string; print?: boolean }

// Shows a document's PDF inside the screen, so it can be checked before it is printed, saved or sent. The file is
// fetched once and shown from memory: Print, Download and Open in new tab all use the same copy.
export function PdfPreview({ req, onClose }: { req: PdfRequest; onClose: () => void }) {
  const [file, setFile] = useState<{ src: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const printed = useRef(false);

  useEffect(() => {
    let src = '', gone = false;
    fetch(req.url, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `The PDF could not be made (${res.status}).`);
        }
        const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'document.pdf';
        const blob = await res.blob();
        if (gone) return;
        src = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setFile({ src, name });
      })
      .catch(e => { if (!gone) setError(e.message || 'The PDF could not be loaded.'); });
    return () => { gone = true; if (src) URL.revokeObjectURL(src); };
  }, [req.url]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);

  const print = () => {
    try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); }
    catch { if (file) window.open(file.src, '_blank'); }
  };
  const download = () => {
    if (!file) return;
    const a = document.createElement('a');
    a.href = file.src; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  // Print asked for from the command bar: print as soon as the viewer has the file
  const loaded = () => { if (req.print && !printed.current) { printed.current = true; setTimeout(print, 300); } };

  return (
    <div className="px-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="px-dialog px-pdf" role="dialog" aria-label={`Preview ${req.title}`}>
        <div className="px-dialog__title">
          <span className="flex-1">Preview · {req.title}</span>
          <button className="px-btn" onClick={print} disabled={!file}><Printer className="h-4 w-4" /> Print</button>
          <button className="px-btn" onClick={download} disabled={!file}><Download className="h-4 w-4" /> Download</button>
          <button className="px-btn" onClick={() => file && window.open(file.src, '_blank')} disabled={!file}><ExternalLink className="h-4 w-4" /> New tab</button>
          <button className="px-doc__close" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-pdf__body">
          {error ? <div className="px-error m-6">{error}</div>
            : file ? <iframe ref={frame} src={file.src} title={req.title} onLoad={loaded} />
            : <div className="px-pdf__wait"><Loader2 className="h-6 w-6 animate-spin" /> Making the PDF…</div>}
        </div>
      </div>
    </div>
  );
}
