'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

export default function LabourJobModal({ isOpen, onClose, onSuccess }: any) {
  const [formData, setFormData] = useState({
    workOrder: '',
    shift: 'Morning',
    date: new Date().toISOString().split('T')[0],
    workers: [] as any[]
  });
  const [workersList, setWorkersList] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/labour').then(res => res.json()).then(setWorkersList);
      fetch('/api/production').then(res => res.json()).then(setWorkOrders);
      setFormData({
        workOrder: '',
        shift: 'Morning',
        date: new Date().toISOString().split('T')[0],
        workers: []
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddWorker = () => {
    setFormData({
      ...formData,
      workers: [...formData.workers, { worker: '', hoursWorked: 8, rate: 0 }]
    });
  };

  const handleWorkerChange = (index: number, field: string, value: any) => {
    const newWorkers = [...formData.workers];
    newWorkers[index][field] = value;
    
    // Auto-fill rate based on selection
    if (field === 'worker') {
      const selectedWorker = workersList.find(w => w._id === value);
      if (selectedWorker) {
         newWorkers[index].rate = selectedWorker.dailyRate / 8; // Assuming hourly rate
      }
    }
    
    setFormData({ ...formData, workers: newWorkers });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/labour/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Assign Labour Job</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Shift</label>
              <select value={formData.shift} onChange={e => setFormData({...formData, shift: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option>Morning</option>
                <option>Evening</option>
                <option>Night</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Work Order (Optional)</label>
              <select value={formData.workOrder} onChange={e => setFormData({...formData, workOrder: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option value="">General / Maintenance</option>
                {workOrders.map(wo => <option key={wo._id} value={wo._id}>{wo.woNumber}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-6">
             <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-bold text-slate-700">Workers Assigned</label>
              <button type="button" onClick={handleAddWorker} className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-1 rounded">+ Add Worker</button>
            </div>
            <div className="space-y-3">
              {formData.workers.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <select value={w.worker} onChange={e => handleWorkerChange(i, 'worker', e.target.value)} className="flex-1 p-2 border border-slate-200 rounded-lg text-sm" required>
                    <option value="">Select Worker...</option>
                    {workersList.map(wl => <option key={wl._id} value={wl._id}>{wl.name} ({wl.employeeId})</option>)}
                  </select>
                  <input type="number" placeholder="Hours" value={w.hoursWorked} onChange={e => handleWorkerChange(i, 'hoursWorked', parseFloat(e.target.value))} className="w-24 p-2 border border-slate-200 rounded-lg text-sm" required />
                  <input type="number" placeholder="Rate/Hr" value={w.rate} onChange={e => handleWorkerChange(i, 'rate', parseFloat(e.target.value))} className="w-24 p-2 border border-slate-200 rounded-lg text-sm" required />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
             <button type="submit" disabled={loading} className="px-6 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl flex items-center gap-2">
              <Save className="w-5 h-5" /> Save Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
