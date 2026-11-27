'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  ChevronRight,
  RefreshCcw,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Package,
  XCircle,
  Truck,
  Bike,
  TrendingUp,
  DollarSign,
  Boxes
} from 'lucide-react';
import OrderModal from '@/components/modals/OrderModal';
import Link from 'next/link';

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('ALL');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      } else {
        setError('Failed to load customer orders');
      }
    } catch (err) {
      setError('An error occurred while fetching orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter(order => {
    const matchesStatus = activeStatusFilter === 'ALL' || order.status === activeStatusFilter;
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.items?.some((i: any) => i.product?.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  // Calculate Metrics
  const totalOrdersCount = orders.length;
  const totalBikesVolume = orders.reduce((sum, order) => {
    return sum + (order.items?.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0) || 0);
  }, 0);
  const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  const shippedCount = orders.filter(o => o.status === 'SHIPPED').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': 
        return <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 border border-slate-200"><Clock className="w-3.5 h-3.5 text-slate-500" /> Pending</span>;
      case 'ALLOCATED': 
        return <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 border border-blue-200"><Package className="w-3.5 h-3.5 text-blue-500" /> Allocated</span>;
      case 'PICKED': 
        return <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 border border-amber-200"><CheckCircle2 className="w-3.5 h-3.5 text-amber-600" /> Picked</span>;
      case 'SHIPPED': 
        return <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 border border-emerald-200"><Truck className="w-3.5 h-3.5 text-emerald-600" /> Shipped</span>;
      case 'CANCELLED': 
        return <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 border border-red-200"><XCircle className="w-3.5 h-3.5 text-red-500" /> Cancelled</span>;
      default: 
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Customer Orders
          </h2>
          <p className="text-slate-500 mt-1">Manage bulk bicycle sales fulfillment, FEFO stock allocation, and regional shipping.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchOrders}
            className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
            title="Refresh Orders"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all"
          >
            <Plus className="w-5 h-5" />
            Create New Order
          </button>
        </div>
      </div>

      {/* Top Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Bulk Orders</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{totalOrdersCount}</h3>
            <p className="text-xs text-blue-600 font-medium mt-1">Active customer contracts</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Bike Volume</p>
            <h3 className="text-3xl font-bold text-amber-600 mt-1">{totalBikesVolume} <span className="text-sm text-slate-500 font-medium">Bikes</span></h3>
            <p className="text-xs text-amber-700 font-medium mt-1">Units ordered across orders</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Bike className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sales Revenue</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">₹{(totalRevenue / 100000).toFixed(2)} L</h3>
            <p className="text-xs text-emerald-600 font-medium mt-1">Cumulative order value</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dispatched & Shipped</p>
            <h3 className="text-3xl font-bold text-indigo-600 mt-1">{shippedCount} <span className="text-sm text-slate-500 font-medium">Orders</span></h3>
            <p className="text-xs text-indigo-600 font-medium mt-1">FEFO Allocated & Shipped</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {[
            { key: 'ALL', label: 'All Orders' },
            { key: 'SHIPPED', label: 'Shipped' },
            { key: 'ALLOCATED', label: 'Allocated' },
            { key: 'PENDING', label: 'Pending' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveStatusFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeStatusFilter === tab.key
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full md:w-80 relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search by Order ID, Customer, or Bike..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Orders Table */}
      {loading && orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-lg">Retrieving customer orders...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Order & Customer</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ordered Bicycle Models</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Volume</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Order Value</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => {
                    const totalUnits = order.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
                    return (
                      <tr key={order._id} className="hover:bg-slate-50/70 transition-colors group">
                        {/* Order & Customer */}
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                              <ShoppingCart className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 text-sm">{order.orderNumber}</span>
                                <span className="text-[11px] font-semibold text-slate-400">({new Date(order.createdAt).toLocaleDateString()})</span>
                              </div>
                              <p className="text-sm font-bold text-slate-800 mt-0.5">{order.customerName}</p>
                              <p className="text-xs text-slate-400 truncate max-w-[220px]">{order.shippingAddress}</p>
                            </div>
                          </div>
                        </td>

                        {/* Bicycle Line Items */}
                        <td className="px-6 py-4">
                          <div className="space-y-1.5">
                            {order.items?.map((item: any, idx: number) => (
                              <div key={idx} className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg text-xs text-slate-800 font-medium mr-1.5 mb-1">
                                <Bike className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span><strong className="text-slate-900">{item.quantity}x</strong> {item.product?.name || 'Bicycle Model'}</span>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Volume */}
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                            <Bike className="w-3.5 h-3.5 text-amber-600" /> {totalUnits} Bikes
                          </span>
                        </td>

                        {/* Order Value */}
                        <td className="px-6 py-4 text-right">
                          <p className="text-base font-bold text-slate-900 font-mono">₹{order.totalAmount.toLocaleString('en-IN')}</p>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            {getStatusBadge(order.status)}
                          </div>
                        </td>

                        {/* Action */}
                        <td className="px-6 py-4 text-right">
                          <Link 
                            href={`/dashboard/orders/${order._id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold bg-slate-900 hover:bg-amber-500 hover:text-slate-900 text-white px-3.5 py-2 rounded-xl transition-all shadow-sm"
                          >
                            View Details
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400 font-medium bg-white">
                      No matching customer orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchOrders}
      />
    </div>
  );
}
