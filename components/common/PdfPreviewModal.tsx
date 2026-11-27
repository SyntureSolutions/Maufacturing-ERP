'use client';

import React, { useState } from 'react';
import { FileText, Download, ExternalLink, X, Printer, Loader2 } from 'lucide-react';

export interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  documentNumber?: string;
  pdfUrl: string;
  downloadUrl?: string;
  fileName?: string;
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  title,
  documentNumber,
  pdfUrl,
  downloadUrl,
  fileName
}: PdfPreviewModalProps) {
  const [loading, setLoading] = useState(true);

  if (!isOpen) return null;

  const actualDownloadUrl = downloadUrl || (pdfUrl.includes('?') ? `${pdfUrl}&download=1` : `${pdfUrl}?download=1`);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
                {documentNumber && (
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 shrink-0">
                    {documentNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Official system-generated PDF document preview</p>
            </div>
          </div>

          {/* Action Buttons: Download, Open, Close */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-xs"
              title="Open full PDF in a new browser window"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Open in Tab</span>
            </a>

            <a
              href={actualDownloadUrl}
              download={fileName || true}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md shadow-amber-600/20"
              title="Download PDF to your computer"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </a>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors ml-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal PDF Viewer Body */}
        <div className="flex-1 relative bg-slate-100/70 p-3 sm:p-4 min-h-[500px]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/80 z-10 text-slate-500 text-xs font-medium">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
              <span>Rendering document preview...</span>
            </div>
          )}

          <iframe
            src={pdfUrl}
            title={title}
            onLoad={() => setLoading(false)}
            className="w-full h-full min-h-[68vh] rounded-2xl border border-slate-200 bg-white shadow-xs"
          />
        </div>

        {/* Footer info note */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Prodexa ERP Document Engine · Verified Statutory Layout</span>
          <a href={actualDownloadUrl} className="text-amber-700 font-semibold hover:underline">
            Click here if preview doesn't load automatically &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
