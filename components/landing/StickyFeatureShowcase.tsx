'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  Calculator,
  Factory,
  FileText,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  TrendingUp,
  Cpu
} from 'lucide-react';
import Link from 'next/link';

interface FeatureStep {
  id: string;
  stepNumber: string;
  title: string;
  category: string;
  icon: React.ElementType;
  description: string;
  bullets: string[];
  docLink: string;
}

const steps: FeatureStep[] = [
  {
    id: 'fefo',
    stepNumber: '01',
    category: 'Inventory Governance',
    title: 'Automated First-Expired-First-Out (FEFO) Dispatch',
    icon: Clock,
    description:
      'Eliminate write-offs and spoiled stock across multi-plant facilities. The FEFO allocation engine automatically generates pick lists prioritizing the oldest verified lots.',
    bullets: [
      'Automated pick-list prioritization based on manufacturer expiry timestamps',
      'Configurable shelf-life thresholds (30 / 60 / 90 day warning windows)',
      'Complete lot genealogy from vendor dock intake to final customer dispatch'
    ],
    docLink: '/docs#inventory'
  },
  {
    id: 'mrp',
    stepNumber: '02',
    category: 'Material Requirements Planning',
    title: 'Multi-Level BOM Explosion & Auto-Procurement',
    icon: Calculator,
    description:
      'Instantly calculate gross and net component requirements across deep sub-assembly tiers, preventing production halts caused by unpredicted stockouts.',
    bullets: [
      'Multi-level BOM hierarchy calculation up to 5 assembly tiers deep',
      'Automated Purchase Order generation triggered on safety stock breach',
      'Supplier lead-time offsetting and demand forecasting synchronization'
    ],
    docLink: '/docs#mrp'
  },
  {
    id: 'shopfloor',
    stepNumber: '03',
    category: 'Production Control',
    title: 'Workstation Routing & Shopfloor OEE Tracking',
    icon: Factory,
    description:
      'Track live cycle times, machine bottlenecks, and shift throughput. Operators log work orders in real-time with zero paper travel sheets.',
    bullets: [
      'Machine workstation routing with planned vs actual cycle times',
      'In-line quality inspection checkpoints and quarantine workflows',
      'Overall Equipment Effectiveness (OEE) and downtime categorization'
    ],
    docLink: '/docs#production'
  },
  {
    id: 'compliance',
    stepNumber: '04',
    category: 'Tax & Compliance',
    title: 'Integrated GST Invoicing & Automated E-Way Bills',
    icon: FileText,
    description:
      'Generate statutory-compliant B2B invoices and instant E-Way bills directly from dispatch notes with zero double entry or manual portal delays.',
    bullets: [
      'Direct E-Way bill generation generated simultaneously with dispatch notes',
      'Automated GSTR-1 and GSTR-2B reconciliation JSON data exports',
      'API-ready synchronization with external enterprise general ledgers'
    ],
    docLink: '/docs#gst'
  }
];

