'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  DollarSign, 
  TrendingDown, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Building, 
  Percent, 
  MessageSquare,
  Sparkles,
  RotateCcw,
  BadgeCheck
} from 'lucide-react';

interface FinanceNegotiationModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: any;
  onSuccess?: () => void;
}

export default function FinanceNegotiationModal({ isOpen, onClose, po, onSuccess }: FinanceNegotiationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [negotiatedItems, setNegotiatedItems] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && po) {
      const origAmt = po.originalAmount || po.totalAmount;
      setNotes(po.negotiationNotes || '');

      const initialItems = (po.items || []).map((it: any) => {
        const origUnitPrice = it.originalUnitPrice || it.unitPrice || 0;
        const currentNegotiatedUnitPrice = it.negotiatedUnitPrice !== undefined ? it.negotiatedUnitPrice : origUnitPrice;
        return {
          ...it,
          originalUnitPrice: origUnitPrice,
          negotiatedUnitPrice: currentNegotiatedUnitPrice,
          negotiatedTotalPrice: currentNegotiatedUnitPrice * it.quantity
        };
      });

      setNegotiatedItems(initialItems);
      setError('');
    }
  }, [isOpen, po]);

  if (!isOpen || !po) return null;

  const originalTotal = po.originalAmount || po.totalAmount || 0;
  
  const currentNegotiatedTotal = negotiatedItems.reduce(
    (sum, it) => sum + (Number(it.negotiatedUnitPrice || 0) * it.quantity), 
    0
  );

  const currentSavings = Math.max(0, originalTotal - currentNegotiatedTotal);
  const currentSavingsPct = originalTotal > 0 ? Math.round((currentSavings / originalTotal) * 100) : 0;

  const handleUnitPriceChange = (index: number, val: number) => {
    const updated = [...negotiatedItems];
    const unitPrice = Math.max(0, val);
    updated[index] = {
      ...updated[index],
      negotiatedUnitPrice: unitPrice,
      negotiatedTotalPrice: unitPrice * updated[index].quantity
    };
    setNegotiatedItems(updated);
  };

  const applyGlobalDiscount = (percent: number) => {
    const factor = (100 - percent) / 100;
    const updated = negotiatedItems.map(it => {
      const newPrice = Math.round(it.originalUnitPrice * factor);
      return {
        ...it,
        negotiatedUnitPrice: newPrice,
        negotiatedTotalPrice: newPrice * it.quantity
      };
    });
    setNegotiatedItems(updated);
    if (!notes) {
      setNotes(`Proposed ${percent}% commercial discount on bulk volume order.`);
    }
  };

  const handleSubmitCounterOffer = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SUBMIT_COUNTER_OFFER',
          poId: po._id,
          counterAmount: currentNegotiatedTotal,
          counterItems: negotiatedItems,
          notes: notes || 'Counter-offer submitted by Finance Manager.'
        })
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit counter-offer');
      }
    } catch (e: any) {
      setError(e.message || 'An error occurred while submitting counter-offer');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeAgreement = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'FINALIZE_NEGOTIATION',
          poId: po._id,
          finalAmount: currentNegotiatedTotal,
          finalItems: negotiatedItems,
          notes: notes || 'Final negotiated price agreed with supplier and authorized by Finance Manager.'
        })
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to finalize price agreement');
      }
    } catch (e: any) {
      setError(e.message || 'An error occurred while finalizing agreement');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESET_NEGOTIATION',
          poId: po._id
        })
      });
      if (res.ok) {
        onSuccess?.();
        onClose();
      }
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto border border-slate-200 z-10 animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Finance Manager Price Negotiation Desk</h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold uppercase">
                  CFO Executive Gate
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Purchase Order Ref: <span className="font-mono text-amber-400 font-bold">{po.poNumber}</span> • Supplier: <span className="text-slate-200 font-medium">{po.supplier?.name || 'Vendor'}</span>
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Three Key Metrics Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Initial Quoted Order Price</p>
              <h4 className="text-2xl font-bold font-mono text-slate-900 mt-1">
                ₹{originalTotal.toLocaleString('en-IN')}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Supplier baseline requisition</p>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Negotiated Target Price</p>
              <h4 className="text-2xl font-bold font-mono text-indigo-900 mt-1">
                ₹{currentNegotiatedTotal.toLocaleString('en-IN')}
              </h4>
              <p className="text-[11px] text-indigo-600 mt-0.5">Proposed counter-offer value</p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Procurement Savings</p>
                <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold text-[11px] rounded-full">
                  -{currentSavingsPct}% Saved
                </span>
              </div>
              <h4 className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                ₹{currentSavings.toLocaleString('en-IN')}
              </h4>
              <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Direct bottom-line margin gain</p>
            </div>
          </div>

          {/* Quick Discount Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Quick Concession Shortcuts:</span>
            </div>
            <div className="flex items-center gap-2">
              {[5, 8, 10, 12, 15].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyGlobalDiscount(pct)}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  -{pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Line Items Negotiation Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Itemized Unit Rate Adjustments
              </h4>
              <span className="text-xs text-slate-500">Edit unit prices to calculate negotiated line totals</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="p-3">Product Name & SKU</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Quoted Rate (₹)</th>
                    <th className="p-3 text-right w-44">Negotiated Rate (₹)</th>
                    <th className="p-3 text-right">Negotiated Total (₹)</th>
                    <th className="p-3 text-right">Savings (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {negotiatedItems.map((item: any, idx: number) => {
                    const originalLine = (item.originalUnitPrice || 0) * item.quantity;
                    const negotiatedLine = (item.negotiatedUnitPrice || 0) * item.quantity;
                    const lineSavings = Math.max(0, originalLine - negotiatedLine);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{item.product?.name || 'Raw Material Item'}</p>
                          <p className="text-[11px] text-slate-400 font-mono">SKU: {item.product?.sku || 'RAW-001'}</p>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500 line-through">
                          ₹{(item.originalUnitPrice || item.unitPrice || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right">
                          <div className="relative inline-block w-36">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={item.negotiatedUnitPrice}
                              onChange={(e) => handleUnitPriceChange(idx, parseFloat(e.target.value) || 0)}
                              className="w-full pl-6 pr-2.5 py-1.5 text-right font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg focus:border-emerald-500 focus:bg-white outline-none transition-all text-xs"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-700">
                          ₹{negotiatedLine.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600">
                          {lineSavings > 0 ? `+ ₹${lineSavings.toLocaleString('en-IN')}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Negotiation Justification Notes */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              Negotiation Terms, Justification & Concessions Agreed with Supplier
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Supplier agreed to revised unit rates for 10% overall price reduction based on Net-20 early settlement terms..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 transition-all text-xs font-medium resize-none"
            />
          </div>

          {/* Current Status Callout */}
          <div className="p-3 rounded-xl bg-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Current Status:</span>
              <span className={`px-2 py-0.5 rounded font-bold uppercase text-[11px] ${
                po.negotiationStatus === 'AGREED' ? 'bg-emerald-100 text-emerald-800' :
                po.negotiationStatus === 'IN_NEGOTIATION' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {po.negotiationStatus === 'AGREED' ? 'Price Agreement Finalized' :
                 po.negotiationStatus === 'IN_NEGOTIATION' ? 'Under Active Counter-Negotiation' : 'Standard Initial Quote'}
              </span>
            </div>

            {po.negotiationStatus !== 'NONE' && (
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Initial Quote
              </button>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 text-slate-500 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Submit Counter Offer button */}
            <button
              onClick={handleSubmitCounterOffer}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Percent className="w-4 h-4" />
              Submit Counter-Offer
            </button>

            {/* Finalize Deal button */}
            <button
              onClick={handleFinalizeAgreement}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <BadgeCheck className="w-4 h-4" />
              Finalize & Sign Off Deal
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
