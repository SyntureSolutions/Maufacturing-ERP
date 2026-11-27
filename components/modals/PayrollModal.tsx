'use client';

import React, { useState, useEffect } from 'react';
import { X, DollarSign, User, Calendar, Save, AlertCircle, Calculator } from 'lucide-react';

interface PayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workers: any[];
}

export default function PayrollModal({ isOpen, onClose, onSuccess, workers }: PayrollModalProps) {
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [payPeriod, setPayPeriod] = useState('2026-04');
  const [baseSalary, setBaseSalary] = useState(45000);
  const [overtimeHours, setOvertimeHours] = useState(10);
  const [allowances, setAllowances] = useState(3000);
  const [deductions, setDeductions] = useState(2500);
  const [paymentMethod, setPaymentMethod] = useState('Bank Direct Transfer');
  const [status, setStatus] = useState('PAID');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && workers.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(workers[0]._id || '');
    }
  }, [isOpen, workers]);

  const handleWorkerSelect = (id: string) => {
    setSelectedWorkerId(id);
    const w = workers.find(w => w._id === id);
    if (w) {
      if (w.hourlyRate) {
        setBaseSalary(w.hourlyRate * 160); // 160 hrs base monthly
      }
    }
  };

  const overtimePay = overtimeHours * 350;
  const netPayable = baseSalary + overtimePay + allowances - deductions;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const targetWorker = workers.find(w => w._id === selectedWorkerId);

    try {
      const res = await fetch('/api/labour/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker: targetWorker ? {
            _id: targetWorker._id,
            name: targetWorker.name,
            employeeId: targetWorker.workerId || targetWorker.employeeId || 'WRK-001',
            department: targetWorker.station || targetWorker.department || 'Assembly Bay'
          } : undefined,
          payPeriod,
          baseSalary,
          overtimeHours,
          overtimePay,
          allowances,
          deductions,
          netPayable,
          paymentMethod,
          status
        })
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit payroll record');
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
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Add Employee Payroll Record</h3>
              <p className="text-xs text-slate-500">Record monthly salary, overtime pay, and deductions.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Select Employee */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" /> Select Employee / Worker
              </label>
              <select
                value={selectedWorkerId}
                onChange={e => handleWorkerSelect(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-sm font-semibold text-slate-800"
                required
              >
                {workers.map(w => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.workerId || w.employeeId || 'ID'}) — {w.station || w.department || 'Production'}
                  </option>
                ))}
              </select>
            </div>

            {/* Pay Period */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Pay Period Month
              </label>
              <input
                type="month"
                value={payPeriod}
                onChange={e => setPayPeriod(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-xs font-semibold"
                required
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Payment Disbursal</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-xs font-semibold"
              >
                <option value="Bank Direct Transfer">Bank Direct Transfer</option>
                <option value="NEFT / RTGS">NEFT / RTGS</option>
                <option value="Company Cheque">Company Cheque</option>
                <option value="Cash Wage">Cash Wage</option>
              </select>
            </div>

            {/* Base Salary */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Base Monthly Salary (₹)</label>
              <input
                type="number"
                min="0"
                value={baseSalary}
                onChange={e => setBaseSalary(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-sm font-bold text-slate-800"
                required
              />
            </div>

            {/* Overtime Hours */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Overtime Hours Worked</label>
              <input
                type="number"
                min="0"
                value={overtimeHours}
                onChange={e => setOvertimeHours(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-sm font-bold text-slate-800"
              />
            </div>

            {/* Allowances */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Allowances & Bonus (₹)</label>
              <input
                type="number"
                min="0"
                value={allowances}
                onChange={e => setAllowances(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-sm font-bold text-slate-800"
              />
            </div>

            {/* Deductions */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Statutory Deductions PF/ESI (₹)</label>
              <input
                type="number"
                min="0"
                value={deductions}
                onChange={e => setDeductions(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-sm font-bold text-slate-800"
              />
            </div>
          </div>

          {/* Net Pay Calculation Banner */}
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Net Take-Home Payable</span>
              <span className="text-xs text-emerald-600 font-medium">Base + OT ({overtimeHours}h @ ₹350/h) + Allowances - Deductions</span>
            </div>
            <span className="text-xl font-bold text-emerald-700">₹{netPayable.toLocaleString('en-IN')}</span>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> Save Payroll Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
