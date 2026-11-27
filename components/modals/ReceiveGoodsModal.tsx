'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  Package, 
  Calendar, 
  AlertCircle,
  ArrowRight
} from 'lucide-react';

interface ReceiveGoodsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  po: any;
}

export default function ReceiveGoodsModal({ isOpen, onClose, onSuccess, po }: ReceiveGoodsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receivedItems, setReceivedItems] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && po) {
      setReceivedItems(po.items.map((it: any) => ({
        product: typeof it.product === 'object' ? it.product._id : it.product,
        name: typeof it.product === 'object' ? it.product.name : 'Unknown Product',
        sku: typeof it.product === 'object' ? it.product.sku : 'N/A',
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        expiryDate: '' // Required for each item
      })));
      setError('');
    }
  }, [isOpen, po]);

  const handleExpiryChange = (index: number, value: string) => {
    const newItems = [...receivedItems];
    newItems[index] = { ...newItems[index], expiryDate: value };
    setReceivedItems(newItems);
  };

  const handleReceive = async () => {
    // Validate that all expiry dates are filled
    const missing = receivedItems.some(it => !it.expiryDate);
    if (missing) {
      setError('Please provide an expiry date for all items to proceed with FEFO tracking.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/purchase/${po._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RECEIVED',
          receivedItems
        })
      });
      
      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to receive goods');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !po) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
              Receive Goods: {po.poNumber}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-emerald-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-bold">Inventory Registration</p>
              <p className="opacity-80">Marking this PO as received will create individual batch records for each item. Please verify quantities and assign expiry dates for FEFO (First Expiry First Out) rotation.</p>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4 px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-5">Product Details</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-5">Expiry Date</div>
            </div>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
              {receivedItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-100 group">
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded shadow-sm text-slate-400 group-hover:text-emerald-500 transition-colors">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 line-clamp-1">{item.name}</p>
                      <p className="text-[11px] font-mono text-slate-400">{item.sku}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-center font-bold text-slate-700">
                    {item.quantity}
                  </div>
                  <div className="col-span-5">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="date"
                        value={item.expiryDate}
                        onChange={(e) => handleExpiryChange(index, e.target.value)}
                        className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500 text-sm font-medium transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">Verified by: <span className="font-bold">System Admin</span></p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all">
              Cancel
            </button>
            <button 
              onClick={handleReceive} 
              disabled={loading}
              className="flex items-center gap-2 px-8 py-2.5 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
              Confirm & Receive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
