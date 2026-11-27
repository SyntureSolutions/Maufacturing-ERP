'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  ShieldCheck, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCcw, 
  Building, 
  Layers, 
  Percent, 
  Trash2, 
  FileText, 
  Sparkles,
  ArrowRight,
  UserCheck,
  Lock,
  Edit3
} from 'lucide-react';
import ApprovalThresholdsModal from '@/components/modals/ApprovalThresholdsModal';

export default function ApprovalPoliciesPage() {
  const [thresholds, setThresholds] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('MANAGER');

  const fetchThresholds = async () => {
    setLoading(true);
    try {
      const [threshRes, sessionRes] = await Promise.all([
        fetch('/api/settings/approval-thresholds'),
        fetch('/api/auth/session')
      ]);
      if (threshRes.ok) setThresholds(await threshRes.json());
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setUserRole(sessionData.user?.role || 'MANAGER');
      }
    } catch (e) {
      console.warn('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  const canEdit = ['ADMIN', 'FINANCE_MANAGER'].includes(userRole);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              Value-Based Approval Policies & Thresholds
            </h2>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full text-xs font-bold uppercase">
              Configurable Governance
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            Super Admin and Finance Manager configure multi-tier financial thresholds for PO procurement, sales discounts, and scrap write-offs without touching code.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchThresholds}
            className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm cursor-pointer"
            title="Refresh policies"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {canEdit && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all text-xs cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              Configure Threshold Limits
            </button>
          )}
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: PO Procurement */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-amber-100 text-amber-800 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Procurement Gate
            </span>
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">Purchase Orders (PO) Tiering</h4>
            <p className="text-xs text-slate-500 mt-1">Tiered spend approval for material requisitions.</p>
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Supply Chain Limit:</span>
              <span className="font-mono font-bold text-emerald-700">₹{(thresholds?.poSupplyChainLimit ?? 50000).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Finance (CFO) Ceiling:</span>
              <span className="font-mono font-bold text-amber-700">₹{(thresholds?.poFinanceLimit ?? 500000).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Above CFO Ceiling:</span>
              <span className="font-bold text-rose-700">Super Admin Sign-off</span>
            </div>
          </div>
        </div>

        {/* Card 2: Sales Discounts */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-indigo-100 text-indigo-800 rounded-xl">
              <Percent className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
              Commercial Margin Gate
            </span>
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">Sales Discount Tiering</h4>
            <p className="text-xs text-slate-500 mt-1">Maximum discount allowances before CFO authorization.</p>
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Sales Rep Standard Cap:</span>
              <span className="font-mono font-bold text-emerald-700">{thresholds?.discountSalesLimitPercent ?? 10}%</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Finance (CFO) Clearance:</span>
              <span className="font-mono font-bold text-indigo-700">{thresholds?.discountFinanceLimitPercent ?? 25}%</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Rupee Concession Cap:</span>
              <span className="font-mono font-bold text-slate-900">₹{(thresholds?.discountAmountLimit ?? 50000).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Scrap Write-offs */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-rose-100 text-rose-800 rounded-xl">
              <Trash2 className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
              Scrap & Loss Gate
            </span>
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">Inventory Scrap & Write-offs</h4>
            <p className="text-xs text-slate-500 mt-1">Loss disposal limits for defective batches and bad debt.</p>
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Quality Floor Scrap Limit:</span>
              <span className="font-mono font-bold text-emerald-700">₹{(thresholds?.writeOffFloorLimit ?? 15000).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Finance Clearance Cap:</span>
              <span className="font-mono font-bold text-amber-700">₹{(thresholds?.writeOffFinanceLimit ?? 100000).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Above Finance Cap:</span>
              <span className="font-bold text-rose-700">Super Admin Sign-off</span>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Approval Governance Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Active Multi-Tier Approval Governance Matrix</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enforced across all procurement and financial actions in the application.</p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Last policy update: {thresholds?.updatedAt ? new Date(thresholds.updatedAt).toLocaleDateString() : 'Active'} by {thresholds?.lastUpdatedBy || 'Admin'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="p-4">Transaction Domain</th>
                <th className="p-4">Tier 1: Operational Sign-Off</th>
                <th className="p-4">Tier 2: Finance Manager Gate</th>
                <th className="p-4">Tier 3: Executive Board / Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              <tr className="hover:bg-slate-50/60">
                <td className="p-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                    <span>Purchase Orders (Procurement)</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">Under ₹{(thresholds?.poSupplyChainLimit ?? 50000).toLocaleString('en-IN')}</span>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">Supply Chain Manager / Ops Manager</div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">₹{(thresholds?.poSupplyChainLimit ?? 50000).toLocaleString('en-IN')} to ₹{(thresholds?.poFinanceLimit ?? 500000).toLocaleString('en-IN')}</span>
                  <div className="text-[11px] text-amber-700 font-semibold mt-0.5">Finance Manager (CFO) Mandatory</div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">Above ₹{(thresholds?.poFinanceLimit ?? 500000).toLocaleString('en-IN')}</span>
                  <div className="text-[11px] text-rose-700 font-semibold mt-0.5">Super Admin Executive Board Approval</div>
                </td>
              </tr>

              <tr className="hover:bg-slate-50/60">
                <td className="p-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-indigo-600" />
                    <span>Sales Quotation Commercial Discounts</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">Up to {thresholds?.discountSalesLimitPercent ?? 10}%</span>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">B2B Sales Representative / Manager</div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">{thresholds?.discountSalesLimitPercent ?? 10}% to {thresholds?.discountFinanceLimitPercent ?? 25}%</span>
                  <div className="text-[11px] text-amber-700 font-semibold mt-0.5">Finance Manager (CFO) Mandatory</div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">Above {thresholds?.discountFinanceLimitPercent ?? 25}%</span>
                  <div className="text-[11px] text-rose-700 font-semibold mt-0.5">Super Admin Executive Board Approval</div>
                </td>
              </tr>

              <tr className="hover:bg-slate-50/60">
                <td className="p-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Defective Scrap & Bad Debt Write-offs</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">Under ₹{(thresholds?.writeOffFloorLimit ?? 15000).toLocaleString('en-IN')}</span>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">Quality Inspector / Floor Superintendent</div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">₹{(thresholds?.writeOffFloorLimit ?? 15000).toLocaleString('en-IN')} to ₹{(thresholds?.writeOffFinanceLimit ?? 100000).toLocaleString('en-IN')}</span>
                  <div className="text-[11px] text-amber-700 font-semibold mt-0.5">Finance Manager (CFO) Mandatory</div>
                </td>
                <td className="p-4">
                  <span className="font-mono font-bold text-slate-900">Above ₹{(thresholds?.writeOffFinanceLimit ?? 100000).toLocaleString('en-IN')}</span>
                  <div className="text-[11px] text-rose-700 font-semibold mt-0.5">Super Admin Executive Board Approval</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <ApprovalThresholdsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchThresholds}
      />
    </div>
  );
}
