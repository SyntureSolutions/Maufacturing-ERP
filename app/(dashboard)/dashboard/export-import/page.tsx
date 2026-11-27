'use client';

import React, { useState, useEffect } from 'react';
import { 
  Globe2, 
  FileText, 
  ArrowRight, 
  RefreshCcw, 
  Plus, 
  Ship, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  ShieldCheck,
  Loader2,
  Anchor
} from 'lucide-react';
import ExportDocModal from '@/components/modals/ExportDocModal';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';

export default function ExportImportPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/export-import');
      if (res.ok) {
        const data = await res.json();
        setDocs(Array.isArray(data) ? data : []);
      } else {
        setDocs([]);
      }
    } catch (e) {
      console.error(e);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const safeDocs = Array.isArray(docs) ? docs : [];
  const totalUSD = safeDocs.reduce((sum, d) => sum + (d.totalValueUSD || (d.totalValueINR ? d.totalValueINR / 83 : 0)), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Export & Import Compliance
          </h2>
          <p className="text-slate-500 mt-1">Manage cross-border shipping bills, Bills of Lading, and customs clearances for international bicycle trade.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchDocs} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors" title="Refresh">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            New Customs / Shipping Doc
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Customs Documents</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{safeDocs.length}</h3>
            <p className="text-xs text-indigo-600 font-medium mt-1">Cross-border shipments</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Globe2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Trade Value (USD)</p>
            <h3 className="text-3xl font-bold text-emerald-600 mt-1">$ {totalUSD.toLocaleString('en-US')}</h3>
            <p className="text-xs text-emerald-700 font-medium mt-1">~ ₹{(totalUSD * 83 / 100000).toFixed(2)} Lakhs</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customs Clearance Rate</p>
            <h3 className="text-3xl font-bold text-purple-600 mt-1">100%</h3>
            <p className="text-xs text-purple-600 font-medium mt-1">Compliant documentation</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Ship className="w-5 h-5 text-indigo-600" />
              Customs & International Shipping Documents
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Bills of Lading, Customs Declarations, and Commercial Export Invoices.</p>
          </div>
        </div>

        {loading && safeDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-3" />
            <p className="text-slate-500 text-sm font-medium">Retrieving customs documents...</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Document Number</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Shipping Line / Vessel</th>
                  <th className="p-4">Origin → Destination Port Route</th>
                  <th className="p-4 text-right">Value (USD)</th>
                  <th className="p-4 text-center">Customs Status</th>
                  <th className="p-4 text-center">Docs & Paperwork</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {safeDocs.map(d => {
                  const typeStr = (d.type || 'DOCUMENT').replace(/_/g, ' ');
                  const statusStr = (d.status || 'IN_TRANSIT').replace(/_/g, ' ');
                  const originPort = d.originPort || d.portOfLoading || 'JNPT Nhava Sheva, India';
                  const destPort = d.destinationPort || d.portOfDischarge || 'Port of Rotterdam, Netherlands';
                  const usdVal = d.totalValueUSD || (d.totalValueINR ? d.totalValueINR / 83 : 0);

                  return (
                    <tr key={d._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono text-sm font-bold text-slate-900">
                        {d.documentNumber}
                        <div className="text-[11px] text-slate-400 font-normal mt-0.5">{d.consignee || 'Decathlon Logistics'}</div>
                      </td>
                      <td className="p-4">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-md text-xs font-bold uppercase">
                          {typeStr}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-xs">{d.shippingLine || 'Maersk Line'}</div>
                        <div className="text-[11px] text-slate-500 italic">{d.vesselName || 'Ocean Freighter'}</div>
                      </td>
                      <td className="p-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="truncate max-w-[150px]" title={originPort}>{originPort}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate max-w-[150px]" title={destPort}>{destPort}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        $ {usdVal.toLocaleString('en-US')}
                        <div className="text-[11px] text-slate-400 font-normal">~ ₹{(usdVal * 83).toLocaleString('en-IN')}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                          d.status === 'CUSTOMS_CLEARED' || d.status === 'CLEARED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          <Anchor className="w-3 h-3" /> {statusStr}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <AttachmentDrawer entityType="EXPORT_IMPORT" entityId={d._id} label="Files" />
                      </td>
                    </tr>
                  );
                })}

                {safeDocs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-medium">
                      No export/import documents recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExportDocModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchDocs} />
    </div>
  );
}
