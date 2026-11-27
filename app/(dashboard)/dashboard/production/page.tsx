'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Play, 
  CheckCircle, 
  Plus,
  RefreshCcw,
  Calendar,
  Clock,
  AlertTriangle,
  Flame,
  RotateCcw,
  Lock,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  X,
  ExternalLink
} from 'lucide-react';
import WorkOrderModal from '@/components/modals/WorkOrderModal';
import JobCardButton from '@/components/common/JobCardButton';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import Link from 'next/link';

export default function ProductionPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('PRODUCTION_MANAGER');
  const [qcBlockModal, setQcBlockModal] = useState<{
    isOpen: boolean;
    error: string;
    woNumber?: string;
    id?: string;
    reason?: string;
  }>({ isOpen: false, error: '' });
  const [overrideReason, setOverrideReason] = useState('');

  const fetchWorkOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/production');
      if (res.ok) {
        const data = await res.json();
        setWorkOrders(Array.isArray(data) ? data : []);
      } else {
        setWorkOrders([]);
      }
    } catch (err) {
      console.error('Failed to fetch work orders:', err);
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const { user } = await res.json();
          if (user?.role) setUserRole(user.role);
        }
      } catch (e) {}
    };
    fetchSession();
    fetchWorkOrders();
  }, []);

  const handleStatusUpdate = async (id: string, newStatus: string, override = false) => {
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          outputQuantity: newStatus === 'COMPLETED' ? 10 : undefined,
          overrideQcGate: override,
          overrideReason: override ? overrideReason : undefined
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setQcBlockModal({
          isOpen: true,
          error: errData.error || 'Action blocked by Quality Control Hard Gate',
          woNumber: errData.woNumber,
          id,
          reason: errData.reason
        });
        fetchWorkOrders(); // Revert any optimistic UI state
        return;
      }

      setQcBlockModal({ isOpen: false, error: '' });
      setOverrideReason('');
      fetchWorkOrders();
    } catch (e) {
      console.error(e);
      fetchWorkOrders();
    }
  };

  const safeWorkOrders = Array.isArray(workOrders) ? workOrders : [];

  // Date & Delay Helper
  const isOverdue = (wo: any) => {
    if (wo.status === 'COMPLETED' || !wo.plannedEndDate) return false;
    const endDate = new Date(wo.plannedEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return endDate < today;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const overdueCount = safeWorkOrders.filter(isOverdue).length;
  const criticalCount = safeWorkOrders.filter(wo => ['CRITICAL', 'HIGH'].includes(wo.priority) && wo.status !== 'COMPLETED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Production Management</h2>
          <p className="text-slate-500 mt-1">Track work order schedules, priorities, start/end dates, and production delays.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchWorkOrders} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors" title="Refresh">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => { setSelectedWO(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            New Work Order
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Active Orders</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{safeWorkOrders.filter(w => w.status !== 'COMPLETED').length}</h3>
          </div>
          <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm flex items-center justify-between ${
          overdueCount > 0 ? 'bg-red-50/80 border-red-200 text-red-900' : 'bg-white border-slate-200 text-slate-900'
        }`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Delayed / Overdue</p>
            <h3 className="text-3xl font-bold mt-1 flex items-center gap-2">
              {overdueCount}
              {overdueCount > 0 && <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full uppercase animate-pulse">Needs Action</span>}
            </h3>
          </div>
          <div className={`p-3 rounded-xl ${overdueCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">High / Critical Priority</p>
            <h3 className="text-3xl font-bold text-amber-600 mt-1">{criticalCount}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-500 rounded-xl">
            <Flame className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['PLANNED', 'IN_PROGRESS', 'COMPLETED'].map(status => {
          const colOrders = safeWorkOrders.filter(wo => wo && wo.status === status);
          return (
            <div key={status} className="bg-slate-100/80 rounded-2xl p-4 min-h-[550px] flex flex-col">
              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="font-bold text-slate-700 tracking-wide uppercase text-sm flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    status === 'PLANNED' ? 'bg-indigo-500' :
                    status === 'IN_PROGRESS' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  {status.replace('_', ' ')}
                </h3>
                <span className="text-xs font-bold bg-white text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                  {colOrders.length}
                </span>
              </div>

              <div className="space-y-4 flex-1">
                {colOrders.map(wo => {
                  const overdue = isOverdue(wo);
                  const orderId = wo._id || wo.woNumber;

                  return (
                    <div 
                      key={orderId} 
                      className={`bg-white p-5 rounded-2xl shadow-sm border transition-all hover:shadow-md ${
                        overdue 
                          ? 'border-red-400 ring-2 ring-red-400/20 bg-red-50/20' 
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Top Badges & Action Buttons */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/dashboard/production/${wo._id}`} className="text-xs font-bold font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 hover:text-amber-600 hover:underline">
                            {wo.woNumber}
                          </Link>
                          
                          {/* Priority Pill */}
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-tight ${
                            wo.priority === 'CRITICAL' ? 'bg-red-500 text-white' :
                            wo.priority === 'HIGH' ? 'bg-amber-500 text-slate-900 font-bold' :
                            wo.priority === 'MEDIUM' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {wo.priority || 'MEDIUM'}
                          </span>

                          {/* QC Gate Pill */}
                          {wo.qcStatus === 'FAILED' ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-tight bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1" title={wo.qcNotes || 'Failed QC Check'}>
                              <ShieldAlert className="w-3 h-3 text-rose-600" /> QC GATE BLOCKED
                            </span>
                          ) : wo.qcStatus === 'PENDING' ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-tight bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1" title="Awaiting QC Inspection">
                              <Clock className="w-3 h-3 text-amber-600" /> QC PENDING
                            </span>
                          ) : (wo.qcStatus === 'PASSED' || wo.qcGatePassed) ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-tight bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" /> QC PASSED
                            </span>
                          ) : null}

                          {/* Overdue Badge */}
                          {overdue && (
                            <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-md uppercase tracking-tight flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> OVERDUE
                            </span>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-1">
                          {wo._id && !String(wo._id).startsWith('wo-') && (<><JobCardButton workOrderId={wo._id} /><LineageDrawer type="WORK_ORDER" id={wo._id} label="Chain" /><AttachmentDrawer entityType="WORK_ORDER" entityId={wo._id} label="Files" /></>)}
                          {status === 'PLANNED' && (
                            <button 
                              onClick={() => handleStatusUpdate(orderId, 'IN_PROGRESS')} 
                              title="Start Work Order (Move to In Progress)"
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1 font-bold text-xs"
                            >
                              <Play className="w-4 h-4 fill-amber-500 text-amber-500" />
                            </button>
                          )}

                          {status === 'IN_PROGRESS' && (
                            <>
                              {/* Option to change from IN_PROGRESS back to PLANNED */}
                              <button 
                                onClick={() => handleStatusUpdate(orderId, 'PLANNED')} 
                                title="Revert to Planned"
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>

                              {/* QC Gated Completion Button */}
                              {wo.qcStatus === 'FAILED' ? (
                                <button 
                                  onClick={() => setQcBlockModal({
                                    isOpen: true,
                                    error: wo.qcNotes || `QC Hard Gate Blocked: Work Order ${wo.woNumber} has FAILED Quality Check(s). Production cannot close this order until defects are resolved.`,
                                    woNumber: wo.woNumber,
                                    id: orderId,
                                    reason: 'QC_FAILED'
                                  })}
                                  title="QC Gate Blocked: Click to view details and required actions"
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                >
                                  <Lock className="w-4 h-4 text-rose-600" />
                                </button>
                              ) : wo.qcStatus === 'PENDING' ? (
                                <button 
                                  onClick={() => setQcBlockModal({
                                    isOpen: true,
                                    error: wo.qcNotes || `QC Hard Gate Blocked: Work Order ${wo.woNumber} has mandatory Quality Checks that are still PENDING sign-off.`,
                                    woNumber: wo.woNumber,
                                    id: orderId,
                                    reason: 'QC_PENDING'
                                  })}
                                  title="QC Gate: Pending Quality Sign-Off"
                                  className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                >
                                  <Clock className="w-4 h-4 text-amber-600" />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleStatusUpdate(orderId, 'COMPLETED')} 
                                  title="Complete Work Order (QC Gate Clear)"
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                >
                                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                                </button>
                              )}
                            </>
                          )}

                          {status === 'COMPLETED' && (
                            <button 
                              onClick={() => handleStatusUpdate(orderId, 'IN_PROGRESS')} 
                              title="Reopen to In Progress"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Title & Quantity */}
                      <h4 className="font-bold text-slate-800 text-base leading-snug mb-1">
                        {wo.product?.name || 'Standard Unit'}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mb-3">
                        Target Quantity: <strong className="text-slate-700">{wo.quantity || 1} {wo.product?.uom || 'unit'}</strong>
                      </p>

                      {/* Dates Schedule Card */}
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1 mb-3">
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="flex items-center gap-1 font-medium text-slate-400">
                            <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Start:
                          </span>
                          <span className="font-semibold text-slate-700">{formatDate(wo.plannedStartDate)}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="flex items-center gap-1 font-medium text-slate-400">
                            <Clock className={`w-3.5 h-3.5 ${overdue ? 'text-red-500' : 'text-amber-500'}`} /> Target Due:
                          </span>
                          <span className={`font-bold ${overdue ? 'text-red-600' : 'text-slate-800'}`}>
                            {formatDate(wo.plannedEndDate)}
                          </span>
                        </div>
                      </div>

                      {/* Machine Station */}
                      <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{wo.assignedMachine?.name || 'No Machine Assigned'}</span>
                      </div>
                    </div>
                  );
                })}

                {colOrders.length === 0 && (
                  <div className="h-32 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-medium">
                    No orders in this column
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <WorkOrderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchWorkOrders}
        workOrder={selectedWO}
      />

      {/* QC Hard Gate Enforcement Modal */}
      {qcBlockModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-rose-100 overflow-hidden">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 p-6 text-white flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md shrink-0">
                  <ShieldAlert className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider">
                      {qcBlockModal.reason === 'OUTPUTS_NOT_RECORDED' ? 'Output not recorded' : 'QC Hard Gate Active'}
                    </span>
                    <span className="text-xs text-rose-100 font-mono font-bold">{qcBlockModal.woNumber}</span>
                  </div>
                  <h3 className="text-xl font-bold mt-1">Production Closure Blocked</h3>
                </div>
              </div>
              <button 
                onClick={() => setQcBlockModal({ isOpen: false, error: '' })}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-semibold leading-relaxed">{qcBlockModal.error}</p>
              </div>

              {qcBlockModal.reason !== 'OUTPUTS_NOT_RECORDED' && <>
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Enforcement Policy:</h4>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Work orders cannot transition to <strong>COMPLETED</strong> while QC inspections are failed or unverified.
                  </p>
                  <p className="flex items-center gap-2 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Quality Inspector clearance and non-conformance disposition are mandatory prior to stock intake.
                  </p>
                </div>
              </div>

              {/* Quality Inspector / Admin Override Panel */}
              {['ADMIN', 'QUALITY_INSPECTOR'].includes(userRole) && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 uppercase flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-700" /> Authorized Override ({userRole})
                    </span>
                    <span className="text-[11px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded font-bold">
                      Audit Logged
                    </span>
                  </div>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Enter formal justification for gate override..."
                    className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-xl outline-none focus:border-amber-500 text-slate-800"
                  />
                  <button
                    onClick={() => {
                      if (qcBlockModal.id) {
                        handleStatusUpdate(qcBlockModal.id, 'COMPLETED', true);
                      }
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                  >
                    Authorize QC Gate Override & Complete Work Order
                  </button>
                </div>
              )}
              </>}
            </div>

            {/* Actions */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <Link
                href={qcBlockModal.reason === 'OUTPUTS_NOT_RECORDED' ? '/dashboard/production/wip' : '/dashboard/quality'}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                <ExternalLink className="w-4 h-4 text-amber-400" />
                {qcBlockModal.reason === 'OUTPUTS_NOT_RECORDED' ? 'Record it on the WIP board' : 'Go to Quality Control Desk'}
              </Link>
              <button
                onClick={() => setQcBlockModal({ isOpen: false, error: '' })}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
