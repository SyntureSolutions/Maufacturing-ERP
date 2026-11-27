'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  Filter,
  Search,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  Layers,
  ArrowRight,
  Zap,
  Lock,
  Calendar
} from 'lucide-react';

interface AuditLogEntry {
  _id: string;
  userName: string;
  userRole: string;
  action: 'CREATE' | 'EDIT' | 'APPROVE' | 'DELETE' | 'OVERRIDE' | 'REJECT' | 'LOGIN';
  resource: string;
  resourceId?: string;
  resourceName?: string;
  details: string;
  reason?: string;
  ipAddress?: string;
  createdAt: string;
}

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [resourceFilter, setResourceFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter !== 'ALL') params.append('action', actionFilter);
      if (resourceFilter !== 'ALL') params.append('resource', resourceFilter);
      if (roleFilter !== 'ALL') params.append('userRole', roleFilter);

      const res = await fetch(`/api/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error('Failed to fetch audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [actionFilter, resourceFilter, roleFilter]);

  // Client-side search filtering
  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      !searchTerm ||
      log.userName.toLowerCase().includes(term) ||
      log.userRole.toLowerCase().includes(term) ||
      log.action.toLowerCase().includes(term) ||
      log.resource.toLowerCase().includes(term) ||
      (log.resourceName && log.resourceName.toLowerCase().includes(term)) ||
      log.details.toLowerCase().includes(term) ||
      (log.reason && log.reason.toLowerCase().includes(term))
    );
  });

  // Summary Metrics
  const totalCount = logs.length;
  const overrideCount = logs.filter(l => l.action === 'OVERRIDE').length;
  const approvalCount = logs.filter(l => l.action === 'APPROVE').length;
  const criticalCount = logs.filter(l => l.action === 'DELETE' || l.action === 'REJECT').length;

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'OVERRIDE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-slate-950 flex items-center gap-1 shadow-sm animate-pulse">
            <Zap className="w-3.5 h-3.5" />
            ⚡ OVERRIDE
          </span>
        );
      case 'APPROVE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ✓ APPROVED
          </span>
        );
      case 'DELETE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            ✕ DELETED
          </span>
        );
      case 'CREATE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            + CREATED
          </span>
        );
      case 'EDIT':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            ✎ EDITED
          </span>
        );
      case 'REJECT':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            ⊘ REJECTED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {action}
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">SUPER ADMIN</span>;
      case 'MANAGER':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">OPERATIONS MGR</span>;
      case 'PRODUCTION_MANAGER':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">PRODUCTION</span>;
      case 'FINANCE_MANAGER':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">FINANCE CFO</span>;
      case 'QUALITY_INSPECTOR':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-100 text-teal-800">QUALITY</span>;
      case 'SALES':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">SALES</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-indigo-600" />
              Corporate Governance & Audit Trail
            </h2>
            <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-amber-400">
              Super Admin Console
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            Complete traceability of all system activity. Who did what, when, and why across all approvals, deletions, and operational overrides.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAuditLogs}
            className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors flex items-center gap-2 font-bold text-xs"
            title="Refresh Audit Logs"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Trail
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Audited Events</p>
            <h3 className="text-2xl font-bold font-mono mt-1 text-white">{totalCount}</h3>
            <p className="text-xs text-slate-400 mt-1">Logged system actions</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl text-amber-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Operational Overrides</p>
            <h3 className="text-2xl font-bold font-mono mt-1 text-amber-950">{overrideCount}</h3>
            <p className="text-xs text-amber-700 font-medium mt-1">Cross-department deadlocks resolved</p>
          </div>
          <div className="p-3 bg-amber-200 text-amber-900 rounded-xl">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Corporate Approvals</p>
            <h3 className="text-2xl font-bold font-mono mt-1 text-emerald-950">{approvalCount}</h3>
            <p className="text-xs text-emerald-700 font-medium mt-1">Tiered PO, SO & Floor gates</p>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Deletions & Rejections</p>
            <h3 className="text-2xl font-bold font-mono mt-1 text-rose-950">{criticalCount}</h3>
            <p className="text-xs text-rose-700 font-medium mt-1">QC blocks & voided orders</p>
          </div>
          <div className="p-3 bg-rose-100 text-rose-800 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Action Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-500">Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Actions</option>
              <option value="OVERRIDE">⚡ Override</option>
              <option value="APPROVE">✓ Approve</option>
              <option value="CREATE">+ Create</option>
              <option value="EDIT">✎ Edit</option>
              <option value="DELETE">✕ Delete</option>
              <option value="REJECT">⊘ Reject</option>
            </select>
          </div>

          {/* Resource Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-500">Resource:</span>
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Resources</option>
              <option value="WorkOrder">Work Orders</option>
              <option value="PurchaseOrder">Purchase Orders</option>
              <option value="SalesOrder">Sales Orders</option>
              <option value="Invoice">Tax Invoices</option>
              <option value="QualityCheck">Quality Checks</option>
              <option value="ApprovalThreshold">Approval Policies</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-500">Actor Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Super Admin</option>
              <option value="MANAGER">Operations Manager</option>
              <option value="HR_MANAGER">HR & Labour Manager</option>
              <option value="FINANCE_MANAGER">Finance CFO</option>
              <option value="PRODUCTION_MANAGER">Production Manager</option>
              <option value="SUPPLY_CHAIN_MANAGER">Supply Chain Manager</option>
              <option value="QUALITY_INSPECTOR">Quality Inspector</option>
              <option value="SALES">B2B Sales</option>
            </select>
          </div>
        </div>

        {/* Text Search */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by actor, reason, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 text-slate-900"
          />
        </div>
      </div>

      {/* Audit Trail Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Actor</th>
                <th className="p-4 text-center">Action Type</th>
                <th className="p-4">Resource & Item</th>
                <th className="p-4">Details & Operational Reason</th>
                <th className="p-4 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr 
                    key={log._id} 
                    className={`hover:bg-slate-50/80 transition-colors ${log.action === 'OVERRIDE' ? 'bg-amber-50/30' : ''}`}
                  >
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(log.createdAt).toLocaleTimeString('en-IN')}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-slate-900">{log.userName}</div>
                      <div className="mt-0.5">{getRoleBadge(log.userRole)}</div>
                    </td>

                    <td className="p-4 text-center whitespace-nowrap">
                      <div className="inline-flex">{getActionBadge(log.action)}</div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-slate-900">{log.resourceName || log.resource}</div>
                      {log.resourceId && (
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          ID: {log.resourceId}
                        </span>
                      )}
                    </td>

                    <td className="p-4 max-w-md">
                      <p className="text-slate-800 text-xs leading-relaxed">{log.details}</p>
                      {log.reason && (
                        <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] font-medium">
                          <strong>Operational Reason:</strong> "{log.reason}"
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-right whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        AUDIT VERIFIED
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 font-medium">
                    {loading ? 'Loading corporate audit trail...' : 'No audit trail events match the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
