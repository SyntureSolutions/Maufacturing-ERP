'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Users, User, Mail, Phone, MapPin, AlertCircle, CreditCard, Building, ShieldCheck } from 'lucide-react';
import GstProfileFields from '@/components/common/GstProfileFields';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer?: any) => void;
  customer?: any;
}

// Drop-down values mirror models/Customer.ts (that file pulls in mongoose, so it is not imported on the client)
const ACCOUNT_GROUPS: Record<string, string> = { SOLD_TO: 'Sold-To Party', SHIP_TO: 'Ship-To Party', BILL_TO: 'Bill-To Party', PAYER: 'Payer' };
const SALES_ORGS: Record<string, string> = { SO01: 'North Region', SO02: 'South Region', SO03: 'Export' };
const CHANNELS: Record<string, string> = { '01': 'Direct Sales', '02': 'Wholesale', '03': 'Retail' };
const DIVISIONS: Record<string, string> = { HV: 'HVAC', LT: 'Lighting', SV: 'Services' };
const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FOB', 'CFR', 'CIF'];
const blankArea = () => ({ salesOrg: 'SO01', distributionChannel: '01', division: 'HV', salesDistrict: '', pricingProcedure: '', shippingConditions: '', incoterm: '' });
const EXTRA_DEFAULTS = { gstRegistration: '', constitution: '', distanceKm: '' as string | number, tcsDeclaration27C: false, accountGroup: 'SOLD_TO', searchTerm: '', pan: '', taxId: '', region: '', country: 'IN', companyCode: '', reconciliationAccount: '', paymentMethod: '', dunningProcedure: '' };
const EXTRA_KEYS = Object.keys(EXTRA_DEFAULTS) as (keyof typeof EXTRA_DEFAULTS)[];
const fieldCls = 'w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm';
const labelCls = 'text-xs font-bold text-slate-700 uppercase tracking-wider';

