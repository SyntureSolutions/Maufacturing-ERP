'use client';

import EnquiryModal from '@/components/modals/EnquiryModal';
import React, { useState, useEffect } from 'react';
import LossAnalytics from '@/components/common/LossAnalytics';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';
import LineageDrawer from '@/components/common/LineageDrawer';
import SalesOrderApprovalDialog from '@/components/common/SalesOrderApprovalDialog';
import {
  Inbox,
  Kanban,
  PackageCheck,
  Plus,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  RefreshCcw,
  FileText,
  DollarSign,
  Building2,
  Bike,
  ChevronRight,
  XCircle,
  AlertCircle,
  Send,
  UserCheck,
  Layers,
  Filter,
  Check,
  Lock,
  Calendar,
  X,
  SlidersHorizontal,
  ShieldAlert
} from 'lucide-react';
import ProformaInvoiceModal from '@/components/modals/ProformaInvoiceModal';

export default function SalesWorkspacePage() {
  const [activeBlock, setActiveBlock] = useState<1 | 2 | 3>(2); // Default to Block 2 (Kanban)
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Global Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<string>('ALL_TIME');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modals state
  const [isNewEnquiryOpen, setIsNewEnquiryOpen] = useState(false);
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const [creditGateModal, setCreditGateModal] = useState<{ open: boolean; quote: any; stage: string }>({ open: false, quote: null, stage: '' });
  const [lossModalQuote, setLossModalQuote] = useState<any | null>(null);
  const [lossCategory, setLossCategory] = useState('PRICE');
  const [lossReason, setLossReason] = useState('');
  const [selectedProformaOrder, setSelectedProformaOrder] = useState<any | null>(null);
  const [isProformaOpen, setIsProformaOpen] = useState(false);
  const [poNumberInput, setPoNumberInput] = useState('');
  const [bypassCreditCheck, setBypassCreditCheck] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [approveSo, setApproveSo] = useState<any | null>(null); // order open in the approval dialog
  const [role, setRole] = useState('');
  useEffect(() => { fetch('/api/auth/session').then(r => r.json()).then(s => setRole(s?.user?.role || '')).catch(() => {}); }, []);

  // New Enquiry Form

  // New Quote Form
  const [quoteCustomer, setQuoteCustomer] = useState('');
  const [quoteBike, setQuoteBike] = useState('Apex Urban Commuter Bicycle');
  const [customBikeName, setCustomBikeName] = useState('');
  const [quoteQty, setQuoteQty] = useState(30);
  const [quotePrice, setQuotePrice] = useState(18500);

  const BICYCLE_PRESETS = [
    { name: 'Apex Urban Commuter Bicycle', price: 18500 },
    { name: 'Velocity Trail Mountain Bike 29er', price: 32000 },
    { name: 'E-Glide Electric Hybrid Bike 250W', price: 48000 },
    { name: 'AeroPro Carbon Road Bike', price: 65000 },
    { name: 'CUSTOM_MODEL', price: 25000 },
  ];

  const handleBikeSelect = (selected: string) => {
    setQuoteBike(selected);
    const found = BICYCLE_PRESETS.find(p => p.name === selected);
    if (found && selected !== 'CUSTOM_MODEL') {
      setQuotePrice(found.price);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [enqRes, quoteRes, soRes] = await Promise.all([
        fetch('/api/enquiries'),
        fetch('/api/quotations'),
        fetch('/api/sales-orders'),
      ]);

      if (enqRes.ok) setEnquiries(await enqRes.json());
      if (quoteRes.ok) setQuotations(await quoteRes.json());
      if (soRes.ok) setSalesOrders(await soRes.json());
    } catch (err) {
      console.error('Failed to fetch sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const updateBlockFromUrl = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const b = params.get('block');
        if (b === '1') setActiveBlock(1);
        else if (b === '2') setActiveBlock(2);
        else if (b === '3') setActiveBlock(3);
      }
    };
    updateBlockFromUrl();
    const handleNavigation = () => setTimeout(updateBlockFromUrl, 50);
    window.addEventListener('popstate', updateBlockFromUrl);
    window.addEventListener('click', handleNavigation);
    return () => {
      window.removeEventListener('popstate', updateBlockFromUrl);
      window.removeEventListener('click', handleNavigation);
    };
  }, []);

  // Filter Logic: Date Range Check
  const isWithinDateRange = (itemDateStr: string) => {
    if (!itemDateStr || dateRange === 'ALL_TIME') return true;
    const itemDate = new Date(itemDateStr);
    const now = new Date();

    if (dateRange === 'TODAY') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (dateRange === 'LAST_7_DAYS') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= sevenDaysAgo;
    }
    if (dateRange === 'LAST_30_DAYS') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return itemDate >= thirtyDaysAgo;
    }
    if (dateRange === 'CUSTOM') {
      if (startDate && new Date(startDate) > itemDate) return false;
      if (endDate && new Date(endDate + 'T23:59:59') < itemDate) return false;
      return true;
    }
    return true;
  };

  // Filtered Quotations
  const filteredQuotations = quotations.filter((q) => {
    const matchesSearch =
      q.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.quoteNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.poNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.enquiryRef?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStage = selectedStage === 'ALL' || q.stage === selectedStage || 
      (selectedStage === 'QUOTATION SENT' && (q.stage === 'QUOTATION SENT' || q.stage === 'QUOTATION_SENT'));

    const matchesDate = isWithinDateRange(q.createdAt || q.updatedAt);

    return matchesSearch && matchesStage && matchesDate;
  });

  // Filtered Enquiries
  const filteredEnquiries = enquiries.filter((enq) => {
    const matchesSearch =
      enq.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enq.enquiryNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = selectedStage === 'ALL' || enq.status === selectedStage;
    const matchesDate = isWithinDateRange(enq.createdAt);
    return matchesSearch && matchesStage && matchesDate;
  });

  // Filtered Sales Orders
  const filteredSalesOrders = salesOrders.filter((so) => {
    const matchesSearch =
      so.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      so.soNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      so.poNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = selectedStage === 'ALL' || so.status === selectedStage;
    const matchesDate = isWithinDateRange(so.createdAt);
    return matchesSearch && matchesStage && matchesDate;
  });

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedStage('ALL');
    setDateRange('ALL_TIME');
    setStartDate('');
    setEndDate('');
  };

  const handleConvertEnquiry = async (enquiryId: string) => {
    try {
      const res = await fetch(`/api/enquiries/${enquiryId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitPrice: 18500 }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(data.message);
        fetchAllData();
        setActiveBlock(2); // Jump to Kanban
      }
    } catch (err) {
      console.error('Convert enquiry failed:', err);
    }
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalBikeName = quoteBike === 'CUSTOM_MODEL' ? (customBikeName || 'Custom Bicycle Unit') : quoteBike;
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: quoteCustomer,
          items: [{ productName: finalBikeName, quantity: Number(quoteQty), unitPrice: Number(quotePrice), totalPrice: Number(quoteQty) * Number(quotePrice) }],
          totalAmount: Number(quoteQty) * Number(quotePrice),
          paymentTerms: 'NET 30',
        }),
      });
      if (res.ok) {
        setIsNewQuoteOpen(false);
        setActionNotice('New B2B Quotation created in ENQUIRY RECEIVED stage!');
        setQuoteCustomer('');
        setCustomBikeName('');
        fetchAllData();
      }
    } catch (err) {
      console.error('Create quote error:', err);
    }
  };

  const handleStageMoveRequest = (quote: any, targetStage: string) => {
    if (targetStage === 'LOST_DECLINED') {
      setLossModalQuote(quote);
      setLossCategory('PRICE');
      setLossReason('');
      return;
    }
    if (targetStage === 'PO_RECEIVED') {
      setCreditGateModal({ open: true, quote, stage: targetStage });
      setPoNumberInput(quote.poNumber || `PO-${Date.now().toString().slice(-6)}`);
    } else {
      executeStageMove(quote._id, targetStage);
    }
  };

  const submitLostQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lossModalQuote || !lossReason.trim()) return;
    try {
      const res = await fetch(`/api/quotations/${lossModalQuote._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'LOST_DECLINED', lossCategory, lossReason: lossReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to mark quotation lost'); return; }
      setLossModalQuote(null);
      setActionNotice(data.message);
      fetchAllData();
    } catch (err) { console.error('Mark quotation lost failed:', err); }
  };

  const executeStageMove = async (quoteId: string, targetStage: string, poNo?: string, bypass?: boolean) => {
    try {
      const res = await fetch(`/api/quotations/${quoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: targetStage,
          poNumber: poNo,
          bypassCreditCheck: bypass,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(data.message);
        setCreditGateModal({ open: false, quote: null, stage: '' });
        fetchAllData();
      } else {
        alert(data.error || 'Failed to update quotation stage');
      }
    } catch (err) {
      console.error('Move stage error:', err);
    }
  };

  const handleApproveSalesOrder = (soId: string) => setApproveSo(salesOrders.find(so => so._id === soId) || { _id: soId });

  const handleRequestTaxInvoiceFromFinance = async (order: any) => {
    const orderId = order._id || order.soNumber || order.quoteNumber;
    const soNo = order.soNumber || order.quoteNumber || 'Order';
    const cust = order.customerName || 'Customer';

    // 1. Instant Optimistic State Update
    setSalesOrders(prev => prev.map(so => (so._id === orderId || so.soNumber === orderId || so.quotationRef === orderId) ? { ...so, taxInvoiceStatus: 'REQUESTED' } : so));
    setActionNotice(`⚡ Tax invoice officially requested for ${soNo} (${cust})! Placed in Finance Central Billing Queue.`);

    // 2. Broadcast to Finance Manager page immediately
    try {
      if (typeof window !== 'undefined') {
        const channel = new BroadcastChannel('erp_sales_finance_events');
        channel.postMessage({
          type: 'TAX_INVOICE_REQUESTED',
          orderId,
          soNumber: soNo,
          customerName: cust,
          totalAmount: order.totalAmount,
          timestamp: Date.now()
        });
        channel.close();

        localStorage.setItem('erp_tax_invoice_requested_ping', JSON.stringify({
          orderId,
          soNumber: soNo,
          customerName: cust,
          totalAmount: order.totalAmount,
          timestamp: Date.now()
        }));
      }
    } catch (e) {}

    try {
      const res = await fetch('/api/sales/proforma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REQUEST_TAX_INVOICE',
          salesOrderId: orderId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchAllData();
      } else {
        alert(data.error || 'Failed to request tax invoice');
      }
    } catch (err) {
      console.error('Request tax invoice error:', err);
    }
  };

  // Kanban Columns Mapping
  const ALL_KANBAN_STAGES = [
    { key: 'ENQUIRY_RECEIVED', label: '1. ENQUIRY RECEIVED', color: 'border-slate-300 bg-slate-50/50', badge: 'bg-slate-100 text-slate-700' },
    { key: 'QUOTATION SENT', label: '2. QUOTATION SENT', color: 'border-blue-200 bg-blue-50/20', badge: 'bg-blue-100 text-blue-800' },
    { key: 'UNDER_REVIEW', label: '3. UNDER REVIEW (CLIENT)', color: 'border-amber-200 bg-amber-50/20', badge: 'bg-amber-100 text-amber-900' },
    { key: 'PO_RECEIVED', label: '4. PO RECEIVED (WON)', color: 'border-emerald-200 bg-emerald-50/30', badge: 'bg-emerald-100 text-emerald-800' },
    { key: 'LOST_DECLINED', label: '5. LOST / DECLINED', color: 'border-red-200 bg-red-50/20', badge: 'bg-red-100 text-red-700' },
  ];

  const visibleKanbanStages = selectedStage === 'ALL'
    ? ALL_KANBAN_STAGES
    : ALL_KANBAN_STAGES.filter(s => s.key === selectedStage || (selectedStage === 'QUOTATION SENT' && (s.key === 'QUOTATION SENT' || s.key === 'QUOTATION_SENT')));

  const hasActiveFilters = searchTerm !== '' || selectedStage !== 'ALL' || dateRange !== 'ALL_TIME' || startDate !== '' || endDate !== '';

  return (
    <div className="space-y-6">
      {approveSo && <SalesOrderApprovalDialog order={approveSo} role={role} onClose={() => setApproveSo(null)} onDone={text => { setApproveSo(null); setActionNotice(text); fetchAllData(); }} />}
      <LossAnalytics refreshKey={quotations} />
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">3-Tier Sales & Fulfillment Workspace</h2>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">Enterprise B2B Engine</span>
          </div>
          <p className="text-slate-500 mt-1">Sequential commercial lifecycle: Raw Intake Queue ➔ Quotation Kanban ➔ SO Order Processing & FEFO Fulfillment</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAllData}
            className="p-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
            title="Refresh Workspace"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsNewEnquiryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            New Intake Enquiry
          </button>
          <button
            onClick={() => setIsNewQuoteOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-all shadow-md shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" />
            New B2B Quotation
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="font-semibold text-sm">{actionNotice}</p>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold text-xs">Dismiss</button>
        </div>
      )}

      {/* 3-STEPPER WORKFLOW NAVIGATION HEADER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1 */}
        <button
          onClick={() => setActiveBlock(1)}
          className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
            activeBlock === 1
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.01]'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeBlock === 1 ? 'text-amber-400' : 'text-slate-400'}`}>
              Block 1 • Intake Queue
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${activeBlock === 1 ? 'bg-slate-800 text-amber-400' : 'bg-slate-100 text-slate-700'}`}>
              {filteredEnquiries.length} Enquiries
            </span>
          </div>
          <h3 className="text-lg font-bold mt-2 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-amber-500" />
            1. Lead Capture & Qualification
          </h3>
          <p className={`text-xs mt-1 leading-relaxed ${activeBlock === 1 ? 'text-slate-300' : 'text-slate-500'}`}>
            Pre-pipeline intake for raw incoming web/email enquiries before qualification.
          </p>
        </button>

        {/* Step 2 */}
        <button
          onClick={() => setActiveBlock(2)}
          className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
            activeBlock === 2
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.01]'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeBlock === 2 ? 'text-amber-400' : 'text-slate-400'}`}>
              Block 2 • Sales Pipeline
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${activeBlock === 2 ? 'bg-slate-800 text-amber-400' : 'bg-slate-100 text-slate-700'}`}>
              {filteredQuotations.length} Deals
            </span>
          </div>
          <h3 className="text-lg font-bold mt-2 flex items-center gap-2">
            <Kanban className="w-5 h-5 text-blue-400" />
            2. Deal / Quotation Kanban
          </h3>
          <p className={`text-xs mt-1 leading-relaxed ${activeBlock === 2 ? 'text-slate-300' : 'text-slate-500'}`}>
            Active 5-stage B2B deal pipeline with built-in Credit Limit Check Gate.
          </p>
        </button>

        {/* Step 3 */}
        <button
          onClick={() => setActiveBlock(3)}
          className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
            activeBlock === 3
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.01]'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeBlock === 3 ? 'text-amber-400' : 'text-slate-400'}`}>
              Block 3 • Orders & Invoicing
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${activeBlock === 3 ? 'bg-slate-800 text-amber-400' : 'bg-slate-100 text-slate-700'}`}>
              {filteredSalesOrders.length} Sales Orders
            </span>
          </div>
          <h3 className="text-lg font-bold mt-2 flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-emerald-400" />
            3. Sales Orders & Invoicing Desk
          </h3>
          <p className={`text-xs mt-1 leading-relaxed ${activeBlock === 3 ? 'text-slate-300' : 'text-slate-500'}`}>
            View confirmed orders, download commercial Pro-Forma, and request Finance Tax Invoices.
          </p>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* FILTER CONTROL BAR (STAGE & DATE FILTERS) */}
      {/* ========================================================================= */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <span>Workspace Filters</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[11px]">Active</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by customer, quote #, PO #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 text-slate-900 text-xs rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-medium transition-all"
              />
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs cursor-pointer"
              >
                <option value="ALL_TIME">All Time</option>
                <option value="TODAY">Today</option>
                <option value="LAST_7_DAYS">Last 7 Days</option>
                <option value="LAST_30_DAYS">Last 30 Days</option>
                <option value="CUSTOM">Custom Date Range</option>
              </select>
            </div>

            {/* Custom Date Pickers if CUSTOM selected */}
            {dateRange === 'CUSTOM' && (
              <div className="flex items-center gap-2 animate-fadeIn">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 text-xs font-medium border border-slate-200 rounded-xl outline-none"
                />
                <span className="text-xs text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 text-xs font-medium border border-slate-200 rounded-xl outline-none"
                />
              </div>
            )}

            {/* Reset Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 transition-all"
                title="Clear all active filters"
              >
                <X className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Stage Filter Buttons / Pills */}
        <div className="pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Stage Filter:</span>
          
          <button
            onClick={() => setSelectedStage('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedStage === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
            }`}
          >
            All Stages ({activeBlock === 1 ? enquiries.length : activeBlock === 2 ? quotations.length : salesOrders.length})
          </button>

          {activeBlock === 2 && (
            ALL_KANBAN_STAGES.map((stg) => {
              const count = quotations.filter(q => q.stage === stg.key || (stg.key === 'QUOTATION SENT' && (q.stage === 'QUOTATION SENT' || q.stage === 'QUOTATION_SENT'))).length;
              return (
                <button
                  key={stg.key}
                  onClick={() => setSelectedStage(selectedStage === stg.key ? 'ALL' : stg.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    selectedStage === stg.key
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{stg.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${selectedStage === stg.key ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })
          )}

          {activeBlock === 1 && (
            ['NEW', 'QUALIFIED', 'REJECTED'].map((stg) => {
              const count = enquiries.filter(e => e.status === stg).length;
              return (
                <button
                  key={stg}
                  onClick={() => setSelectedStage(selectedStage === stg ? 'ALL' : stg)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    selectedStage === stg
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{stg}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${selectedStage === stg ? 'bg-amber-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })
          )}

          {activeBlock === 3 && (
            ['DRAFT', 'APPROVED', 'IN_FULFILLMENT', 'FULFILLED'].map((stg) => {
              const count = salesOrders.filter(so => so.status === stg).length;
              return (
                <button
                  key={stg}
                  onClick={() => setSelectedStage(selectedStage === stg ? 'ALL' : stg)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    selectedStage === stg
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{stg}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${selectedStage === stg ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BLOCK 1: INTAKE QUEUE VIEW */}
      {/* ========================================================================= */}
      {activeBlock === 1 && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Pre-Pipeline Enquiry Intake Queue</h3>
              <p className="text-xs text-slate-500">Capture raw leads from web, email, or trade shows before converting them to active deal quotes.</p>
            </div>
            <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-xl">
              Showing {filteredEnquiries.length} of {enquiries.length} Enquiries
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredEnquiries.length > 0 ? (
              filteredEnquiries.map((enq) => (
                <div key={enq._id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg">
                        {enq.enquiryNumber}
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700">
                        {enq.source}
                      </span>
                      {enq._id && !String(enq._id).startsWith('enq-') && <span className="flex gap-1.5"><AttachmentDrawer entityType="ENQUIRY" entityId={enq._id} label="Files" /><LineageDrawer type="ENQUIRY" id={enq._id} label="Chain" /></span>}
                    </div>

                    <h4 className="text-base font-bold text-slate-900 mt-3">{enq.customerName}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{enq.email || enq.phone || 'Contact pending'}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">Date: {new Date(enq.createdAt).toLocaleDateString()}</p>

                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Requested Bikes</p>
                      {enq.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-semibold text-slate-800 mt-1">
                          <span className="flex items-center gap-1.5"><Bike className="w-3.5 h-3.5 text-amber-600" /> {item.productName}</span>
                          <span className="font-bold text-slate-900">{item.estimatedQuantity} Units</span>
                        </div>
                      ))}
                    </div>

                    {enq.notes && (
                      <p className="text-xs text-slate-500 italic mt-3 bg-slate-50/50 p-2 rounded-lg border border-slate-100">"{enq.notes}"</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${enq.status === 'QUALIFIED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      Status: {enq.status}
                    </span>

                    {enq.status !== 'QUALIFIED' ? (
                      <button
                        onClick={() => handleConvertEnquiry(enq._id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-amber-500 hover:text-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        Qualify & Convert
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> In Quote Pipeline ({enq.convertedQuotationRef})
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-16 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 font-medium">
                No matching intake enquiries found with current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BLOCK 2: DEAL / QUOTATION KANBAN VIEW */}
      {/* ========================================================================= */}
      {activeBlock === 2 && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Kanban className="w-5 h-5 text-blue-600" />
                Quotation & Deal Kanban Pipeline
              </h3>
              <p className="text-xs text-slate-500">Track active B2B deal negotiations through 5 structured stages. Credit checks enforced before PO confirmation.</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-xl">
                Deals: {filteredQuotations.length} of {quotations.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Filtered value</span>
                <span className="text-sm font-bold text-slate-900 num">
                  ₹{(filteredQuotations.reduce((sum, q) => sum + (q.totalAmount || 0), 0) / 100000).toFixed(2)} L
                </span>
              </div>
            </div>
          </div>

          {/* Kanban Board Grid */}
          <div className="grid gap-5 overflow-x-auto pb-4 custom-scrollbar" style={{ gridTemplateColumns: `repeat(${visibleKanbanStages.length}, minmax(320px, 1fr))` }}>
            {visibleKanbanStages.map((col) => {
              const stageQuotes = filteredQuotations.filter(q => q.stage === col.key || (col.key === 'QUOTATION SENT' && (q.stage === 'QUOTATION SENT' || q.stage === 'QUOTATION_SENT')));
              const stageTotal = stageQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0);

              return (
                <div key={col.key} className={`rounded-2xl border ${col.color} p-4 flex flex-col min-h-[520px] shadow-sm`}>
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/70 mb-4">
                    <div>
                      <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.08em]">{col.label}</h4>
                      <p className="text-[11px] text-slate-500 num mt-1">
                        ₹{(stageTotal / 100000).toFixed(1)} L · {stageQuotes.length} {stageQuotes.length === 1 ? 'deal' : 'deals'}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${col.badge}`}>
                      {stageQuotes.length}
                    </span>
                  </div>

                  {/* Column Cards */}
                  <div className="space-y-4 flex-1 overflow-y-auto pr-0.5">
                    {stageQuotes.map((quote) => (
                      <div key={quote._id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              {quote.quoteNumber}
                            </span>
                            {quote.enquiryRef && (
                              <span className="text-[11px] text-slate-400 block mt-1">Ref: {quote.enquiryRef}</span>
                            )}
                          </div>
                          {quote._id && !String(quote._id).startsWith('q-') && <span className="flex gap-1.5"><AttachmentDrawer entityType="QUOTATION" entityId={quote._id} label="Files" /><LineageDrawer type="QUOTATION" id={quote._id} label="Chain" /></span>}
                          {quote.creditCheckPassed && (
                            <span className="p-1 bg-emerald-50 text-emerald-600 rounded-md" title="Credit Gate Passed">
                              <ShieldCheck className="w-4 h-4" />
                            </span>
                          )}
                        </div>

                        <div>
                          <h5 className="text-sm font-semibold text-slate-900 leading-snug">{quote.customerName}</h5>
                          <p className="text-lg font-bold text-slate-900 num tracking-tight mt-1">₹{quote.totalAmount?.toLocaleString('en-IN')}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{new Date(quote.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>

                        {/* Items preview */}
                        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 p-2.5 rounded-lg space-y-1.5">
                          {quote.items?.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between font-medium">
                              <span className="min-w-0 truncate pr-3" title={item.productName}>{item.productName}</span>
                              <span className="shrink-0 font-semibold text-slate-900 num">× {item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        {/* Status / PO Badge */}
                        {quote.poNumber && (
                          <div className="px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between text-xs text-emerald-800 font-semibold">
                            <span>PO: {quote.poNumber}</span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                        )}

                        {quote.salesOrderRef && (
                          <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between text-xs text-blue-800 font-semibold">
                            <span>SO Created: {quote.salesOrderRef}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                        )}

                        {quote.lossReason && (
                          <p className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg leading-relaxed"><span className="font-bold">{String(quote.lossCategory || 'OTHER').replaceAll('_', ' ')}:</span> {quote.lossReason}</p>
                        )}

                        {/* Pro-Forma / Invoicing Shortcut on Kanban Card */}
                        <div className="pt-3.5 border-t border-slate-100 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              setSelectedProformaOrder(quote);
                              setIsProformaOpen(true);
                            }}
                            className="btn btn-sm btn-warn"
                            title="Preview Commercial Pro-Forma Invoice"
                          >
                            <FileText className="w-3 h-3 text-amber-600" />
                            Pro-Forma
                          </button>

                          <button
                            onClick={() => {
                              setSelectedProformaOrder(quote);
                              setIsProformaOpen(true);
                            }}
                            className="btn btn-sm btn-secondary"
                            title="Request Tax Invoice or View Estimate"
                          >
                            <Send className="w-3 h-3" />
                            Tax Invoice
                          </button>
                        </div>

                        {/* Stage Transition Controls */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {col.key !== 'ENQUIRY_RECEIVED' && (
                            <button
                              onClick={() => {
                                const idx = ALL_KANBAN_STAGES.findIndex(s => s.key === col.key);
                                if (idx > 0) handleStageMoveRequest(quote, ALL_KANBAN_STAGES[idx - 1].key);
                              }}
                              className="btn btn-sm btn-ghost"
                            >
                              ← Back
                            </button>
                          )}

                          {col.key !== 'LOST_DECLINED' && col.key !== 'PO_RECEIVED' && (
                            <>
                            {col.key === 'UNDER_REVIEW' && <button onClick={() => handleStageMoveRequest(quote, 'LOST_DECLINED')} className="btn btn-sm btn-danger ml-auto">Mark Lost</button>}
                            <button
                              onClick={() => {
                                const idx = ALL_KANBAN_STAGES.findIndex(s => s.key === col.key);
                                if (idx < ALL_KANBAN_STAGES.length - 1) handleStageMoveRequest(quote, ALL_KANBAN_STAGES[idx + 1].key);
                              }}
                              className="btn btn-sm btn-primary"
                            >
                              Advance Stage →
                            </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {stageQuotes.length === 0 && (
                      <div className="py-12 text-center text-slate-400 text-xs italic">
                        No deals in this stage matching current filter
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BLOCK 3: ORDER PROCESSING & FULFILLMENT HUB */}
      {/* ========================================================================= */}
      {activeBlock === 3 && (
        <div className="space-y-4">
          {/* Statutory Separation Notice */}
          <div className="p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-950 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-800 rounded-xl shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Separation of Quote vs. Tax Invoice Compliance
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Sales issues commercial <strong>Quotations & Pro-Forma Invoices</strong> for customer approval. Official <strong>GST Tax Invoices</strong> are generated exclusively by the <strong>Finance Department</strong> to keep tax compliance centralized.
                </p>
              </div>
            </div>
            <div className="text-[11px] font-bold px-3 py-1 bg-amber-100 border border-amber-300 rounded-lg text-amber-900 shrink-0">
              Finance Centralized Invoicing
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-emerald-600" />
                Sales Order Processing & Stock Fulfillment Hub
              </h3>
              <p className="text-xs text-slate-500">
                Post-Win Fulfillment Engine: Sales Orders start in <strong className="text-slate-900">DRAFT</strong> (no stock reserved). 
                Stock is reserved via <strong className="text-emerald-700">FEFO Batch Allocation</strong> upon explicit SO Order Approval.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Draft SOs:</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                {filteredSalesOrders.filter(so => so.status === 'DRAFT').length} Pending Approval
              </span>
            </div>
          </div>

          {/* Sales Orders List / Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-4">SO & Customer</th>
                    <th className="px-5 py-4">Quotation & PO Ref</th>
                    <th className="px-5 py-4">Ordered Bikes</th>
                    <th className="px-5 py-4 text-right">Order Amount</th>
                    <th className="px-5 py-4 text-center">SO Status</th>
                    <th className="px-5 py-4 text-center">Pro-Forma & Invoicing</th>
                    <th className="px-5 py-4 text-right">Approval & FEFO Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSalesOrders.length > 0 ? (
                    filteredSalesOrders.map((so) => (
                      <tr key={so._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${so.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              SO
                            </div>
                            <div>
                              <p className="font-mono font-bold text-sm text-slate-900">{so.soNumber}</p>
                              <p className="text-xs font-semibold text-slate-700 mt-0.5">{so.customerName}</p>
                              <p className="text-[11px] text-slate-400 font-mono">{new Date(so.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <span className="inline-block text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              Quote: {so.quotationRef || 'N/A'}
                            </span>
                            <br />
                            <span className="inline-block text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                              PO: {so.poNumber || 'N/A'}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1 text-xs">
                            {so.items?.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5 text-slate-800 font-medium">
                                <Bike className="w-3.5 h-3.5 text-amber-600" />
                                <span><strong>{item.quantity}x</strong> {item.productName || item.product?.name || 'Bicycle Unit'}</span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <p className="text-sm font-bold text-slate-900 font-mono">₹{so.totalAmount?.toLocaleString('en-IN')}</p>
                          <p className="text-[11px] text-slate-400">{so.paymentTerms || 'NET 30'}</p>
                        </td>

                        <td className="px-5 py-4 text-center">
                          {so.status === 'DRAFT' && (
                            <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200 inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-600" /> DRAFT (No Stock Reserved)
                            </span>
                          )}
                          {so.status === 'APPROVED' && (
                            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 inline-flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> APPROVED (FEFO Stock Reserved)
                            </span>
                          )}
                          {so.status === 'IN_FULFILLMENT' && (
                            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200 inline-flex items-center gap-1">
                              <PackageCheck className="w-3.5 h-3.5 text-blue-600" /> IN FULFILLMENT
                            </span>
                          )}
                        </td>

                        {/* Pro-Forma & Invoicing Separation Cell */}
                        <td className="px-5 py-4 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedProformaOrder(so);
                                setIsProformaOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center gap-1 transition-colors shadow-xs"
                              title="Download Commercial Pro-Forma Estimate"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-600" />
                              <span>Pro-Forma ({so.proformaNumber || 'Draft PI'})</span>
                            </button>

                            {so.taxInvoiceStatus === 'INVOICED' ? (
                              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {so.taxInvoiceNumber || 'INV-Issued'}
                              </span>
                            ) : so.taxInvoiceStatus === 'REQUESTED' ? (
                              <span className="text-[11px] font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-300 inline-flex items-center gap-1.5 shadow-xs animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                ⚡ REQUESTED (In Finance Queue)
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRequestTaxInvoiceFromFinance(so)}
                                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold hover:underline inline-flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                Request Tax Invoice
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right">
                          {so.status === 'ON_HOLD' ? (
                            <div className="text-xs text-red-700 font-bold">On hold{so.hold?.reason ? `: ${so.hold.reason}` : ''}</div>
                          ) : so.status === 'DRAFT' && so.approvalPending ? (
                            <div className="text-xs text-amber-700 font-bold">Waiting in the approval matrix</div>
                          ) : so.status === 'DRAFT' ? (
                            <button
                              onClick={() => handleApproveSalesOrder(so._id)}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 ml-auto"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              Approve SO & Allocate FEFO
                            </button>
                          ) : (
                            <div className="text-xs text-emerald-700 font-bold flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Reserved & Scheduled
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                        No Sales Orders matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREDIT MANAGEMENT GATE MODAL (Triggered on PO Received) */}
      {/* ========================================================================= */}
      {creditGateModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-scaleIn space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Credit Limit Verification Gate</h3>
                  <p className="text-xs text-slate-500">Validation check before advancing deal to PO RECEIVED</p>
                </div>
              </div>
              <button
                onClick={() => setCreditGateModal({ open: false, quote: null, stage: '' })}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Customer:</span>
                <span className="text-slate-900">{creditGateModal.quote?.customerName}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Quote Total Value:</span>
                <span className="text-slate-900 font-mono">₹{creditGateModal.quote?.totalAmount?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Approved Credit Limit:</span>
                <span className="text-emerald-700 font-mono">₹ 2,500,000</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Current AR Exposure:</span>
                <span className="text-amber-700 font-mono">₹ 850,000</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Customer Purchase Order (PO) Number</label>
              <input
                type="text"
                placeholder="e.g. PO-DECATHLON-9921"
                value={poNumberInput}
                onChange={(e) => setPoNumberInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 text-slate-900 text-xs font-medium border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs font-semibold text-blue-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>Credit Gate Verification: <strong>PASSED</strong></span>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bypassCreditCheck}
                  onChange={(e) => setBypassCreditCheck(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Override Gate
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setCreditGateModal({ open: false, quote: null, stage: '' })}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => executeStageMove(creditGateModal.quote?._id, 'PO_RECEIVED', poNumberInput, bypassCreditCheck)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2"
              >
                Confirm PO Received & Create Draft SO
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <EnquiryModal isOpen={isNewEnquiryOpen} onClose={() => setIsNewEnquiryOpen(false)} onSaved={(e) => { setActionNotice(`Enquiry ${e.enquiryNumber} captured.`); fetchAllData(); }} />

      {/* NEW B2B QUOTATION MODAL */}
      {isNewQuoteOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateQuote} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create New B2B Deal Quote</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Customer / Dealer Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Wheels & Distributors"
                  value={quoteCustomer}
                  onChange={(e) => setQuoteCustomer(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Bicycle Model</label>
                <select
                  value={quoteBike}
                  onChange={(e) => handleBikeSelect(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                >
                  <option value="Apex Urban Commuter Bicycle">Apex Urban Commuter Bicycle (Std ₹18,500)</option>
                  <option value="Velocity Trail Mountain Bike 29er">Velocity Trail Mountain Bike 29er (Std ₹32,000)</option>
                  <option value="E-Glide Electric Hybrid Bike 250W">E-Glide Electric Hybrid Bike 250W (Std ₹48,000)</option>
                  <option value="AeroPro Carbon Road Bike">AeroPro Carbon Road Bike (Std ₹65,000)</option>
                  <option value="CUSTOM_MODEL">✨ Custom Bicycle Model (Manual Name & Price)</option>
                </select>
              </div>

              {quoteBike === 'CUSTOM_MODEL' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custom Bicycle Model Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Custom Superlite Carbon Single-Speed"
                    value={customBikeName}
                    onChange={(e) => setCustomBikeName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quoteQty}
                    onChange={(e) => setQuoteQty(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium font-mono"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-slate-700">Unit Price (₹)</label>
                    <span className="text-[11px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">Admin Editable</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={quotePrice}
                    onChange={(e) => setQuotePrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-white border border-blue-400 rounded-xl outline-none font-bold text-slate-900 font-mono shadow-sm focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex justify-between items-center font-bold text-slate-900">
                <span className="text-xs text-blue-900">Total Quote Value ({quoteQty}x @ ₹{quotePrice.toLocaleString('en-IN')}):</span>
                <span className="font-mono text-base text-blue-700">₹{(Number(quoteQty) * Number(quotePrice)).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsNewQuoteOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md"
              >
                Create Quotation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRO-FORMA INVOICE MODAL */}
      {lossModalQuote && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitLostQuote} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div><h2 className="text-lg font-bold text-slate-900">Mark quotation as lost</h2><p className="mt-1 text-sm text-slate-500">{lossModalQuote.quoteNumber} · {lossModalQuote.customerName}</p></div>
            <label className="block text-sm font-semibold text-slate-700">Reason category
              <select value={lossCategory} onChange={e => setLossCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3">
                <option value="COMPETITOR">Competitor</option><option value="PRICE">Price</option><option value="LEAD_TIME">Lead time</option><option value="SPEC_MISMATCH">Specification mismatch</option><option value="BUDGET_CANCELLED">Budget cancelled</option><option value="OTHER">Other</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Detailed reason
              <textarea required minLength={3} value={lossReason} onChange={e => setLossReason(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3" placeholder="Add context for the sales team" />
            </label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setLossModalQuote(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">Save loss reason</button></div>
          </form>
        </div>
      )}
      <ProformaInvoiceModal
        isOpen={isProformaOpen}
        onClose={() => {
          setIsProformaOpen(false);
          setSelectedProformaOrder(null);
        }}
        order={selectedProformaOrder}
        onRequestTaxInvoice={(orderId) => {
          setSalesOrders(prev => prev.map(so => (so._id === orderId || so.soNumber === orderId || so.quotationRef === orderId) ? { ...so, taxInvoiceStatus: 'REQUESTED' } : so));
          if (selectedProformaOrder) {
            setSelectedProformaOrder((prev: any) => prev ? { ...prev, taxInvoiceStatus: 'REQUESTED' } : null);
          }
          const orderIdentifier = selectedProformaOrder?.soNumber || selectedProformaOrder?.quoteNumber || 'Order';
          setActionNotice(`⚡ Tax invoice requested for ${orderIdentifier}! Placed in Finance Central Billing Queue.`);
          fetchAllData();
        }}
      />
    </div>
  );
}
