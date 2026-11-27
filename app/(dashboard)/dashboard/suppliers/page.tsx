'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Building, 
  Search, 
  Plus, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Mail, 
  Phone,
  RefreshCcw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import SupplierModal from '@/components/modals/SupplierModal';

export default function SuppliersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('VIEWER');

  const fetchSuppliers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      } else {
        setError('Failed to load suppliers');
      }
    } catch (err) {
      setError('An error occurred while fetching suppliers');
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
          setUserRole(user?.role || 'VIEWER');
        }
      } catch (e) {}
      fetchSuppliers();
    };
    init();
  }, []);

  const canEdit = ['ADMIN', 'MANAGER'].includes(userRole);

  const handleAddSupplier = () => {
    setSelectedSupplier(null);
    setIsModalOpen(true);
  };

  const handleEditSupplier = (supplier: any) => {
    setSelectedSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSuppliers();
      } else {
        alert('Failed to delete supplier');
      }
    } catch (err) {
      alert('An error occurred during deletion');
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.contactPerson && s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Suppliers</h2>
          <p className="text-slate-500 mt-1">Manage your procurement sources and contacts.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchSuppliers}
            className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canEdit && (
            <button 
              onClick={handleAddSupplier}
              className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all font-bold"
            >
              <Plus className="w-5 h-5" />
              Register Supplier
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search by company name, contact person or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {loading && suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-lg">Loading suppliers...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.length > 0 ? (
            filteredSuppliers.map((supplier) => (
              <div key={supplier._id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                    <Building className="w-6 h-6" />
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditSupplier(supplier)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteSupplier(supplier._id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-slate-800 line-clamp-1"><Link href={`/dashboard/suppliers/${supplier._id}`} className="hover:text-amber-600 hover:underline">{supplier.name}</Link></h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">{supplier.code}</span>
                      {supplier.gstin && (
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                          GST: {supplier.gstin}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{supplier.email || 'No email provided'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{supplier.phone || 'No phone provided'}</span>
                    </div>
                  </div>

                  {/* Commercial Terms Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {supplier.leadTime !== undefined && (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200/60">
                        ⚡ {supplier.leadTime}d Lead Time
                      </span>
                    )}
                    {supplier.paymentTerms && (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200/60">
                        💳 {supplier.paymentTerms}
                      </span>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-tight ${
                      supplier.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button 
                      onClick={() => handleEditSupplier(supplier)}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-500 flex items-center gap-1 transition-colors"
                    >
                      Edit Vendor
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-20 text-center text-slate-500 font-medium bg-white rounded-2xl border border-slate-200">
              No suppliers found. Start by adding one!
            </div>
          )}
        </div>
      )}

      <SupplierModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchSuppliers}
        supplier={selectedSupplier}
      />
    </div>
  );
}
