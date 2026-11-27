'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Building, User, Mail, Phone, MapPin, AlertCircle, CreditCard, Clock, FileText } from 'lucide-react';
import GstProfileFields from '@/components/common/GstProfileFields';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (supplier?: any) => void;
  supplier?: any;
}

// Mirror models/Supplier.ts (that file pulls in mongoose, so it is not imported on the client)
const ACCOUNT_GROUPS: Record<string, string> = { DOMESTIC: 'Domestic Supplier', FOREIGN: 'Foreign Supplier', SERVICE_PROVIDER: 'Service Provider', ONE_TIME: 'One-Time Vendor' };
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const EXTRA_DEFAULTS = {
  gstRegistration: '', constitution: '', distanceKm: '' as string | number,
  accountGroup: 'DOMESTIC', searchTerm: '', city: '', pincode: '', region: '', country: 'IN', taxId: '', vatNumber: '',
  companyCode: '', reconciliationAccount: '', paymentMethod: '', toleranceGroup: '', withholdingTaxCode: '',
  purchasingOrg: '', orderCurrency: 'INR', incoterm: '', minOrderValue: '', pricingSchemaGroup: '',
  orderingAddress: '', invoicingParty: '',
};
const EXTRA_KEYS = Object.keys(EXTRA_DEFAULTS) as (keyof typeof EXTRA_DEFAULTS)[];
const fieldCls = 'w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm';
const labelCls = 'text-xs font-bold text-slate-700 uppercase tracking-wider';

