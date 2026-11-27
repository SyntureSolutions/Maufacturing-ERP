'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

export default function WorkOrderModal({ isOpen, onClose, onSuccess, workOrder }: any) {
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    product: '',
    bom: '',
    quantity: 1,
    demandType: 'MTS',
    salesOrderRef: '',
    priority: 'MEDIUM',
    plannedStartDate: todayStr,
    plannedEndDate: nextWeekStr,
    assignedMachine: '',
    autoAssign: false,
  });
  const [products, setProducts] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetch('/api/products')
        .then(res => res.ok ? res.json() : [])
        .then(data => setProducts(Array.isArray(data) ? data : []))
        .catch(() => setProducts([]));

      fetch('/api/production/bom')
        .then(res => res.ok ? res.json() : [])
        .then(data => setBoms(Array.isArray(data) ? data : []))
        .catch(() => setBoms([]));

      fetch('/api/production/machines')
        .then(res => res.ok ? res.json() : [])
        .then(data => setMachines(Array.isArray(data) ? data : []))
        .catch(() => setMachines([]));
      fetch('/api/sales-orders').then(res => res.ok ? res.json() : []).then(data => setSalesOrders(Array.isArray(data) ? data : [])).catch(() => setSalesOrders([]));
      
      if (workOrder) {
        setFormData({
          product: workOrder.product?._id || '',
          bom: workOrder.bom?._id || '',
          quantity: workOrder.quantity,
          demandType: workOrder.demandType || 'MTS',
          salesOrderRef: workOrder.salesOrderRef || '',
          priority: workOrder.priority || 'MEDIUM',
          plannedStartDate: workOrder.plannedStartDate ? new Date(workOrder.plannedStartDate).toISOString().split('T')[0] : todayStr,
          plannedEndDate: workOrder.plannedEndDate ? new Date(workOrder.plannedEndDate).toISOString().split('T')[0] : nextWeekStr,
          assignedMachine: workOrder.assignedMachine?._id || '',
          autoAssign: false,
        });
      } else {
        setFormData({ 
          product: '', 
          bom: '', 
          quantity: 1, 
          demandType: 'MTS',
          salesOrderRef: '',
          priority: 'MEDIUM', 
          plannedStartDate: todayStr, 
          plannedEndDate: nextWeekStr, 
          assignedMachine: '',
          autoAssign: false
        });
      }
      setError('');
    }
  }, [isOpen, workOrder]);

  if (!isOpen) return null;

  // Only things the factory makes can have a work order; each needs a bill of materials to draw material against
  const MAKEABLE = ['FINISHED_GOOD', 'SEMI_FINISHED'];
  const makeable = products.filter(p => MAKEABLE.includes(p.productType) || p._id === formData.product);
  // only active BOMs can be built from (the one already on a work order being edited stays listed)
  const ofItem = (productId: string) => boms.filter(b => String(b.product?._id || b.product) === productId);
  const bomsFor = (productId: string) => ofItem(productId).filter(b => b.status === 'ACTIVE' || b._id === (workOrder?.bom?._id || workOrder?.bom));
  const notActiveYet = formData.product ? ofItem(formData.product).filter(b => b.status === 'DRAFT' || b.status === 'PENDING_APPROVAL') : [];
  const productBoms = formData.product ? bomsFor(formData.product) : [];
  const noBom = !!formData.product && productBoms.length === 0;
  const pickProduct = (id: string) => {
    const list = bomsFor(id);
    const chosen = list.find(b => b.isDefault) || (list.length === 1 ? list[0] : null);
    setFormData({ ...formData, product: id, bom: chosen?._id || '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(workOrder ? `/api/production/${workOrder._id}` : '/api/production', {
        method: workOrder ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save work order');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <h2 className="text-xl font-bold text-slate-800">
            {workOrder ? 'Edit Work Order' : 'New Work Order'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
              <AlertCircle className="w-5 h-5" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Demand type</label>
              <select value={formData.demandType} onChange={e => setFormData({...formData, demandType: e.target.value, salesOrderRef: e.target.value === 'MTS' ? '' : formData.salesOrderRef})} className="w-full px-4 py-3 rounded-xl border border-slate-200">
                <option value="MTO">Make to Order</option><option value="MTS">Make to Stock</option>
              </select>
            </div>
            {formData.demandType === 'MTO' && <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Sales order</label>
              <select required value={formData.salesOrderRef} onChange={e => setFormData({...formData, salesOrderRef: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200">
                <option value="">Select approved sales order</option>{salesOrders.filter(so => !['CANCELLED', 'REJECTED'].includes(so.status)).map(so => <option key={so._id} value={so.soNumber}>{so.soNumber} · {so.customerName}</option>)}
              </select>
            </div>}
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Product</label>
              <select
                value={formData.product}
                onChange={(e) => pickProduct(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
                required
              >
                <option value="">{makeable.length ? 'Select the item to make' : 'No finished or semi-finished items in the item master'}</option>
                {makeable.map(p => (
                  <option key={p._id} value={p._id}>{p.name} ({p.sku}){bomsFor(p._id).length ? '' : ' · no BOM yet'}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Bill of Materials (BOM)</label>
              {noBom ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {notActiveYet.length ? <>This item&apos;s BOM (version {notActiveYet.map(b => b.version).join(', ')}) is {notActiveYet.some(b => b.status === 'PENDING_APPROVAL') ? 'waiting for approval' : 'still a draft'}, and only an active BOM can be built from.{' '}</> : <>This item has no bill of materials, so the material to issue can&apos;t be worked out.{' '}</>}
                  <a href="/dashboard/masters/bom" className="font-bold underline">{notActiveYet.length ? 'Open its BOM' : 'Create its BOM'}</a> first, then raise the work order.
                </div>
              ) : (
                <select
                  value={formData.bom}
                  onChange={(e) => setFormData({...formData, bom: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all disabled:bg-slate-50"
                  required
                  disabled={!formData.product}
                >
                  <option value="">{formData.product ? 'Select BOM version' : 'Choose the item first'}</option>
                  {productBoms.map(b => (
                    <option key={b._id} value={b._id}>Version {b.version}{b.isDefault ? ' · default' : b.status !== 'ACTIVE' ? ` · ${String(b.status).toLowerCase()}` : ''} · makes {b.baseQuantity || 1} {b.product?.uom || ''} · {b.components?.length || 0} components</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Quantity</label>
              <input 
                type="number" min="0" step="any"
                value={formData.quantity} 
                onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value)})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Priority</label>
              <select 
                value={formData.priority} 
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-bold"
              >
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="CRITICAL">🔥 CRITICAL Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Planned Start Date</label>
              <input 
                type="date"
                value={formData.plannedStartDate}
                onChange={(e) => setFormData({...formData, plannedStartDate: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-sm font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Target End Date (Due Date)</label>
              <input 
                type="date"
                value={formData.plannedEndDate}
                onChange={(e) => setFormData({...formData, plannedEndDate: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-sm font-medium"
                required
              />
            </div>

            <div className="col-span-2">
               <label className="block text-sm font-bold text-slate-700 mb-2">Assign Machine (Optional)</label>
               <select 
                value={formData.assignedMachine} 
                onChange={(e) => setFormData({...formData, assignedMachine: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none"
              >
                <option value="">None</option>
                {machines.map(m => (
                  <option key={m._id} value={m._id}>{m.name} ({m.status})</option>
                ))}
              </select>
              {!formData.assignedMachine && !workOrder && (
                <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input type="checkbox" checked={formData.autoAssign} onChange={(e) => setFormData({...formData, autoAssign: e.target.checked})} />
                  Auto-assign to the least-loaded production line
                </label>
              )}
            </div>
          </div>

          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <button type="button" onClick={onClose} className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || noBom} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl flex items-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="w-5 h-5" /> {loading ? 'Saving...' : 'Save Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
