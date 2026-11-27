'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr, fmtQty } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import JobCardButton from '@/components/common/JobCardButton';

// Work order as an object page: toolbar, header strip, Header tabs (general, material, quality, cost, sub-assemblies)
// and the Routing section (stage totals and the stage log). Starting, completing and logging output stay on the Production screen.

const TONE: Record<string, string> = { PLANNED: 'info', IN_PROGRESS: 'critical', COMPLETED: 'positive', ON_HOLD: 'negative', CANCELLED: 'negative' };
const READY: Record<string, string> = { NO_MRN: 'No material requisition yet', READY: 'Material reserved', SHORTFALL: 'Material short', ISSUED: 'Material issued' };
const HEADER_TABS = ['General', 'Material', 'Quality', 'Cost', 'Sub-assemblies'];
const words = (v: any) => String(v || '').replace(/_/g, ' ');
const stamp = (d: any) => (d ? new Date(d).toLocaleString('en-GB') : '—');

export default function WorkOrderObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [wo, setWo] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, stages: true, logs: true });
  const [tab, setTab] = useState(HEADER_TABS[0]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/production/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setWo(data); else setError(data.error || 'Could not load the work order.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/production" className="btn btn-secondary btn-sm w-fit">Back to production</Link></div>;
  if (!wo) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  const p = wo.product || {};
  const stages: any[] = wo.stages || [];
  const logs: any[] = [...(wo.stageLogs || [])].reverse();
  const ready = wo.readiness || { status: 'NO_MRN' };
  const fg = wo.fgQc;
  const made = wo.fgReceivedQty || 0;
  const sfgOut: any[] = wo.sfgIssuedOut || [];
  const sfgIn: any[] = wo.sfgReceived || [];
  const unitCost = made > 0 && (wo.costTransferred || 0) > 0 ? (wo.costTransferred || 0) / made : null;

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/production" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Production</Link>
        <JobCardButton workOrderId={wo._id} label="Job card" />
        <LineageDrawer type="WORK_ORDER" id={wo._id} label="Document chain" />
        <AttachmentDrawer entityType="WORK_ORDER" entityId={wo._id} label="Attachments" />
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {fmtDay(wo.createdAt)}</span>
      </div>

      <div className="obj-header">
        <Field label="Order Type">{wo.demandType === 'MTO' ? 'Make to order' : 'Make to stock'}</Field>
        <Field label="Work Order">{wo.woNumber}</Field>
        <Field label="Material">{p.sku ? `${p.sku} ${p.name}` : p.name}</Field>
        <Field label="Order Quantity">{`${fmtQty(wo.quantity)} ${p.uom || ''}`}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${TONE[wo.status] || 'info'}`}>{words(wo.status)}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={HEADER_TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'General' && <div className="form-grid">
            <Field label="Priority">{words(wo.priority)}</Field><Field label="Machine">{wo.assignedMachine?.name}</Field>
            <Field label="Sales Order">{wo.salesOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/order-desk/${wo.salesOrder}`}>{wo.salesOrderRef || 'Open order'}</Link> : wo.salesOrderRef}</Field>
            <Field label="Parent Work Order">{wo.parentWorkOrder ? <Link className="text-[var(--erp-accent)] hover:underline" href={`/dashboard/production/${wo.parentWorkOrder}`}>Open parent order</Link> : ''}</Field>
            <Field label="Planned Start">{fmtDay(wo.plannedStartDate)}</Field><Field label="Planned Finish">{fmtDay(wo.plannedEndDate)}</Field>
            <Field label="Actual Start">{fmtDay(wo.actualStartDate)}</Field><Field label="Actual Finish">{fmtDay(wo.actualEndDate)}</Field>
            <Field label="Bill of Materials">{wo.bom?.version ? `Version ${wo.bom.version}` : ''}</Field>
          </div>}

          {tab === 'Material' && <div className="form-grid">
            <Field label="Material Readiness"><span className={`status-text status-text--${ready.status === 'SHORTFALL' ? 'negative' : ready.status === 'NO_MRN' ? 'critical' : 'positive'}`}>{READY[ready.status] || ready.status}</span></Field>
            <Field label="Material Requisition">{ready.mrn ? `${ready.mrn.number} (${words(ready.mrn.status)})` : ''}</Field>
            <Field label="Lines Short">{ready.short?.length ? String(ready.short.length) : ready.status === 'NO_MRN' ? '' : 'None'}</Field>
          </div>}

          {tab === 'Quality' && <div className="space-y-3">
            <div className="form-grid">
              <Field label="Work Order QC">{words(wo.qcStatus)}</Field><Field label="QC Gate">{wo.qcGatePassed ? 'Passed' : 'Not passed'}</Field>
              <Field label="QC Notes">{wo.qcNotes}</Field>
              <Field label="Finished Goods QC">{fg ? words(fg.status) : 'Not inspected'}</Field>
              <Field label="Approved Units">{fmtQty(wo.fgApprovedQty || 0)}</Field><Field label="Scrapped Units">{fmtQty(wo.fgScrapQty || 0)}</Field>
              <Field label="Inspector">{fg?.inspector ? `${fg.inspector}${fg.signature ? ` (signed ${fg.signature})` : ''}` : ''}</Field><Field label="Certificate">{fg?.certificateNo}</Field>
            </div>
            {(fg?.checks || []).length > 0 && <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Check</th><th>Standard</th><th>Actual</th><th>Result</th></tr></thead>
              <tbody>{fg.checks.map((c: any, k: number) => <tr key={k}><td>{c.name}</td><td>{c.standard || '—'}</td><td>{c.actual || '—'}</td><td><span className={`status-text status-text--${c.result === 'PASS' ? 'positive' : 'negative'}`}>{c.result}</span></td></tr>)}</tbody></table></div>}
          </div>}

          {tab === 'Cost' && <div className="form-grid">
            <Field label="Material Issued">{fmtInr(wo.materialCost || 0)}</Field><Field label="Moved to Finished Goods or Scrap">{fmtInr(wo.costTransferred || 0)}</Field>
            <Field label="Still in Work in Progress">{fmtInr(Math.max(0, (wo.materialCost || 0) - (wo.costTransferred || 0)))}</Field>
            <Field label="Received into Stock">{`${fmtQty(made)} ${p.uom || ''}`}</Field>
            <Field label="Material Cost per Unit">{unitCost != null ? fmtInr(unitCost) : '—'}</Field>
          </div>}

          {tab === 'Sub-assemblies' && <div className="space-y-4">
            <div><h4 className="mb-1 text-sm font-semibold">Issued to other work orders</h4>
              {sfgOut.length ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Lot</th><th>To Work Order</th><th>At Stage</th><th className="text-right">Quantity</th><th>When</th></tr></thead>
                <tbody>{sfgOut.map((s, k) => <tr key={k}><td className="num">{s.batchCode}</td><td className="num">{s.toWorkOrder}</td><td className="num">{s.atStage}</td><td className="text-right num">{fmtQty(s.quantity)}</td><td className="num">{stamp(s.at)}</td></tr>)}</tbody></table></div>
                : <p className="text-sm text-[var(--erp-muted)]">Nothing was issued to another work order.</p>}</div>
            <div><h4 className="mb-1 text-sm font-semibold">Received from other work orders</h4>
              {sfgIn.length ? <div className="table-wrap !shadow-none"><table className="text-left text-sm"><thead><tr><th>Lot</th><th>From Work Order</th><th>At Stage</th><th className="text-right">Quantity</th><th>When</th></tr></thead>
                <tbody>{sfgIn.map((s, k) => <tr key={k}><td className="num">{s.batchCode}</td><td className="num">{s.fromWorkOrder}</td><td className="num">{s.atStage}</td><td className="text-right num">{fmtQty(s.quantity)}</td><td className="num">{stamp(s.at)}</td></tr>)}</tbody></table></div>
                : <p className="text-sm text-[var(--erp-muted)]">Nothing was received from another work order.</p>}</div>
          </div>}
        </div>
      </Section>

      <Section title={`Routing (${stages.length} stage${stages.length === 1 ? '' : 's'})`} open={open.stages} onToggle={() => setOpen({ ...open, stages: !open.stages })}>
        {stages.length
          ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
              <thead><tr><th>Stage</th><th>Operation</th><th className="text-right">Released In</th><th className="text-right">Good</th><th className="text-right">Scrap</th><th className="text-right">Rework</th><th className="text-right">Waiting</th></tr></thead>
              <tbody>{stages.map(s => <tr key={s.seq}><td className="num">{s.seq}</td><td>{s.name}</td><td className="text-right num">{fmtQty(s.inQty)}</td><td className="text-right num">{fmtQty(s.good)}</td><td className="text-right num">{fmtQty(s.scrap)}</td><td className="text-right num">{fmtQty(s.rework)}</td><td className="text-right num">{fmtQty(Math.max(0, s.inQty - s.good - s.scrap))}</td></tr>)}</tbody></table></div>
          : <p className="px-4 py-3 text-sm text-[var(--erp-muted)]">No routing has been set for this work order.</p>}
      </Section>

      <Section title={`Stage Log (${logs.length})`} open={open.logs} onToggle={() => setOpen({ ...open, logs: !open.logs })}>
        {logs.length
          ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
              <thead><tr><th>When</th><th>Stage</th><th>Operator</th><th className="text-right">Input</th><th className="text-right">Good</th><th className="text-right">Scrap</th><th className="text-right">Rework</th><th>Notes</th></tr></thead>
              <tbody>{logs.map((l, k) => <tr key={k}><td className="num">{stamp(l.at)}</td><td>{l.seq} {l.stageName}</td><td>{l.operator}</td><td className="text-right num">{fmtQty(l.input)}</td><td className="text-right num">{fmtQty(l.good)}</td><td className="text-right num">{fmtQty(l.scrap)}</td><td className="text-right num">{fmtQty(l.rework)}</td><td>{l.notes || '—'}</td></tr>)}</tbody></table></div>
          : <p className="px-4 py-3 text-sm text-[var(--erp-muted)]">No output has been logged yet.</p>}
      </Section>
    </div>
  );
}
