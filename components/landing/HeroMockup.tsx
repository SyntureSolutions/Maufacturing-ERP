'use client';

import React, { useState, useEffect } from 'react';
import {
  Package,
  ShoppingCart,
  Truck,
  AlertTriangle,
  Factory,
  TrendingUp,
  Activity,
  ShieldCheck,
  FileText,
  Play,
  Sparkles,
  Layers,
  Cpu,
  CheckCircle2,
  Clock,
  Zap,
  DollarSign,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface HeroMockupProps {
  onOpenDemo: () => void;
}

type RoleType = 'executive' | 'production' | 'quality' | 'finance';

export default function HeroMockup({ onOpenDemo }: HeroMockupProps) {
  const [activeRole, setActiveRole] = useState<RoleType>('executive');
  const [tickerIndex, setTickerIndex] = useState(0);

  // Live Factory Ticker Messages
  const tickerMessages = [
    { time: '13:11:42', text: 'Batch #B-9024 FEFO validated — 450 units allocated to Sales Order #SO-881', status: 'success' },
    { time: '13:08:15', text: 'Line #4 CNC Milling completed 1,200 units with 99.4% precision QA pass', status: 'info' },
    { time: '13:05:02', text: 'Auto-GST E-Way Bill #EWB-44910 generated & synced with Tally ERP', status: 'success' },
    { time: '12:58:30', text: 'Low Stock Alert: Packaging Film Roll < 15% threshold — Auto PO created', status: 'warning' },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % tickerMessages.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [tickerMessages.length]);

  return (
    <div className="w-full max-w-5xl rounded-2xl sm:rounded-3xl border border-slate-800/80 bg-slate-900 shadow-2xl overflow-hidden text-left">
      {/* Mac Browser Chrome Top Bar */}
      <div className="h-9 sm:h-10 bg-slate-950 border-b border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
          <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block"></span>
          <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block"></span>
        </div>

        {/* URL Bar */}
        <div className="bg-slate-900 text-[11px] font-mono text-slate-300 px-4 py-0.5 rounded-full border border-white/10 flex items-center gap-2 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span className="text-slate-400">https://</span>
          <span className="text-white font-semibold">prodexa.app</span>
          <span className="text-slate-400">/preview</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDemo}
            className="px-3 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center gap-1.5 hover:bg-amber-400 transition-all shadow-xs cursor-pointer"
          >
            <Play className="w-3 h-3 fill-slate-950" />
            <span>Live Workspace</span>
          </button>
        </div>
      </div>

      {/* Role Selector Tabs Header */}
      <div className="bg-slate-900/90 border-b border-white/10 px-3.5 py-1.5 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2 hidden sm:inline">Module View:</span>
          
          <button
            onClick={() => setActiveRole('executive')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeRole === 'executive'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Executive Overview</span>
          </button>

          <button
            onClick={() => setActiveRole('production')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeRole === 'production'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Factory className="w-3.5 h-3.5" />
            <span>Shopfloor Production</span>
          </button>

          <button
            onClick={() => setActiveRole('quality')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeRole === 'quality'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>FEFO & Quality</span>
          </button>

          <button
            onClick={() => setActiveRole('finance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeRole === 'finance'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>GST & Invoicing</span>
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Live Sync
          </span>
        </div>
      </div>

      {/* Main Inner Interactive Dashboard UI Preview */}
      <div className="flex h-[335px] sm:h-[350px] md:h-[365px] bg-slate-50 text-slate-800 select-none overflow-hidden">
        {/* Left Mini Sidebar */}
        <div className="w-44 sm:w-48 bg-slate-900 text-slate-300 p-2.5 flex flex-col justify-between shrink-0 border-r border-slate-800">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1.5 py-0.5">
              <img src="/images/prodexa_logo.jpg" alt="Prodexa ERP" className="w-5 h-5 rounded object-contain bg-white p-0.5" />
              <span className="font-extrabold text-xs text-white tracking-tight">Prodexa ERP</span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="px-2 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-extrabold rounded-lg flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span className="capitalize">{activeRole} Suite</span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-950"></span>
              </div>

              <div className="space-y-0.5 pt-0.5">
                <p className="px-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Quick Switcher</p>
                <button
                  onClick={() => setActiveRole('executive')}
                  className={`w-full text-left px-2 py-1 rounded-md text-[11px] flex items-center justify-between transition-colors ${
                    activeRole === 'executive' ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Analytics Desk</span>
                  {activeRole === 'executive' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                </button>
                <button
                  onClick={() => setActiveRole('production')}
                  className={`w-full text-left px-2 py-1 rounded-md text-[11px] flex items-center justify-between transition-colors ${
                    activeRole === 'production' ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Floor Control</span>
                  {activeRole === 'production' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                </button>
                <button
                  onClick={() => setActiveRole('quality')}
                  className={`w-full text-left px-2 py-1 rounded-md text-[11px] flex items-center justify-between transition-colors ${
                    activeRole === 'quality' ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>FEFO & Compliance</span>
                  {activeRole === 'quality' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                </button>
                <button
                  onClick={() => setActiveRole('finance')}
                  className={`w-full text-left px-2 py-1 rounded-md text-[11px] flex items-center justify-between transition-colors ${
                    activeRole === 'finance' ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Tax & Invoices</span>
                  {activeRole === 'finance' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                </button>
              </div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[10px] space-y-0.5">
            <div className="flex items-center justify-between text-slate-400">
              <span>Plant:</span>
              <span className="text-emerald-400 font-bold">Pune Unit 1</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Status:</span>
              <span className="text-white font-extrabold">Shift B Active</span>
            </div>
          </div>
        </div>

        {/* Right Content Area (Dynamic based on selected role) */}
        <div className="flex-1 bg-slate-100 p-2.5 sm:p-3 flex flex-col justify-between overflow-hidden">
          {/* Top Header Card inside preview */}
          <div className="space-y-2">
            {/* Top Toolbar */}
            <div className="flex justify-between items-center bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 font-bold">
                  {activeRole === 'executive' && <BarChart3 className="w-3.5 h-3.5" />}
                  {activeRole === 'production' && <Factory className="w-3.5 h-3.5" />}
                  {activeRole === 'quality' && <ShieldCheck className="w-3.5 h-3.5" />}
                  {activeRole === 'finance' && <FileText className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 capitalize">
                    {activeRole === 'executive' && 'Executive Overview & Live KPIs'}
                    {activeRole === 'production' && 'Production Floor & Shopfloor Control'}
                    {activeRole === 'quality' && 'Quality Control & Expiry Tracking (FEFO)'}
                    {activeRole === 'finance' && 'GST Billing & E-Way Generation'}
                  </h4>
                  <p className="text-[9px] text-slate-500">Live operational feed • Synced 2 seconds ago</p>
                </div>
              </div>

              <button
                onClick={onOpenDemo}
                className="bg-slate-900 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <span>Interactive Mode</span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </button>
            </div>

            {/* DYNAMIC ROLE CONTENT 1: Executive View */}
            {activeRole === 'executive' && (
              <div key="executive" className="space-y-2 animate-tab-crossfade">
                {/* 4 Metric Cards */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200/90 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Overall Efficiency</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">94.2%</p>
                    <span className="text-[9px] font-bold text-emerald-600">Optimal throughput</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200/90 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Monthly Revenue</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">₹ 48.2 Lakhs</p>
                    <span className="text-[9px] font-bold text-emerald-600">On target</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200/90 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Active Work Orders</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">14 Batches</p>
                    <span className="text-[9px] font-bold text-amber-600">2 pending inspect</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200/90 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Stock Health</p>
                    <p className="text-sm sm:text-base font-black text-emerald-600 mt-0.5">Optimum</p>
                    <span className="text-[9px] font-bold text-slate-500">0 expired items</span>
                  </div>
                </div>

                {/* Main Graph + Alert Area */}
                <div className="grid grid-cols-12 gap-2 sm:gap-2.5">
                  <div className="col-span-8 bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <p className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                        Production Output vs Schedule (Units)
                      </p>
                      <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">Schedule Met</span>
                    </div>
                    <svg viewBox="0 0 280 65" className="w-full h-14 sm:h-16">
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M 10 50 Q 60 15, 110 30 T 210 12 T 270 20 L 270 65 L 10 65 Z" fill="url(#grad)" />
                      <path d="M 10 50 Q 60 15, 110 30 T 210 12 T 270 20" fill="none" stroke="#f59e0b" strokeWidth="2.5" className="animate-line-draw" />
                      <circle cx="210" cy="12" r="3.5" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
                    </svg>
                  </div>

                  <div className="col-span-4 bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1">
                    <p className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-[#2563EB]" />
                      Executive Insights
                    </p>
                    <div className="space-y-1 text-[10px]">
                      <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-900 text-[10px]">Shift B Target Met</p>
                          <p className="text-slate-500 text-[9px]">1,200 units processed</p>
                        </div>
                      </div>
                      <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-1.5">
                        <Clock className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-900 text-[10px]">Maintenance Due</p>
                          <p className="text-slate-500 text-[9px]">Tomorrow 06:00 AM</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DYNAMIC ROLE CONTENT 2: Production View */}
            {activeRole === 'production' && (
              <div key="production" className="space-y-2 animate-tab-crossfade">
                <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase">Line #1 - CNC Milling</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[9px]">Running</span>
                    </div>
                    <p className="text-xs sm:text-sm font-black text-slate-900">Batch #B-9024 (Auto Parts)</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[82%] transition-all duration-700" />
                    </div>
                    <p className="text-[10px] text-slate-500 flex justify-between font-bold">
                      <span>Progress: 82%</span>
                      <span>1,640 / 2,000 Pcs</span>
                    </p>
                  </div>

                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase">Line #2 - Injection Mold</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[9px]">Running</span>
                    </div>
                    <p className="text-xs sm:text-sm font-black text-slate-900">Batch #B-9025 (Poly Casing)</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[65%] transition-all duration-700" />
                    </div>
                    <p className="text-[10px] text-slate-500 flex justify-between font-bold">
                      <span>Progress: 65%</span>
                      <span>3,250 / 5,000 Pcs</span>
                    </p>
                  </div>

                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase">Line #3 - Packaging Line</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[9px]">Setup Mode</span>
                    </div>
                    <p className="text-xs sm:text-sm font-black text-slate-900">Tool Changeover</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full w-[35%] transition-all duration-700" />
                    </div>
                    <p className="text-[10px] text-slate-500 flex justify-between font-bold">
                      <span>ETA Complete: 12 mins</span>
                      <span>Next: Batch #B-9026</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1">
                  <p className="text-[11px] font-extrabold text-slate-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Material Requirement Planning (BOM Allocation)
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">Stock Reserved</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="font-bold text-slate-700">Raw Steel Bar (304)</span>
                      <span className="text-slate-900 font-black">420 Kg</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="font-bold text-slate-700">Coolant Fluid (HD-2)</span>
                      <span className="text-slate-900 font-black">80 L</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="font-bold text-slate-700">Corrugated Boxes (L)</span>
                      <span className="text-slate-900 font-black">500 Pcs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DYNAMIC ROLE CONTENT 3: Quality & FEFO View */}
            {activeRole === 'quality' && (
              <div key="quality" className="space-y-2 animate-tab-crossfade">
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">QA Status</p>
                    <p className="text-sm sm:text-base font-black text-emerald-600 mt-0.5">Compliant</p>
                    <span className="text-[9px] font-bold text-slate-500">ISO 9001 standard</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">FEFO Dispatches</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">Active</p>
                    <span className="text-[9px] font-bold text-emerald-600">Automated pick lists</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Items Pending QA</p>
                    <p className="text-sm sm:text-base font-black text-amber-600 mt-0.5">2 Batches</p>
                    <span className="text-[9px] font-bold text-slate-500">In inspection</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">COA Status</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">Verified</p>
                    <span className="text-[9px] font-bold text-emerald-600">Dock clearance</span>
                  </div>
                </div>

                <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1">
                  <p className="text-[11px] font-extrabold text-slate-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      FEFO Expiry Schedule & Priority Dispatch Matrix
                    </span>
                    <span className="text-[10px] text-slate-500">First-Expired-First-Out</span>
                  </p>
                  <div className="space-y-1 text-[10px]">
                    <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-200/70 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-extrabold text-[9px]">PRIORITY #1</span>
                        <span className="font-bold text-slate-900">Batch #B-8812 (Refined Palm Oil 15L)</span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-700">
                        <span>Expires: <strong className="text-amber-900 font-black">4 Days</strong></span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold text-[9px]">Auto Allocated</span>
                      </div>
                    </div>

                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold text-[9px]">PRIORITY #2</span>
                        <span className="font-bold text-slate-900">Batch #B-8901 (Flour Blend Grade A)</span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-700">
                        <span>Expires: <strong className="text-slate-900 font-bold">18 Days</strong></span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold text-[9px]">Queue Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DYNAMIC ROLE CONTENT 4: Finance & GST View */}
            {activeRole === 'finance' && (
              <div key="finance" className="space-y-2 animate-tab-crossfade">
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">GST Invoiced</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">₹ 8,67,400</p>
                    <span className="text-[9px] font-bold text-emerald-600">CGST/SGST/IGST</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">E-Way Bills</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">Generated</p>
                    <span className="text-[9px] font-bold text-emerald-600">Portal synchronized</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Input Tax Credit</p>
                    <p className="text-sm sm:text-base font-black text-emerald-600 mt-0.5">Reconciled</p>
                    <span className="text-[9px] font-bold text-slate-500">2B Data Match</span>
                  </div>
                  <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Ledger Sync</p>
                    <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5">Active</p>
                    <span className="text-[9px] font-bold text-emerald-600">Audit Ready</span>
                  </div>
                </div>

                <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-1">
                  <p className="text-[11px] font-extrabold text-slate-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                      Recent GST Tax Invoices & E-Way Dispatch Logs
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">Ledger Synced</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                      <div className="flex justify-between items-center font-bold text-slate-900">
                        <span>Inv #INV-2026-881</span>
                        <span className="text-emerald-700">₹ 3,45,000</span>
                      </div>
                      <p className="text-slate-500 text-[9px]">Client: Commercial Auto Division</p>
                      <div className="flex items-center gap-1.5 text-emerald-600 text-[9px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>E-Way Bill #99104812 Validated</span>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                      <div className="flex justify-between items-center font-bold text-slate-900">
                        <span>Inv #INV-2026-882</span>
                        <span className="text-emerald-700">₹ 1,82,400</span>
                      </div>
                      <p className="text-slate-500 text-[9px]">Client: Regional Distribution Hub</p>
                      <div className="flex items-center gap-1.5 text-emerald-600 text-[9px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>E-Way Bill #99104815 Validated</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Live Factory Status Stream */}
          <div className="bg-slate-900 text-white rounded-lg p-2 border border-slate-800 flex items-center justify-between gap-3 text-xs shadow-sm">
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-[9px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                EVENT LOG
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                [{tickerMessages[tickerIndex].time}]
              </span>
            </div>

            <p className="text-[11px] font-medium text-slate-300 truncate flex-1 animate-fadeIn">
              {tickerMessages[tickerIndex].text}
            </p>

            <button
              onClick={onOpenDemo}
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>Explore Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
