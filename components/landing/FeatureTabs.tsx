'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Calculator,
  ShieldCheck,
  FileText,
  TrendingUp,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

export default function FeatureTabs() {
  const [activeTab, setActiveTab] = useState<'fefo' | 'mrp' | 'quality' | 'finance'>('fefo');

  // Integrated Value Driver Overview Highlights
  const valueDrivers = [
    {
      icon: TrendingUp,
      title: 'Lean Inventory & Reorder Rules',
      description: 'Multi-warehouse reorder triggers and automated stock reservation to minimize holding costs without risking stockouts.',
      tag: 'Holding Cost Optimization'
    },
    {
      icon: Clock,
      title: 'FEFO & Shelf-Life Governance',
      description: 'Systematic First-Expired-First-Out pick lists and automated shelf-life alerts to prevent perishable inventory write-offs.',
      tag: 'Zero Spoilage Workflow'
    },
    {
      icon: FileText,
      title: 'Integrated GST & Invoicing',
      description: 'Instant tax invoice generation, automated E-Way bill creation, and GSTR reconciliation ready for statutory audit.',
      tag: 'Statutory Compliance'
    }
  ];

  const tabs = [
    {
      id: 'fefo',
      label: 'Batch Traceability & FEFO',
      icon: Clock,
      title: 'Automated First-Expired-First-Out Dispatching',
      subtitle: 'Systematically allocate oldest batches across multi-warehouse facilities to minimize perishable write-offs.',
      bullets: [
        'Automated pick-list generation prioritizing oldest verified batches.',
        'Real-time shelf life threshold alerts across 30, 60, and 90-day expiry windows.',
        'End-to-end lot genealogy from supplier receipt through shopfloor routing to customer dispatch.'
      ],
      previewData: {
        badge: 'FEFO Engine Active',
        metric1: 'High Priority',
        metric1Label: 'Batch Allocation Logic',
        metric2: 'Active',
        metric2Label: 'Shelf-Life Monitoring',
        mockupTitle: 'FEFO Batch Allocation Stream',
        batches: [
          { code: 'LOT-AL-6061-02', name: 'Alloy Frame Tubes (Grade 6061)', expiry: 'Expiry: 12 Days Remaining', status: 'Priority Dispatch', bg: 'bg-amber-50 text-amber-900 border-amber-300' },
          { code: 'LOT-SHI-2026-04', name: 'Precision Drivetrain Sets', expiry: 'Expiry: 45 Days Remaining', status: 'Standard Allocation', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
          { code: 'LOT-RUB-9921-01', name: 'Vulcanized Rubber Compounds', expiry: 'Expiry: 90 Days Remaining', status: 'Reserve Stock', bg: 'bg-slate-50 text-slate-800 border-slate-200' }
        ]
      }
    },
    {
      id: 'mrp',
      label: 'BOM & MRP Engine',
      icon: Calculator,
      title: 'Automated Bill of Materials & Procurement Planning',
      subtitle: 'Calculate raw material requirements and production schedules based on confirmed sales orders and lead times.',
      bullets: [
        'Multi-level BOM explosion across multiple sub-assembly tiers.',
        'Automated Purchase Order generation triggered by safety stock shortfalls.',
        'Machine workstation routing and shift labor capacity balancing.'
      ],
      previewData: {
        badge: 'MRP Calculation Synced',
        metric1: 'Multi-Tier',
        metric1Label: 'BOM Explosion Hierarchy',
        metric2: 'Synchronized',
        metric2Label: 'Component Stock Status',
        mockupTitle: 'Sub-Assembly & Component Explosion',
        batches: [
          { code: 'BOM-ENG-V8', name: 'Engine Block Sub-Assembly', expiry: '2,000 Units Required', status: 'In Production', bg: 'bg-slate-900 text-white border-slate-800' },
          { code: 'BOM-PIST-04', name: 'Precision Piston Rings', expiry: '8,000 Units Required', status: 'Allocated', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
          { code: 'RAW-AL-BILLET', name: 'Aluminum Grade 6061 Ingots', expiry: '12 Tons Available', status: 'Safety Reserve', bg: 'bg-slate-50 text-slate-800 border-slate-200' }
        ]
      }
    },
    {
      id: 'quality',
      label: 'Quality Assurance (QA)',
      icon: ShieldCheck,
      title: 'In-Line Quality Inspections & Compliance Certification',
      subtitle: 'Enforce non-conformance quarantine rules and mandatory Certificate of Analysis verification at receiving docks.',
      bullets: [
        'Mandatory Certificate of Analysis (COA) logging before releasing stock to production.',
        'Non-conformance report (NCR) workflows with automated supplier score tracking.',
        'Defect categorization and ISO-compliant audit trails for all critical components.'
      ],
      previewData: {
        badge: 'ISO Audit Ready',
        metric1: 'Verified',
        metric1Label: 'Receiving Dock Inspection',
        metric2: 'Active',
        metric2Label: 'Quarantine Protocol',
        mockupTitle: 'Receiving Dock Quality Verification',
        batches: [
          { code: 'QA-INSP-9012', name: 'Industrial Solvent Lot #44', expiry: 'Purity Certificate Verified', status: 'COA Approved', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
          { code: 'QA-INSP-9014', name: 'Structural Steel Frame Batch #881', expiry: 'Tensile Strength Validated', status: 'Passed QA', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
          { code: 'QA-INSP-8991', name: 'Polymer Coating Resin Batch #19', expiry: 'Viscosity Deviation Noted', status: 'Quarantined', bg: 'bg-rose-50 text-rose-900 border-rose-300' }
        ]
      }
    },
    {
      id: 'finance',
      label: 'GST & Invoicing',
      icon: FileText,
      title: 'Automated GST Tax Invoicing & E-Way Bill Integration',
      subtitle: 'Generate compliant B2B tax invoices, manage multi-rate GST calculations, and export GSTR reconciliation datasets.',
      bullets: [
        'Direct E-Way bill generation generated alongside dispatch notes.',
        'Automated GSTR-1 and GSTR-2B reconciliation JSON data exports.',
        'Seamless integration pathways for external accounting packages and general ledgers.'
      ],
      previewData: {
        badge: 'Portal Compliant',
        metric1: 'Automated',
        metric1Label: 'B2B Tax Calculation',
        metric2: 'Synchronized',
        metric2Label: 'E-Way Dispatch Status',
        mockupTitle: 'B2B Tax Invoices & E-Way Logs',
        batches: [
          { code: 'INV-2026-881', name: 'Commercial Vehicle Assembly Division', expiry: 'E-Way Bill Generated', status: 'Tax Cleared', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
          { code: 'INV-2026-882', name: 'Regional Distribution Hub', expiry: 'E-Way Bill Generated', status: 'Tax Cleared', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
          { code: 'INV-2026-885', name: 'Precision Engineering Plant', expiry: 'E-Way Verification In Progress', status: 'Pending Clearance', bg: 'bg-amber-50 text-amber-900 border-amber-300' }
        ]
      }
    }
  ];

  const current = tabs.find(t => t.id === activeTab) || tabs[0];
  const Icon = current.icon;

  return (
    <div id="capabilities" className="bg-[#FAF6F1] py-24 border-t border-[#E8DDD0] relative">
      <div className="max-w-6xl mx-auto px-8 relative z-10 space-y-16">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#1E293B]/20 text-xs font-semibold text-slate-800 mb-3 shadow-xs">
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>Enterprise Capabilities and streanghts</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1E3A8A] tracking-tight">
            Operational Excellence Across Every Stage
          </h2>
          <p className="text-slate-600 text-base mt-3 leading-relaxed">
            Coordinate shopfloor production, multi-tier BOM planning, FEFO batch allocation, and compliance in one unified architecture.
          </p>
        </div>

        {/* Folded 3-Card Value Driver Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {valueDrivers.map((driver, idx) => {
            const DriverIcon = driver.icon;
            return (
              <div
                key={idx}
                className="p-7 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-sm hover:shadow-md hover:border-amber-500/60 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-600">
                    <DriverIcon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1E293B] mb-2">
                    {driver.title}
                  </h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-4">
                    {driver.description}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-md inline-block">
                    {driver.tag}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tab Navigation Controls */}
        <div className="pt-4">
          <div className="flex items-center justify-center gap-2 overflow-x-auto custom-scrollbar pb-3 mb-8">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer ${isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:border-slate-400'
                    }`}
                >
                  <TabIcon className={`w-4 h-4 ${isSelected ? 'text-slate-950' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Deep Dive Content Container */}
          <div className="bg-white border-2 border-[#1E293B]/15 rounded-3xl p-8 lg:p-10 shadow-lg grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Description Column */}
            <div className="lg:col-span-6 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-[#1E293B]">
                <Icon className="w-4 h-4 text-amber-600" />
                <span>{current.label}</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-[#1E3A8A] leading-tight">
                {current.title}
              </h3>

              <p className="text-slate-600 text-sm leading-relaxed">
                {current.subtitle}
              </p>

              {/* Bullets */}
              <div className="space-y-3 pt-2">
                {current.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-700 leading-snug">
                      {bullet}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Link
                  href="/docs"
                  className="px-6 py-2.5 rounded-lg bg-[#1E293B] text-white font-semibold text-xs inline-flex items-center gap-2 hover:bg-slate-800 transition-all shadow-sm"
                >
                  <span>View Technical Documentation</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                </Link>
              </div>
            </div>

            {/* Right Interactive Mini UI Preview Column */}
            <div className="lg:col-span-6 bg-[#FAF6F1] text-slate-800 rounded-2xl p-5 border border-slate-300 shadow-xs space-y-4">
              {/* Top Bar of Preview */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="text-xs font-bold text-slate-900">{current.previewData.mockupTitle}</span>
                </div>
                <span className="text-[10px] font-semibold bg-white text-slate-700 border border-slate-300 px-2.5 py-0.5 rounded-md">
                  {current.previewData.badge}
                </span>
              </div>

              {/* Metric Callouts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{current.previewData.metric1Label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{current.previewData.metric1}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{current.previewData.metric2Label}</p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">{current.previewData.metric2}</p>
                </div>
              </div>

              {/* List Stream Items */}
              <div className="space-y-2">
                {current.previewData.batches.map((item, i) => (
                  <div key={i} className={`p-3 rounded-xl border flex items-center justify-between ${item.bg}`}>
                    <div>
                      <span className="text-[10px] font-mono font-bold block">{item.code}</span>
                      <span className="text-xs font-bold block mt-0.5">{item.name}</span>
                      <span className="text-[10px] font-medium opacity-80">{item.expiry}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded bg-white border border-slate-200 shadow-xs shrink-0">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