export default function StickyFeatureShowcase() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    stepRefs.current.forEach((el, index) => {
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveStepIndex(index);
          }
        },
        {
          rootMargin: '-30% 0px -40% 0px',
          threshold: 0.1
        }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []);

  const activeStep = steps[activeStepIndex] || steps[0];

  return (
    <div id="capabilities" className="relative py-28 bg-[#FAF6F1]">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#1E293B]/20 text-xs font-semibold text-slate-800 mb-3 shadow-xs">
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>Core Operating Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1E3A8A] tracking-tight">
            How Prodexa Coordinates Your Plant
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            Scroll through each operational phase to see how data flows from inventory intake to final tax compliance.
          </p>
        </div>

        {/* Sticky 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start relative">
          {/* Left Column: Scrolling Narrative Steps */}
          <div className="lg:col-span-6 space-y-32 py-8">
            {steps.map((step, idx) => {
              const StepIcon = step.icon;
              const isCurrent = activeStepIndex === idx;

              return (
                <div
                  key={step.id}
                  ref={(el) => {
                    stepRefs.current[idx] = el;
                  }}
                  className={`transition-all duration-500 rounded-3xl p-8 border-2 ${
                    isCurrent
                      ? 'bg-white border-amber-500/80 shadow-xl'
                      : 'bg-white/60 border-slate-200/80 opacity-60 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-md bg-[#1E293B] text-amber-400">
                      PHASE {step.stepNumber}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {step.category}
                    </span>
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] tracking-tight mb-4 leading-snug">
                    {step.title}
                  </h3>

                  <p className="text-slate-600 text-sm leading-relaxed mb-6 font-normal">
                    {step.description}
                  </p>

                  <div className="space-y-3 pt-2 mb-6 border-t border-slate-100">
                    {step.bullets.map((bullet, bIdx) => (
                      <div key={bIdx} className="flex items-start gap-3 text-xs font-medium text-slate-700">
                        <div className="w-4 h-4 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                        </div>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={step.docLink}
                    className="inline-flex items-center gap-2 text-xs font-bold text-[#1E293B] hover:text-amber-600 transition-colors"
                  >
                    <span>Read Technical Specification</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Right Column: Sticky Product Visual Showcase */}
          <div className="hidden lg:block lg:col-span-6 sticky top-28 h-[540px]">
            <div className="w-full h-full bg-[#1E293B] border-2 border-slate-700 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col justify-between relative text-white">
              {/* Top Chrome Header */}
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block" />
                  <span className="text-[11px] font-mono text-slate-400 ml-2">
                    prodexa://{activeStep.id}-engine
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md">
                    Phase {activeStep.stepNumber} of 04
                  </span>
                </div>
              </div>

              {/* Dynamic Visual Content based on active step with 350ms crossfade */}
              <div className="flex-1 my-4 flex flex-col justify-center">
                {/* Visual 1: FEFO Batch Allocation */}
                {activeStepIndex === 0 && (
                  <div key="fefo-visual" className="space-y-3 animate-tab-crossfade text-left">
                    <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-200">Active FEFO Dispatch Queue</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Real-Time Allocation</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-amber-400 block">LOT-AL-6061-02</span>
                            <span className="text-xs font-bold text-white">Alloy Frame Tube Bar</span>
                            <span className="text-[10px] text-amber-300 block">Expiry: 12 Days Remaining</span>
                          </div>
                          <span className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold text-[10px]">
                            Priority Pick #1
                          </span>
                        </div>

                        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-slate-400 block">LOT-SHI-2026-04</span>
                            <span className="text-xs font-bold text-white">Precision Drivetrain Assembly</span>
                            <span className="text-[10px] text-slate-400 block">Expiry: 45 Days Remaining</span>
                          </div>
                          <span className="px-2.5 py-1 rounded bg-slate-700 text-slate-200 font-medium text-[10px]">
                            Standard Queue
                          </span>
                        </div>

                        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-slate-400 block">LOT-RUB-9921-01</span>
                            <span className="text-xs font-bold text-white">Vulcanized Rubber Compounds</span>
                            <span className="text-[10px] text-slate-400 block">Expiry: 90 Days Remaining</span>
                          </div>
                          <span className="px-2.5 py-1 rounded bg-slate-700 text-slate-200 font-medium text-[10px]">
                            Reserve Holding
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual 2: MRP & BOM Explosion */}
                {activeStepIndex === 1 && (
                  <div key="mrp-visual" className="space-y-3 animate-tab-crossfade text-left">
                    <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-200">5-Tier Bill of Materials Hierarchy</span>
                        <span className="text-[10px] text-amber-400 font-mono">BOM #BOM-V8-2026</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-bold text-white">Engine Block Assembly (Tier 0)</span>
                            <span className="text-emerald-400 font-bold text-[10px]">100% Component Match</span>
                          </div>
                          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full w-[100%]" />
                          </div>
                        </div>

                        <div className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl pl-6 relative">
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400" />
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-slate-200 text-xs">Sub-Assembly: Piston Rings (Tier 1)</span>
                            <span className="text-slate-400 text-[10px]">8,000 Units Required</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block">Allocated from Warehouse Bin #A-14</span>
                        </div>

                        <div className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl pl-6 relative">
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400" />
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-slate-200 text-xs">Raw Material: Aluminum Ingot 6061</span>
                            <span className="text-amber-400 text-[10px] font-bold">Auto-PO Generated</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block">Vendor Lead Time: 3 Business Days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual 3: Shopfloor Workstations */}
                {activeStepIndex === 2 && (
                  <div key="shopfloor-visual" className="space-y-3 animate-tab-crossfade text-left">
                    <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-200">Shopfloor Machine Stations</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Shift B Operating</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-white text-[11px]">CNC Line #1</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                              Running
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">Batch #B-9024 (Auto Parts)</p>
                          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full w-[82%]" />
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">Output: 1,640 / 2,000 Pcs</span>
                        </div>

                        <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-white text-[11px]">Injection Mold #2</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                              Running
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">Batch #B-9025 (Poly Casing)</p>
                          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full w-[65%]" />
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">Output: 3,250 / 5,000 Pcs</span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <span className="text-white font-bold block text-xs">Line #3 Packaging & Tooling</span>
                          <span className="text-[10px] text-amber-300">Changeover in Progress • ETA 12 mins</span>
                        </div>
                        <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 font-semibold text-[10px]">
                          Setup Mode
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual 4: GST & Compliance */}
                {activeStepIndex === 3 && (
                  <div key="compliance-visual" className="space-y-3 animate-tab-crossfade text-left">
                    <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-200">Statutory GST & E-Way Clearance</span>
                        <span className="text-[10px] text-emerald-400 font-mono">GSTIN Sync OK</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white block">Tax Invoice #INV-2026-881</span>
                            <span className="text-[10px] text-slate-400">Client: Commercial Automotive Division</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-400 block">₹ 3,45,000</span>
                            <span className="text-[9px] text-emerald-400 font-semibold">EWB #99104812 Valid</span>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white block">Tax Invoice #INV-2026-882</span>
                            <span className="text-[10px] text-slate-400">Client: Regional Logistics Center</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-400 block">₹ 1,82,400</span>
                            <span className="text-[9px] text-emerald-400 font-semibold">EWB #99104815 Valid</span>
                          </div>
                        </div>

                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-[11px] text-emerald-300">
                          <span>GSTR-1 & 2B Reconciliation JSON</span>
                          <span className="font-bold text-white">Export Ready</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Interactive Step Indicator Bar */}
              <div className="flex items-center justify-between border-t border-slate-700/80 pt-3 text-xs">
                <div className="flex items-center gap-1.5">
                  {steps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        stepRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                        i === activeStepIndex ? 'w-8 bg-amber-500' : 'w-2 bg-slate-600 hover:bg-slate-400'
                      }`}
                      aria-label={`Jump to step ${i + 1}`}
                    />
                  ))}
                </div>

                <span className="text-[11px] text-slate-400 font-medium">
                  {activeStep.title.split(' ')[0]} {activeStep.title.split(' ')[1]} Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
