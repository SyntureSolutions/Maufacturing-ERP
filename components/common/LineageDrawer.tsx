'use client';

import { useEffect, useMemo, useState } from 'react';

interface Node { key: string; type: string; id: string; number: string; status?: string; date?: string; amount?: number; page: string }
interface Edge { from: string; to: string }
interface Chain { root: string; nodes: Node[]; edges: Edge[]; truncated: boolean }

const LABEL: Record<string, string> = {
  ENQUIRY: 'Enquiry', QUOTATION: 'Quotation', SALES_ORDER: 'Sales order', WORK_ORDER: 'Work order', DELIVERY_CHALLAN: 'Delivery challan', INVOICE: 'Tax invoice', RECEIPT: 'Receipt',
  MRP_RUN: 'MRP run', PURCHASE_INDENT: 'Purchase indent', RFQ: 'RFQ', PURCHASE_ORDER: 'Purchase order', GRN: 'Goods received', VENDOR_BILL: 'Vendor bill', PAYMENT: 'Payment', BILL_OF_ENTRY: 'Bill of Entry',
};

const DONE = new Set(['PAID', 'RECEIVED', 'FULFILLED', 'INVOICED', 'COMPLETED', 'POSTED', 'CLOSED', 'AWARDED', 'PO_RECEIVED', 'PUT_AWAY', 'QC_DONE', 'CONVERTED', 'ACCEPTED', 'APPROVED']);
const WAITING = new Set(['CANCELLED', 'REJECTED', 'LOST_DECLINED', 'VOIDED']);
const tone = (s?: string) => (!s ? 'bg-slate-100 text-slate-600' : DONE.has(s) ? 'bg-emerald-100 text-emerald-800' : WAITING.has(s) ? 'bg-slate-200 text-slate-500 line-through' : 'bg-amber-100 text-amber-800');
const inr = (n?: number) => (n === undefined ? '' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

/** Longest-path layers: every document sits one column to the right of the latest document it came from */
function layers(chain: Chain) {
  const incoming = new Map<string, string[]>();
  for (const n of chain.nodes) incoming.set(n.key, []);
  for (const e of chain.edges) incoming.get(e.to)?.push(e.from);
  const depth = new Map<string, number>();
  const visit = (k: string, seen: Set<string>): number => {
    if (depth.has(k)) return depth.get(k)!;
    if (seen.has(k)) return 0;
    seen.add(k);
    const d = Math.max(-1, ...(incoming.get(k) || []).map(p => visit(p, seen))) + 1;
    depth.set(k, d);
    return d;
  };
  chain.nodes.forEach(n => visit(n.key, new Set()));
  const cols: Node[][] = [];
  for (const n of chain.nodes) (cols[depth.get(n.key) || 0] ||= []).push(n);
  return { cols: cols.filter(Boolean), incoming };
}

export default function LineageDrawer({ type, id, label = 'Document chain' }: { type: string; id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<Chain | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChain(null); setError(''); setPicked(null);
    fetch(`/api/lineage?type=${type}&id=${encodeURIComponent(id)}`).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load the chain');
      setChain(d);
    }).catch(e => setError(e.message));
  }, [open, type, id]);

  const laid = useMemo(() => (chain ? layers(chain) : null), [chain]);
  const byKey = useMemo(() => new Map((chain?.nodes || []).map(n => [n.key, n])), [chain]);
  const selected = picked ? byKey.get(picked) : undefined;

  return (
    <>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(true)}>⛓ {label}</button>
      {open && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40 backdrop-blur-sm print:hidden" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto bg-white p-6 text-left shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="text-left"><h2 className="m-0 text-left text-xl font-bold text-slate-900">Document chain</h2><p className="mt-1 text-left text-sm text-slate-500">Everything this document came from and everything it led to. Click a document for details.</p></div>
              <button type="button" className="btn btn-sm btn-secondary shrink-0" onClick={() => setOpen(false)} aria-label="Close the document chain">✕ Close</button>
            </div>
            {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
            {!chain && !error && <p className="text-sm text-slate-500">Loading…</p>}
            {chain && laid && (
              <>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Completed / approved / paid</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />In progress / waiting</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Cancelled</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border-2 border-amber-500" />The document you opened</span>
                </div>
                {chain.nodes.length <= 1 && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No other document is linked to this one yet.</p>}
                <div className="flex items-start overflow-x-auto pb-3">
                  {laid.cols.map((col, i) => (
                    <div key={i} className="flex items-start">
                    {i > 0 && <div className="flex w-10 shrink-0 items-center justify-center self-stretch text-xl font-bold text-slate-300" aria-hidden="true">→</div>}
                    <div className="flex min-w-[210px] flex-col gap-3">
                      {col.map(n => {
                        const from = (laid.incoming.get(n.key) || []).map(k => byKey.get(k)?.number).filter(Boolean);
                        return (
                          <button key={n.key} type="button" onClick={() => setPicked(n.key)}
                            className={`rounded-xl border-2 p-3 text-left text-sm shadow-sm transition hover:shadow-md ${n.key === chain.root ? 'border-amber-500' : 'border-slate-200'} ${picked === n.key ? 'bg-slate-50 ring-2 ring-slate-300' : 'bg-white'}`}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{LABEL[n.type] || n.type}</div>
                            <div className="num mt-0.5 text-base font-bold text-slate-900">{n.number}</div>
                            {n.status && <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone(n.status)}`}>{n.status.replace(/_/g, ' ')}</span>}
                            {n.amount !== undefined && <div className="num mt-1 text-xs font-semibold text-slate-600">{inr(n.amount)}</div>}
                            {from.length > 0 && <div className="mt-1 text-[11px] text-slate-500">from {from.join(', ')}</div>}
                          </button>);
                      })}
                    </div>
                    </div>))}
                </div>
                {chain.truncated && <p className="text-xs font-semibold text-amber-700">This chain is very long; only the first documents are shown.</p>}
                {selected && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-sm">
                    <div className="font-bold">{LABEL[selected.type] || selected.type} {selected.number}</div>
                    <div className="mt-1 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
                      <span>Status: <b>{selected.status ? selected.status.replace(/_/g, ' ') : '—'}</b></span>
                      <span>Date: <b>{selected.date ? new Date(selected.date).toLocaleDateString('en-IN') : '—'}</b></span>
                      {selected.amount !== undefined && <span>Amount: <b className="num">{inr(selected.amount)}</b></span>}
                    </div>
                    <a className="btn btn-sm btn-primary mt-2 inline-block" href={selected.page}>Open its page</a>
                  </div>)}
              </>)}
          </div>
        </div>)}
    </>
  );
}
