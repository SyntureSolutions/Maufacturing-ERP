'use client';

import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  MapPin, 
  RefreshCcw, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  ExternalLink, 
  ShieldCheck, 
  ArrowRight, 
  Phone, 
  User, 
  Package, 
  Plus, 
  X, 
  FileCheck2, 
  Calendar, 
  AlertCircle,
  Layers,
  Search,
  Filter,
  Check
} from 'lucide-react';
import Link from 'next/link';

export default function SupplyChainPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'INBOUND' | 'OUTBOUND' | 'DELAYED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // Modals state
  const [selectedOrderDossier, setSelectedOrderDossier] = useState<any | null>(null);
  const [activeDelayModal, setActiveDelayModal] = useState<any | null>(null);
  const [delayForm, setDelayForm] = useState({
    delayReasonCode: 'CUSTOMS_HOLD',
    delayDetails: 'Port customs clearance inspection on imported container seal hold.',
    revisedETA: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  const [activePodModal, setActivePodModal] = useState<any | null>(null);
  const [podForm, setPodForm] = useState({
    podReceiverName: 'Suresh Patil (Dock Supervisor)',
    podReceiverPhone: '+91 98220 11982',
    podSignature: `SIG-DOCK-${Math.floor(1000 + Math.random() * 9000)}`,
    podNotes: 'Goods inspected at bay. Packaging verified and uncompromised.',
    autoGRN: true
  });

  const [selectedPodCertificate, setSelectedPodCertificate] = useState<any | null>(null);
  const [isNewShipmentModalOpen, setIsNewShipmentModalOpen] = useState(false);
  const [newShipmentForm, setNewShipmentForm] = useState({
    orderType: 'PURCHASE_ORDER',
    orderNumber: 'PO-2026-0048',
    entityName: 'Shimano Component Imports Ltd',
    type: 'INBOUND',
    carrier: 'TCI Freight Logistics',
    vehicleNumber: 'MH-12-KL-9921',
    driverName: 'Harish Rane',
    driverPhone: '+91 98221 44556',
    origin: 'JNPT Port Logistics Yard, Navi Mumbai',
    destination: 'Chakan Central Raw Material Depot, Pune',
    expectedDeliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
    shippingCost: 24000,
    items: [
      { productName: 'Shimano Deore 11-Speed Drivetrain', sku: 'CMP-DRV-001', quantity: 60, unitCost: 6000, uom: 'sets' }
    ]
  });

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/supply-chain');
      if (res.ok) setShipments(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, []);

  const safeShipments = Array.isArray(shipments) ? shipments : [];

  const filteredShipments = safeShipments.filter(s => {
    const matchesSearch = 
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.orderNumber && s.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.entityName && s.entityName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.carrier && s.carrier.toLowerCase().includes(searchTerm.toLowerCase()));

    if (filterType === 'INBOUND') return matchesSearch && s.type === 'INBOUND';
    if (filterType === 'OUTBOUND') return matchesSearch && s.type === 'OUTBOUND';
    if (filterType === 'DELAYED') return matchesSearch && s.status === 'DELAYED';
    return matchesSearch;
  });

  // Handler: Submit Delay Log
  const handleSaveDelay = async () => {
    if (!activeDelayModal) return;
    try {
      const res = await fetch('/api/supply-chain', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: activeDelayModal._id,
          action: 'LOG_DELAY',
          delayReasonCode: delayForm.delayReasonCode,
          delayDetails: delayForm.delayDetails,
          revisedETA: delayForm.revisedETA
        })
      });
      if (res.ok) {
        setNotification(`Disruption logged for ${activeDelayModal.trackingNumber}. Revised ETA updated.`);
        fetchShipments();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to log delay:', e);
    } finally {
      setActiveDelayModal(null);
    }
  };

  // Handler: Confirm Delivery & Capture POD
  const handleConfirmPOD = async () => {
    if (!activePodModal) return;
    try {
      const res = await fetch('/api/supply-chain', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: activePodModal._id,
          action: 'CAPTURE_POD',
          podReceiverName: podForm.podReceiverName,
          podReceiverPhone: podForm.podReceiverPhone,
          podSignature: podForm.podSignature,
          podNotes: podForm.podNotes,
          autoGRN: podForm.autoGRN
        })
      });
      if (res.ok) {
        const data = await res.json();
        setNotification(data.message || `Delivery confirmed & POD recorded for ${activePodModal.trackingNumber}!`);
        fetchShipments();
        setTimeout(() => setNotification(null), 4500);
      }
    } catch (e) {
      console.error('Failed to capture POD:', e);
    } finally {
      setActivePodModal(null);
    }
  };

  // Handler: Create New Shipment
  const handleCreateShipment = async () => {
    try {
      const res = await fetch('/api/supply-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShipmentForm)
      });
      if (res.ok) {
        setNotification(`Shipment created and linked to ${newShipmentForm.orderNumber}!`);
        fetchShipments();
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error('Failed to create shipment:', e);
    } finally {
      setIsNewShipmentModalOpen(false);
    }
  };

  const delayReasonLabels: { [key: string]: string } = {
    CUSTOMS_HOLD: 'Customs / Octroi Inspection Hold',
    WEATHER_ROAD_BLOCK: 'Weather Disruption / Road Blockage',
    CARRIER_BREAKDOWN: 'Carrier Vehicle Breakdown',
    TRAFFIC_CONGESTION: 'Highway Traffic Congestion',
    DOCK_CONGESTION: 'Destination Receiving Dock Full',
    DOCUMENTATION_PENDING: 'E-Way Bill or Invoice Query'
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Supply Chain & Logistics Operations
          </h2>
          <p className="text-slate-500 mt-1">
            Real-time highway tracking, reason-coded delay monitoring, digital Proof of Delivery (POD), and auto-GRN warehouse fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchShipments} 
            className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm cursor-pointer"
            title="Refresh Shipments"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsNewShipmentModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Draft New Shipment
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm font-medium animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-lg shadow-slate-900/20">
          <div className="flex justify-between items-start mb-3">
            <span className="p-3 bg-white/10 rounded-2xl text-blue-400">
              <Truck className="w-6 h-6" />
            </span>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Active In-Transit</p>
          <h3 className="text-3xl font-bold font-mono mt-1">
            {safeShipments.filter(s => s.status === 'IN_TRANSIT').length}
          </h3>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <span className="p-3 bg-slate-100 rounded-2xl text-slate-700">
              <Package className="w-6 h-6" />
            </span>
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Preparing at Dock</p>
          <h3 className="text-3xl font-bold font-mono text-slate-900 mt-1">
            {safeShipments.filter(s => s.status === 'PREPARING').length}
          </h3>
        </div>

        <div className="bg-rose-600 p-6 rounded-3xl text-white shadow-lg shadow-rose-600/20">
          <div className="flex justify-between items-start mb-3">
            <span className="p-3 bg-white/10 rounded-2xl text-white">
              <AlertTriangle className="w-6 h-6" />
            </span>
          </div>
          <p className="text-rose-100 text-xs font-bold uppercase tracking-wider">Delayed / Hold Disruptions</p>
          <h3 className="text-3xl font-bold font-mono mt-1">
            {safeShipments.filter(s => s.status === 'DELAYED').length}
          </h3>
        </div>

        <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-600/20">
          <div className="flex justify-between items-start mb-3">
            <span className="p-3 bg-white/10 rounded-2xl text-white">
              <ShieldCheck className="w-6 h-6" />
            </span>
          </div>
          <p className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Delivered with Verified POD</p>
          <h3 className="text-3xl font-bold font-mono mt-1">
            {safeShipments.filter(s => s.status === 'DELIVERED').length}
          </h3>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 relative group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
          <input 
            type="text" 
            placeholder="Search by Tracking #, PO/SO Number, Carrier, or Supplier/Customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 transition-all font-medium text-xs sm:text-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'ALL', label: 'All Shipments' },
            { id: 'INBOUND', label: 'Inbound (Suppliers)' },
            { id: 'OUTBOUND', label: 'Outbound (Customers)' },
            { id: 'DELAYED', label: 'Delayed Disruption' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterType === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shipment Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">
                <th className="px-6 py-4">Tracking # & Linked Order</th>
                <th className="px-6 py-4">Type & Carrier Details</th>
                <th className="px-6 py-4">Route & Live ETA</th>
                <th className="px-6 py-4">Status & Exception</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShipments.map(s => {
                const isDelayed = s.status === 'DELAYED';
                const isDelivered = s.status === 'DELIVERED';
                const isInTransit = s.status === 'IN_TRANSIT';

                return (
                  <tr key={s._id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Column 1: Tracking & Order Link */}
                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <span className="font-mono text-sm font-bold text-slate-900 block">{s.trackingNumber}</span>
                        
                        {/* Clickable Order Dossier Badge */}
                        <button
                          onClick={() => setSelectedOrderDossier(s)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer group/order"
                          title="Click to view full cargo itemization"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{s.orderNumber}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover/order:opacity-100" />
                        </button>
                        
                        <p className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">{s.entityName}</p>
                      </div>
                    </td>

                    {/* Column 2: Type & Fleet */}
                    <td className="px-6 py-4">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-block mb-1.5 ${
                        s.type === 'INBOUND' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {s.type} {s.type === 'INBOUND' ? '• Auto-GRN Eligible' : '• Customer Dispatch'}
                      </span>
                      <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-slate-400"/> {s.carrier}
                      </p>
                      {s.vehicleNumber && (
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Vehicle: <strong className="text-slate-700">{s.vehicleNumber}</strong>
                        </p>
                      )}
                      {s.driverName && (
                        <p className="text-[11px] text-slate-500">
                          Driver: {s.driverName} {s.driverPhone ? `(${s.driverPhone})` : ''}
                        </p>
                      )}
                    </td>

                    {/* Column 3: Route & Live ETA */}
                    <td className="px-6 py-4">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600 truncate max-w-[230px]">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{s.origin}</span>
                        </div>
                        <div className="w-0.5 h-2.5 bg-slate-200 ml-1.5 my-0.5"></div>
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium truncate max-w-[230px]">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{s.destination}</span>
                        </div>

                        {/* ETA Display */}
                        <div className="pt-2 border-t border-slate-100 mt-1.5">
                          {isDelayed && s.revisedETA ? (
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-slate-400 line-through block">
                                Orig ETA: {new Date(s.expectedDeliveryDate).toLocaleDateString()}
                              </span>
                              <span className="text-xs font-bold text-rose-600 block flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                Revised ETA: {new Date(s.revisedETA).toLocaleDateString()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-700 font-semibold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              ETA: {new Date(s.expectedDeliveryDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Column 4: Status & Delay Reason */}
                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <span className={`px-3 py-1 rounded-lg text-[11px] font-bold uppercase inline-flex items-center gap-1.5 ${
                          isDelivered ? 'bg-emerald-100 text-emerald-800' :
                          isDelayed ? 'bg-rose-100 text-rose-800 animate-pulse' : 
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {isDelivered && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {isDelayed && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                          {s.status.replace('_', ' ')}
                        </span>

                        {/* Delay reason explanation pill */}
                        {isDelayed && s.delayReasonCode && (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-900 max-w-[220px]">
                            <strong className="block font-bold">
                              {delayReasonLabels[s.delayReasonCode] || s.delayReasonCode}
                            </strong>
                            <p className="text-[11px] text-rose-700 mt-0.5 leading-tight">{s.delayDetails}</p>
                          </div>
                        )}

                        {/* Auto-GRN Success Badge */}
                        {isDelivered && s.grnGenerated && (
                          <div className="mt-1">
                            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[11px] font-bold inline-flex items-center gap-1">
                              <Layers className="w-3 h-3 text-indigo-600" /> Auto-GRN Batches Created
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Column 5: Action Controls */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Log Delay action */}
                        {isInTransit && (
                          <button
                            onClick={() => {
                              setActiveDelayModal(s);
                              setDelayForm({
                                delayReasonCode: 'TRAFFIC_CONGESTION',
                                delayDetails: 'Highway transit blockage reported.',
                                revisedETA: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                              });
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer"
                            title="Log route delay with reason code"
                          >
                            Log Delay
                          </button>
                        )}

                        {/* Complete Delivery & Capture POD */}
                        {(isInTransit || isDelayed) && (
                          <button
                            onClick={() => {
                              setActivePodModal(s);
                              setPodForm({
                                podReceiverName: s.type === 'INBOUND' ? 'Warehouse Dock Supervisor' : 'Customer Receiving Manager',
                                podReceiverPhone: '+91 98220 11982',
                                podSignature: `SIG-DOCK-${Math.floor(1000 + Math.random() * 9000)}`,
                                podNotes: 'Cargo inspected and accepted at dock.',
                                autoGRN: s.type === 'INBOUND'
                              });
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Capture POD
                          </button>
                        )}

                        {/* View Digital POD Certificate */}
                        {isDelivered && s.podSignature && (
                          <button
                            onClick={() => setSelectedPodCertificate(s)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> View POD
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredShipments.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-slate-400 font-medium">
                    No shipments found matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ORDER CARGO DOSSIER (PO / SALES ORDER BREAKDOWN) */}
      {/* ========================================================================= */}
      {selectedOrderDossier && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cargo Manifest: {selectedOrderDossier.orderNumber}
                  </h3>
                  <p className="text-xs text-slate-500">Tracking: {selectedOrderDossier.trackingNumber}</p>
                </div>
              </div>
              <button onClick={() => setSelectedOrderDossier(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Order Category:</span>
                  <strong className="text-slate-900 font-bold uppercase">{selectedOrderDossier.orderType.replace('_', ' ')}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Counterparty Entity:</span>
                  <strong className="text-slate-900 font-bold">{selectedOrderDossier.entityName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">E-Way Bill Number:</span>
                  <span className="font-mono font-bold text-indigo-600">{selectedOrderDossier.ewayBillNumber || 'EWB-294019284019'}</span>
                </div>
              </div>

              {/* Itemized Cargo Table */}
              <div className="space-y-2">
                <span className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
                  Physical Items on Vehicle
                </span>
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {selectedOrderDossier.items?.map((it: any, i: number) => (
                    <div key={i} className="p-3 bg-white flex justify-between items-center">
                      <div>
                        <strong className="font-bold text-slate-900 block">{it.productName}</strong>
                        <span className="text-[11px] font-mono text-slate-400">SKU: {it.sku || 'N/A'}</span>
                      </div>
                      <div className="text-right">
                        <strong className="text-sm font-mono font-bold text-slate-900">{it.quantity} {it.uom || 'units'}</strong>
                        {it.unitCost && (
                          <span className="text-[11px] text-slate-400 block">(@ ₹{it.unitCost.toLocaleString('en-IN')})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setSelectedOrderDossier(null)}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close Manifest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: LOG DELAY WITH REASON CODE & REVISED ETA */}
      {/* ========================================================================= */}
      {activeDelayModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Log Transit Disruption</h3>
                  <p className="text-xs text-slate-500">Tracking: {activeDelayModal.trackingNumber}</p>
                </div>
              </div>
              <button onClick={() => setActiveDelayModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Disruption Reason Code</label>
                <select
                  value={delayForm.delayReasonCode}
                  onChange={(e) => setDelayForm({ ...delayForm, delayReasonCode: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                >
                  <option value="CUSTOMS_HOLD">Customs / Octroi Inspection Hold</option>
                  <option value="TRAFFIC_CONGESTION">Highway Traffic Congestion</option>
                  <option value="CARRIER_BREAKDOWN">Carrier Vehicle Breakdown</option>
                  <option value="WEATHER_ROAD_BLOCK">Weather Disruption / Road Blockage</option>
                  <option value="DOCK_CONGESTION">Destination Receiving Dock Full</option>
                  <option value="DOCUMENTATION_PENDING">E-Way Bill or Invoice Query</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Explanation & Route Notes</label>
                <textarea
                  rows={3}
                  value={delayForm.delayDetails}
                  onChange={(e) => setDelayForm({ ...delayForm, delayDetails: e.target.value })}
                  placeholder="e.g. NH-48 road blockage near Surat checkpost due to heavy monsoon rains..."
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none resize-none font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Revised Expected Delivery Date (ETA)</label>
                <input
                  type="date"
                  value={delayForm.revisedETA}
                  onChange={(e) => setDelayForm({ ...delayForm, revisedETA: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold font-mono"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setActiveDelayModal(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleSaveDelay}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" /> Broadcast Delay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CAPTURE PROOF OF DELIVERY (POD) & AUTO-GRN */}
      {/* ========================================================================= */}
      {activePodModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Capture Proof of Delivery (POD)</h3>
                  <p className="text-xs text-slate-500">Order: {activePodModal.orderNumber} ({activePodModal.type})</p>
                </div>
              </div>
              <button onClick={() => setActivePodModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Receiver Full Name</label>
                  <input
                    type="text"
                    value={podForm.podReceiverName}
                    onChange={(e) => setPodForm({ ...podForm, podReceiverName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Receiver Phone</label>
                  <input
                    type="text"
                    value={podForm.podReceiverPhone}
                    onChange={(e) => setPodForm({ ...podForm, podReceiverPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Digital Signature / Verification Code</label>
                <input
                  type="text"
                  value={podForm.podSignature}
                  onChange={(e) => setPodForm({ ...podForm, podSignature: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold text-indigo-700"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Inspection & Cargo Notes</label>
                <textarea
                  rows={2}
                  value={podForm.podNotes}
                  onChange={(e) => setPodForm({ ...podForm, podNotes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none resize-none"
                />
              </div>

              {/* AUTO-GRN TOGGLE FOR INBOUND GOODS */}
              {activePodModal.type === 'INBOUND' && (
                <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200/80 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoGrnCheck"
                      checked={podForm.autoGRN}
                      onChange={(e) => setPodForm({ ...podForm, autoGRN: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                    />
                    <label htmlFor="autoGrnCheck" className="font-bold text-indigo-900 cursor-pointer text-xs">
                      Auto-Trigger Goods Receipt Note (GRN)
                    </label>
                  </div>
                  <p className="text-[11px] text-indigo-700 pl-6 leading-tight">
                    Instantly generates warehouse inventory batches with FEFO tracking and marks Purchase Order as received.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setActivePodModal(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleConfirmPOD}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Confirm & Archive POD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DIGITAL PROOF OF DELIVERY (POD) CERTIFICATE VIEWER */}
      {/* ========================================================================= */}
      {selectedPodCertificate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Proof of Delivery Certificate</h3>
                  <p className="text-xs text-slate-500 font-mono">Tracking: {selectedPodCertificate.trackingNumber}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPodCertificate(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Verifiable POD Certificate Paper */}
            <div className="p-5 bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-slate-200 space-y-4 text-xs">
              <div className="flex justify-between items-start pb-3 border-b border-slate-200">
                <div>
                  <span className="font-bold text-slate-900 text-sm block">DELIVERY RECEIPT VERIFICATION</span>
                  <span className="text-[11px] text-slate-400 font-mono">Ref Order: {selectedPodCertificate.orderNumber}</span>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[11px]">
                  VERIFIED LEGAL POD
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Signed Receiver</span>
                  <strong className="text-slate-900 block font-bold">{selectedPodCertificate.podReceiverName || 'Receiver'}</strong>
                  <span className="text-[11px] text-slate-500 font-mono">{selectedPodCertificate.podReceiverPhone || ''}</span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Delivery Timestamp</span>
                  <strong className="text-slate-900 block font-bold">
                    {new Date(selectedPodCertificate.podTimestamp || selectedPodCertificate.actualDeliveryDate).toLocaleString()}
                  </strong>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Digital Cryptographic Signature</span>
                <span className="font-mono text-indigo-600 font-bold block bg-indigo-50/70 p-2 rounded-lg border border-indigo-100 mt-1">
                  {selectedPodCertificate.podSignature || 'SIG-AUTHENTICATED'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Condition Notes</span>
                <p className="text-slate-700 italic mt-0.5">{selectedPodCertificate.podNotes || 'Goods accepted at dock without exceptions.'}</p>
              </div>

              {selectedPodCertificate.grnGenerated && (
                <div className="pt-2 border-t border-slate-200 text-emerald-700 font-bold text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Auto-GRN Batches Created & Credited to Stock Ledger.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setSelectedPodCertificate(null)}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DRAFT NEW SHIPMENT */}
      {/* ========================================================================= */}
      {isNewShipmentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create New Shipment Tracking</h3>
                  <p className="text-xs text-slate-500">Link directly to Purchase Order or Sales Order</p>
                </div>
              </div>
              <button onClick={() => setIsNewShipmentModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Shipment Direction</label>
                  <select
                    value={newShipmentForm.type}
                    onChange={(e) => setNewShipmentForm({ 
                      ...newShipmentForm, 
                      type: e.target.value,
                      orderType: e.target.value === 'INBOUND' ? 'PURCHASE_ORDER' : 'SALES_ORDER'
                    })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  >
                    <option value="INBOUND">INBOUND (From Supplier)</option>
                    <option value="OUTBOUND">OUTBOUND (To Customer)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Order Number</label>
                  <input
                    type="text"
                    value={newShipmentForm.orderNumber}
                    onChange={(e) => setNewShipmentForm({ ...newShipmentForm, orderNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Counterparty Name (Supplier / Customer)</label>
                <input
                  type="text"
                  value={newShipmentForm.entityName}
                  onChange={(e) => setNewShipmentForm({ ...newShipmentForm, entityName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Carrier</label>
                  <input
                    type="text"
                    value={newShipmentForm.carrier}
                    onChange={(e) => setNewShipmentForm({ ...newShipmentForm, carrier: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Vehicle Number</label>
                  <input
                    type="text"
                    value={newShipmentForm.vehicleNumber}
                    onChange={(e) => setNewShipmentForm({ ...newShipmentForm, vehicleNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Origin Location</label>
                  <input
                    type="text"
                    value={newShipmentForm.origin}
                    onChange={(e) => setNewShipmentForm({ ...newShipmentForm, origin: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Destination</label>
                  <input
                    type="text"
                    value={newShipmentForm.destination}
                    onChange={(e) => setNewShipmentForm({ ...newShipmentForm, destination: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Expected Delivery Date (ETA)</label>
                <input
                  type="date"
                  value={newShipmentForm.expectedDeliveryDate}
                  onChange={(e) => setNewShipmentForm({ ...newShipmentForm, expectedDeliveryDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsNewShipmentModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">
                Cancel
              </button>
              <button
                onClick={handleCreateShipment}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Save Shipment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
