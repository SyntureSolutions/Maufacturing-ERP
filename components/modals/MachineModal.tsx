'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Cpu, MapPin, Gauge, Calendar, AlertCircle, Wrench, Activity } from 'lucide-react';

interface MachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (machine?: any) => void;
  machine?: any;
}

export default function MachineModal({ isOpen, onClose, onSuccess, machine }: MachineModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'Robotic Welding Cell',
    location: 'Bay 1 - Frame Fabrication Shop',
    capacity: 25,
    status: 'AVAILABLE',
    maintenanceSchedule: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  });

  useEffect(() => {
    if (isOpen) {
      if (machine) {
        setFormData({
          name: machine.name || '',
          code: machine.code || '',
          type: machine.type || 'Robotic Welding Cell',
          location: machine.location || '',
          capacity: machine.capacity || 20,
          status: machine.status || 'AVAILABLE',
          maintenanceSchedule: machine.maintenanceSchedule 
            ? new Date(machine.maintenanceSchedule).toISOString().split('T')[0]
            : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
        });
      } else {
        const autoCode = `MCH-EQP-${Math.floor(100 + Math.random() * 900)}`;
        setFormData({
          name: '',
          code: autoCode,
          type: 'Robotic Welding Cell',
          location: 'Bay 1 - Frame Fabrication Shop',
          capacity: 25,
          status: 'AVAILABLE',
          maintenanceSchedule: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
        });
      }
      setError('');
    }
  }, [isOpen, machine]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Machine name is required.');
      return;
    }
    if (!formData.code.trim()) {
      setError('Machine code is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        type: formData.type,
        location: formData.location.trim(),
        capacity: Number(formData.capacity) || 1,
        status: formData.status,
        maintenanceSchedule: formData.maintenanceSchedule ? new Date(formData.maintenanceSchedule) : undefined
      };

      const res = await fetch('/api/production/machines', {
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
        setError(data.error || 'Failed to register machine');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving machine');
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
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {machine ? 'Edit Machine Spec' : 'Commission Factory Machine'}
              </h3>
              <p className="text-xs text-slate-500">Register production equipment, rated capacity & shop floor bay</p>
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

            {/* Name & Code */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Machine Name *</label>
                <div className="relative">
                  <Cpu className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-sm"
                    placeholder="e.g. Panasonic Robotic TIG Welder"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Machine Code / Asset ID *</label>
                <input
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-mono text-sm uppercase"
                  placeholder="MCH-WLD-001"
                />
              </div>
            </div>

            {/* Type & Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Equipment Category</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-medium"
                >
                  <option value="Robotic Welding Cell">⚡ Robotic Welding Cell</option>
                  <option value="Automated Truing Rig">🚲 Automated Truing & Spoking Rig</option>
                  <option value="Powder Coat Conveyor">🎨 Powder Coat Conveyor Line</option>
                  <option value="Conveyor Assembly Line">⚙️ Conveyor Assembly Line</option>
                  <option value="CNC Milling / Lathe">🔧 CNC Milling / Lathe Unit</option>
                  <option value="Hydroforming Tube Press">🏗️ Hydroforming Tube Press</option>
                  <option value="Testing & Dynamometer">🔍 Roller Dynamometer & QC Rig</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Shop Floor Bay / Line</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-medium"
                    placeholder="Bay 1 - Frame Fabrication"
                  />
                </div>
              </div>
            </div>

            {/* Rated Capacity, Status, Maintenance Schedule */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Rated Capacity (Units/Hr)</label>
                <div className="relative">
                  <Gauge className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min="1"
                    name="capacity"
                    value={formData.capacity}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-mono font-bold"
                    placeholder="25"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Operational Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-bold"
                >
                  <option value="AVAILABLE">🟢 Available for Production</option>
                  <option value="IN_USE">🔵 Currently In Use</option>
                  <option value="MAINTENANCE">🟡 Scheduled Maintenance</option>
                  <option value="BREAKDOWN">🔴 Unplanned Breakdown</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Next PM Schedule</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    name="maintenanceSchedule"
                    value={formData.maintenanceSchedule}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-xs font-medium cursor-pointer"
                  />
                </div>
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
              className="flex items-center gap-2 px-8 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 text-sm cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {machine ? 'Update Machine' : 'Commission Machine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
