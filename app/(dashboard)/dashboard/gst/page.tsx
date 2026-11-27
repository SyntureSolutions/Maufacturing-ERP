'use client';

import React, { useState, useEffect } from 'react';
import { useUrlTab } from '@/components/workspace/useUrlTab';
import { 
  FileText, 
  Plus, 
  RefreshCcw, 
  CheckCircle2, 
  ShieldCheck, 
  QrCode, 
  Truck, 
  Download, 
  CreditCard, 
  Settings, 
  Percent, 
  Building, 
  ArrowUpRight, 
  ArrowDownRight, 
  Check, 
  X, 
  AlertCircle,
  FileCheck,
  Zap
} from 'lucide-react';

export default function GSTPage() {
  const [data, setData] = useState<any>({ returns: [], eInvoices: [], itcLedger: [], hsnMaster: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'RETURNS' | 'E_INVOICING' | 'ITC_MANAGEMENT' | 'TAX_CONFIG'>('RETURNS');
  useUrlTab(['RETURNS', 'E_INVOICING', 'ITC_MANAGEMENT', 'TAX_CONFIG'] as const, setActiveTab);
  const [notification, setNotification] = useState<string | null>(null);

  // E-Invoice Modal State
  const [isEInvModalOpen, setIsEInvModalOpen] = useState(false);
  const [eInvData, setEInvData] = useState({
    invoiceNumber: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
    customerName: 'Metro Cycle Distributors',
    customerGSTIN: '27AAAAA0000A1Z5',
    taxableAmount: 500000
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/gst');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (e) {
      console.error('Failed to fetch GST data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateReturn = async (period: string, type: string) => {
    try {
      const res = await fetch('/api/gst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPeriod: period, formType: type }),
      });
      if (res.ok) {
        setNotification(`✅ ${type} Return generated successfully for ${period}!`);
        fetchData();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateEInvoice = async () => {
    try {
      const res = await fetch('/api/gst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'GENERATE_E_INVOICE',
          ...eInvData
        })
      });
      if (res.ok) {
        setNotification(`⚡ E-Invoice IRN & E-Way Bill generated for ${eInvData.invoiceNumber}!`);
        fetchData();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to generate e-invoice:', e);
    } finally {
      setIsEInvModalOpen(false);
    }
  };

  const safeReturns = Array.isArray(data.returns) ? data.returns : [];
  const safeEInvoices = Array.isArray(data.eInvoices) ? data.eInvoices : [];
  const safeItcLedger = Array.isArray(data.itcLedger) ? data.itcLedger : [];
  const safeHsnMaster = Array.isArray(data.hsnMaster) ? data.hsnMaster : [];

  const totalLiability = safeReturns.reduce((sum: number, r: any) => sum + (r.taxLiabilityCGST || 0) + (r.taxLiabilitySGST || 0) + (r.taxLiabilityIGST || 0), 0);
  const totalItc = safeReturns.reduce((sum: number, r: any) => sum + (r.itcAvailableCGST || 0) + (r.itcAvailableSGST || 0) + (r.itcAvailableIGST || 0), 0);
  const netPayable = totalLiability - totalItc;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            GST Compliance & E-Invoicing Workspace
          </h2>
          <p className="text-slate-500 mt-1">Automated GST calculations, Input Tax Credit (ITC) reconciliation, E-Invoices, and Return Filings (GSTR-1, GSTR-3B).</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm cursor-pointer" title="Refresh">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsEInvModalOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4" /> Generate E-Invoice (IRN)
          </button>
          <button 
            onClick={() => {
              const d = new Date();
              generateReturn(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, 'GSTR-3B');
            }}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg text-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" /> Generate GSTR-3B Return
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm font-medium animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg shadow-slate-900/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Output Tax Liability</p>
            <h3 className="text-2xl font-bold font-mono mt-1 text-white">₹{totalLiability.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">CGST + SGST Output Sales</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl text-amber-400">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Eligible ITC Claims</p>
            <h3 className="text-2xl font-bold font-mono mt-1">₹{totalItc.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-emerald-200 font-medium mt-1">Raw Material Purchases ITC</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <ArrowDownRight className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-600/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">Net GST Tax Payable</p>
            <h3 className="text-2xl font-bold font-mono mt-1">₹{netPayable.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-indigo-200 font-medium mt-1">After ITC Deductions</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="bg-sky-600 rounded-2xl p-5 text-white shadow-lg shadow-sky-600/20 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">Active E-Way Bills</p>
            <h3 className="text-2xl font-bold font-mono mt-1">{safeEInvoices.length} Active</h3>
            <p className="text-xs text-sky-200 font-medium mt-1">Govt Portal Transit Passes</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <Truck className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      {/* Non-Scrolling Pill Tabs Bar */}
      <div className="flex overflow-x-auto">
        <button
          onClick={() => setActiveTab('RETURNS')}
          className={`tab justify-center gap-1.5 ${activeTab === 'RETURNS' ? 'tab-active' : ''}`}
        >
          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate">1. GST Returns & Filing</span>
        </button>

        <button
          onClick={() => setActiveTab('E_INVOICING')}
          className={`tab justify-center gap-1.5 ${activeTab === 'E_INVOICING' ? 'tab-active' : ''}`}
        >
          <Zap className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="truncate">2. E-Invoicing & IRN</span>
        </button>

        <button
          onClick={() => setActiveTab('ITC_MANAGEMENT')}
          className={`tab justify-center gap-1.5 ${activeTab === 'ITC_MANAGEMENT' ? 'tab-active' : ''}`}
        >
          <CreditCard className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="truncate">3. Input Tax Credit (ITC)</span>
        </button>

        <button
          onClick={() => setActiveTab('TAX_CONFIG')}
          className={`tab justify-center gap-1.5 ${activeTab === 'TAX_CONFIG' ? 'tab-active' : ''}`}
        >
          <Percent className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="truncate">4. HSN Tax Configuration</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: GST RETURNS & FILING (GSTR-1, GSTR-3B, GSTR-2B) */}
      {/* ========================================================================= */}
      {activeTab === 'RETURNS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Automated GST Return History (GSTR-1, GSTR-3B, GSTR-2B)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Automated return compilation from sales invoices and supplier purchase bills.</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Return Period</th>
                  <th className="p-4">Form Type</th>
                  <th className="p-4 text-right">Tax Liability (Output)</th>
                  <th className="p-4 text-right">ITC Available (Input)</th>
                  <th className="p-4 text-right">Net Tax Payable</th>
                  <th className="p-4 text-center">Filing Status</th>
                  <th className="p-4 text-center">Portal Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {safeReturns.map((r: any) => {
                  const liability = (r.taxLiabilityCGST || 0) + (r.taxLiabilitySGST || 0) + (r.taxLiabilityIGST || 0);
                  const itc = (r.itcAvailableCGST || 0) + (r.itcAvailableSGST || 0) + (r.itcAvailableIGST || 0);

                  return (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-900">{r.returnPeriod}</td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                          {r.formType}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-slate-800 font-bold">₹{liability.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-right font-mono text-emerald-700 font-bold">₹{itc.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">₹{r.netTaxPayable?.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          r.status === 'FILED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => alert(`Downloading government portal JSON for ${r.formType} (${r.returnPeriod})...`)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> Portal JSON
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: E-INVOICING & E-WAY BILLS (IRN & QR CODE) */}
      {/* ========================================================================= */}
      {activeTab === 'E_INVOICING' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-600" />
                E-Invoicing Portal & E-Way Bill Transit Passes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Government portal IRN validation and automatic E-Way Bill generation for fleet dispatches.</p>
            </div>
            <button
              onClick={() => setIsEInvModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Zap className="w-4 h-4" /> Generate E-Invoice (IRN)
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Invoice # & Party</th>
                  <th className="p-4">Buyer GSTIN</th>
                  <th className="p-4">Government IRN Hash (64-Char)</th>
                  <th className="p-4">E-Way Bill Number</th>
                  <th className="p-4 text-right">Taxable & Invoice Total</th>
                  <th className="p-4 text-center">IRN Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {safeEInvoices.map((einv: any) => (
                  <tr key={einv._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{einv.invoiceNumber}</div>
                      <div className="text-xs text-slate-500">{einv.customerName}</div>
                    </td>
                    <td className="p-4 font-mono text-xs font-bold text-slate-700">{einv.customerGSTIN}</td>
                    <td className="p-4">
                      <div className="font-mono text-[11px] bg-slate-50 border border-slate-200 p-1.5 rounded font-bold text-indigo-700 max-w-xs truncate" title={einv.irn}>
                        {einv.irn}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Ack: {einv.ackNumber}</p>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                        {einv.ewayBillNumber}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">Valid till: {new Date(einv.ewayBillValidTill).toLocaleDateString()}</p>
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900">
                      ₹{einv.totalAmount?.toLocaleString('en-IN')}
                    </td>
                    <td className="p-4 text-center">
                      <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> IRN Valid
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INPUT TAX CREDIT (ITC) MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'ITC_MANAGEMENT' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-rose-600" />
                Input Tax Credit (ITC) Reconciliation (GSTR-2B)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Tracks ITC claims on raw material purchases against supplier GSTR-2B uploads.</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Supplier Vendor</th>
                  <th className="p-4">Supplier GSTIN</th>
                  <th className="p-4">Purchase Bill #</th>
                  <th className="p-4 text-right">Taxable Purchases</th>
                  <th className="p-4 text-right">CGST Claimed</th>
                  <th className="p-4 text-right">SGST Claimed</th>
                  <th className="p-4 text-center">GSTR-2B Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {safeItcLedger.map((itc: any) => (
                  <tr key={itc._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-bold text-slate-900">{itc.supplierName}</td>
                    <td className="p-4 font-mono text-xs text-slate-600">{itc.supplierGSTIN}</td>
                    <td className="p-4 font-mono text-xs text-slate-800">{itc.billNumber}</td>
                    <td className="p-4 text-right font-mono font-bold">₹{itc.taxableAmount?.toLocaleString('en-IN')}</td>
                    <td className="p-4 text-right font-mono text-emerald-700 font-bold">₹{itc.cgstClaimed?.toLocaleString('en-IN')}</td>
                    <td className="p-4 text-right font-mono text-emerald-700 font-bold">₹{itc.sgstClaimed?.toLocaleString('en-IN')}</td>
                    <td className="p-4 text-center">
                      <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Matched 2B
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TAX CONFIGURATION & HSN MASTER */}
      {/* ========================================================================= */}
      {activeTab === 'TAX_CONFIG' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Percent className="w-5 h-5 text-amber-600" />
              Tax Configuration & HSN Code Master Rates
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Pre-configured HSN tax rates and jurisdiction rules for bicycle manufacturing.</p>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">HSN Code</th>
                  <th className="p-4">Description & Item Category</th>
                  <th className="p-4 text-center">GST Rate %</th>
                  <th className="p-4 text-center">CGST %</th>
                  <th className="p-4 text-center">SGST %</th>
                  <th className="p-4 text-center">IGST %</th>
                  <th className="p-4 text-center">Jurisdiction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {safeHsnMaster.map((hsn: any) => (
                  <tr key={hsn.code} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-bold text-amber-700 bg-amber-50 rounded">{hsn.code}</td>
                    <td className="p-4 font-bold text-slate-900">{hsn.description}</td>
                    <td className="p-4 text-center font-mono font-bold text-slate-900">{hsn.gstRate}%</td>
                    <td className="p-4 text-center font-mono text-slate-600">{hsn.cgstRate}%</td>
                    <td className="p-4 text-center font-mono text-slate-600">{hsn.sgstRate}%</td>
                    <td className="p-4 text-center font-mono text-slate-600">{hsn.igstRate}%</td>
                    <td className="p-4 text-center">
                      <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold">
                        {hsn.jurisdiction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GENERATE E-INVOICE MODAL */}
      {isEInvModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Generate E-Invoice & E-Way Bill</h3>
              </div>
              <button onClick={() => setIsEInvModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Sales Invoice Number</label>
                <input
                  type="text"
                  value={eInvData.invoiceNumber}
                  onChange={(e) => setEInvData({ ...eInvData, invoiceNumber: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Customer Name</label>
                <input
                  type="text"
                  value={eInvData.customerName}
                  onChange={(e) => setEInvData({ ...eInvData, customerName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Customer GSTIN</label>
                <input
                  type="text"
                  value={eInvData.customerGSTIN}
                  onChange={(e) => setEInvData({ ...eInvData, customerGSTIN: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Taxable Amount (₹)</label>
                <input
                  type="number"
                  value={eInvData.taxableAmount}
                  onChange={(e) => setEInvData({ ...eInvData, taxableAmount: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold text-sm"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsEInvModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleGenerateEInvoice}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4" /> Generate IRN & E-Way Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
