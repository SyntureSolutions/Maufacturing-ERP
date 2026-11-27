'use client';

import React, { useState, useEffect } from 'react';
import MrpPlanner from '@/components/common/MrpPlanner';
import { 
  Calculator, 
  PackageSearch,
  Plus,
  RefreshCcw,
  Boxes,
  Layers,
  ShoppingCart,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  FileSpreadsheet,
  PackageCheck,
  Check
} from 'lucide-react';
import BomList from '@/components/production/BomList';
import { useUrlTab } from '@/components/workspace/useUrlTab';

export default function MRPPage() {
  const [mrpRuns, setMrpRuns] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  

  const [activeTab, setActiveTab] = useState<'REQUIREMENTS' | 'BOM' | 'HISTORY' | 'PLANNER'>('REQUIREMENTS');
  useUrlTab(['REQUIREMENTS', 'BOM', 'HISTORY', 'PLANNER'] as const, setActiveTab);
  const [notification, setNotification] = useState<string | null>(null);

  const [products, setProducts] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mrpRes, bomRes, prodRes] = await Promise.all([
        fetch('/api/mrp'),
        fetch('/api/production/bom'),
        fetch('/api/products')
      ]);
      if (mrpRes.ok) setMrpRuns(await mrpRes.json());
      if (bomRes.ok) setBoms(await bomRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const safeBOMs = Array.isArray(boms) ? boms : [];
  const safeRuns = Array.isArray(mrpRuns) ? mrpRuns : [];

  // the latest saved MRP run (runs come newest first); purchase cost at each item's purchase price from the item master
  const latest = safeRuns.find(r => Array.isArray(r.matrix)) || null;
  const price = new Map((Array.isArray(products) ? products : []).map((p: any) => [String(p._id), Number(p.purchasePrice) || 0]));
  const shortRows = (latest?.matrix || []).filter((r: any) => r.netIndentQty > 0);
  const toBuy = shortRows.filter((r: any) => r.orderType === 'PURCHASE');
  const noPrice = toBuy.filter((r: any) => !price.get(String(r.product))).length;
  const totalPlannedPurchaseCost = toBuy.reduce((t: number, r: any) => t + r.netIndentQty * (price.get(String(r.product)) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Material Requirement Planning (MRP)
          </h2>
          <p className="text-slate-500 mt-1">Explode BOMs, calculate raw material shortfalls, and auto-generate procurement purchase orders.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setActiveTab('BOM')}
            className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl shadow-sm transition-all flex items-center gap-2"
          >
            <PackageSearch className="w-4 h-4 text-amber-500" /> Bills of materials
          </button>
          <button 
            onClick={() => setActiveTab('PLANNER')}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 transition-all"
          >
            <Calculator className="w-5 h-5 text-amber-400" />
            Run MRP
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm font-medium animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Items with an active BOM</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{new Set(safeBOMs.filter(b => b.status === 'ACTIVE').map(b => String(b.product?._id || b.product))).size}</h3>
            <p className="text-xs text-emerald-600 font-medium mt-1">Multi-level component trees</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Shortfall Items</p>
            <h3 className="text-3xl font-bold text-red-600 mt-1">{shortRows.length} item{shortRows.length === 1 ? '' : 's'}</h3>
            <p className="text-xs text-red-500 font-medium mt-1">{latest ? 'Short in the latest MRP run' : 'No MRP run yet'}</p>
          </div>
          <div className="p-3 bg-red-50 rounded-xl text-red-500">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Planned Purchase Cost</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">₹{totalPlannedPurchaseCost.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">{noPrice ? `${noPrice} item${noPrice > 1 ? 's' : ''} with no purchase price not included` : 'At item master purchase prices'}</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total MRP Engine Runs</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{safeRuns.length}</h3>
            <p className="text-xs text-emerald-600 font-medium mt-1">{latest ? `Latest: ${new Date(latest.runDate || latest.createdAt).toLocaleString('en-IN')}` : 'Run MRP from the Demand Planner'}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Calculator className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('REQUIREMENTS')}
          className={`pb-3 text-sm font-bold transition-all relative ${
            activeTab === 'REQUIREMENTS'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <Boxes className="w-4 h-4" /> Requirements (latest run)
          </span>
        </button>

        <button
          onClick={() => setActiveTab('BOM')}
          className={`pb-3 text-sm font-bold transition-all relative ${
            activeTab === 'BOM'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <PackageSearch className="w-4 h-4" /> Bills of Materials (BOM Catalog)
          </span>
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`pb-3 text-sm font-bold transition-all relative ${
            activeTab === 'HISTORY'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <Calculator className="w-4 h-4" /> MRP Engine Run History
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PLANNER')}
          className={`pb-3 text-sm font-bold transition-all relative ${
            activeTab === 'PLANNER'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Demand Planner
        </button>
      </div>

      {activeTab === 'PLANNER' && <MrpPlanner />}

      {/* Tab 1: what the latest MRP run found, item by item */}
      {activeTab === 'REQUIREMENTS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-900">Net requirements from the latest MRP run</h3>
              <p className="mt-1 text-sm text-slate-500">{latest ? <>Run on {new Date(latest.runDate || latest.createdAt).toLocaleString('en-IN')}{latest.salesOrder ? ' for one sales order' : ''}. Raise indents and work orders from the Demand Planner.</> : 'No MRP run yet.'}</p>
            </div>
            <button onClick={() => setActiveTab('PLANNER')} className="btn btn-sm btn-primary">Open Demand Planner</button>
          </div>
          {latest && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Item</th><th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Gross required</th><th className="px-4 py-3 text-right">Free stock</th><th className="px-4 py-3 text-right">On PO</th>
                    <th className="px-4 py-3 text-right">Open WOs</th><th className="px-4 py-3 text-right">Reorder level</th><th className="px-4 py-3 text-right">Net to get</th>
                    <th className="px-4 py-3 text-right">Est. purchase cost</th><th className="px-4 py-3">Order / start by</th><th className="px-4 py-3">How</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...latest.matrix].sort((a: any, b: any) => Number(b.netIndentQty > 0) - Number(a.netIndentQty > 0)).map((r: any) => {
                    const p = price.get(String(r.product)) || 0;
                    return (
                      <tr key={r.product} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3"><div className="font-semibold text-slate-900">{r.name}</div><div className="text-xs text-slate-500 num">{r.sku}{r.category ? ` · ${r.category}` : ''}</div></td>
                        <td className="px-4 py-3 text-xs">{r.itemType}</td>
                        <td className="px-4 py-3 text-right num">{r.grossReq}</td><td className="px-4 py-3 text-right num">{r.inStock}</td><td className="px-4 py-3 text-right num">{r.poPipeline || ''}</td>
                        <td className="px-4 py-3 text-right num">{r.openWorkOrders || ''}</td><td className="px-4 py-3 text-right num">{r.reorderLevel || ''}</td>
                        <td className={`px-4 py-3 text-right font-bold num ${r.netIndentQty > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.netIndentQty > 0 ? r.netIndentQty : 'Covered'}</td>
                        <td className="px-4 py-3 text-right num">{r.netIndentQty > 0 && r.orderType === 'PURCHASE' ? (p ? `₹${Math.round(r.netIndentQty * p).toLocaleString('en-IN')}` : <span className="text-xs text-amber-700">no price</span>) : ''}</td>
                        <td className={`px-4 py-3 text-xs ${r.late ? 'font-bold text-red-600' : ''}`}>{r.netIndentQty > 0 && r.orderBy ? <>{new Date(r.orderBy).toLocaleDateString('en-IN')}{r.late && ' · late'}</> : ''}</td>
                        <td className="px-4 py-3 text-xs">{r.notPlanned ? 'Not planned' : r.netIndentQty > 0 ? (r.orderType === 'PURCHASE' ? 'Purchase indent' : 'Work order') : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Bills of materials, every version of every item */}
      {activeTab === 'BOM' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <BomList onChange={fetchData} />
        </div>
      )}

      {/* Tab 3: MRP Engine Run History */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900">MRP Engine Execution Audit Trail</h3>
              <p className="text-xs text-slate-500 mt-0.5">Log of automated material explosions and generated production/purchase recommendations.</p>
            </div>
          </div>

          <div className="space-y-4">
            {safeRuns.map((run) => (
              <div key={run._id} className="border border-slate-200 p-5 rounded-2xl bg-white shadow-sm space-y-4">
                <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-indigo-500" />
                      MRP Run #{run._id}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Executed on: <strong className="text-slate-700">{new Date(run.runDate).toLocaleString()}</strong> • Triggered by: <strong className="text-slate-700">{run.generatedBy?.name || 'System Admin'}</strong>
                    </p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase">
                    {run.status || 'APPROVED'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Demand Inputs */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <h5 className="font-bold text-slate-700 uppercase tracking-wider mb-2">Demand Target Inputs</h5>
                    <ul className="space-y-1.5">
                      {run.demandInputs?.map((d: any, idx: number) => (
                        <li key={idx} className="flex justify-between text-slate-600 font-medium">
                          <span>{d.product?.name || 'Bike Product'}</span>
                          <span className="font-bold text-slate-800">{d.quantity} units (Due: {d.requiredDate || 'N/A'})</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Planned Orders Generated */}
                  <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-100">
                    <h5 className="font-bold text-slate-700 uppercase tracking-wider mb-2">Calculated Recommendations</h5>
                    <ul className="space-y-1.5">
                      {run.plannedOrders?.map((po: any, idx: number) => (
                        <li key={idx} className="flex justify-between text-slate-700 font-medium">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${po.orderType === 'PURCHASE' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                            {po.product?.name || 'Material Item'}
                          </span>
                          <span className="font-bold text-slate-900">
                            {po.quantity} pcs ({po.orderType})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}

            {safeRuns.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">No MRP calculation runs recorded yet.</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
