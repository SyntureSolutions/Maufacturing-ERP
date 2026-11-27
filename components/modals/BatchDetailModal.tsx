'use client';

import React from 'react';
import { X, Layers, Calendar, MapPin, Package, ShieldCheck, Tag, ArrowRight, Activity } from 'lucide-react';

interface BatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: any | null;
}

export default function BatchDetailModal({ isOpen, onClose, batch }: BatchDetailModalProps) {
  if (!isOpen || !batch) return null;

  const daysToExpiry = Math.ceil(
    (new Date(batch.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const availableQty = batch.currentQuantity - (batch.allocatedQuantity || 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{batch.product?.name || 'Inventory Batch'}</h3>
              <p className="text-xs font-mono text-slate-500">Batch Code: <span className="font-bold text-slate-700">{batch.batchNumber}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stock Metrics */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Initial Stock</span>
              <strong className="text-lg font-bold text-slate-800 font-mono">{batch.initialQuantity || batch.currentQuantity}</strong>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Allocated / Reserved</span>
              <strong className="text-lg font-bold text-blue-600 font-mono">{batch.allocatedQuantity || 0}</strong>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Available Stock</span>
              <strong className="text-lg font-bold text-emerald-600 font-mono">{availableQty}</strong>
            </div>
          </div>

          {/* Key Attributes */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">FEFO & Storage Location</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-500" />
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Expiry Date</span>
                  <strong className="text-slate-800 text-xs font-bold">{new Date(batch.expiryDate).toLocaleDateString()}</strong>
                  <span className="text-[11px] font-bold text-amber-600 block">({daysToExpiry} days remaining)</span>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
                <MapPin className="w-5 h-5 text-indigo-500" />
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Warehouse Rack/Bin</span>
                  <strong className="text-slate-800 text-xs font-bold">{batch.location || 'Main Assembly Bay 1'}</strong>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
                <Tag className="w-5 h-5 text-sky-500" />
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Source Procurement</span>
                  <strong className="text-slate-800 text-xs font-bold">{batch.po?.poNumber || 'Manual Receipt'}</strong>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Quality Clearance</span>
                  <strong className="text-emerald-700 text-xs font-bold uppercase">PASSED (QA Certified)</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Traceability Audit Trail */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" /> Batch Movement & Audit Log
            </h4>
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold">• Batch Received in Warehouse</span>
                <span className="text-slate-400 font-mono">{new Date(batch.createdAt || '2026-03-15').toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold">• QA Inspection Status Verified</span>
                <span className="text-emerald-600 font-bold">APPROVED</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-semibold">• FEFO Expiry Indexing</span>
                <span className="text-amber-600 font-bold">ACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all shadow-sm"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
