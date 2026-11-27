'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  FileText, 
  Layers, 
  BarChart, 
  Save,
  AlertCircle,
  Plus
} from 'lucide-react';
import CategoryModal from './CategoryModal';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  product?: any; // Existing product for edit mode
}

// Mirror models/Product.ts (that file pulls in mongoose, so it is not imported on the client)
const MRP_TYPES: Record<string, string> = { PD: 'MRP', VB: 'Reorder Point', ND: 'No Planning' };
const PRICE_CONTROLS: Record<string, string> = { V: 'Moving Average', S: 'Standard Price' };
// Optional numbers: shown blank, sent as null when cleared
const OPTIONAL_NUMBERS = ['minSellingPrice', 'grossWeight', 'netWeight', 'plannedDeliveryDays'] as const;
const EXTRA_DEFAULTS = { minSellingPrice: '', grossWeight: '', netWeight: '', oemName: '', oemPartNumber: '', plant: '', mrpType: 'PD', safetyStock: 0, plannedDeliveryDays: '', storageBin: '', batchManaged: true, valuationClass: '', priceControl: 'V' };
const EXTRA_KEYS = Object.keys(EXTRA_DEFAULTS) as (keyof typeof EXTRA_DEFAULTS)[];
const inputCls = 'w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all';
const labelCls = 'text-sm font-bold text-slate-700';