export default function CustomerModal({ isOpen, onClose, onSuccess, customer }: CustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    contactPerson: '',
    email: '',
    phone: '',
    billingAddress: '',
    city: '',
    pincode: '',
    stateCode: '',
    paymentTerms: 'Net 30',
    creditLimit: 500000,
    isActive: true,
    ...EXTRA_DEFAULTS
  });
  const [salesAreas, setSalesAreas] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setFormData({
          name: customer.name || '',
          gstin: customer.gstin || '',
          contactPerson: customer.contactPerson || '',
          email: customer.email || '',
          phone: customer.phone || '',
          billingAddress: customer.billingAddress || '',
          city: customer.city || '',
          pincode: customer.pincode || '',
          stateCode: customer.stateCode || '',
          paymentTerms: customer.paymentTerms || 'Net 30',
          creditLimit: customer.creditLimit || 500000,
          isActive: customer.isActive ?? true,
          ...(Object.fromEntries(EXTRA_KEYS.map(k => [k, customer[k] ?? EXTRA_DEFAULTS[k]])) as typeof EXTRA_DEFAULTS)
        });
        setSalesAreas((customer.salesAreas || []).map((a: any) => ({ ...blankArea(), ...a })));
      } else {
        setFormData({
          name: '',
          gstin: '',
          contactPerson: '',
          email: '',
          phone: '',
          billingAddress: '',
          city: '',
          pincode: '',
          stateCode: '',
          paymentTerms: 'Net 30',
          creditLimit: 500000,
          isActive: true,
          ...EXTRA_DEFAULTS
        });
        setSalesAreas([]);
      }
      setError('');
    }
  }, [isOpen, customer]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'gstin') {
      const upper = value.toUpperCase();
      const derivedState = upper.length >= 2 ? upper.slice(0, 2) : '';
      setFormData(prev => ({ 
        ...prev, 
        gstin: upper,
        stateCode: derivedState || prev.stateCode 
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const setArea = (i: number, key: string, value: string) => setSalesAreas(prev => prev.map((a, j) => (j === i ? { ...a, [key]: value } : a)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!formData.billingAddress.trim()) {
      setError('Billing address is required.');
      return;
    }
    if (formData.country === 'IN' && formData.gstin && formData.gstin.length !== 15) {
      setError('GSTIN must be exactly 15 characters.');
      return;
    }
    if (formData.country === 'IN' && formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
      setError('Pincode must be 6 digits.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload: any = {
        ...formData,
        salesAreas,
        creditLimit: Number(formData.creditLimit) || 0
      };
      if (customer?._id) {
        payload._id = customer._id;
      }

      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        onSuccess?.(data);
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save customer');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving customer');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {customer ? 'Edit Customer Master' : 'Add New Customer'}
              </h3>
              <p className="text-xs text-slate-500">Register corporate buyer, GST details & billing profile</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Name & GSTIN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer / Company Name *</label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-sm"
                    placeholder="e.g. Decathlon Sports India Pvt Ltd"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">GSTIN (15 Alphanumeric)</label>
                <div className="relative">
                  <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="gstin"
                    maxLength={15}
                    value={formData.gstin}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-mono uppercase text-sm"
                    placeholder="29AABCD1234E1Z6"
                  />
                </div>
              </div>
            </div>

            {/* GST registration, constitution and e-way distance */}
            <GstProfileFields value={formData} onChange={patch => setFormData(prev => ({ ...prev, ...patch }) as any)} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!(formData as any).tcsDeclaration27C} onChange={e => setFormData(prev => ({ ...prev, tcsDeclaration27C: e.target.checked }) as any)} />
              Form 27C declaration received (buys scrap or other TCS goods for manufacturing): no TCS on their invoices
            </label>

            {/* Contact Person, Email, Phone */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Contact Person</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm"
                    placeholder="Aditi Rao"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm"
                    placeholder="orders@decathlon.in"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm"
                    placeholder="+91 80 4099 2200"
                  />
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Billing Address *</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <textarea
                  name="billingAddress"
                  value={formData.billingAddress}
                  onChange={handleInputChange}
                  rows={2}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 resize-none text-sm"
                  placeholder="Survey No 78/10, Chikkajala Village, Bengaluru, Karnataka"
                />
              </div>
            </div>

            {/* City, Pincode, State Code */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">City</label>
                <input
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm"
                  placeholder="Bengaluru"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pincode (6 digits)</label>
                <input
                  name="pincode"
                  maxLength={6}
                  value={formData.pincode}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-mono"
                  placeholder="562157"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">GST State Code</label>
                <input
                  name="stateCode"
                  maxLength={2}
                  value={formData.stateCode}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-mono"
                  placeholder="29"
                />
              </div>
            </div>

            {/* Payment Terms & Credit Limit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Payment Terms</label>
                <select
                  name="paymentTerms"
                  value={formData.paymentTerms}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-medium"
                >
                  <option value="Immediate">Immediate / Advance</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 30">Net 30 Days (Standard)</option>
                  <option value="Net 45">Net 45 Days</option>
                  <option value="Net 60">Net 60 Days</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Credit Limit (INR)</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    name="creditLimit"
                    value={formData.creditLimit}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-mono"
                    placeholder="500000"
                  />
                </div>
              </div>
            </div>

            {/* General data */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">General data</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className={labelCls}>Account group</label>
                  <select name="accountGroup" value={formData.accountGroup} onChange={handleInputChange} className={fieldCls}>
                    {Object.entries(ACCOUNT_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Search term</label>
                  <input name="searchTerm" value={formData.searchTerm} onChange={handleInputChange} className={fieldCls + ' uppercase'} placeholder="DECATHLON" />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Country (2 letters)</label>
                  <input name="country" maxLength={2} value={formData.country} onChange={e => setFormData(p => ({ ...p, country: e.target.value.toUpperCase() }))} className={fieldCls + ' font-mono uppercase'} placeholder="IN" />
                </div>
                {formData.country === 'IN' ? (
                  <div className="space-y-2">
                    <label className={labelCls}>PAN</label>
                    <input name="pan" maxLength={10} value={formData.pan} onChange={e => setFormData(p => ({ ...p, pan: e.target.value.toUpperCase() }))} className={fieldCls + ' font-mono uppercase'} placeholder="Filled from GSTIN if blank" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className={labelCls}>Tax ID</label>
                    <input name="taxId" value={formData.taxId} onChange={handleInputChange} className={fieldCls} placeholder="Foreign tax id" />
                  </div>
                )}
                <div className="space-y-2">
                  <label className={labelCls}>Region</label>
                  <input name="region" value={formData.region} onChange={e => setFormData(p => ({ ...p, region: e.target.value.toUpperCase() }))} className={fieldCls + ' uppercase'} placeholder="MH" />
                </div>
              </div>
            </div>

            {/* Company code data */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">Company code data</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><label className={labelCls}>Company code</label><input name="companyCode" value={formData.companyCode} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Reconciliation account</label><input name="reconciliationAccount" value={formData.reconciliationAccount} onChange={handleInputChange} className={fieldCls + ' font-mono'} placeholder="121000" /></div>
                <div className="space-y-2"><label className={labelCls}>Payment method</label><input name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} className={fieldCls} placeholder="Wire Transfer" /></div>
                <div className="space-y-2"><label className={labelCls}>Dunning procedure</label><input name="dunningProcedure" value={formData.dunningProcedure} onChange={handleInputChange} className={fieldCls} /></div>
              </div>
            </div>

            {/* Sales areas */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800">Sales areas</h4>
                <button type="button" onClick={() => setSalesAreas(prev => [...prev, blankArea()])} className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg">+ Add sales area</button>
              </div>
              {salesAreas.length === 0 && <p className="text-xs text-slate-500">No sales area yet. Add one for each sales org, channel and division this customer buys from.</p>}
              {salesAreas.map((a, i) => (
                <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1"><label className={labelCls}>Sales org</label>
                      <select value={a.salesOrg} onChange={e => setArea(i, 'salesOrg', e.target.value)} className={fieldCls}>{Object.entries(SALES_ORGS).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}</select></div>
                    <div className="space-y-1"><label className={labelCls}>Distribution channel</label>
                      <select value={a.distributionChannel} onChange={e => setArea(i, 'distributionChannel', e.target.value)} className={fieldCls}>{Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}</select></div>
                    <div className="space-y-1"><label className={labelCls}>Division</label>
                      <select value={a.division} onChange={e => setArea(i, 'division', e.target.value)} className={fieldCls}>{Object.entries(DIVISIONS).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1"><label className={labelCls}>Sales district</label><input value={a.salesDistrict || ''} onChange={e => setArea(i, 'salesDistrict', e.target.value)} className={fieldCls} /></div>
                    <div className="space-y-1"><label className={labelCls}>Pricing procedure</label><input value={a.pricingProcedure || ''} onChange={e => setArea(i, 'pricingProcedure', e.target.value)} className={fieldCls} /></div>
                    <div className="space-y-1"><label className={labelCls}>Shipping conditions</label><input value={a.shippingConditions || ''} onChange={e => setArea(i, 'shippingConditions', e.target.value)} className={fieldCls} /></div>
                    <div className="space-y-1"><label className={labelCls}>Incoterm</label>
                      <select value={a.incoterm || ''} onChange={e => setArea(i, 'incoterm', e.target.value)} className={fieldCls}><option value="">None</option>{INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  </div>
                  <button type="button" onClick={() => setSalesAreas(prev => prev.filter((_, j) => j !== i))} className="text-xs font-bold text-red-600 hover:underline">Remove this sales area</button>
                </div>
              ))}
            </div>
          </div>

          <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-8 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 text-sm cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {customer ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
