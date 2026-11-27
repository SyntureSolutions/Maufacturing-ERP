'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  ShoppingCart, 
  Building, 
  Package, 
  AlertCircle, 
  Calculator, 
  Calendar 
} from 'lucide-react';
import ProductModal from './ProductModal';
import SupplierModal from './SupplierModal';
import { orderView } from '@/lib/purchaseUnits';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (poData?: any) => void;
  po?: any;
  initialMaterial?: any;
}

// One PO line. deliveryDate is the line's own date ('' = with the PO); sources are the requisition lines it orders.
// quantity and unitPrice are in `unit`: empty is the item's stock unit, otherwise its purchase unit (bag, roll...)
type PoLine = { product: string; unit?: string; quantity: number; unitPrice: number; lineNo?: number; deliveryDate?: string; sources?: any[] };

export default function PurchaseOrderModal({ isOpen, onClose, onSuccess, po, initialMaterial }: PurchaseOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [indents, setIndents] = useState<any[]>([]); // approved requisitions, each line with its ordered and open quantity
  const [approvalLimits, setApprovalLimits] = useState({ poSupplyChainLimit: 50000, poFinanceLimit: 500000 });
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  
  const [formData, setFormData] = useState<{ supplier: string; items: PoLine[]; expectedDeliveryDate: string; sourceType: string; notes: string }>({
    supplier: '',
    items: [{ product: '', quantity: 1, unitPrice: 0 }],
    expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sourceType: 'MANUAL',
    notes: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchSuppliers();
      fetchProducts();
      fetchApprovalLimits();
      fetchIndents();
      if (po) {
        setFormData({
          supplier: typeof po.supplier === 'object' ? po.supplier._id : po.supplier || '',
          items: po.items.map((it: any) => ({
            product: typeof it.product === 'object' ? it.product._id : it.product || '',
            unit: it.orderFactor ? it.orderUnit : '',
            quantity: orderView(it).qty,
            unitPrice: orderView(it).rate,
            lineNo: it.lineNo,
            deliveryDate: it.deliveryDate ? new Date(it.deliveryDate).toISOString().split('T')[0] : '',
            sources: it.sources, // requisition lines this line orders; kept as they are
          })),
          expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toISOString().split('T')[0] : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          sourceType: po.sourceType || 'MANUAL',
          notes: po.notes || ''
        });
      } else if (initialMaterial) {
        setFormData({
          supplier: initialMaterial.supplier || '',
          items: [{
            product: initialMaterial.componentName || initialMaterial.sku || '',
            quantity: initialMaterial.netShortfall || 1,
            unitPrice: initialMaterial.unitCost || 0
          }],
          expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          sourceType: 'MRP_AUTO',
          notes: `MRP Shortfall PO for ${initialMaterial.componentName || 'Raw Material'} (${initialMaterial.sku || ''}). Supplier: ${initialMaterial.supplier || ''}.`
        });
      } else {
        setFormData({
          supplier: '',
          items: [{ product: '', quantity: 1, unitPrice: 0 }],
          expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          sourceType: 'MANUAL',
          notes: ''
        });
      }
      setError('');
    }
  }, [isOpen, po, initialMaterial]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) setSuppliers(await res.json());
    } catch (err) {}
  };

  const fetchIndents = async () => {
    try {
      const res = await fetch('/api/purchase-indents?status=APPROVED');
      if (res.ok) { const data = await res.json(); setIndents(Array.isArray(data) ? data : []); }
    } catch (err) {}
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } catch (err) {}
  };

  const fetchApprovalLimits = async () => {
    try {
      const res = await fetch('/api/settings/approval-thresholds');
      if (res.ok) {
        const data = await res.json();
        setApprovalLimits({
          poSupplyChainLimit: data.poSupplyChainLimit ?? 50000,
          poFinanceLimit: data.poFinanceLimit ?? 500000
        });
      }
    } catch (err) {}
  };

  // How much of a requisition line this PO already orders (when editing, its own quantity is not "used up" for it)
  const ownQty = (indentId: string, lineNo: number) =>
    (po?.items || []).flatMap((it: any) => it.sources || []).filter((x: any) => String(x.indent) === String(indentId) && x.lineNo === lineNo).reduce((sum: number, x: any) => sum + x.quantity, 0);

  // Requisition lines that could be ordered for this product, with what is still open on each
  const requisitionLines = (productId: string) => indents.flatMap(ind => (ind.items || [])
    .filter((l: any) => String(l.product?._id || l.product) === String(productId))
    .map((l: any) => ({ indent: String(ind._id), number: ind.number, lineNo: l.lineNo, open: Math.round((l.openQty + ownQty(ind._id, l.lineNo)) * 10000) / 10000 }))
    .filter((l: any) => l.open > 0));

  const pickRequisition = (index: number, value: string) => {
    const newItems = [...formData.items];
    if (!value) { newItems[index] = { ...newItems[index], sources: [] }; }
    else {
      const [indent, lineNo] = value.split('|');
      const line = requisitionLines(newItems[index].product).find(l => l.indent === indent && String(l.lineNo) === lineNo);
      if (!line) return;
      const quantity = newItems[index].quantity > 0 ? Math.min(newItems[index].quantity, line.open) : line.open;
      newItems[index] = { ...newItems[index], quantity: Math.max(newItems[index].quantity, quantity), sources: [{ indent: line.indent, lineNo: line.lineNo, quantity }] };
    }
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'product') { newItems[index].sources = []; newItems[index].unit = ''; }
    else if (field === 'quantity' && newItems[index].sources?.length === 1) newItems[index].sources = [{ ...newItems[index].sources![0], quantity: Number(value) || 0 }];
    
    // Auto-fill unit price from product's purchasePrice or catalog price
    if (field === 'product') {
      const selectedProd = products.find(p => p._id === value);
      if (selectedProd && (selectedProd.purchasePrice !== undefined || selectedProd.price !== undefined)) {
        newItems[index].unitPrice = selectedProd.purchasePrice || selectedProd.price || 0;
      }
    }
    
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const handleProductCreated = async () => {
    setIsNewProductModalOpen(false);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const prods = await res.json();
        setProducts(prods);
        if (prods.length > 0) {
          const latest = prods[0];
          setFormData(prev => {
            const items = [...prev.items];
            const emptyIdx = items.findIndex(it => !it.product);
            const targetIdx = emptyIdx !== -1 ? emptyIdx : items.length - 1;
            if (targetIdx >= 0) {
              items[targetIdx] = {
                ...items[targetIdx],
                product: latest._id,
                unitPrice: latest.purchasePrice || latest.price || 0
              };
            }
            return { ...prev, items };
          });
        }
      }
    } catch (e) {}
  };

  const handleSupplierCreated = async (newSup?: any) => {
    setIsNewSupplierModalOpen(false);
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setSuppliers(list);
        if (newSup?._id) {
          setFormData(prev => ({ ...prev, supplier: newSup._id }));
        } else if (list.length > 0) {
          setFormData(prev => ({ ...prev, supplier: list[0]._id }));
        }
      }
    } catch (e) {}
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product: '', quantity: 1, unitPrice: 0 }]
    }));
  };

  const removeItem = (index: number) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const calculateTotal = () => {
    return formData.items.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const url = po ? `/api/purchase/${po._id}` : '/api/purchase';
      const method = po ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        const data = await res.json();
        onSuccess?.(data);
        onClose();
      } else {
        // Show the real reason. Nothing is shown as saved unless the server saved it.
        const data = await res.json().catch(() => ({}));
        setError(data.error || `The purchase order could not be saved (error ${res.status}).`);
      }
    } catch (err: any) {
      setError('Could not reach the server. The purchase order was not saved.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl max-h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="shrink-0 px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              {po ? `Edit Purchase Order (${po.poNumber})` : 'New Purchase Order'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-8 space-y-8 overflow-y-auto">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-500" />
                  Select Supplier
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewSupplierModalOpen(true)}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Supplier
                </button>
              </div>
              <select 
                value={formData.supplier}
                onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-medium appearance-none cursor-pointer"
                required
              >
                <option value="">Choose a registered supplier...</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                Expected Delivery Date (Feeds Vendor OTD %)
              </label>
              {/* with dated lines the PO is due with its earliest line, so the date is set on the lines */}
              <input
                type="date"
                value={formData.items.some(it => it.deliveryDate) ? formData.items.map(it => it.deliveryDate).filter(Boolean).sort()[0] : formData.expectedDeliveryDate}
                disabled={formData.items.some(it => it.deliveryDate)}
                title={formData.items.some(it => it.deliveryDate) ? 'Follows the earliest line delivery date' : undefined}
                onChange={(e) => setFormData(prev => ({ ...prev, expectedDeliveryDate: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
              />
              {formData.items.some(it => it.deliveryDate) && <p className="text-[11px] text-slate-500">Follows the earliest line delivery date. Lines without a date are due on it too.</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                Ordered Items
              </label>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsNewProductModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg transition-all cursor-pointer shadow-xs"
                  title="Register a new product without leaving this modal"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  New Product
                </button>
                <button 
                  type="button" 
                  onClick={addItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 text-white hover:bg-blue-800 border border-blue-700 rounded-lg transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Add Line
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4 px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <div className="col-span-4">Product</div>
                <div className="col-span-2">Quantity</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-3">Line delivery date</div>
                <div className="col-span-1"></div>
              </div>

              {formData.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-4 items-center bg-slate-50/50 p-2 rounded-xl border border-slate-100 group">
                  <div className="col-span-4">
                    {item.lineNo ? <div className="mb-1 text-[10px] font-bold text-slate-400">Line {item.lineNo}{item.sources?.length ? " · from requisition" : ""}</div> : null}
                    <select 
                      value={item.product}
                      onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                      className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-amber-500 text-sm font-medium transition-all"
                    >
                      <option value="">Select Product...</option>
                      {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                    {item.product && requisitionLines(item.product).length > 0 && (() => {
                      const chosen = item.sources?.[0];
                      const open = chosen ? requisitionLines(item.product).find(l => l.indent === String(chosen.indent) && l.lineNo === chosen.lineNo)?.open : undefined;
                      return (
                        <div className="mt-1.5">
                          <select
                            value={chosen ? `${chosen.indent}|${chosen.lineNo}` : ''}
                            onChange={(e) => pickRequisition(index, e.target.value)}
                            className="w-full px-2 py-1 bg-white text-slate-700 border border-slate-200 rounded-lg text-[11px]"
                          >
                            <option value="">Not from a requisition</option>
                            {requisitionLines(item.product).map(l => <option key={`${l.indent}|${l.lineNo}`} value={`${l.indent}|${l.lineNo}`}>{l.number} line {l.lineNo} · open {l.open}</option>)}
                          </select>
                          {chosen && open !== undefined && (
                            <p className={`mt-0.5 text-[10px] font-bold ${item.quantity > open ? 'text-rose-600' : 'text-slate-400'}`}>
                              {item.quantity > open ? `Only ${open} is open on this requisition line; reduce the quantity.` : `${open} open on this requisition line`}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="col-span-2">
                    <input 
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-amber-500 text-sm font-medium transition-all"
                      min="0" step="any"
                    />
                    {(() => {
                      const p = products.find(x => x._id === item.product);
                      if (!p?.purchaseUom || p.purchaseUom === p.uom) return p ? <div className="mt-1 text-[10px] text-slate-400">{p.uom}</div> : null;
                      const f = Number(p.purchaseConversion) || 1;
                      return (
                        <select value={item.unit || p.uom} disabled={!!item.sources?.length} aria-label={`Line ${index + 1} unit`}
                          title={item.sources?.length ? 'A line from a requisition is ordered in the stock unit' : `1 ${p.purchaseUom} = ${f} ${p.uom}`}
                          className="mt-1 w-full px-2 py-1 bg-white text-slate-700 border border-slate-200 rounded-lg text-[11px]"
                          onChange={e => {
                            const toBuy = e.target.value === p.purchaseUom;
                            if (toBuy === !!item.unit) return;
                            const k = toBuy ? 1 / f : f; // the same amount, at the same price, in the other unit
                            const items = [...formData.items];
                            items[index] = { ...item, unit: toBuy ? p.purchaseUom : '', quantity: Math.round(item.quantity * k * 1e6) / 1e6, unitPrice: Math.round((item.unitPrice / k) * 100) / 100 };
                            setFormData(prev => ({ ...prev, items }));
                          }}>
                          <option value={p.uom}>{p.uom}</option><option value={p.purchaseUom}>{p.purchaseUom} (= {f} {p.uom})</option>
                        </select>);
                    })()}
                  </div>
                  <div className="col-span-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                      <input 
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-amber-500 text-sm font-medium transition-all"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="date"
                      value={item.deliveryDate || ''}
                      title="Leave empty to deliver with the PO's expected date"
                      onChange={(e) => handleItemChange(index, 'deliveryDate', e.target.value)}
                      className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-amber-500 text-sm font-medium transition-all"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button 
                      type="button" 
                      onClick={() => removeItem(index)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                      disabled={formData.items.length <= 1}
                      aria-label="Remove line" title={formData.items.length <= 1 ? 'A purchase order needs at least one line' : 'Remove line'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-slate-900 rounded-2xl flex items-center justify-between text-white shadow-xl shadow-slate-900/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-800 rounded-lg">
                <Calculator className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Estimated Grand Total</p>
                <p className="text-2xl font-bold">₹{calculateTotal().toLocaleString('en-IN')}</p>
                {calculateTotal() > approvalLimits.poFinanceLimit ? (
                  <p className="text-[11px] text-rose-400 font-bold mt-0.5">
                    ⚠️ Total &gt; ₹{approvalLimits.poFinanceLimit.toLocaleString('en-IN')}: Requires Super Admin Executive Board Sign-Off (PENDING_APPROVAL)
                  </p>
                ) : calculateTotal() > approvalLimits.poSupplyChainLimit ? (
                  <p className="text-[11px] text-amber-400 font-bold mt-0.5">
                    ⚠️ Total &gt; ₹{approvalLimits.poSupplyChainLimit.toLocaleString('en-IN')}: Requires Finance Manager (CFO) Spend Approval (PENDING_APPROVAL)
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-400 font-bold mt-0.5">
                    ✅ Within Supply Chain limit (&le; ₹{approvalLimits.poSupplyChainLimit.toLocaleString('en-IN')}): Direct Procurement Authorized
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Internal Notes</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Any specific delivery instructions or terms..."
              className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 resize-none transition-all"
            />
          </div>
        </div>

        <div className="shrink-0 px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="flex items-center gap-2 px-10 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {loading ? <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
            Submit Purchase Order
          </button>
        </div>
      </div>

      {isNewProductModalOpen && (
        <ProductModal
          isOpen={isNewProductModalOpen}
          onClose={() => setIsNewProductModalOpen(false)}
          onSuccess={handleProductCreated}
        />
      )}

      {isNewSupplierModalOpen && (
        <SupplierModal
          isOpen={isNewSupplierModalOpen}
          onClose={() => setIsNewSupplierModalOpen(false)}
          onSuccess={handleSupplierCreated}
        />
      )}
    </div>
  );
}
