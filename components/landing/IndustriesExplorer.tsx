'use client';

import React from 'react';
import {
  Apple,
  Cog,
  FlaskConical,
  Cpu,
  Shirt,
  Box,
  CheckCircle2,
  ShieldCheck,
  Factory,
  Layers,
  Clock,
  Play
} from 'lucide-react';

interface IndustriesExplorerProps {
  onOpenDemo?: () => void;
}

export default function IndustriesExplorer({ onOpenDemo }: IndustriesExplorerProps) {
  return (
    <div className="relative bg-[#FAF6F1] text-slate-900 font-sans">
      {/* Main Page Title Header */}
      <div className="pt-20 pb-14 bg-gradient-to-b from-[#1E293B] via-[#2A374A] to-[#FAF6F1] text-white text-center">
        <div className="max-w-4xl mx-auto px-6 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-amber-300 shadow-xs backdrop-blur-sm">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Tailored Manufacturing Workflows</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Industry Solutions for Modern Plant Operations
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
            Every manufacturing sector operates under unique regulatory requirements, batch workflows, and production constraints. Explore our dedicated industry configurations.
          </p>
        </div>
      </div>

      {/* DEDICATED SECTIONS FOR EACH INDUSTRY */}
      <div className="divide-y divide-[#E8DDD0]">

        {/* SECTION 1: FOOD & BEVERAGE PROCESSING */}
        <section id="food-bev" className="py-24 bg-[#FAF6F1] scroll-mt-20 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-12">
            {/* Section Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8DDD0] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-700 shrink-0">
                  <Apple className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">
                    Manufacturing Sector 01
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E3A8A] tracking-tight">
                    Food & Beverage Processing
                  </h2>
                </div>
              </div>
              <span className="text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-4 py-1.5 rounded-full self-start sm:self-center">
                Strict FEFO & Expiry Compliance
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <p className="text-slate-600 text-base leading-relaxed">
                  Food and beverage producers require absolute control over ingredient shelf life, batch traceability, and statutory safety compliance to prevent waste and safeguard consumer health.
                </p>

                {/* Primary Challenge Solved Callout */}
                <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-1">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Primary Challenge Solved</span>
                  </div>
                  <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                    Eliminates perishable ingredient spoilage by auto-allocating raw materials with the earliest expiry dates (FEFO) to production work orders.
                  </p>
                </div>

                {/* Field-Specific Workflow Use Cases */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Core Workflows & Features:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">FEFO Expiry Pick-Lists</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sales dispatches automatically select stock batches closest to expiry, keeping shelf-life waste under control.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Allergen & Recipe BOMs</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Track ingredient lot numbers with automated allergen checks and batch recipe consistency logs.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">30-Day Expiry Risk Alerts</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Automated notifications alert plant supervisors 30 days prior to batch expiration thresholds.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Instant Audit Traceability</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Generate complete digital chain-of-custody reports for any batch code in seconds.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modules Used */}
                <div className="pt-4 border-t border-[#E8DDD0] flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block mb-1">Modules Used:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">FEFO Batches</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Recipe BOM Engine</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Quality Inspection</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Visual Interactive UI Card */}
              <div className="lg:col-span-5 bg-[#1E293B] text-white border-2 border-slate-700 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>FEFO Expiry Allocation Monitor</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">Active</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">Batch #B-8812 (Whole Milk 1000L)</span>
                      <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Expires in 4 Days</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Allocated to: Work Order #WO-4091 (Dairy Processing)</p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full w-[90%]" />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">Batch #B-8901 (Flour Grade A 500Kg)</span>
                      <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Expires in 28 Days</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Allocated to: Work Order #WO-4095 (Bakery Dispatch)</p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full w-[35%]" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={onOpenDemo}
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 hover:bg-amber-400 transition-all shadow-md mt-4 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Explore Food & Beverage Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: AUTOMOTIVE PARTS & HEAVY MACHINING */}
        <section id="auto-machining" className="py-24 bg-[#F5EDE3] scroll-mt-20 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-12">
            {/* Section Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8DDD0] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 shrink-0">
                  <Cog className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block">
                    Manufacturing Sector 02
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E3A8A] tracking-tight">
                    Automotive Parts & Heavy Machining
                  </h2>
                </div>
              </div>
              <span className="text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 rounded-full self-start sm:self-center">
                High-Precision Multi-Tier Assembly
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <p className="text-slate-600 text-base leading-relaxed">
                  Automotive component manufacturers deal with complex multi-level sub-assemblies, machine downtime risks, and strict supplier delivery deadlines.
                </p>

                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Primary Challenge Solved</span>
                  </div>
                  <p className="text-xs text-amber-950 font-medium leading-relaxed">
                    Prevents assembly line shutdowns by calculating raw material BOM shortfalls 5 tiers deep prior to starting production shifts.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Core Workflows & Features:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">5-Tier Sub-Assembly BOM</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Explode engine frames and gearboxes to verify availability of sub-components down to individual fasteners.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">CNC Machine Scheduling</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Route work orders to specific CNC lathes based on shift availability and tooling maintenance logs.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Auto Material Requisitions</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Draft Purchase Orders trigger automatically when raw billets drop below defined safety buffer thresholds.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Serial & Lot Tracking</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Assign unique serial numbers to critical sub-assemblies for warranty traceability and audit protection.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E8DDD0] flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block mb-1">Modules Used:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">MRP Engine</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Multi-Tier BOM</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Work Orders Desk</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-5 bg-[#1E293B] text-white border-2 border-slate-700 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Factory className="w-4 h-4 text-amber-400" />
                    <span>CNC Machine & BOM Explosion</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">Shift Active</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">CNC Machine Line #4</span>
                      <span className="text-emerald-400 font-bold text-[10px]">Running Shift B</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div>Part: <strong className="text-white">Alloy Brake Disc</strong></div>
                      <div>Target: <strong className="text-white">1,500 Pcs</strong></div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1.5">
                    <span className="font-bold text-slate-400 text-[10px] uppercase">5-Tier Raw Material Status</span>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">Aluminum Billet Grade 6061</span>
                      <span className="text-emerald-400 font-bold">Reserved</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">High-Temp Tooling Inserts</span>
                      <span className="text-emerald-400 font-bold">Ready</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={onOpenDemo}
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 hover:bg-amber-400 transition-all shadow-md mt-4 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Explore Automotive Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: CHEMICALS & PHARMACEUTICALS */}
        <section id="pharma-chem" className="py-24 bg-[#FAF6F1] scroll-mt-20 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-12">
            {/* Section Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8DDD0] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-700 shrink-0">
                  <FlaskConical className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block">
                    Manufacturing Sector 03
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E3A8A] tracking-tight">
                    Chemicals & Pharmaceuticals
                  </h2>
                </div>
              </div>
              <span className="text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 px-4 py-1.5 rounded-full self-start sm:self-center">
                Digital COA & Non-Conformance Quarantine
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <p className="text-slate-600 text-base leading-relaxed">
                  Chemical compounders and pharma formulators demand rigorous quality control, hazardous material tracking, and digital Certificates of Analysis (COA).
                </p>

                <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 space-y-1">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Primary Challenge Solved</span>
                  </div>
                  <p className="text-xs text-rose-950 font-medium leading-relaxed">
                    Guarantees lab compliance by automatically routing unverified or off-spec chemical lots directly to quarantine hold locations.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Core Workflows & Features:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Digital COA Testing Logs</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Log lab parameters (Purity %, Viscosity, pH Level) before releasing raw chemicals to active production tanks.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Quarantine & NCR Isolation</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Failed chemical batches are locked into quarantine status with mandatory Quality Manager clearance signatures.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Hazardous Material Rules</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Set strict minimum holding limits for hazardous solvents with automated reorder warnings.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Locked Formulations</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Lock recipe proportions to prevent unauthorized operator alterations on the compounding floor.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E8DDD0] flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block mb-1">Modules Used:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Quality Desk</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">NCR Quarantine</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Batch Logs</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-5 bg-[#1E293B] text-white border-2 border-slate-700 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-rose-400" />
                    <span>Certificate of Analysis (COA) Status</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">QA Passed</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-2">
                    <div className="flex justify-between items-center font-bold text-white">
                      <span>Batch #CHEM-901 (Solvent X-8)</span>
                      <span className="text-emerald-400">Purity: 99.8%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                      <div>pH Level: <strong className="text-white">6.8 (Norm)</strong></div>
                      <div>Viscosity: <strong className="text-white">12 cP</strong></div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-2xl border border-rose-500/30 space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-rose-300">
                      <span>Quarantine Rack #Q-3</span>
                      <span className="text-xs bg-rose-500 text-slate-950 px-2 py-0.5 rounded font-bold">HOLD</span>
                    </div>
                    <p className="text-[11px] text-rose-200">Batch #CHEM-889 — Impurity &gt; 0.5% threshold</p>
                  </div>
                </div>

                <button
                  onClick={onOpenDemo}
                  className="w-full py-3 rounded-xl bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-600 transition-all shadow-md mt-4 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Explore Chemical & Pharma Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: ELECTRONICS & PRECISION MANUFACTURING */}
        <section id="electronics" className="py-24 bg-[#F5EDE3] scroll-mt-20 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-12">
            {/* Section Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8DDD0] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-700 shrink-0">
                  <Cpu className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">
                    Manufacturing Sector 04
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E3A8A] tracking-tight">
                    Electronics & Precision Manufacturing
                  </h2>
                </div>
              </div>
              <span className="text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 px-4 py-1.5 rounded-full self-start sm:self-center">
                SMT Reel Lot & Serialized Registration
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <p className="text-slate-600 text-base leading-relaxed">
                  Electronics manufacturers manage thousands of micro-components (resistors, microcontrollers, PCBs) across high-speed SMT assembly lines.
                </p>

                <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-1">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Primary Challenge Solved</span>
                  </div>
                  <p className="text-xs text-indigo-950 font-medium leading-relaxed">
                    Eliminates micro-component inventory discrepancies with barcode lot scanning across SMT pick-and-place feeders.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Core Workflows & Features:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">SMT Component Reel Tracking</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Track individual capacitor, IC, and resistor reel lot numbers during high-speed PCB surface mounting.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Serialized Unit Warranty</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Automatically register unit serial numbers at invoice creation for seamless post-sales warranty support.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">High-Density MRP Engine</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Calculate multi-item reorder requirements across thousands of electrical component part numbers.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">B2B GST Billing Sync</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Generate tax invoices with exact HSN codes and automated E-Way bills for regional dispatches.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E8DDD0] flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block mb-1">Modules Used:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">MRP Calculation</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Products & BOM</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">GST Invoicing</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-5 bg-[#1E293B] text-white border-2 border-slate-700 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <span>SMT Reel & Serial Registration</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">Synced</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-white">
                      <span>Unit Serial #SN-2026-90412</span>
                      <span className="text-indigo-400 font-mono">Gateway PCB V2</span>
                    </div>
                    <p className="text-[11px] text-slate-400">SMT Board ID: #PCB-88910 (Feeder Reel #R-401)</p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1">
                    <span className="font-bold text-slate-400 text-[10px] uppercase">Warranty Status</span>
                    <p className="text-[11px] text-emerald-400 font-bold">24-Month B2B Coverage Active</p>
                  </div>
                </div>

                <button
                  onClick={onOpenDemo}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all shadow-md mt-4 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Explore Electronics Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: TEXTILES & APPAREL PRODUCTION */}
        <section id="textiles" className="py-24 bg-[#FAF6F1] scroll-mt-20 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-12">
            {/* Section Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8DDD0] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-700 shrink-0">
                  <Shirt className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block">
                    Manufacturing Sector 05
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E3A8A] tracking-tight">
                    Textiles & Apparel Production
                  </h2>
                </div>
              </div>
              <span className="text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 px-4 py-1.5 rounded-full self-start sm:self-center">
                Dye Lot Matching & Labour Payroll
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <p className="text-slate-600 text-base leading-relaxed">
                  Garment factories handle complex matrix variants (Size, Color, Fabric Grade), yarn dye lot matching, and piece-rate worker productivity tracking.
                </p>

                <div className="p-5 rounded-2xl bg-purple-50 border border-purple-200 space-y-1">
                  <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Primary Challenge Solved</span>
                  </div>
                  <p className="text-xs text-purple-950 font-medium leading-relaxed">
                    Eliminates garment shade variations by grouping raw fabric rolls by strict dye lot numbers across bulk cutting orders.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Core Workflows & Features:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Dye Lot & Shade Matching</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Track fabric roll lengths and dye lot numbers to ensure uniform garment shade consistency.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Piece-Rate Worker Payroll</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Record daily operator output per stitching table and generate monthly payroll with overtime calculations.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Garment Matrix BOM</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Define bill of materials across S/M/L/XL sizes with precise thread, zipper, and button consumption.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Export Documentation</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Generate multi-currency export packing lists and shipping bills for international buyers.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E8DDD0] flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block mb-1">Modules Used:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Inventory Batches</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Production Desk</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Labour & Payroll</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-5 bg-[#1E293B] text-white border-2 border-slate-700 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Shirt className="w-4 h-4 text-purple-400" />
                    <span>Dye Lot & Stitching Table Output</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-bold">Shade Matched</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1 font-bold text-white">
                    <span>Fabric Roll Lot #DYE-774 (Cotton Navy)</span>
                    <p className="text-[11px] text-slate-400 font-normal">Allocated to Order #ORD-881 (1,200 Polo Shirts)</p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1 text-slate-300">
                    <span className="font-bold text-white text-[11px]">Shift Output Log:</span>
                    <p className="text-[10px] text-emerald-400 font-bold">Stitching Table #4 — 450 Units Completed Today</p>
                  </div>
                </div>

                <button
                  onClick={onOpenDemo}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-purple-500 transition-all shadow-md mt-4 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Explore Apparel Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: FMCG & FAST-MOVING CONSUMER GOODS */}
        <section id="fmcg" className="py-24 bg-[#F5EDE3] scroll-mt-20 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-12">
            {/* Section Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8DDD0] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 shrink-0">
                  <Box className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block">
                    Manufacturing Sector 06
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E3A8A] tracking-tight">
                    FMCG & Consumer Goods
                  </h2>
                </div>
              </div>
              <span className="text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 rounded-full self-start sm:self-center">
                High-Volume 3PL & Multi-Warehouse Dispatches
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <p className="text-slate-600 text-base leading-relaxed">
                  High-velocity consumer goods companies demand real-time inventory visibility across central plants, regional hubs, and third-party logistics (3PL) partners.
                </p>

                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Primary Challenge Solved</span>
                  </div>
                  <p className="text-xs text-amber-950 font-medium leading-relaxed">
                    Streamlines multi-warehouse dispatches with 1-click E-Way bill clearance and real-time inventory reorder point sync.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Core Workflows & Features:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Multi-Warehouse Visibility</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Track stock levels simultaneously across central manufacturing plants and regional distribution hubs.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">1-Click E-Way Transport</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Auto-generate government E-Way bills directly from confirmed sales order dispatch notes.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">High-Velocity B2B Sales</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Process high-volume distributor bulk orders with instant credit check validations.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <h4 className="text-xs font-bold text-[#1E3A8A]">Stock Turnover Analytics</h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Analyze fast-moving vs slow-moving SKUs to optimize factory production schedules.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E8DDD0] flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block mb-1">Modules Used:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Sales Pipeline</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">Multi-Warehouse Sync</span>
                      <span className="px-3 py-1 rounded-full bg-white text-[#1E293B] border border-slate-300 font-semibold">GST & E-Way</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-5 bg-[#1E293B] text-white border-2 border-slate-700 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-400" />
                    <span>Multi-Hub Warehouse Dispatch Log</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">E-Way Cleared</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1">
                    <div className="flex justify-between items-center font-bold text-white">
                      <span>Dispatch #DSP-9041 (Truck MH-12)</span>
                      <span className="text-emerald-400">EWB #99104812</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Origin: Central Plant → Destination: Regional Hub</p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700 space-y-1">
                    <span className="font-bold text-slate-400 text-[10px] uppercase">Central Stock Footprint</span>
                    <p className="text-[11px] text-white font-bold">14,200 Cases Ready Across 3 Regional Hubs</p>
                  </div>
                </div>

                <button
                  onClick={onOpenDemo}
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 hover:bg-amber-400 transition-all shadow-md mt-4 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Explore FMCG Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
