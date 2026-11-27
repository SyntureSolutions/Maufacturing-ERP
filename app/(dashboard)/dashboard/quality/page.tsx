'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  RefreshCcw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock
} from 'lucide-react';
import QualityCheckModal from '@/components/modals/QualityCheckModal';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';

export default function QualityPage() {
  const [checks, setChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PASSED' | 'FAILED' | 'PENDING'>('ALL');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchChecks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quality');
      if (res.ok) {
        setChecks(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch quality checks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecks();
  }, []);

  // Update inspection status (PASSED / FAILED / PENDING) with optimistic UI update
  const handleUpdateStatus = async (checkId: string, newStatus: 'PASSED' | 'FAILED' | 'PENDING') => {
    // The server decides: show the result only after it accepts the change
    try {
      const res = await fetch('/api/quality', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: checkId, status: newStatus }),
      });
      const updated = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification(`⚠️ ${updated.error || 'Could not update the inspection.'}`);
        fetchChecks();
      } else {
        setChecks((prev) => prev.map((c) => (c._id === checkId ? { ...c, ...updated } : c)));
        const note = updated.batchOutcome && !updated.batchOutcome.changed && updated.batchOutcome.reason ? ` Batch unchanged: ${updated.batchOutcome.reason}` : '';
        setNotification(`✅ Quality Inspection marked ${newStatus}.${note}`);
      }
    } catch (err) {
      console.error('Failed to update quality check status:', err);
      setNotification('⚠️ Could not reach the server. Nothing was changed.');
    }
    setTimeout(() => setNotification(null), 6000);
  };

  const formatDate = (dateInput: any) => {
    if (!dateInput) return 'N/A';
    try {
      const d = new Date(dateInput);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'N/A';
    }
  };

  const safeChecks = Array.isArray(checks) ? checks : [];
  const filteredChecks = safeChecks.filter((c) =>
    filterStatus === 'ALL' ? true : c.status === filterStatus
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Quality Management & Testing Workspace
          </h2>
          <p className="text-slate-500 mt-1">Monitor inspection parameters, track assignment & completion dates, and change testing statuses.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchChecks} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm" title="Refresh">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            New Inspection
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setFilterStatus('PASSED')}
          className={`p-6 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            filterStatus === 'PASSED' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20' : 'bg-white border-slate-200 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl"><CheckCircle className="w-8 h-8" /></div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passed Inspections</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-0.5">{safeChecks.filter(c => c.status === 'PASSED').length}</h3>
            </div>
          </div>
        </div>

        <div 
          onClick={() => setFilterStatus('FAILED')}
          className={`p-6 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            filterStatus === 'FAILED' ? 'bg-red-50 border-red-300 ring-2 ring-red-400/20' : 'bg-white border-slate-200 hover:border-red-200'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="p-4 bg-red-100 text-red-600 rounded-2xl"><XCircle className="w-8 h-8" /></div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Failed (NCR Defect)</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-0.5">{safeChecks.filter(c => c.status === 'FAILED').length}</h3>
            </div>
          </div>
        </div>

        <div 
          onClick={() => setFilterStatus('PENDING')}
          className={`p-6 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            filterStatus === 'PENDING' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20' : 'bg-white border-slate-200 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl"><AlertTriangle className="w-8 h-8" /></div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Testing</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-0.5">{safeChecks.filter(c => c.status === 'PENDING').length}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        {[
          { key: 'ALL', label: 'All Inspections' },
          { key: 'PASSED', label: 'Passed Only' },
          { key: 'FAILED', label: 'Failed (NCR) Only' },
          { key: 'PENDING', label: 'Pending Testing' },
        ].map((st) => (
          <button
            key={st.key}
            onClick={() => setFilterStatus(st.key as any)}
            className={`pb-3 text-sm font-bold transition-all relative ${
              filterStatus === st.key
                ? 'text-indigo-600 border-b-2 border-indigo-500'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* Quality Checks Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Quality Inspection Logs & Testing Timeline</h3>
            <p className="text-xs text-slate-500 mt-0.5">Displays assigned & completion timestamps alongside interactive status controls.</p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl">
            Showing {filteredChecks.length} Inspections
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <th className="p-4">Check Number</th>
                <th className="p-4">Type & Target Reference</th>
                <th className="p-4">Inspection Timeline (Assigned / Completed)</th>
                <th className="p-4">Inspector</th>
                <th className="p-4 text-center">Change Testing Status Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredChecks.length > 0 ? (
                filteredChecks.map((check) => {
                  const isExpanded = expandedCheckId === check._id;
                  return (
                    <React.Fragment key={check._id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4">
                          <button
                            onClick={() => setExpandedCheckId(isExpanded ? null : check._id)}
                            className="font-mono font-bold text-indigo-600 hover:underline flex items-center gap-1.5"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            {check.checkNumber}
                          </button>
                        </td>

                        <td className="p-4">
                          <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700 uppercase mb-1 inline-block">
                            {check.type}
                          </span>
                          <p className="text-xs font-semibold text-slate-600">
                            {check.batch ? `Batch: ${check.batch.batchNumber}` : ''}
                            {check.workOrder ? `WO: ${check.workOrder.woNumber}` : ''}
                          </p>
                        </td>

                        {/* INSPECTION TIMELINE (ASSIGNED & COMPLETED DATES) */}
                        <td className="p-4">
                          <div className="text-xs space-y-1 font-medium">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>Assigned: <strong className="font-bold text-slate-900">{formatDate(check.assignedDate || check.createdAt || check.checkedAt)}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>
                                Completed:{' '}
                                {check.status === 'PENDING' ? (
                                  <span className="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">
                                    ⏳ In Progress
                                  </span>
                                ) : (
                                  <strong className="font-bold text-emerald-700">
                                    {formatDate(check.completedDate || check.checkedAt || Date.now())}
                                  </strong>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="p-4 text-sm font-semibold text-slate-700">
                          {check.inspector?.name || 'Quality Inspector'}
                        </td>

                        {/* INTERACTIVE TESTING ACTION STATUS CONTROLS */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {[
                              { key: 'PASSED', label: 'PASSED', color: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' },
                              { key: 'FAILED', label: 'FAILED (NCR)', color: 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100' },
                              { key: 'PENDING', label: 'PENDING', color: 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' },
                            ].map((stg) => (
                              <button
                                key={stg.key}
                                onClick={() => handleUpdateStatus(check._id, stg.key as any)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                  check.status === stg.key
                                    ? `${stg.color} ring-2 ring-slate-900/20 font-bold shadow-sm scale-105`
                                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {stg.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDED PARAMETERS BREAKDOWN DRAWER */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="p-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div>
                                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                    Detailed Inspection Parameters & Tolerances ({check.checkNumber})
                                  </h4>
                                  <span className="text-[11px] text-slate-400">Date: {formatDate(check.checkedAt || Date.now())}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <AttachmentDrawer entityType="QUALITY_CHECK" entityId={check._id} label="QC Evidence / Photos" />
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b">
                                    <tr>
                                      <th className="p-2.5">Parameter / Test Name</th>
                                      <th className="p-2.5">Standard Specification</th>
                                      <th className="p-2.5">Actual Measured Value</th>
                                      <th className="p-2.5 text-center">Result</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium">
                                    {check.parameters?.map((param: any, pIdx: number) => (
                                      <tr key={pIdx}>
                                        <td className="p-2.5 font-bold text-slate-800">{param.name}</td>
                                        <td className="p-2.5 text-slate-600">{param.standard}</td>
                                        <td className="p-2.5 font-mono text-slate-700">{param.actual}</td>
                                        <td className="p-2.5 text-center">
                                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                            param.result === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                          }`}>
                                            {param.result}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                    {(!check.parameters || check.parameters.length === 0) && (
                                      <tr>
                                        <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                                          No detailed parameter breakdown recorded for this inspection.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                    No quality checks found for status "{filterStatus}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quality Inspection Modal */}
      <QualityCheckModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchChecks} />
    </div>
  );
}