export default function SupplierModal({ isOpen, onClose, onSuccess, supplier }: SupplierModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    gstin: '',
    pan: '',
    paymentTerms: 'Net 30',
    leadTime: 7,
    bankDetails: '',
    isActive: true,
    ...EXTRA_DEFAULTS
  });

  useEffect(() => {
    if (isOpen) {
      if (supplier) {
        setFormData({
          name: supplier.name || '',
          code: supplier.code || '',
          contactPerson: supplier.contactPerson || '',
          email: supplier.email || '',
          phone: supplier.phone || '',
          address: supplier.address || '',
          gstin: supplier.gstin || '',
          pan: supplier.pan || '',
          paymentTerms: supplier.paymentTerms || 'Net 30',
          leadTime: supplier.leadTime ?? 7,
          bankDetails: supplier.bankDetails || '',
          isActive: supplier.isActive ?? true,
          ...(Object.fromEntries(EXTRA_KEYS.map(k => [k, supplier[k] ?? EXTRA_DEFAULTS[k]])) as typeof EXTRA_DEFAULTS)
        });
      } else {
        const autoCode = `SUP-${Math.floor(100 + Math.random() * 900)}`;
        setFormData({
          name: '',
          code: autoCode,
          contactPerson: '',
          email: '',
          phone: '',
          address: '',
          gstin: '',
          pan: '',
          paymentTerms: 'Net 30',
          leadTime: 7,
          bankDetails: '',
          isActive: true,
          ...EXTRA_DEFAULTS
        });
      }
      setError('');
    }
  }, [isOpen, supplier]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'gstin' || name === 'pan') {
      setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Supplier name is required');
      return;
    }
    if (!formData.code.trim()) {
      setError('Supplier code is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const url = supplier?._id ? `/api/suppliers/${supplier._id}` : '/api/suppliers';
      const method = supplier?._id ? 'PATCH' : 'POST';
      
      const payload = {
        ...formData,
        leadTime: Number(formData.leadTime) || 0,
        minOrderValue: formData.minOrderValue === '' ? 0 : Number(formData.minOrderValue)
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        onSuccess?.(data);
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save supplier');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
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
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {supplier ? 'Edit Supplier' : 'Register Supplier'}
              </h3>
              <p className="text-xs text-slate-500">Configure vendor information, GST credentials & procurement terms</p>
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
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Company / Vendor Name *</label>
                <input 
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-sm"
                  placeholder="e.g. Apex Alloy Frames Ltd."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Supplier Code *</label>
                <input 
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-mono text-sm"
                  placeholder="SUP-FRM-001"
                />
              </div>
            </div>

            {/* Contact Person & Email & Phone */}
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
                    placeholder="Rajesh Sharma"
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
                    placeholder="orders@vendor.com"
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
                    placeholder="+91 98230 11223"
                  />
                </div>
              </div>
            </div>

            {/* GST, PAN, Lead Time */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">GSTIN (15 Chars)</label>
                <div className="relative">
                  <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    name="gstin"
                    maxLength={15}
                    value={formData.gstin}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-mono text-sm uppercase"
                    placeholder="27AAACA1234F1Z5"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">PAN (10 Chars)</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    name="pan"
                    maxLength={10}
                    value={formData.pan}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-mono text-sm uppercase"
                    placeholder="AAACA1234F"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Lead Time (Days)</label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="number"
                    min="0"
                    name="leadTime"
                    value={formData.leadTime}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-semibold"
                    placeholder="7"
                  />
                </div>
              </div>
            </div>

            {/* GST registration, constitution and e-way distance */}
            <GstProfileFields value={formData} onChange={patch => setFormData(prev => ({ ...prev, ...patch }) as any)} />

            {/* Payment Terms & Bank Details */}
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
                  <option value="COD">Cash On Delivery (COD)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bank Details (Optional)</label>
                <input 
                  name="bankDetails"
                  value={formData.bankDetails}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm"
                  placeholder="HDFC Bank, A/C: 5020..., IFSC: HDFC0001234"
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Registered Address / Facility</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <textarea 
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 resize-none text-sm"
                  placeholder="Plot 42, Chakan Industrial Area, Pune, Maharashtra"
                />
              </div>
            </div>

            {/* General data */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">General data</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2"><label className={labelCls}>Account group</label>
                  <select name="accountGroup" value={formData.accountGroup} onChange={handleInputChange} className={fieldCls}>{Object.entries(ACCOUNT_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="space-y-2"><label className={labelCls}>Search term</label><input name="searchTerm" value={formData.searchTerm} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Country (2 letters)</label>
                  <input name="country" maxLength={2} value={formData.country} onChange={e => setFormData(p => ({ ...p, country: e.target.value.toUpperCase() }))} className={fieldCls + ' font-mono uppercase'} /></div>
                <div className="space-y-2"><label className={labelCls}>City</label><input name="city" value={formData.city} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Pincode</label><input name="pincode" value={formData.pincode} onChange={handleInputChange} className={fieldCls + ' font-mono'} /></div>
                <div className="space-y-2"><label className={labelCls}>Region</label>
                  <input name="region" value={formData.region} onChange={e => setFormData(p => ({ ...p, region: e.target.value.toUpperCase() }))} className={fieldCls + ' uppercase'} /></div>
                {formData.country !== 'IN' && (<>
                  <div className="space-y-2"><label className={labelCls}>Tax ID</label><input name="taxId" value={formData.taxId} onChange={handleInputChange} className={fieldCls} /></div>
                  <div className="space-y-2"><label className={labelCls}>VAT number</label><input name="vatNumber" value={formData.vatNumber} onChange={handleInputChange} className={fieldCls} /></div>
                </>)}
              </div>
            </div>

            {/* Company code data */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">Company code data</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2"><label className={labelCls}>Company code</label><input name="companyCode" value={formData.companyCode} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Reconciliation account</label><input name="reconciliationAccount" value={formData.reconciliationAccount} onChange={handleInputChange} className={fieldCls + ' font-mono'} placeholder="211000" /></div>
                <div className="space-y-2"><label className={labelCls}>Payment method</label><input name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Tolerance group</label><input name="toleranceGroup" value={formData.toleranceGroup} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Withholding tax code</label><input name="withholdingTaxCode" value={formData.withholdingTaxCode} onChange={handleInputChange} className={fieldCls} /></div>
              </div>
            </div>

            {/* Purchasing data */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">Purchasing data</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2"><label className={labelCls}>Purchasing org</label><input name="purchasingOrg" value={formData.purchasingOrg} onChange={handleInputChange} className={fieldCls} /></div>
                <div className="space-y-2"><label className={labelCls}>Order currency</label>
                  <input name="orderCurrency" maxLength={3} value={formData.orderCurrency} onChange={e => setFormData(p => ({ ...p, orderCurrency: e.target.value.toUpperCase() }))} className={fieldCls + ' font-mono uppercase'} placeholder="INR" /></div>
                <div className="space-y-2"><label className={labelCls}>Incoterm</label>
                  <select name="incoterm" value={formData.incoterm} onChange={handleInputChange} className={fieldCls}><option value="">None</option>{INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="space-y-2"><label className={labelCls}>Minimum order value</label><input type="number" min="0" name="minOrderValue" value={formData.minOrderValue} onChange={handleInputChange} className={fieldCls + ' font-mono'} /></div>
                <div className="space-y-2"><label className={labelCls}>Pricing schema group</label><input name="pricingSchemaGroup" value={formData.pricingSchemaGroup} onChange={handleInputChange} className={fieldCls} /></div>
              </div>
            </div>

            {/* Partner functions */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">Partner functions</h4>
              <p className="text-xs text-slate-500">Enter another vendor's Vendor ID, or leave blank. The vendor itself is always allowed.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><label className={labelCls}>Ordering address</label><input name="orderingAddress" value={formData.orderingAddress} onChange={handleInputChange} className={fieldCls + ' font-mono'} /></div>
                <div className="space-y-2"><label className={labelCls}>Invoicing party</label><input name="invoicingParty" value={formData.invoicingParty} onChange={handleInputChange} className={fieldCls + ' font-mono'} /></div>
              </div>
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
              {supplier ? 'Update Supplier' : 'Register Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