export default function ProductModal({ isOpen, onClose, onSuccess, product }: ProductModalProps) {
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sku: '',
    category: '',
    uom: 'pcs',
    barcode: '',
    minStockLevel: 0,
    price: 0,
    purchasePrice: 0,
    productType: 'FINISHED_GOOD',
    hsnCode: '',
    gstRate: 18,
    isActive: true,
    ...EXTRA_DEFAULTS
  });

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      if (product) {
        setFormData({
          name: product.name || '',
          description: product.description || '',
          sku: product.sku || '',
          category: typeof product.category === 'object' ? product.category._id : product.category || '',
          uom: product.uom || 'pcs',
          barcode: product.barcode || '',
          minStockLevel: product.minStockLevel || 0,
          price: product.price ?? 0,
          purchasePrice: product.purchasePrice ?? 0,
          productType: product.productType || 'FINISHED_GOOD',
          hsnCode: product.hsnCode || '',
          gstRate: product.gstRate ?? 18,
          isActive: product.isActive !== undefined ? product.isActive : true,
          ...(Object.fromEntries(EXTRA_KEYS.map(k => [k, product[k] ?? EXTRA_DEFAULTS[k]])) as typeof EXTRA_DEFAULTS)
        });
      } else {
        setFormData({
          name: '',
          description: '',
          sku: '',
          category: '',
          uom: 'pcs',
          barcode: '',
          minStockLevel: 0,
          price: 0,
          purchasePrice: 0,
          productType: 'FINISHED_GOOD',
          hsnCode: '',
          gstRate: 18,
          isActive: true,
          ...EXTRA_DEFAULTS
        });
      }
      setStep(1);
      setError('');
    }
  }, [isOpen, product]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const handleCategoryCreated = (newCat: any) => {
    setIsCategoryModalOpen(false);
    fetchCategories();
    if (newCat?._id) {
      setFormData(prev => ({ ...prev, category: newCat._id }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['minStockLevel', 'gstRate', 'price', 'purchasePrice', 'safetyStock'].includes(name) ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const url = product ? `/api/products/${product._id}` : '/api/products';
      const method = product ? 'PATCH' : 'POST';
      const payload: any = { ...formData };
      for (const k of OPTIONAL_NUMBERS) payload[k] = payload[k] === '' || payload[k] === null ? null : Number(payload[k]);
      if (!product) for (const k of OPTIONAL_NUMBERS) if (payload[k] === null) delete payload[k];
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save product');
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
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {product ? 'Edit Product' : 'Add New Product'}
              </h3>
              <p className="text-xs text-slate-500">Step {step} of 4: {step === 1 ? 'General Info & Pricing' : step === 2 ? 'Classification' : step === 3 ? 'Inventory Rules' : 'Planning & Accounting'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 transition-all">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" />
                  Product Name
                </label>
                <input 
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Fresh Tomato Puree"
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-medium"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Description</label>
                <textarea 
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="Describe the product, its usage, etc."
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all resize-none"
                />
              </div>

              {/* Pricing & Commercials */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Commercial Pricing
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">
                      Selling / Catalog Price (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                      <input 
                        type="number"
                        name="price"
                        value={formData.price || ''}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        min="0"
                        step="any"
                        className="w-full pl-8 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Default rate used for B2B Quotes & Sales Orders.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">
                      Standard Purchase / Cost Price (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                      <input 
                        type="number"
                        name="purchasePrice"
                        value={formData.purchasePrice || ''}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        min="0"
                        step="any"
                        className="w-full pl-8 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Pre-fills vendor unit price when raising Purchase Orders.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700">Minimum Selling Price (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                      <input
                        type="number"
                        name="minSellingPrice"
                        value={formData.minSellingPrice}
                        onChange={handleInputChange}
                        placeholder="No minimum"
                        min="0"
                        step="any"
                        className="w-full pl-8 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">An order line priced below this needs a Manager or Admin to approve the margin.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 transition-all">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-500" />
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Category
                    </button>
                  </div>
                  <select 
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all appearance-none cursor-pointer"
                    required
                  >
                    <option value="">Select a category</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat._id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">SKU (Stock Keeping Unit)</label>
                  <input 
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    placeholder="e.g. TOM-PUR-500"
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-mono"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Barcode / EAN</label>
                <input 
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleInputChange}
                  placeholder="e.g. 5060123456789"
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 transition-all">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <BarChart className="w-4 h-4 text-amber-500" />
                    Unit of Measure (UOM)
                  </label>
                  <select 
                    name="uom"
                    value={formData.uom}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all"
                    required
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="box">Box</option>
                    <option value="ctn">Carton</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Minimum Stock Level</label>
                  <input 
                    type="number"
                    name="minStockLevel"
                    value={formData.minStockLevel}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all"
                    min="0"
                  />
                  <p className="text-xs text-slate-400 italic">Alert triggers when stock falls below this value (also the MRP reorder level).</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Item type</label>
                  <select name="productType" value={formData.productType} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all">
                    <option value="FINISHED_GOOD">Finished good (FG)</option><option value="SEMI_FINISHED">Semi-finished (SFG)</option><option value="RAW_MATERIAL">Raw material (RM)</option><option value="PACKAGING">Packaging material (PM)</option><option value="TRADING_GOOD">Trading good</option><option value="SPARE_PART">Spare part</option><option value="SERVICE">Service</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">HSN code</label>
                  <input name="hsnCode" value={formData.hsnCode} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all" placeholder="e.g. 8712" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">GST rate (%)</label>
                  <input type="number" name="gstRate" value={formData.gstRate} onChange={handleInputChange} min="0" className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all" />
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <input 
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="w-5 h-5 accent-amber-500 rounded border-slate-300 focus:ring-amber-500"
                />
                <label htmlFor="isActive" className="text-sm font-bold text-slate-700 cursor-pointer">
                  This product is currently active and available for trade
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 transition-all">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Basic data</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2"><label className={labelCls}>Gross weight (kg)</label><input type="number" name="grossWeight" min="0" step="any" value={formData.grossWeight} onChange={handleInputChange} className={inputCls} /></div>
                  <div className="space-y-2"><label className={labelCls}>Net weight (kg)</label><input type="number" name="netWeight" min="0" step="any" value={formData.netWeight} onChange={handleInputChange} className={inputCls} /><p className="text-[11px] text-slate-400">Cannot be more than the gross weight.</p></div>
                  <div className="space-y-2"><label className={labelCls}>OEM name</label><input name="oemName" value={formData.oemName} onChange={handleInputChange} className={inputCls} /></div>
                  <div className="space-y-2"><label className={labelCls}>OEM part number</label><input name="oemPartNumber" value={formData.oemPartNumber} onChange={handleInputChange} className={inputCls + ' font-mono'} /></div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Planning (MRP) and storage</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2"><label className={labelCls}>Plant</label><input name="plant" value={formData.plant} onChange={handleInputChange} className={inputCls + ' uppercase'} placeholder="e.g. P100" /></div>
                  <div className="space-y-2"><label className={labelCls}>MRP type</label>
                    <select name="mrpType" value={formData.mrpType} onChange={handleInputChange} className={inputCls}>{Object.entries(MRP_TYPES).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}</select></div>
                  <div className="space-y-2"><label className={labelCls}>Safety stock</label><input type="number" name="safetyStock" min="0" value={formData.safetyStock} onChange={handleInputChange} className={inputCls} /></div>
                  <div className="space-y-2"><label className={labelCls}>Planned delivery days</label><input type="number" name="plannedDeliveryDays" min="0" value={formData.plannedDeliveryDays} onChange={handleInputChange} className={inputCls} /></div>
                  <div className="space-y-2"><label className={labelCls}>Storage bin</label><input name="storageBin" value={formData.storageBin} onChange={handleInputChange} className={inputCls} /></div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 self-end">
                    <input type="checkbox" id="batchManaged" checked={formData.batchManaged} onChange={e => setFormData(prev => ({ ...prev, batchManaged: e.target.checked }))} className="w-5 h-5 accent-amber-500" />
                    <label htmlFor="batchManaged" className="text-sm font-bold text-slate-700 cursor-pointer">Batch managed</label>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Accounting</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2"><label className={labelCls}>Valuation class</label><input name="valuationClass" value={formData.valuationClass} onChange={handleInputChange} className={inputCls + ' font-mono'} placeholder="e.g. 3000" /></div>
                  <div className="space-y-2"><label className={labelCls}>Price control</label>
                    <select name="priceControl" value={formData.priceControl} onChange={handleInputChange} className={inputCls}>{Object.entries(PRICE_CONTROLS).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}</select></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button 
            type="button"
            onClick={() => setStep(prev => Math.max(1, prev - 1))}
            disabled={step === 1 || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
              step === 1 ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>
          
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all"
              disabled={loading}
            >
              Cancel
            </button>
            
            {step < 4 ? (
              <button 
                type="button"
                onClick={() => setStep(prev => prev + 1)}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-8 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {product ? 'Update Product' : 'Create Product'}
              </button>
            )}
          </div>
        </div>
      </div>

      {isCategoryModalOpen && (
        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onSuccess={handleCategoryCreated}
        />
      )}
    </div>
  );
}
