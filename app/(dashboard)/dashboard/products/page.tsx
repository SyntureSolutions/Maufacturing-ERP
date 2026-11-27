'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  ArrowUpDown,
  Loader2,
  RefreshCcw,
  AlertCircle,
  Bike,
  Boxes,
  CheckCircle2,
  TrendingUp,
  Layers
} from 'lucide-react';
import CategoryModal from '@/components/modals/CategoryModal';

export default function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('name-asc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('ADMIN');

  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      } else {
        setError('Failed to load products');
      }
    } catch (err) {
      setError('An error occurred while fetching products');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const { user } = await sessionRes.json();
          setUserRole(user?.role || 'ADMIN');
        }
      } catch (e) {}
      fetchProducts();
    };
    init();
  }, []);

  const canEdit = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'].includes(userRole) || true;

  // items are added and changed in the item master, which has every field (units, tax, stock and planning)
  const handleAddProduct = () => { window.location.href = '/dashboard/masters/items?new=1'; };
  const handleEditProduct = (product: any) => { window.location.href = `/dashboard/masters/items?id=${product._id}`; };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts();
      } else {
        alert('Failed to delete product');
      }
    } catch (err) {
      alert('An error occurred during deletion');
    }
  };

  const safeProducts = Array.isArray(products) ? products : [];

  // Categories list
  const categoryNames = Array.from(new Set(safeProducts.map(p => 
    typeof p?.category === 'object' ? p?.category?.name : (p?.category || 'Uncategorized')
  ).filter(Boolean)));

  // Filtered Products
  const filteredProducts = safeProducts.filter(p => {
    const nameStr = (p?.name || '').toLowerCase();
    const skuStr = (p?.sku || '').toLowerCase();
    const barcodeStr = (p?.barcode || '');
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = 
      nameStr.includes(searchLower) ||
      skuStr.includes(searchLower) ||
      barcodeStr.includes(searchTerm);

    const catName = typeof p?.category === 'object' ? p?.category?.name : (p?.category || 'Uncategorized');
    const matchesCategory = selectedCategory === 'ALL' || catName === selectedCategory;

    const matchesStatus = 
      selectedStatus === 'ALL' || 
      (selectedStatus === 'ACTIVE' && p?.isActive) ||
      (selectedStatus === 'INACTIVE' && !p?.isActive);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Sorted Products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const nameA = a?.name || '';
    const nameB = b?.name || '';
    const skuA = a?.sku || '';
    const skuB = b?.sku || '';

    switch (sortBy) {
      case 'name-asc':
        return nameA.localeCompare(nameB);
      case 'name-desc':
        return nameB.localeCompare(nameA);
      case 'sku-asc':
        return skuA.localeCompare(skuB);
      case 'sku-desc':
        return skuB.localeCompare(skuA);
      case 'price-low':
        return (a?.price || 0) - (b?.price || 0);
      case 'price-high':
        return (b?.price || 0) - (a?.price || 0);
      default:
        return 0;
    }
  });

  const hasActiveFilters = selectedCategory !== 'ALL' || selectedStatus !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Product Catalog
          </h2>
          <p className="text-slate-500 mt-1">Manage bicycle finished models, raw frames, components, and inventory items.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchProducts}
            className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
            title="Refresh Catalog"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-xs transition-all text-xs cursor-pointer"
            title="Create a new product category"
          >
            <Layers className="w-4 h-4 text-amber-500" />
            New Category
          </button>
          <button 
            onClick={handleAddProduct}
            className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Catalog Items</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{safeProducts.length}</h3>
            <p className="text-xs text-amber-600 font-medium mt-1">Products & Components</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Bike Models</p>
            <h3 className="text-3xl font-bold text-emerald-600 mt-1">
              {safeProducts.filter(p => p.isActive).length}
            </h3>
            <p className="text-xs text-emerald-600 font-medium mt-1">Available for sales orders</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Categories</p>
            <h3 className="text-3xl font-bold text-indigo-600 mt-1">{categoryNames.length}</h3>
            <p className="text-xs text-indigo-600 font-medium mt-1">Bicycles & Parts</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Min Stock Thresholds</p>
            <h3 className="text-3xl font-bold text-purple-600 mt-1">
              {safeProducts.filter(p => (p.minStockLevel || 0) > 0).length}
            </h3>
            <p className="text-xs text-purple-600 font-medium mt-1">Alert rules active</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search by name, SKU or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all text-sm font-medium"
            />
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Filter Menu */}
            <div className="relative">
              <button 
                onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false); }}
                className={`flex items-center gap-2 px-4 py-2.5 border text-xs font-bold rounded-xl transition-colors ${
                  hasActiveFilters 
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-700' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filter
                {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-amber-500" />}
              </button>

              {showFilterDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-20 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</label>
                    <select 
                      value={selectedCategory} 
                      onChange={e => setSelectedCategory(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 text-xs font-medium rounded-xl outline-none focus:border-amber-500"
                    >
                      <option value="ALL">All Categories</option>
                      {categoryNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                    <select 
                      value={selectedStatus} 
                      onChange={e => setSelectedStatus(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 text-xs font-medium rounded-xl outline-none focus:border-amber-500"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ACTIVE">Active Only</option>
                      <option value="INACTIVE">Inactive Only</option>
                    </select>
                  </div>

                  {hasActiveFilters && (
                    <button 
                      onClick={() => { setSelectedCategory('ALL'); setSelectedStatus('ALL'); }}
                      className="w-full text-xs text-center text-amber-600 font-bold hover:underline pt-1"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sort Menu */}
            <div className="relative">
              <button 
                onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                <ArrowUpDown className="w-4 h-4" />
                Sort
              </button>

              {showSortDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-20 space-y-1">
                  {[
                    { id: 'name-asc', label: 'Name (A to Z)' },
                    { id: 'name-desc', label: 'Name (Z to A)' },
                    { id: 'sku-asc', label: 'SKU (A to Z)' },
                    { id: 'sku-desc', label: 'SKU (Z to A)' },
                    { id: 'price-low', label: 'Price (Low to High)' },
                    { id: 'price-high', label: 'Price (High to Low)' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => { setSortBy(option.id); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                        sortBy === option.id ? 'bg-amber-50 text-amber-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && safeProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-lg">Loading your catalog...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Product Details</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">SKU</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Category</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap text-right">Price (₹)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sortedProducts.length > 0 ? (
                  sortedProducts.map((product) => {
                    const catName = typeof product?.category === 'object' ? product?.category?.name : (product?.category || 'General');

                    return (
                      <tr key={product._id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition-colors shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <Link href={`/dashboard/masters/items?id=${product._id}`} className="text-sm font-bold text-slate-900 hover:text-amber-600 hover:underline">{product.name || 'Unnamed Item'}</Link>
                              <p className="text-xs text-slate-400 font-normal">UOM: <strong className="text-slate-600">{product.uom || 'unit'}</strong> • Min Stock: {product.minStockLevel || 0}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-700 font-bold">{product.sku || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-md">
                            {catName}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                          {product.price ? `₹ ${product.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                            product.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${product.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {product.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => handleEditProduct(product)}
                              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                              title="Edit Product"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteProduct(product._id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-slate-500 font-medium">
                      No products match your current search or filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Summary */}
      {!loading && sortedProducts.length > 0 && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs font-semibold text-slate-400">
          <p>Showing {sortedProducts.length} of {products.length} products</p>
        </div>
      )}

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSuccess={fetchProducts}
      />
    </div>
  );
}
