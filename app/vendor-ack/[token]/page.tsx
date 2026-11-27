'use client';

import { Alert } from '@/components/ui';
import { use, useEffect, useState } from 'react';

export default function VendorAckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [po, setPo] = useState<any>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/vendor-ack?token=${token}`).then(async r => { const d = await r.json(); if (!r.ok) setError(d.error || 'Invalid link'); else setPo(d); }).catch(() => setError('Could not load the order.'));
  }, [token]);

  const ack = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/vendor-ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setDone(true); else setError(d.error || 'Could not acknowledge');
  };

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Purchase order acknowledgement</h1>
      {error && <Alert ok={false}>{error}</Alert>}
      {po && (
        <div className="space-y-3 card">
          <div><b>{po.poNumber}</b> · {po.supplier}</div>
          <table className="w-full text-sm"><tbody>{po.items.map((i: any, n: number) => <tr key={n} className="border-t border-slate-100"><td className="py-1">{i.name}</td><td>{i.quantity}</td><td className="text-right">₹{i.unitPrice}</td></tr>)}</tbody></table>
          <div className="text-right font-bold">Total ₹{po.totalAmount?.toLocaleString('en-IN')}</div>
          {po.acknowledgedAt || done ? <Alert ok>Thank you, this order has been acknowledged.</Alert> : (
            <form onSubmit={ack} className="flex gap-2"><input required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="input flex-1" /><button className="btn btn-primary">Acknowledge order</button></form>
          )}
        </div>
      )}
    </main>
  );
}
