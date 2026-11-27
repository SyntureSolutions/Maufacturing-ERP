'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  ShoppingCart, 
  User, 
  MapPin, 
  Save,
  AlertCircle,
  Package,
  Building,
  CreditCard
} from 'lucide-react';
import CustomerModal from './CustomerModal';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface OrderItem {
  product: string;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
}

export default function OrderModal({ isOpen, onClose, onSuccess }: OrderModalProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  
  const [customerInfo, setCustomerInfo] = useState({
    customer: '',
    customerName: '',
    shippingAddress: '',
    gstin: ''
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedPrice, setSelectedPrice] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      fetchCustomers();
      setCustomerInfo({ customer: '', customerName: '', shippingAddress: '', gstin: '' });
      setOrderItems([]);
      setError('');
    }
  }, [isOpen]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const handleCustomerSelect = (id: string) => {
    const c = customers.find(cust => cust._id === id);
    if (c) {
      setCustomerInfo({
        customer: c._id,
        customerName: c.name,
        shippingAddress: c.billingAddress || (c.shippingAddresses && c.shippingAddresses[0]) || '',
        gstin: c.gstin || ''
      });
    } else {
      setCustomerInfo(prev => ({ ...prev, customer: '' }));
    }
  };

  const handleCustomerCreated = async (newCust?: any) => {
    setIsNewCustomerModalOpen(false);
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setCustomers(list);
        if (newCust?._id) {
          setCustomerInfo({
            customer: newCust._id,
            customerName: newCust.name,
            shippingAddress: newCust.billingAddress || '',
            gstin: newCust.gstin || ''
          });
        }
      }
    } catch (e) {}
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const p = products.find(prod => prod._id === productId);
    if (p) {
      setSelectedPrice(p.price || p.purchasePrice || 100);
    }
  };

  const addProductToOrder = () => {
    if (!selectedProductId) return;
    
    const product = products.find(p => p._id === selectedProductId);
    if (!product) return;

    // Check if already in list
    const existing = orderItems.find(item => item.product === selectedProductId);
    if (existing) {
      setOrderItems(prev => prev.map(item => 
        item.product === selectedProductId 
          ? { ...item, quantity: item.quantity + selectedQty, price: selectedPrice } 
          : item
      ));
    } else {
      setOrderItems(prev => [...prev, {
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: selectedQty,
        price: selectedPrice
      }]);
    }
    
    setSelectedProductId('');
    setSelectedQty(1);
    setSelectedPrice(0);
  };

  const updateItemField = (index: number, field: 'quantity' | 'price', value: number) => {
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeItem = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmit = async () => {
    if (!customerInfo.customerName.trim()) {
      setError('Please select or specify a customer name.');
      return;
    }
    if (!customerInfo.shippingAddress.trim()) {
      setError('Please provide a delivery / shipping address.');
      return;
    }
    if (orderItems.length === 0) {
      setError('Please add at least one product to the order.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customerInfo.customer || undefined,
          customerName: customerInfo.customerName.trim(),
          shippingAddress: customerInfo.shippingAddress.trim(),
          items: orderItems
        })
      });
      
      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create order');
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
      
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Create Customer Sales Order</h3>
              <p className="text-xs text-slate-500">Capture buyer details, verify GST & allocate finished goods stock</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
          {/* Customer Info */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <Building className="w-4 h-4 text-amber-500" />
                Customer Account
              </h4>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(true)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Customer
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Select Registered Customer</label>
                <select
                  value={customerInfo.customer}
                  onChange={e => handleCustomerSelect(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all font-medium appearance-none cursor-pointer text-sm"
                >
                  <option value="">-- Choose from Master or enter manually --</option>
                  {customers.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.code ? `(${c.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer Name *</label>
                  <input 
                    type="text"
                    placeholder="Decathlon Sports India"
                    value={customerInfo.customerName}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-medium"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer GSTIN</label>
                  <input 
                    type="text"
                    placeholder="29AABCD1234E1Z6"
                    value={customerInfo.gstin}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                    className="w-full px-3.5 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-mono text-sm uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Shipping & Delivery Address *
                </label>
                <textarea 
                  rows={2}
                  placeholder="Full delivery destination, street, city and pin code..."
                  value={customerInfo.shippingAddress}
                  onChange={e => setCustomerInfo(prev => ({ ...prev, shippingAddress: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 resize-none text-sm font-medium"
                  required
                />
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/60 space-y-3">
              <h5 className="text-xs font-bold text-amber-700 uppercase tracking-wider">Order Value Summary</h5>
              <div className="flex justify-between items-center text-slate-600 text-sm">
                <span>Total Finished Units</span>
                <span className="font-bold text-slate-900">{orderItems.reduce((a, b) => a + b.quantity, 0)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-800 pt-2 border-t border-amber-200/80">
                <span className="font-bold">Total Payable (Tax Exclusive)</span>
                <span className="text-lg font-bold text-amber-700">₹{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Product Selection */}
          <div className="space-y-6">
            <h4 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
              <Package className="w-4 h-4 text-amber-500" />
              Bicycle Catalog & Stock Allocation
            </h4>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Select Product</label>
                <select 
                  value={selectedProductId}
                  onChange={e => handleProductSelect(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-sm appearance-none cursor-pointer"
                >
                  <option value="">Choose a product model...</option>
                  {products.map(p => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku}) - {p.totalStock ?? 0} {p.uom || 'units'} in stock
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quantity</label>
                  <input 
                    type="number"
                    min="1"
                    value={selectedQty}
                    onChange={e => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Unit Price (₹)</label>
                  <input 
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedPrice}
                    onChange={e => setSelectedPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <button 
                type="button"
                onClick={addProductToOrder}
                disabled={!selectedProductId}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-40 text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Line Item
              </button>
            </div>

            {/* Added Items List */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selected Items ({orderItems.length})</label>
              
              {orderItems.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-sm">
                  No items added yet. Choose a product above to add.
                </div>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {orderItems.map((item, index) => (
                    <div key={index} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{item.productName}</p>
                          <p className="text-[11px] font-mono text-slate-400">{item.sku}</p>
                        </div>
                        <button 
                          onClick={() => removeItem(index)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantity</label>
                          <input 
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => updateItemField(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full px-3 py-1 bg-white text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-amber-500 text-sm font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unit Price (₹)</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                            <input 
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price}
                              onChange={e => updateItemField(index, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full pl-6 pr-3 py-1 bg-white text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-amber-500 text-sm font-bold text-amber-600"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs pt-1 text-slate-500 font-medium">
                        <span>Subtotal:</span>
                        <span className="font-bold text-slate-800 text-sm">₹{(item.price * item.quantity).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-8 mb-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all text-sm"
            disabled={loading}
          >
            Cancel
          </button>
          
          <button 
            type="button"
            onClick={handleSubmit}
            disabled={loading || orderItems.length === 0}
            className="flex items-center gap-2 px-8 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 text-sm cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Place Order
          </button>
        </div>
      </div>

      {isNewCustomerModalOpen && (
        <CustomerModal
          isOpen={isNewCustomerModalOpen}
          onClose={() => setIsNewCustomerModalOpen(false)}
          onSuccess={handleCustomerCreated}
        />
      )}
    </div>
  );
}
