'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  DollarSign, 
  Sliders, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Building, 
  Percent, 
  Sparkles, 
  Layers, 
  Info,
  RotateCcw,
  ArrowRight
} from 'lucide-react';

interface ApprovalThresholdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ApprovalThresholdsModal({ isOpen, onClose, onSuccess }: ApprovalThresholdsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // Form State
  const [thresholds, setThresholds] = useState({
    poSupplyChainLimit: 50000,
    poFinanceLimit: 500000,
    discountSalesLimitPercent: 10,
    discountFinanceLimitPercent: 25,
    discountAmountLimit: 50000,
    writeOffFloorLimit: 15000,
    writeOffFinanceLimit: 100000,
    lastUpdatedBy: 'System Initializer',
    lastUpdatedRole: 'ADMIN',
    updatedAt: new Date().toISOString()
  });

  // Interactive Simulator State
  const [simCategory, setSimCategory] = useState<'PO' | 'DISCOUNT' | 'WRITE_OFF'>('PO');
  const [simValue, setSimValue] = useState<number>(75000);

  const fetchThresholds = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings/approval-thresholds');
      if (res.ok) {
        const data = await res.json();
        setThresholds(data);
      }
    } catch (e: any) {
      console.warn('Failed to load thresholds:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchThresholds();
      setNotification(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings/approval-thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds)
      });

      if (res.ok) {
        const updated = await res.json();
        setThresholds(updated);
        setNotification('✅ Approval threshold policies updated and applied successfully in real time!');
        setTimeout(() => setNotification(null), 3500);
        onSuccess?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save approval threshold policies.');
      }
    } catch (e: any) {
      setError(e.message || 'Error occurred while saving thresholds.');
    } finally {
      setSaving(false);
    }
  };

  // Simulator Evaluator
  const getSimulationResult = () => {
    if (simCategory === 'PO') {
      if (simValue > thresholds.poFinanceLimit) {
        return {
          tier: 'Tier 3: Executive Board / Super Admin',
          role: 'ADMIN (Super Executive)',
          color: 'bg-rose-50 border-rose-300 text-rose-800',
          badge: 'Executive Authorization Required',
          detail: `Exceeds CFO ceiling of ₹${thresholds.poFinanceLimit.toLocaleString('en-IN')}. Requires Super Admin sign-off.`
        };
      } else if (simValue > thresholds.poSupplyChainLimit) {
        return {
          tier: 'Tier 2: Finance Manager (CFO) Gate',
          role: 'FINANCE_MANAGER (CFO)',
          color: 'bg-amber-50 border-amber-300 text-amber-800',
          badge: 'Finance Manager Sign-Off Required',
          detail: `Exceeds Supply Chain limit of ₹${thresholds.poSupplyChainLimit.toLocaleString('en-IN')}. Requires Finance Manager clearance.`
        };
      } else {
        return {
          tier: 'Tier 1: Supply Chain Manager Operations',
          role: 'SUPPLY_CHAIN_MANAGER or MANAGER',
          color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
          badge: 'Direct Supply Chain Sign-Off',
          detail: `Under ₹${thresholds.poSupplyChainLimit.toLocaleString('en-IN')}. Can be directly approved by Supply Chain or Operations Manager.`
        };
      }
    } else if (simCategory === 'DISCOUNT') {
      if (simValue > thresholds.discountFinanceLimitPercent) {
        return {
          tier: 'Tier 3: Executive Discount Exception',
          role: 'ADMIN (Super Executive)',
          color: 'bg-rose-50 border-rose-300 text-rose-800',
          badge: 'Super Admin Override Required',
          detail: `Exceeds CFO discount cap of ${thresholds.discountFinanceLimitPercent}%. Requires Super Admin approval.`
        };
      } else if (simValue > thresholds.discountSalesLimitPercent) {
        return {
          tier: 'Tier 2: Commercial Finance Approval',
          role: 'FINANCE_MANAGER (CFO)',
          color: 'bg-amber-50 border-amber-300 text-amber-800',
          badge: 'Finance Manager Sign-Off Required',
          detail: `Exceeds standard Sales limit of ${thresholds.discountSalesLimitPercent}%. Requires Finance Manager approval.`
        };
      } else {
        return {
          tier: 'Tier 1: Sales Representative Discretion',
          role: 'SALES (Commercial Rep)',
          color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
          badge: 'Standard Sales Authority',
          detail: `Within normal ${thresholds.discountSalesLimitPercent}% commercial threshold.`
        };
      }
    } else {
      if (simValue > thresholds.writeOffFinanceLimit) {
        return {
          tier: 'Tier 3: Executive Asset Write-Off',
          role: 'ADMIN (Super Executive)',
          color: 'bg-rose-50 border-rose-300 text-rose-800',
          badge: 'Executive Board Approval',
          detail: `Exceeds CFO write-off clearance of ₹${thresholds.writeOffFinanceLimit.toLocaleString('en-IN')}. Requires Super Admin.`
        };
      } else if (simValue > thresholds.writeOffFloorLimit) {
        return {
          tier: 'Tier 2: Finance Scrap Clearance',
          role: 'FINANCE_MANAGER (CFO)',
          color: 'bg-amber-50 border-amber-300 text-amber-800',
          badge: 'Finance Manager Sign-Off Required',
          detail: `Exceeds Floor Manager scrap allowance of ₹${thresholds.writeOffFloorLimit.toLocaleString('en-IN')}.`
        };
      } else {
        return {
          tier: 'Tier 1: Quality Floor Scrap Disposal',
          role: 'QUALITY_INSPECTOR or MANAGER',
          color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
          badge: 'Plant Floor Approval',
          detail: `Under ₹${thresholds.writeOffFloorLimit.toLocaleString('en-IN')} scrap threshold.`
        };
      }
    }
  };

  const simResult = getSimulationResult();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Main Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto border border-slate-200 z-10 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">Value-Based Approval Policies & Thresholds</h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold uppercase">
                  Super Admin & Finance Manager Access
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Configure tiered authorization rules without editing code. Changes apply dynamically across the ERP.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-8 max-h-[75vh] overflow-y-auto">
          {notification && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-bold animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{notification}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* POLICY 1: PURCHASE ORDER VALUE TIERING */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Purchase Order Procurement Approval Tiers</h4>
                  <p className="text-xs text-slate-500">Defines spend sign-off boundaries for Supply Chain vs Finance Manager vs Super Admin.</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Currency: INR (₹)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/60 p-4 rounded-xl border border-slate-200/80">
              {/* Tier 1 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Tier 1: Supply Chain Approval Limit (₹)
                  </label>
                  <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Supply Chain / Ops Mgr
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={thresholds.poSupplyChainLimit}
                    onChange={(e) => setThresholds(prev => ({ ...prev, poSupplyChainLimit: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-7 pr-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-amber-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  POs under this amount can be signed off directly by Supply Chain Manager.
                </p>
              </div>

              {/* Tier 2 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Tier 2: Finance Manager (CFO) Ceiling (₹)
                  </label>
                  <span className="text-[11px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                    Finance Manager (CFO)
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50000"
                    value={thresholds.poFinanceLimit}
                    onChange={(e) => setThresholds(prev => ({ ...prev, poFinanceLimit: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-7 pr-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-amber-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  POs between ₹{thresholds.poSupplyChainLimit.toLocaleString('en-IN')} and this limit require CFO approval. Above this requires Super Admin.
                </p>
              </div>
            </div>
          </div>

          {/* POLICY 2: SALES DISCOUNT TIERING */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Sales Quotation & Commercial Discount Tiers</h4>
                  <p className="text-xs text-slate-500">Controls maximum percentage discount allowances before Finance authorization.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 bg-slate-50/60 p-4 rounded-xl border border-slate-200/80">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Sales Standard Discount Limit (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={thresholds.discountSalesLimitPercent}
                    onChange={(e) => setThresholds(prev => ({ ...prev, discountSalesLimitPercent: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-3 pr-7 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-indigo-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                </div>
                <p className="text-[11px] text-slate-500">Sales Rep standard margin allowance.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Finance Manager Discount Cap (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={thresholds.discountFinanceLimitPercent}
                    onChange={(e) => setThresholds(prev => ({ ...prev, discountFinanceLimitPercent: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-3 pr-7 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-indigo-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                </div>
                <p className="text-[11px] text-slate-500">Higher discounts require Super Admin.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Discount Rupee Cap (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={thresholds.discountAmountLimit}
                    onChange={(e) => setThresholds(prev => ({ ...prev, discountAmountLimit: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-7 pr-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">Absolute rupee concession ceiling.</p>
              </div>
            </div>
          </div>

          {/* POLICY 3: INVENTORY SCRAP & WRITE-OFFS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Inventory Scrap & Loss Write-Off Tiers</h4>
                  <p className="text-xs text-slate-500">Thresholds for defective batch write-offs, scrap disposal, and bad debts.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/60 p-4 rounded-xl border border-slate-200/80">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Quality Inspector / Plant Floor Scrap Limit (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={thresholds.writeOffFloorLimit}
                    onChange={(e) => setThresholds(prev => ({ ...prev, writeOffFloorLimit: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-7 pr-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-rose-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">Quality Inspectors can write off damaged raw parts under this value.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Finance Manager Write-Off Clearance Limit (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="25000"
                    value={thresholds.writeOffFinanceLimit}
                    onChange={(e) => setThresholds(prev => ({ ...prev, writeOffFinanceLimit: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-7 pr-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-rose-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">Amounts above this require Super Admin executive sign-off.</p>
              </div>
            </div>
          </div>

          {/* REAL-TIME INTERACTIVE SIMULATOR */}
          <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-bold">Interactive Policy Simulator</h4>
              </div>
              <span className="text-[11px] text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                Test Threshold Behavior Live
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-medium">Select Transaction Category:</label>
                <div className="flex gap-2">
                  {[
                    { id: 'PO', label: 'Purchase Order' },
                    { id: 'DISCOUNT', label: 'Sales Discount' },
                    { id: 'WRITE_OFF', label: 'Scrap Write-Off' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSimCategory(cat.id as any);
                        setSimValue(cat.id === 'PO' ? 75000 : cat.id === 'DISCOUNT' ? 15 : 25000);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        simCategory === cat.id ? 'bg-amber-500 text-slate-950 shadow' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <label className="text-xs text-slate-300 font-medium">
                    {simCategory === 'DISCOUNT' ? 'Test Discount Percentage (%):' : 'Test Value Amount (₹):'}
                  </label>
                  <input
                    type="number"
                    value={simValue}
                    onChange={(e) => setSimValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded-xl text-sm font-mono font-bold outline-none focus:border-amber-400 mt-1"
                  />
                </div>
              </div>

              {/* Simulation Result Card */}
              <div className={`p-4 rounded-xl border ${simResult.color} space-y-1.5 flex flex-col justify-center`}>
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {simResult.badge}
                </span>
                <h5 className="font-bold text-base">{simResult.tier}</h5>
                <p className="text-xs font-semibold">
                  Required Role: <span className="underline">{simResult.role}</span>
                </p>
                <p className="text-[11px] opacity-90">{simResult.detail}</p>
              </div>
            </div>
          </div>

          {/* Audit Timestamp */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t pt-3">
            <span>
              Last updated by: <strong className="text-slate-700">{thresholds.lastUpdatedBy} ({thresholds.lastUpdatedRole})</strong>
            </span>
            <span>
              Updated: {new Date(thresholds.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Policies...' : 'Save & Enforce Policies'}
          </button>
        </div>

      </div>
    </div>
  );
}
