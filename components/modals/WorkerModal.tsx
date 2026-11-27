'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, User, Briefcase, Clock, DollarSign, Award, AlertCircle, Wrench, ShieldCheck } from 'lucide-react';

interface WorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (worker?: any) => void;
  worker?: any;
}

export default function WorkerModal({ isOpen, onClose, onSuccess, worker }: WorkerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    department: 'Assembly',
    station: 'Frame Robotic Welding Line',
    skillLevel: 'MASTER_WELDER',
    shift: 'MORNING',
    hourlyRate: 350,
    dailyRate: 2800,
    overtimeRate: 525,
    skills: 'TIG Welding, Robotic Arm Calibration',
    status: 'ACTIVE'
  });

  useEffect(() => {
    if (isOpen) {
      if (worker) {
        setFormData({
          name: worker.name || '',
          employeeId: worker.employeeId || worker.workerId || '',
          department: worker.department || 'Assembly',
          station: worker.station || '',
          skillLevel: worker.skillLevel || 'ASSEMBLER',
          shift: worker.shift || 'MORNING',
          hourlyRate: worker.hourlyRate || 320,
          dailyRate: worker.dailyRate || 2560,
          overtimeRate: worker.overtimeRate || 480,
          skills: Array.isArray(worker.skills) ? worker.skills.join(', ') : (worker.skills || ''),
          status: worker.status || 'ACTIVE'
        });
      } else {
        const autoId = `WRK-BIK-${Math.floor(100 + Math.random() * 900)}`;
        setFormData({
          name: '',
          employeeId: autoId,
          department: 'Assembly',
          station: 'Transmission Indexing Bay',
          skillLevel: 'DRIVETRAIN_SPECIALIST',
          shift: 'MORNING',
          hourlyRate: 320,
          dailyRate: 2560,
          overtimeRate: 480,
          skills: 'Drivetrain Calibration, Shimano Gear Tuning',
          status: 'ACTIVE'
        });
      }
      setError('');
    }
  }, [isOpen, worker]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'hourlyRate') {
      const hr = Math.max(0, parseFloat(value) || 0);
      setFormData(prev => ({
        ...prev,
        hourlyRate: hr,
        dailyRate: Math.round(hr * 8),
        overtimeRate: Math.round(hr * 1.5)
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Technician name is required.');
      return;
    }
    if (!formData.employeeId.trim()) {
      setError('Employee / Worker ID is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: formData.name.trim(),
        employeeId: formData.employeeId.trim(),
        workerId: formData.employeeId.trim(),
        department: formData.department,
        station: formData.station,
        skillLevel: formData.skillLevel,
        shift: formData.shift,
        hourlyRate: Number(formData.hourlyRate) || 0,
        dailyRate: Number(formData.dailyRate) || 0,
        overtimeRate: Number(formData.overtimeRate) || 0,
        skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
        status: formData.status
      };

      const res = await fetch('/api/labour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        onSuccess?.(data);
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to onboard technician');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving technician');
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
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {worker ? 'Edit Technician Profile' : 'Onboard Floor Technician'}
              </h3>
              <p className="text-xs text-slate-500">Configure factory workstation, shift schedule & wage rates</p>
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
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Name & Employee ID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Technician Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium text-sm"
                    placeholder="e.g. Ramesh Patil"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Worker / Employee ID *</label>
                <div className="relative">
                  <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleInputChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-sm"
                    placeholder="WRK-BIK-001"
                  />
                </div>
              </div>
            </div>

            {/* Department & Station */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Factory Department</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium"
                >
                  <option value="Welding">⚡ Frame Robotic Welding Line</option>
                  <option value="Assembly">⚙️ Transmission & Drivetrain Assembly</option>
                  <option value="Quality Assurance">🔍 Quality Assurance & Roll Test</option>
                  <option value="Paint & Coating">🎨 Paint & Powder Coating</option>
                  <option value="Packaging">📦 Final Boxing & Dispatch</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Assigned Workstation</label>
                <input
                  name="station"
                  value={formData.station}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium"
                  placeholder="e.g. Transmission Indexing Bay"
                />
              </div>
            </div>

            {/* Skill Level & Shift */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Skill Level / Classification</label>
                <select
                  name="skillLevel"
                  value={formData.skillLevel}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium"
                >
                  <option value="MASTER_WELDER">Master Welder (TIG / Robotic)</option>
                  <option value="DRIVETRAIN_SPECIALIST">Drivetrain & Gear Specialist</option>
                  <option value="WHEEL_TRUING_TECH">Wheel Truing Technician</option>
                  <option value="QC_INSPECTOR">Quality Control Inspector</option>
                  <option value="PAINT_OPERATOR">Powder Coat Spray Operator</option>
                  <option value="ASSEMBLER">Bicycle Assembly Technician</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Shift Schedule</label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    name="shift"
                    value={formData.shift}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-medium"
                  >
                    <option value="MORNING">Morning Shift (08:00 AM - 04:30 PM)</option>
                    <option value="EVENING">Evening Shift (04:30 PM - 01:00 AM)</option>
                    <option value="NIGHT">Night Shift (01:00 AM - 08:00 AM)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Wage & Overtime Rates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Hourly Wage (₹)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    name="hourlyRate"
                    value={formData.hourlyRate}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-sm font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Daily Rate (8 hrs) (₹)</label>
                <input
                  type="number"
                  min="0"
                  name="dailyRate"
                  value={formData.dailyRate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-sm font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">OT Rate (1.5x) (₹/hr)</label>
                <input
                  type="number"
                  min="0"
                  name="overtimeRate"
                  value={formData.overtimeRate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-sm font-bold text-amber-700"
                />
              </div>
            </div>

            {/* Skills & Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Specialized Skills (Comma separated)</label>
                <div className="relative">
                  <Wrench className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="skills"
                    value={formData.skills}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm"
                    placeholder="e.g. Robotic Arc Welding, CNC Lathe, Spoke Truing"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Floor Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold"
                >
                  <option value="ACTIVE">🟢 Active on Floor</option>
                  <option value="ON_LEAVE">🟡 On Approved Leave</option>
                  <option value="INACTIVE">🔴 Inactive / Relieved</option>
                </select>
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
              className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 text-sm cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {worker ? 'Update Technician' : 'Onboard Technician'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
