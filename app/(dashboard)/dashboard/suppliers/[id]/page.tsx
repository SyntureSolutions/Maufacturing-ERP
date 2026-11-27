'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pencil, ArrowLeft } from 'lucide-react';
import { Field, Section, Tabs, fmtDay, fmtInr } from '@/components/common/ObjectPage';
import { Alert } from '@/components/ui';
import SupplierModal from '@/components/modals/SupplierModal';

// Vendor master as an object page: header strip, then collapsible Header (tabs).
// Layout follows the ERP Vendor Master Template: general data, company code data, purchasing data and partner functions.

const TABS = ['General', 'Address', 'Company code', 'Purchasing', 'Partners', 'Bank'];
const GROUPS: Record<string, string> = { DOMESTIC: 'Domestic Supplier', FOREIGN: 'Foreign Supplier', SERVICE_PROVIDER: 'Service Provider', ONE_TIME: 'One-Time Vendor' };

export default function VendorObjectPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({ header: true });
  const [tab, setTab] = useState(TABS[0]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/suppliers/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setS(data); else setError(data.error || 'Could not load the vendor.');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="ui-page"><Alert ok={false}>{error}</Alert><Link href="/dashboard/suppliers" className="btn btn-secondary btn-sm w-fit">Back to vendors</Link></div>;
  if (!s) return <p className="text-sm text-[var(--erp-muted)]">Loading…</p>;

  return (
    <div className="ui-page !gap-0">
      <div className="obj-toolbar">
        <Link href="/dashboard/suppliers" className="btn btn-sm btn-secondary"><ArrowLeft className="h-4 w-4" /> Vendors</Link>
        <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Change</button>
        <span className="ml-auto text-[13px] text-[var(--erp-muted)]">Created {fmtDay(s.createdAt)} · changed {fmtDay(s.updatedAt)}</span>
      </div>

      <div className="obj-header">
        <Field label="Vendor">{s.code}</Field>
        <Field label="Name">{s.name}</Field>
        <Field label="Account Group">{GROUPS[s.accountGroup] || s.accountGroup}</Field>
        <Field label="Order Currency">{s.orderCurrency || 'INR'}</Field>
        <div className="field-row"><span className="field-label">Status</span><span className={`status-text status-text--${s.isActive === false ? 'negative' : 'positive'}`}>{s.isActive === false ? 'Inactive' : 'Active'}</span></div>
      </div>

      <Section title="Header" open={open.header} onToggle={() => setOpen({ header: !open.header })}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="obj-pane">
          {tab === 'General' && <div className="form-grid">
            <Field label="Search Term">{s.searchTerm}</Field><Field label="Contact Person">{s.contactPerson}</Field>
            <Field label="Email">{s.email}</Field><Field label="Telephone">{s.phone}</Field>
            <Field label="GSTIN">{s.gstin}</Field><Field label="PAN">{s.pan}</Field>
            <Field label="Tax ID (foreign)">{s.taxId}</Field><Field label="VAT Number">{s.vatNumber}</Field>
          </div>}
          {tab === 'Address' && <div className="form-grid">
            <Field label="Street">{s.address}</Field><Field label="City / Postal Code">{[s.city, s.pincode].filter(Boolean).join(' ')}</Field>
            <Field label="Region">{s.region}</Field><Field label="Country">{s.country}</Field>
          </div>}
          {tab === 'Company code' && <div className="form-grid">
            <Field label="Company Code">{s.companyCode}</Field><Field label="Reconciliation Account">{s.reconciliationAccount}</Field>
            <Field label="Payment Terms">{s.paymentTerms}</Field><Field label="Payment Method">{s.paymentMethod}</Field>
            <Field label="Tolerance Group">{s.toleranceGroup}</Field><Field label="Withholding Tax Code">{s.withholdingTaxCode}</Field>
          </div>}
          {tab === 'Purchasing' && <div className="form-grid">
            <Field label="Purchasing Org.">{s.purchasingOrg}</Field><Field label="Order Currency">{s.orderCurrency}</Field>
            <Field label="Incoterms">{s.incoterm}</Field><Field label="Minimum Order Value">{s.minOrderValue ? fmtInr(s.minOrderValue) : 'None'}</Field>
            <Field label="Pricing Schema Group">{s.pricingSchemaGroup}</Field><Field label="Planned Delivery Time">{s.leadTime != null ? `${s.leadTime} days` : '—'}</Field>
            <Field label="Performance Rating">{s.performanceRating != null ? String(s.performanceRating) : '—'}</Field><Field label="Certifications">{(s.certifications || []).join(', ')}</Field>
          </div>}
          {tab === 'Partners' && <div className="form-grid">
            <Field label="Ordering Address">{s.orderingAddress}</Field><Field label="Invoicing Party">{s.invoicingParty}</Field>
          </div>}
          {tab === 'Bank' && <div className="min-h-16 whitespace-pre-wrap border border-[var(--erp-line)] p-3 text-sm">{s.bankDetails || <span className="text-[var(--erp-muted)]">No bank details.</span>}</div>}
        </div>
      </Section>

      <SupplierModal isOpen={editing} supplier={s} onClose={() => setEditing(false)} onSuccess={() => { setEditing(false); load(); }} />
    </div>
  );
}
