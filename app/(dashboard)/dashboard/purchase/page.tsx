'use client';

import Link from 'next/link';
import LineageDrawer from '@/components/common/LineageDrawer';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  MoreVertical, 
  ChevronRight,
  RefreshCcw,
  Loader2,
  AlertCircle,
  Truck,
  CheckCircle2,
  Clock,
  Ban,
  ShieldCheck,
  Package,
  Calendar,
  AlertTriangle,
  Bot,
  UserCheck,
  Check,
  X,
  FileCheck,
  FileText,
  DollarSign,
  BadgeCheck,
  TrendingDown,
  Printer,
  Sparkles,
  Layers,
  Filter,
  Sliders,
  Lock
} from 'lucide-react';
import PurchaseOrderModal from '@/components/modals/PurchaseOrderModal';
import ReceiveGoodsModal from '@/components/modals/ReceiveGoodsModal';
import PurchaseQuotationModal from '@/components/modals/PurchaseQuotationModal';
import FinanceNegotiationModal from '@/components/modals/FinanceNegotiationModal';
import FinalPriceLetterModal from '@/components/modals/FinalPriceLetterModal';
import ApprovalThresholdsModal from '@/components/modals/ApprovalThresholdsModal';

export default function PurchasePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState<'ALL' | 'PENDING' | 'IN_NEGOTIATION' | 'AGREED' | 'ORDERED' | 'RECEIVED'>('ALL');
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isNegotiationModalOpen, setIsNegotiationModalOpen] = useState(false);
  const [isFinalPriceModalOpen, setIsFinalPriceModalOpen] = useState(false);
  const [isThresholdsModalOpen, setIsThresholdsModalOpen] = useState(false);
  const [thresholds, setThresholds] = useState<any>(null);

  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('MANAGER');

  const isFinanceManager = userRole === 'FINANCE_MANAGER' || userRole === 'ADMIN';

  const fetchPOs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/purchase');
      if (res.ok) {
        const data = await res.json();
        setPos(data);
      } else {
        setError('Failed to load purchase orders');
      }
    } catch (err) {
      setError('An error occurred while fetching purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchThresholds = async () => {
    try {
      const res = await fetch('/api/settings/approval-thresholds');
      if (res.ok) {
        setThresholds(await res.json());
      }
    } catch (e) {}
  };

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const { user } = await sessionRes.json();
          setUserRole(user?.role || 'MANAGER');
        }
      } catch (e) {}
      fetchThresholds();
      fetchPOs();
    };
    init();
  }, []);

  const handleCreatePO = () => {
    setSelectedPO(null);
    setIsPOModalOpen(true);
  };

  const handleReceivePO = (po: any) => {
    // Receiving now goes through the GRN gate (quarantine -> QC -> put-away)
    window.location.href = `/dashboard/transactions/grn?po=${po._id}`;
  };

  const handleOpenQuotation = (po: any) => {
    setSelectedPO(po);
    setIsQuotationModalOpen(true);
  };

  const handleOpenNegotiation = (po: any) => {
    setSelectedPO(po);
    setIsNegotiationModalOpen(true);
  };

  const handleOpenFinalPriceLetter = (po: any) => {
    setSelectedPO(po);
    setIsFinalPriceModalOpen(true);
  };

  // Sign off & Approve PO spend with dynamic role tier checking
  const handleApprovePO = async (poId: string) => {
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_STATUS', poId, newStatus: 'ORDERED' })
      });
      if (res.ok) {
        setPos(prev => prev.map(p => p._id === poId ? { ...p, status: 'ORDERED' } : p));
        setNotification('Purchase Order spend approved! Status moved to ORDERED.');
        setTimeout(() => setNotification(null), 4000);
        fetchPOs();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to approve Purchase Order');
        setTimeout(() => setError(''), 6000);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while approving Purchase Order');
    }
  };

  // Record Partial Receipt
  const handlePartialReceivePO = async (poId: string) => {
    // Receipts are recorded on the GRN screen; the PO status then follows the quantities received.
    window.location.href = `/dashboard/transactions/grn?po=${poId}`;
  };

  const filteredPOs = pos.filter(po => {
    const matchesSearch = 
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (po.supplier && po.supplier.name && po.supplier.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (filterStage === 'PENDING') return po.status === 'PENDING_APPROVAL';
    if (filterStage === 'IN_NEGOTIATION') return po.negotiationStatus === 'IN_NEGOTIATION';
    if (filterStage === 'AGREED') return po.negotiationStatus === 'AGREED';
    if (filterStage === 'ORDERED') return po.status === 'ORDERED';
    if (filterStage === 'RECEIVED') return po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED';

    return true;
  });

  // Calculate Finance Negotiation Metrics
  const totalOriginalProcurement = pos.reduce((sum, p) => sum + (p.originalAmount || p.totalAmount || 0), 0);
  const totalAgreedSavings = pos.reduce((sum, p) => sum + (p.savingsAmount || 0), 0);
  const totalAgreedPOs = pos.filter(p => p.negotiationStatus === 'AGREED').length;
  const inNegotiationPOs = pos.filter(p => p.negotiationStatus === 'IN_NEGOTIATION').length;

  const fmtDate = (d?: string | number | Date) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const PILL = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold';
  const getStatusBadge = (po: any) => {
    switch (po.status) {
      case 'DRAFT':
        return <span className={`${PILL} border-slate-200 bg-slate-100 text-slate-600`}><Clock className="h-3.5 w-3.5" /> Draft</span>;
      case 'PENDING_APPROVAL':
        return <span className={`${PILL} border-amber-200 bg-amber-50 text-amber-800`}><ShieldCheck className="h-3.5 w-3.5" /> Pending approval</span>;
      case 'ORDERED':
        return <span className={`${PILL} border-blue-200 bg-blue-50 text-blue-700`}><Truck className="h-3.5 w-3.5" /> Ordered</span>;
      case 'PARTIALLY_RECEIVED':
        return <span className={`${PILL} border-violet-200 bg-violet-50 text-violet-700`}><Package className="h-3.5 w-3.5" /> Partially received</span>;
      case 'RECEIVED':
        return <span className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" /> Fully received</span>;
      case 'CANCELLED':
        return <span className={`${PILL} border-red-200 bg-red-50 text-red-700`}><Ban className="h-3.5 w-3.5" /> Cancelled</span>;
      default:
        return null;
    }
  };

  const getNegotiationBadge = (po: any) => {
    if (po.negotiationStatus === 'AGREED') {
      return <span className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`}><BadgeCheck className="h-3 w-3" /> Price agreed · −{po.savingsPercentage || 0}%</span>;
    }
    if (po.negotiationStatus === 'IN_NEGOTIATION') {
      return <span className={`${PILL} border-amber-200 bg-amber-50 text-amber-800`}><Clock className="h-3 w-3" /> In negotiation</span>;
    }
    return null;
  };

  // Vendor on-time-delivery (OTD) for a received PO
  const getDeliveryOnTimeBadge = (expectedStr?: string, actualStr?: string) => {
    if (!actualStr) return null;
    if (!expectedStr) return <span className={`${PILL} border-slate-200 bg-slate-50 text-slate-500`}>Delivery recorded</span>;
    const expected = new Date(expectedStr).getTime();
    const actual = new Date(actualStr).getTime();
    if (actual <= expected) {
      return <span className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`}><Check className="h-3 w-3" /> On time</span>;
    }
    const daysLate = Math.ceil((actual - expected) / (1000 * 60 * 60 * 24));
    return <span className={`${PILL} border-red-200 bg-red-50 text-red-700`}><AlertCircle className="h-3 w-3" /> {daysLate} {daysLate === 1 ? 'day' : 'days'} late</span>;
  };

  return (
    <div className="ui-page">
      {/* Title panel with the page toolbar */}
      <div className="page-header">
        <div>
          <h1>Purchase Orders</h1>
          <p>Spend approvals, supplier quotations, price negotiations, receipts and on-time delivery.{isFinanceManager ? ' Finance Manager access.' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={fetchPOs} className="btn btn-secondary" title="Refresh orders"><RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          {isFinanceManager && <button onClick={() => setIsThresholdsModalOpen(true)} className="btn btn-secondary" title="Value-based approval limits"><Sliders className="w-4 h-4" /> Approval limits</button>}
          <button onClick={handleCreatePO} className="btn btn-primary"><Plus className="w-4 h-4" /> Create</button>
        </div>
      </div>

      {/* Negotiation figures (Finance Manager) */}
      {isFinanceManager && (
        <div className="card flex flex-wrap items-center gap-x-10 gap-y-3">
          <div><div className="text-[13px] text-[var(--erp-muted)]">Vendor price negotiation</div><div className="text-sm">Counter-offers on open POs; download the price agreement letter once settled.</div></div>
          <div className="ml-auto flex gap-10">
            <div><div className="text-[13px] text-[var(--erp-muted)]">Total savings</div><div className="text-2xl font-light text-[var(--erp-positive)] num">₹{totalAgreedSavings.toLocaleString('en-IN')}</div></div>
            <div><div className="text-[13px] text-[var(--erp-muted)]">In negotiation</div><div className="text-2xl font-light text-[var(--erp-critical)] num">{inNegotiationPOs}</div></div>
            <div><div className="text-[13px] text-[var(--erp-muted)]">Agreed</div><div className="text-2xl font-light text-[var(--erp-accent)] num">{totalAgreedPOs}</div></div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm font-medium animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex-1 w-full relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search by PO number or supplier name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-amber-500 transition-all text-xs sm:text-sm font-medium"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { key: 'ALL', label: 'All Orders' },
            { key: 'PENDING', label: 'Pending Approval' },
            { key: 'IN_NEGOTIATION', label: 'In Negotiation' },
            { key: 'AGREED', label: 'Price Agreed' },
            { key: 'ORDERED', label: 'Ordered' },
            { key: 'RECEIVED', label: 'Received' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStage(tab.key as any)}
              className={`tab ${filterStage === tab.key ? 'tab-active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {loading && pos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-lg">Loading purchase orders...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3.5 whitespace-nowrap">PO number</th>
                  <th className="px-5 py-3.5 whitespace-nowrap">Supplier</th>
                  <th className="px-5 py-3.5 whitespace-nowrap">Delivery</th>
                  <th className="px-5 py-3.5 whitespace-nowrap">Amount</th>
                  <th className="px-5 py-3.5 whitespace-nowrap">Status</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 [&>tr>td]:align-middle">
                {filteredPOs.length > 0 ? (
                  filteredPOs.map((po) => {
                    const totalQty = po.items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0;
                    const recQty = po.items?.reduce((s: number, i: any) => s + (i.receivedQuantity || 0), 0) || 0;
                    const isNegotiated = po.negotiationStatus === 'AGREED';
                    const hasNegotiationInFlight = po.negotiationStatus === 'IN_NEGOTIATION';

                    return (
                      <tr key={po._id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* PO Number & Origin Badge */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition-colors shrink-0">
                              <ShoppingCart className="w-5 h-5" />
                            </div>
                            <div>
                              {/^[a-f0-9]{24}$/.test(String(po._id))
                                ? <Link href={`/dashboard/purchase/${po._id}`} className="text-sm font-semibold text-[var(--erp-accent)] hover:underline num whitespace-nowrap">{po.poNumber}</Link>
                                : <p className="text-sm font-semibold text-slate-900 num whitespace-nowrap">{po.poNumber}</p>}

                              {/* MRP vs Manual Origin Badge */}
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                {po.sourceType === 'MRP_AUTO' || po.mrpRun ? (
                                  <span className={`${PILL} border-indigo-200 bg-indigo-50 text-indigo-700`}>
                                    <Bot className="h-3 w-3" /> Auto (MRP)
                                  </span>
                                ) : (
                                  <span className={`${PILL} border-slate-200 bg-slate-50 text-slate-600`}>
                                    <UserCheck className="h-3 w-3" /> Manual
                                  </span>
                                )}

                                {getNegotiationBadge(po)}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Supplier */}
                        <td className="px-5 py-4 min-w-[180px]">
                          <p className="text-sm font-semibold text-slate-900">{po.supplier?.name || 'Supplier'}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{po.supplier?.code || 'SUP-001'}</p>
                        </td>

                        {/* Order & expected delivery (vendor OTD) */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <dl className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <dt className="w-14 text-slate-500">Ordered</dt>
                              <dd className="font-medium text-slate-800 num">{fmtDate(po.orderDate)}</dd>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-amber-500" />
                              <dt className="w-14 text-slate-500">Expected</dt>
                              <dd className="font-semibold text-amber-700 num">{po.expectedDeliveryDate ? fmtDate(po.expectedDeliveryDate) : <span className="font-normal text-slate-400">Not set</span>}</dd>
                            </div>
                          </dl>
                          {po.receivedDate && <div className="mt-2">{getDeliveryOnTimeBadge(po.expectedDeliveryDate, po.receivedDate)}</div>}
                        </td>

                        {/* Amount & receipt progress */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {isNegotiated && po.originalAmount && po.originalAmount > po.totalAmount ? (
                            <div className="space-y-1">
                              <div className="text-xs text-slate-400 line-through num">₹{po.originalAmount.toLocaleString('en-IN')}</div>
                              <div className="text-base font-bold text-emerald-700 num tracking-tight">₹{po.totalAmount?.toLocaleString('en-IN')}</div>
                              <span className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`}>Saved ₹{(po.savingsAmount || 0).toLocaleString('en-IN')}</span>
                            </div>
                          ) : (
                            <p className="text-base font-bold text-slate-900 num tracking-tight">₹{po.totalAmount?.toLocaleString('en-IN')}</p>
                          )}
                          <p className="mt-1.5 text-xs text-slate-500">
                            {po.status === 'PARTIALLY_RECEIVED' ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                                <Package className="h-3.5 w-3.5" /> {recQty} of {totalQty} received · {totalQty - recQty} pending
                              </span>
                            ) : (
                              <span>{po.items?.length || 1} {(po.items?.length || 1) === 1 ? 'item' : 'items'} · {totalQty} units</span>
                            )}
                          </p>
                        </td>

                        {/* Status & Approval Gate Controls */}
                        <td className="px-5 py-4 min-w-[190px]">
                          <div className="space-y-2">
                            <div>{getStatusBadge(po)}</div>
                            {po.payment && po.payment.status !== 'NOT_BILLED' && (
                              <div className="text-[11px] font-semibold">
                                <span className={`rounded-full px-2 py-0.5 ${po.payment.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : po.payment.status === 'PARTIALLY_PAID' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{po.payment.status === 'PAID' ? 'Paid' : po.payment.status === 'PARTIALLY_PAID' ? 'Part paid' : 'Unpaid'}</span>
                                {po.payment.fullyBilled === false && <span className="ml-1.5 text-slate-500">more to bill</span>}
                              </div>)}

                            {/* Dynamic Value-Based Approval Tiering */}
                            {po.status === 'PENDING_APPROVAL' && (() => {
                              const scLimit = thresholds?.poSupplyChainLimit ?? 50000;
                              const finLimit = thresholds?.poFinanceLimit ?? 500000;
                              const amt = po.totalAmount || 0;
                              
                              const requiresAdmin = amt > finLimit;
                              const requiresFinance = amt > scLimit && !requiresAdmin;
                              
                              const canApprove = requiresAdmin 
                                ? userRole === 'ADMIN'
                                : requiresFinance 
                                ? ['ADMIN', 'FINANCE_MANAGER'].includes(userRole)
                                : ['ADMIN', 'FINANCE_MANAGER', 'MANAGER', 'SUPPLY_CHAIN_MANAGER'].includes(userRole);

                              return (
                                <div className="space-y-2">
                                  <div>
                                    {requiresAdmin ? (
                                      <span className={`${PILL} border-rose-200 bg-rose-50 text-rose-700`}>
                                        <Lock className="h-3 w-3" /> Tier 3 · Admin approval
                                      </span>
                                    ) : requiresFinance ? (
                                      <span className={`${PILL} border-amber-200 bg-amber-50 text-amber-800`}>
                                        <ShieldCheck className="h-3 w-3" /> Tier 2 · CFO sign-off
                                      </span>
                                    ) : (
                                      <span className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`}>
                                        <Check className="h-3 w-3" /> Tier 1 · Supply chain
                                      </span>
                                    )}
                                  </div>

                                  {canApprove ? (
                                    <button
                                      onClick={() => handleApprovePO(po._id)}
                                      className="btn btn-sm btn-accent"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5" /> Approve · {requiresAdmin ? 'Admin' : requiresFinance ? 'CFO' : 'Supply chain'}
                                    </button>
                                  ) : (
                                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                      <Lock className="h-3 w-3" /> Awaiting {requiresAdmin ? 'Admin' : 'CFO'} clearance
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </td>

                        {/* Actions & Letters */}
                        <td className="px-5 py-4 text-right min-w-[280px]">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {po._id && !String(po._id).startsWith('po-') && (<><LineageDrawer type="PURCHASE_ORDER" id={po._id} label="Chain" /><AttachmentDrawer entityType="PURCHASE_ORDER" entityId={po._id} label="Files" /></>)}

                            {/* 1. Official Quotation / Pro-Forma Invoice Letter Download Option */}
                            <button
                              onClick={() => handleOpenQuotation(po)}
                              className="btn btn-sm btn-secondary"
                              title="View & Download Official Purchase Quotation / Invoice Letter"
                            >
                              <FileText className="h-3.5 w-3.5 text-amber-600" />
                              <span>Quotation letter</span>
                            </button>

                            {/* 2. Finance Manager Only: Price Negotiation Action Button */}
                            {isFinanceManager && (
                              <button
                                onClick={() => handleOpenNegotiation(po)}
                                className={`btn btn-sm btn-secondary ${isNegotiated ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : hasNegotiationInFlight ? 'text-amber-800 border-amber-200 bg-amber-50' : ''}`}
                                title="Open Finance Price Negotiation Desk"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                                <span>{isNegotiated ? 'Negotiated' : hasNegotiationInFlight ? 'Negotiating' : 'Negotiate price'}</span>
                              </button>
                            )}

                            {/* 3. Final Price Letter Download (Available after negotiation agreement!) */}
                            {isNegotiated && (
                              <button
                                onClick={() => handleOpenFinalPriceLetter(po)}
                                className="btn btn-sm btn-secondary"
                                title="Download Negotiated Final Price Settlement Letter"
                              >
                                <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Final price letter</span>
                              </button>
                            )}

                            {/* GRN Receipt Actions */}
                            {po.status === 'ORDERED' && (
                              <>
                                <button 
                                  onClick={() => handleReceivePO(po)}
                                  className="btn btn-sm btn-success"
                                >
                                  Receive goods <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}

                            {po.status === 'PARTIALLY_RECEIVED' && (
                              <button 
                                onClick={() => handleReceivePO(po)}
                                className="btn btn-sm btn-success"
                              >
                                Receive pending <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-400 bg-white">
                      No purchase orders found matching current search/filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PO Creation / Edit Modal */}
      <PurchaseOrderModal 
        isOpen={isPOModalOpen} 
        onClose={() => setIsPOModalOpen(false)} 
        onSuccess={fetchPOs}
        po={selectedPO}
      />

      {/* Goods Receipt Note (GRN) Modal */}
      <ReceiveGoodsModal 
        isOpen={isReceiveModalOpen} 
        onClose={() => setIsReceiveModalOpen(false)} 
        onSuccess={fetchPOs}
        po={selectedPO}
      />

      {/* 1. Official Purchase Quotation / Pro-Forma Invoice Letter Modal */}
      <PurchaseQuotationModal
        isOpen={isQuotationModalOpen}
        onClose={() => setIsQuotationModalOpen(false)}
        po={selectedPO}
      />

      {/* 2. Finance Manager Price Negotiation Modal */}
      <FinanceNegotiationModal
        isOpen={isNegotiationModalOpen}
        onClose={() => setIsNegotiationModalOpen(false)}
        po={selectedPO}
        onSuccess={fetchPOs}
      />

      {/* 3. Official Negotiated Final Price Settlement Letter Modal */}
      <FinalPriceLetterModal
        isOpen={isFinalPriceModalOpen}
        onClose={() => setIsFinalPriceModalOpen(false)}
        po={selectedPO}
      />

      {/* 4. Dynamic Approval Thresholds Policy Configuration Modal */}
      <ApprovalThresholdsModal
        isOpen={isThresholdsModalOpen}
        onClose={() => setIsThresholdsModalOpen(false)}
        onSuccess={() => {
          fetchThresholds();
          fetchPOs();
        }}
      />
    </div>
  );
}
