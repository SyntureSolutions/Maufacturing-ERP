'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Plus, Trash2, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function QualityCheckModal({ isOpen, onClose, onSuccess }: any) {
  const [formData, setFormData] = useState({
    type: 'IN_PROCESS',
    workOrder: '',
    batch: '',
    status: 'PASSED',
    parameters: [] as any[],
    severity: 'MAJOR',
    dispositionDecision: 'REWORK',
    correctiveAction: '',
    ncrType: 'PROCESS'
  });
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetch('/api/production')
        .then(res => res.ok ? res.json() : [])
        .then(data => setWorkOrders(Array.isArray(data) ? data : []))
        .catch(() => setWorkOrders([]));

      fetch('/api/inventory/batches')
        .then(res => res.ok ? res.json() : [])
        .then(data => setBatches(Array.isArray(data) ? data : []))
        .catch(() => setBatches([]));

      setFormData({
        type: 'IN_PROCESS',
        workOrder: '',
        batch: '',
        status: 'PASSED',
        parameters: [],
        severity: 'MAJOR',
        dispositionDecision: 'REWORK',
        correctiveAction: '',
        ncrType: 'PROCESS'
      });
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddParam = () => {
    setFormData(prev => ({
      ...prev,
      parameters: [...prev.parameters, { name: '', standard: '', actual: '', result: 'PASS' }]
    }));
  };

  const handleRemoveParam = (index: number) => {
    setFormData(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index)
    }));
  };

  const handleParamChange = (index: number, field: string, value: any) => {
    const newParams = [...formData.parameters];
    newParams[index][field] = value;
    
    // Auto-detect failure if any parameter is FAIL
    const hasFailure = newParams.some(p => p.result === 'FAIL');
    setFormData(prev => ({ 
      ...prev, 
      parameters: newParams,
      status: hasFailure ? 'FAILED' : prev.status
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save quality record');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-800">New Quality Inspection</h2>
            <p className="text-xs text-slate-500">Record incoming, in-process WIP, or finished bike inspections</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Inspection Type</label>
              <select 
                value={formData.type} 
                onChange={(e) => setFormData({
                  ...formData, 
                  type: e.target.value,
                  ncrType: e.target.value === 'INCOMING' ? 'MATERIAL' : e.target.value === 'FINAL' ? 'PRODUCT' : 'PROCESS'
                })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-amber-500 text-sm font-medium"
              >
                <option value="INCOMING">Incoming Material / Parts</option>
                <option value="IN_PROCESS">In Process (WIP Sub-assembly)</option>
                <option value="FINAL">Final Product Acceptance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Overall Gate Status</label>
              <select 
                value={formData.status} 
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-amber-500 text-sm font-bold"
              >
                <option value="PASSED">Passed (Gate Cleared)</option>
                <option value="FAILED">Failed (Trigger NCR & Hold)</option>
                <option value="PENDING">Pending In-Progress</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Reference Work Order (Optional)</label>
              <select 
                value={formData.workOrder} 
                onChange={(e) => setFormData({...formData, workOrder: e.target.value})}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-amber-500 text-sm font-medium"
              >
                <option value="">Select Work Order...</option>
                {workOrders.map(wo => (
                  <option key={wo._id} value={wo._id}>{wo.woNumber} - {wo.product?.name || 'Production Run'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* NON-CONFORMANCE REPORT (NCR) DETAILS WHEN FAILED */}
          {formData.status === 'FAILED' && (
            <div className="p-5 bg-red-50/80 border border-red-200 rounded-2xl space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 text-red-800">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold">Non-Conformance Report (NCR) Required</h4>
                  <p className="text-xs text-red-700">Inspection failure triggers a quality hold. Define disposition and corrective action.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-red-900 mb-1">NCR Severity</label>
                  <select
                    value={formData.severity}
                    onChange={e => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-red-200 text-sm font-bold text-slate-800 outline-none"
                  >
                    <option value="CRITICAL">🔴 Critical (Immediate Quarantine)</option>
                    <option value="MAJOR">🟠 Major (Line Disruption)</option>
                    <option value="MINOR">🟡 Minor (Cosmetic / Low Risk)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-red-900 mb-1">Disposition Decision</label>
                  <select
                    value={formData.dispositionDecision}
                    onChange={e => setFormData({ ...formData, dispositionDecision: e.target.value })}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-red-200 text-sm font-bold text-slate-800 outline-none"
                  >
                    <option value="REWORK">🔧 Rework on Line</option>
                    <option value="SCRAP">🗑️ Scrap & Write-Off</option>
                    <option value="RETURN">↩️ Return to Supplier</option>
                    <option value="USE_AS_IS">⚠️ Use As-Is (Engineer Concession)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-red-900 mb-1">Immediate Corrective Action / RCA Note *</label>
                <textarea
                  rows={2}
                  required={formData.status === 'FAILED'}
                  value={formData.correctiveAction}
                  onChange={e => setFormData({ ...formData, correctiveAction: e.target.value })}
                  placeholder="e.g. Frame alignment exceeds 0.2mm tolerance. Quarantined for hydraulic re-straightening."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-red-200 text-sm font-medium outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* Parameters List */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Parameters Checked</label>
              <button 
                type="button" 
                onClick={handleAddParam} 
                className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1 rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Parameter
              </button>
            </div>
            
            <div className="space-y-2.5">
              {formData.parameters.map((param, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    placeholder="Parameter (e.g. Tensile Strength)" 
                    value={param.name} 
                    onChange={e => handleParamChange(index, 'name', e.target.value)} 
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium outline-none" 
                    required
                  />
                  <input 
                    type="text" 
                    placeholder="Standard (>350 MPa)" 
                    value={param.standard} 
                    onChange={e => handleParamChange(index, 'standard', e.target.value)} 
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium outline-none" 
                    required
                  />
                  <input 
                    type="text" 
                    placeholder="Actual (380 MPa)" 
                    value={param.actual} 
                    onChange={e => handleParamChange(index, 'actual', e.target.value)} 
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-medium outline-none" 
                    required
                  />
                  <select 
                    value={param.result} 
                    onChange={e => handleParamChange(index, 'result', e.target.value)} 
                    className={`px-3 py-2 border rounded-xl text-xs font-bold bg-white outline-none ${
                      param.result === 'FAIL' ? 'border-red-300 text-red-700 bg-red-50' : 'border-emerald-300 text-emerald-700'
                    }`}
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveParam(index)} 
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {formData.parameters.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">
                  No parameters added yet. Click "+ Add Parameter" above to record tolerance metrics.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-2.5 font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="px-8 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 text-sm cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> 
              {loading ? 'Saving...' : 'Save Quality Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
