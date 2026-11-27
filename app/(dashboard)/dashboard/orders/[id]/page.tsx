'use client';

import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  Package, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Truck, 
  FileText,
  AlertCircle,
  ArrowRight,
  ClipboardCheck,
  Zap,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [dispatchError, setDispatchError] = useState('');

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
      } else {
        setError('Order not found');
      }
    } catch (err) {
      setError('Failed to fetch order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchOrder();
  }, [id]);

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    setDispatchError('');
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (res.ok) {
        fetchOrder();
      } else {
        const data = await res.json();
        setDispatchError(data.error || 'Failed to update status');
      }
    } catch (err: any) {
      setDispatchError(err?.message || 'Update error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
        <Zap className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
        <p className="text-slate-500 font-medium">Loading fulfillment details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8 text-center bg-red-50 border border-red-100 rounded-2xl">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-red-700">Error</h3>
        <p className="text-red-600 mb-6">{error || 'Order not found'}</p>
        <Link href="/dashboard/orders" className="text-blue-600 font-bold hover:underline">Back to Orders</Link>
      </div>
    );
  }

  const quarantinedAllocations = (order?.allocations || []).filter((a: any) => {
    const b = a.batch;
    return b && (b.qualityStatus === 'REJECTED' || b.qualityStatus === 'ON_HOLD' || b.qualityStatus === 'PENDING_QC');
  });
  const hasQuarantinedBatch = quarantinedAllocations.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* QC Hard Gate Warning Banner */}
      {hasQuarantinedBatch && (
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-rose-950 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600 shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-rose-600 text-white rounded text-[11px] font-bold uppercase tracking-wider">
                  QC Gate Active
                </span>
                <h4 className="font-bold text-base text-rose-900">Warehouse Dispatch Blocked</h4>
              </div>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                This order contains allocated batch(es) that are currently <strong>QUARANTINED</strong> or <strong>REJECTED</strong> by Quality Control. Under factory QC Hard Gate policy, dispatch is strictly prohibited until Quality clears the defect or stock is reallocated.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/quality"
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shrink-0 transition-all shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Quality Control Desk
          </Link>
        </div>
      )}

      {dispatchError && (
        <div className="p-4 bg-red-100 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{dispatchError}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/dashboard/orders" 
            className="p-2 transition-all hover:bg-slate-100 rounded-xl"
          >
            <ChevronLeft className="w-6 h-6 text-slate-400" />
          </Link>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              {order.orderNumber}
              <span className="text-sm font-bold bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">
                {order.status}
              </span>
            </h2>
            <p className="text-slate-500 mt-1">Order Date: {new Date(order.createdAt).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {order.status === 'ALLOCATED' && (
            <button 
              onClick={() => updateStatus('PICKED')}
              disabled={updating}
              className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all font-bold"
            >
              <ClipboardCheck className="w-5 h-5" />
              Mark as Picked
            </button>
          )}
          {order.status === 'PICKED' && (
            hasQuarantinedBatch ? (
              <button 
                disabled
                className="flex items-center gap-2 px-6 py-3 bg-rose-100 text-rose-700 border border-rose-300 font-bold rounded-xl text-xs cursor-not-allowed shadow-sm"
                title="QC Dispatch Gate Blocked: Contains Quarantined Batch"
              >
                <Lock className="w-4 h-4 text-rose-600" />
                Shipping Blocked (Quarantine)
              </button>
            ) : (
              <button 
                onClick={() => updateStatus('SHIPPED')}
                disabled={updating}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all font-bold"
              >
                <Truck className="w-5 h-5" />
                Mark as Shipped
              </button>
            )
          )}
          {order.status !== 'SHIPPED' && order.status !== 'CANCELLED' && (
             <button 
                onClick={() => updateStatus('CANCELLED')}
                disabled={updating}
                className="px-6 py-3 bg-white text-red-600 border border-red-100 hover:bg-red-50 font-bold rounded-xl transition-all"
             >
                Cancel Order
             </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Customer & Items */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg"><MapPin className="w-5 h-5 text-slate-600" /></div>
              Delivery Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Name</p>
                <p className="text-lg font-bold text-slate-800">{order.customerName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Shipping Address</p>
                <p className="text-slate-700 leading-relaxed italic">"{order.shippingAddress}"</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg"><FileText className="w-5 h-5 text-slate-600" /></div>
              Order Items
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Product</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">SKU</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Price</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {order.items.map((item: any, idx: number) => (
                    <tr key={idx} className="group hover:bg-slate-50/50">
                      <td className="py-4">
                        <p className="text-sm font-bold text-slate-800">{item.product?.name || 'Unknown'}</p>
                      </td>
                      <td className="py-4">
                         <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-tight uppercase">
                            {item.product?.sku || 'N/A'}
                         </span>
                      </td>
                      <td className="py-4 text-right">
                        <p className="text-sm font-bold text-slate-700">{item.quantity}</p>
                      </td>
                      <td className="py-4 text-right italic text-slate-400 text-sm">
                        ₹{item.price.toLocaleString()}
                      </td>
                      <td className="py-4 text-right">
                        <p className="text-sm font-bold text-blue-600 font-mono">₹{(item.price * item.quantity).toLocaleString()}</p>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900 text-white">
                    <td colSpan={4} className="p-4 rounded-l-xl text-right font-bold uppercase tracking-wider text-xs opacity-60">Grand Total</td>
                    <td className="p-4 rounded-r-xl text-right font-bold text-xl">₹{order.totalAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Pick List (The FEFO result) */}
        <div className="space-y-8">
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl shadow-slate-900/20 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-12 translate-x-12 blur-3xl opacity-50" />
            <h3 className="text-xl font-bold flex items-center gap-3 relative">
              <div className="p-2 bg-white/10 rounded-lg"><ClipboardCheck className="w-5 h-5 text-blue-400" /></div>
              Pick List
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed italic">The system has automatically identified optimized batches using First-Expiry-First-Out (FEFO) logic to ensure product freshness.</p>
            
            <div className="space-y-4 pt-4">
              {order.allocations.map((alloc: any, idx: number) => (
                <div key={idx} className="p-5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] transition-all group">
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                       <Package className="w-4 h-4 text-amber-500 shrink-0" />
                       <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{alloc.batch?.batchNumber || 'Batch Removed'}</span>
                       {alloc.batch?.qualityStatus === 'ON_HOLD' || alloc.batch?.qualityStatus === 'REJECTED' ? (
                         <span className="bg-rose-600 text-white text-[11px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                           <ShieldAlert className="w-2.5 h-2.5" /> QUARANTINED
                         </span>
                       ) : alloc.batch?.qualityStatus === 'PENDING_QC' ? (
                         <span className="bg-amber-500 text-slate-900 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                           <Clock className="w-2.5 h-2.5" /> PENDING QC
                         </span>
                       ) : (
                         <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                           <CheckCircle2 className="w-2.5 h-2.5" /> QC APPROVED
                         </span>
                       )}
                    </div>
                    <span className="bg-emerald-500 text-slate-900 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ring-4 ring-emerald-500/20 shrink-0">
                      Pick {alloc.quantity} units
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                       <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Expiration</p>
                       <p className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {alloc.batch?.expiryDate ? new Date(alloc.batch.expiryDate).toLocaleDateString() : 'N/A'}
                       </p>
                    </div>
                    <div className="space-y-1 text-right">
                       <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Location</p>
                       <p className="text-xs font-bold text-slate-300">{alloc.batch?.location || 'Main Warehouse'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {order.status === 'SHIPPED' && (
              <div className="mt-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <p className="text-xs font-bold">Successfully dispatched and deducted from inventory.</p>
              </div>
            )}
          </div>

          {/* Timeline / Status Tracker */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <h4 className="font-bold text-slate-800 text-sm border-b pb-2">Movement Tracker</h4>
             <div className="space-y-6">
                <div className={`flex items-start gap-4 ${order.status !== 'PENDING' && order.status !== 'CANCELLED' ? 'text-slate-400' : 'text-blue-600'}`}>
                   <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${order.status !== 'PENDING' ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {order.status !== 'PENDING' ? <CheckCircle2 className="w-4 h-4 text-white" /> : '1'}
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-sm font-bold">Order Received & Allocated</p>
                      <p className="text-xs italic opacity-80">Stock is reserved from FEFO batches</p>
                   </div>
                </div>
                <div className={`flex items-start gap-4 ${order.status === 'PICKED' || order.status === 'SHIPPED' ? 'text-blue-600' : 'text-slate-300'}`}>
                   <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${order.status === 'PICKED' || order.status === 'SHIPPED' ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {order.status === 'PICKED' || order.status === 'SHIPPED' ? <CheckCircle2 className="w-4 h-4 text-white" /> : '2'}
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-sm font-bold">Goods Picked & Verified</p>
                      <p className="text-xs italic opacity-80">Physical stock has been retrieved</p>
                   </div>
                </div>
                <div className={`flex items-start gap-4 ${order.status === 'SHIPPED' ? 'text-blue-600' : 'text-slate-300'}`}>
                   <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${order.status === 'SHIPPED' ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {order.status === 'SHIPPED' ? <CheckCircle2 className="w-4 h-4 text-white" /> : '3'}
                   </div>
                   <div className="space-y-0.5">
                      <p className="text-sm font-bold">Dispatched (Finalized)</p>
                      <p className="text-xs italic opacity-80">Syncing final stock levels</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
