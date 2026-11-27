'use client';

import React, { useState } from 'react';
import { X, Globe2, Ship, Save, AlertCircle } from 'lucide-react';

interface ExportDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ExportDocModal({ isOpen, onClose, onSuccess }: ExportDocModalProps) {
  const [docType, setDocType] = useState('BILL_OF_LADING');
  const [shippingLine, setShippingLine] = useState('Maersk Logistics India');
  const [vesselName, setVesselName] = useState('Maersk Sealand v.204E');
  const [originPort, setOriginPort] = useState('JNPT Nhava Sheva, Mumbai, India');
  const [destinationPort, setDestinationPort] = useState('Port of Rotterdam, Netherlands');
  const [consignee, setConsignee] = useState('Decathlon International Logistics B.V.');
  const [goodsDescription, setGoodsDescription] = useState('100x AeroPro Carbon Road Bikes in Crates');
  const [totalValueUSD, setTotalValueUSD] = useState(85000);
  const [status, setStatus] = useState('IN_TRANSIT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/export-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentNumber: `EXP-202604-${Math.floor(Math.random() * 1000)}`,
          type: docType,
          shippingLine,
          vesselName,
          originPort,
          destinationPort,
          consignee,
          goodsDescription,
          totalValueUSD,
          status,
          shippedDate: new Date().toISOString().split('T')[0]
        })
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create export document');
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
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">New Export / Import Document</h3>
              <p className="text-xs text-slate-500">Cross-border customs and shipping documentation.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Document Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
              >
                <option value="BILL_OF_LADING">Bill of Lading (B/L)</option>
                <option value="CUSTOMS_DECLARATION">Customs Declaration (Shipping Bill)</option>
                <option value="COMMERCIAL_INVOICE">Commercial Export Invoice</option>
                <option value="CERTIFICATE_OF_ORIGIN">Certificate of Origin</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Shipping Line / Carrier</label>
              <input
                type="text"
                value={shippingLine}
                onChange={e => setShippingLine(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Vessel & Voyage Name</label>
              <input
                type="text"
                value={vesselName}
                onChange={e => setVesselName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Total Shipment Value (USD $)</label>
              <input
                type="number"
                value={totalValueUSD}
                onChange={e => setTotalValueUSD(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-bold text-slate-800"
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700">Origin Port (Loading)</label>
              <input
                type="text"
                value={originPort}
                onChange={e => setOriginPort(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold"
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700">Destination Port (Discharge)</label>
              <input
                type="text"
                value={destinationPort}
                onChange={e => setDestinationPort(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold"
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700">Consignee & Destination Address</label>
              <input
                type="text"
                value={consignee}
                onChange={e => setConsignee(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold"
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700">Goods Description & Packaging</label>
              <input
                type="text"
                value={goodsDescription}
                onChange={e => setGoodsDescription(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-semibold"
                required
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
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
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> Save Export Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
