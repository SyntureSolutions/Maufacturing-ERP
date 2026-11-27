'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  BookOpen,
  Search,
  CheckCircle2,
  Clock,
  Calculator,
  ShieldCheck,
  FileText,
  Users,
  Code,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Layers
} from 'lucide-react';
import LandingNavbar from '@/components/landing/LandingNavbar';

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState<string>('getting-started');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const docSections = [
    {
      id: 'getting-started',
      title: 'Quick Start Guide',
      icon: BookOpen,
      content: {
        heading: 'Getting Started with Prodexa ERP',
        description: 'Learn how to set up your enterprise environment, initialize MongoDB models, and configure your first warehouse.',
        steps: [
          {
            title: '1. Environment Configuration',
            desc: 'Copy the .env.example file to .env.local and configure your MONGODB_URI and JWT AUTH_SECRET credentials.'
          },
          {
            title: '2. Database Seeding & Admin Setup',
            desc: 'Run node add_user.js or trigger /api/seed to generate default product categories, demo batches, and admin access.'
          },
          {
            title: '3. Warehouse & Safety Stock Setup',
            desc: 'Navigate to Inventory & Stocks to define rack locations and set minimum safety stock thresholds per batch.'
          }
        ]
      }
    },
    {
      id: 'fefo-engine',
      title: 'FEFO & Batch Traceability',
      icon: Clock,
      content: {
        heading: 'First-Expired-First-Out (FEFO) Allocation Engine',
        description: 'Automated dispatching logic prioritizing perishable inventory batches based on expiration timestamps.',
        steps: [
          {
            title: 'Batch Creation & Expiry Tagging',
            desc: 'When receiving Purchase Orders, every batch is tagged with a unique batch number, manufacturing date, and expiry date.'
          },
          {
            title: 'Automatic Pick-List Order Allocation',
            desc: 'Sales orders automatically invoke allocation logic to reserve quantities from the nearest-expiring active batches first.'
          },
          {
            title: '30/60/90-Day Expiry Risk Alerts',
            desc: 'The Executive Dashboard actively flags batches approaching critical shelf-life thresholds.'
          }
        ]
      }
    },
    {
      id: 'mrp-bom',
      title: 'BOM & MRP Engine',
      icon: Calculator,
      content: {
        heading: 'Bill of Materials & Material Requirements Planning',
        description: 'Multi-level BOM explosion and automatic purchase requisition generation based on sales demand.',
        steps: [
          {
            title: 'Multi-Tier Assembly BOMs',
            desc: 'Define raw material items, sub-assembly parts, and machine routing overhead per finished product unit.'
          },
          {
            title: 'MRP Shortfall Analysis',
            desc: 'Run the MRP calculation engine to detect inventory shortages across scheduled production work orders.'
          },
          {
            title: 'Automated Purchase Requisitions',
            desc: 'Generate draft Purchase Orders directly from MRP shortfall alerts with 1-click supplier routing.'
          }
        ]
      }
    },
    {
      id: 'gst-accounting',
      title: 'GST Compliance & Billing',
      icon: FileText,
      content: {
        heading: 'GST Tax Invoicing & Financial Accounting',
        description: 'Compliant Indian GST returns (GSTR-1, GSTR-3B), E-Way bill passes, and P&L financial ledgers.',
        steps: [
          {
            title: 'Automated HSN/SAC Tax Calculation',
            desc: 'Invoices automatically calculate CGST, SGST, and IGST rates based on customer billing location.'
          },
          {
            title: '1-Click E-Way Bill Pass Generation',
            desc: 'Generate transport clearance documentation directly from confirmed sales order dispatches.'
          },
          {
            title: 'GSTR-1 JSON Export',
            desc: 'Export monthly B2B invoice data formatted for direct upload into the official GST portal.'
          }
        ]
      }
    },
    {
      id: 'api-reference',
      title: 'API Endpoint Reference',
      icon: Code,
      content: {
        heading: 'RESTful API Documentation',
        description: 'Complete API endpoints for external ERP integration, mobile apps, and custom webhooks.',
        steps: [
          {
            title: 'GET /api/dashboard/stats',
            desc: 'Fetch real-time KPI metrics, period trend line data, and recent activity logs.'
          },
          {
            title: 'GET / POST /api/purchase',
            desc: 'Retrieve all Purchase Orders or submit a new supplier purchase order.'
          },
          {
            title: 'GET / POST /api/orders',
            desc: 'Fetch confirmed B2B sales orders and execute stock allocation.'
          },
          {
            title: 'GET / POST /api/inventory',
            desc: 'Fetch batch stock logs, update safety stock thresholds, or record adjustments.'
          }
        ]
      }
    }
  ];

  const current = docSections.find(s => s.id === activeSection) || docSections[0];
  const CurrentIcon = current.icon;

  const filteredSections = docSections.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.content.heading.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-amber-500/20">
      {/* Top Navbar - Reusable LandingNavbar */}
      <LandingNavbar />

      {/* Hero Search Header */}
      <div className="py-12 border-b border-blue-300/40 bg-gradient-to-b from-[#93C5FD] via-blue-100 to-slate-50 text-center px-6">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/90 border border-blue-400/60 text-xs font-black text-blue-950 shadow-xs">
            <BookOpen className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Official Technical Documentation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            Prodexa ERP <span className="text-[#2563EB]">Knowledge Base</span>
          </h1>
          <p className="text-slate-800 text-xs sm:text-sm max-w-xl mx-auto font-medium">
            Comprehensive guides, FEFO allocation architecture, GST tax invoicing, and REST API specifications.
          </p>

          {/* Search Bar */}
          <div className="pt-2 max-w-xl mx-auto relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search documentation (e.g. FEFO, GST, MRP, Purchase API)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border-2 border-[#1E3A8A] rounded-full py-2.5 pl-11 pr-4 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#93C5FD] transition-all shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Main Docs Body */}
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Docs Navigation Rail */}
        <div className="lg:col-span-4 space-y-2">
          <p className="px-3 text-[11px] font-black text-slate-500 uppercase tracking-wider mb-3">
            Documentation Modules
          </p>

          {filteredSections.map((sec) => {
            const Icon = sec.icon;
            const isSelected = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full p-3.5 rounded-2xl text-left transition-all duration-200 flex items-center justify-between group cursor-pointer ${
                  isSelected
                    ? 'bg-[#93C5FD] border-2 border-blue-400 text-slate-950 shadow-md font-black'
                    : 'bg-white border-2 border-[#1E3A8A] text-slate-800 hover:bg-blue-50 hover:border-[#93C5FD]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-slate-950 text-white font-bold' : 'bg-slate-100 text-[#2563EB]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-extrabold">{sec.title}</span>
                </div>
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${
                    isSelected ? 'text-slate-950 translate-x-1 font-bold' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div className="lg:col-span-8 bg-white border-2 border-[#1E3A8A] rounded-3xl p-8 lg:p-10 shadow-xl space-y-8 text-left">
          <div className="space-y-3 border-b-2 border-slate-200 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#2563EB]/10 border border-[#2563EB]/20 text-xs font-extrabold text-[#2563EB]">
              <CurrentIcon className="w-4 h-4 text-[#2563EB]" />
              <span>{current.title}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2563EB] tracking-tight">
              {current.content.heading}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {current.content.description}
            </p>
          </div>

          {/* Workflow Steps */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Implementation Workflow</h3>
            <div className="space-y-3">
              {current.content.steps.map((step, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 border-2 border-[#1E3A8A] space-y-1">
                  <h4 className="text-xs font-extrabold text-[#2563EB] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {step.title}
                  </h4>
                  <p className="text-xs text-slate-600 pl-6 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
