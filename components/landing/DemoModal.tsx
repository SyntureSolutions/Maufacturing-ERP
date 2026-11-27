'use client';

import React, { useState } from 'react';
import {
  X,
  Calendar,
  Building2,
  CheckCircle2,
  Mail,
  User,
  Phone,
  Layers
} from 'lucide-react';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    focusArea: 'FEFO & Lot Traceability',
    plantSize: '10-50 Workers'
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-slate-100 text-left">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-20 cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="p-8 pb-6 border-b border-slate-800 bg-[#1E293B]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-amber-400 mb-3">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Schedule a Consultation</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Book a Technical Demonstration
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1.5 leading-relaxed font-normal">
            Speak with an enterprise solutions architect for a live walkthrough tailored to your plant workflow.
          </p>
        </div>

        {/* Modal Content */}
        <div className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {submitted ? (
            <div className="p-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Demonstration Request Received</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                Thank you, {formData.name}. Our technical team will reach out to schedule a demonstration tailored for <strong className="text-white">{formData.company || 'your facility'}</strong>.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition-all cursor-pointer"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rajesh Kumar"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Work Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="rajesh@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Company / Plant Name</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Precision Ltd"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Primary Requirement</label>
                  <div className="relative">
                    <select
                      value={formData.focusArea}
                      onChange={(e) => setFormData({ ...formData, focusArea: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="FEFO & Lot Traceability">FEFO & Lot Traceability</option>
                      <option value="Multi-Tier BOM & MRP">Multi-Tier BOM & MRP</option>
                      <option value="Quality Inspection & COA">Quality Inspection & COA</option>
                      <option value="GST Billing & E-Way Bills">GST Billing & E-Way Bills</option>
                      <option value="Full Enterprise Suite">Full Enterprise Suite</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Plant Workforce Size</label>
                  <select
                    value={formData.plantSize}
                    onChange={(e) => setFormData({ ...formData, plantSize: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="10-50 Workers">10 - 50 Workers</option>
                    <option value="50-200 Workers">50 - 200 Workers</option>
                    <option value="200-500 Workers">200 - 500 Workers</option>
                    <option value="500+ Workers">500+ Workers (Multi-Plant Group)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-slate-950" />
                  <span>Submit Demonstration Request</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                By submitting, you agree to receive communications regarding your demonstration request. Your information will not be shared.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
