'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pencil, ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import CustomerModal from '@/components/modals/CustomerModal';

// Customer master as an object page: header strip, then collapsible Header (tabs) and Sales Areas.
// Layout follows the ERP Customer Master Template: general data, company code data and sales area data.

const TABS = ['General', 'Address', 'Company code', 'Tax'];
const GROUPS: Record<string, string> = { SOLD_TO: 'Sold-To Party', SHIP_TO: 'Ship-To Party', BILL_TO: 'Bill-To Party', PAYER: 'Payer' };
const SALES_ORGS: Record<string, string> = { SO01: 'North Region', SO02: 'South Region', SO03: 'Export' };
const CHANNELS: Record<string, string> = { '01': 'Direct Sales', '02': 'Wholesale', '03': 'Retail' };
const DIVISIONS: Record<string, string> = { HV: 'HVAC', LT: 'Lighting', SV: 'Services' };
const named = (map: Record<string, string>, k: string) => (map[k] ? `${k} (${map[k]})` : k);

export default function CustomerObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true, areas: true });
  const [tab, setTab] = useState(TABS[0]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setC(data); else setError(data.error || 'Could not load the customer.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/dispatch" className="btn btn-secondary btn-sm w-fit">Back to customers</Link></div>;
  if (!c) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;
  const areas: any[] = c.salesAreas || [];

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/dispatch" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Customers</Link>
        <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Change</button>
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {fmtDay(c.createdAt)} · changed {fmtDay(c.updatedAt)}</span>
      </div>

      <div className="obj-header">
        <Field label="Customer">{c.code}</Field>
        <Field label="Name">{c.name}</Field>
        <Field label="Account Group">{GROUPS[c.accountGroup] || 'Sold-To Party'}</Field>
        <Field label="Credit Limit">{c.creditLimit ? fmtInr(c.creditLimit) : 'None set'}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${c.isActive === false ? 'negative' : 'positive'}`}>{c.isActive === false ? 'Inactive' : 'Active'}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ ...open, header: !open.header })}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'General' && <div className="form-grid">
            <Field label="Search Term">{c.searchTerm}</Field><Field label="Contact Person">{c.contactPerson}</Field>
            <Field label="Email">{c.email}</Field><Field label="Telephone">{c.phone}</Field>
          </div>}
          {tab === 'Address' && <div className="form-grid">
            <Field label="Billing Address">{c.billingAddress}</Field><Field label="City / Postal Code">{[c.city, c.pincode].filter(Boolean).join(' ')}</Field>
            <Field label="Region">{c.region}</Field><Field label="Country">{c.country}</Field>
            <Field label="GST State Code">{c.stateCode}</Field>
            <Field label="Shipping Addresses">{(c.shippingAddresses || []).join(' | ')}</Field>
          </div>}
          {tab === 'Company code' && <div className="form-grid">
            <Field label="Company Code">{c.companyCode}</Field><Field label="Reconciliation Account">{c.reconciliationAccount}</Field>
            <Field label="Payment Terms">{c.paymentTerms}</Field><Field label="Payment Method">{c.paymentMethod}</Field>
            <Field label="Dunning Procedure">{c.dunningProcedure}</Field><Field label="Credit Limit">{c.creditLimit ? fmtInr(c.creditLimit) : 'None set'}</Field>
          </div>}
          {tab === 'Tax' && <div className="form-grid">
            <Field label="GSTIN">{c.gstin}</Field><Field label="PAN">{c.pan}</Field>
            <Field label="Tax ID (foreign)">{c.taxId}</Field>
          </div>}
        </div>
      </Section>

      <Section title={`Sales Areas (${areas.length})`} open={open.areas} onToggle={() => setOpen({ ...open, areas: !open.areas })}>
        {areas.length
          ? <div className="table-wrap !shadow-none"><table className="text-left text-sm">
              <thead><tr><th>Sales Org.</th><th>Distr. Channel</th><th>Division</th><th>Sales District</th><th>Pricing Procedure</th><th>Shipping Conditions</th><th>Incoterms</th></tr></thead>
              <tbody>{areas.map((a, k) => <tr key={k}><td>{named(SALES_ORGS, a.salesOrg)}</td><td>{named(CHANNELS, a.distributionChannel)}</td><td>{named(DIVISIONS, a.division)}</td><td>{a.salesDistrict || '—'}</td><td>{a.pricingProcedure || '—'}</td><td>{a.shippingConditions || '—'}</td><td>{a.incoterm || '—'}</td></tr>)}</tbody></table></div>
          : <p className="px-4 py-3 text-sm text-[var(--erp-muted)]">No sales area has been set up for this customer.</p>}
      </Section>

      <CustomerModal isOpen={editing} customer={c} onClose={() => setEditing(false)} onSuccess={() => { setEditing(false); load(); }} />
    </div>
  );
}
