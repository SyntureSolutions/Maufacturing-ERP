'use client';

import { useEffect, useState } from 'react';

const LABELS: Record<string, string> = {
  COMPETITOR: 'Competitor', PRICE: 'Price', LEAD_TIME: 'Lead time',
  SPEC_MISMATCH: 'Spec mismatch', BUDGET_CANCELLED: 'Budget cancelled', OTHER: 'Other',
};

// Lost-quotation breakdown by reason category; `refreshKey` re-fetches after a quote is marked lost
export default function LossAnalytics({ refreshKey }: { refreshKey?: unknown }) {
  const [rows, setRows] = useState<{ category: string; count: number; value: number }[]>([]);

  useEffect(() => {
    fetch('/api/quotations/loss-analytics')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, [refreshKey]);

  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.value), 1);

  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-bold text-slate-900">Lost-order analysis (by quoted value)</h3>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.category} className="flex items-center gap-3 text-xs">
            <span className="w-32 font-semibold text-slate-600">{LABELS[r.category] || r.category}</span>
            <div className="h-3 flex-1 rounded-full bg-slate-100">
              <div className="h-3 rounded-full bg-red-400" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            <span className="w-40 text-right font-semibold text-slate-700">{r.count} lost · ₹{r.value.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
