'use client';

import React, { useState } from 'react';
import Link from "next/link";
import {
  Layers,
  Factory,
  Users,
  ShoppingCart,
  Package,
  FileText,
  Globe,
  HelpCircle,
  Calendar,
  FileCode2,
  ArrowRight
} from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import StickyFeatureShowcase from "@/components/landing/StickyFeatureShowcase";
import RoiCalculator from "@/components/landing/RoiCalculator";
import HeroMockup from "@/components/landing/HeroMockup";
import DemoModal from "@/components/landing/DemoModal";
import ScrollReveal from "@/components/landing/ScrollReveal";

export default function LandingPage() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF6F1] text-slate-900 selection:bg-amber-200 font-sans">
      {/* 1. Top Navbar */}
      <LandingNavbar onOpenDemo={() => setIsDemoOpen(true)} />

      {/* 2. Hero Section */}
      <main className="relative pt-1.5 sm:pt-3 pb-8 sm:pb-10 overflow-hidden bg-[#1E293B] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center text-center relative z-10 space-y-2.5 sm:space-y-3">

          {/* Software Name & Headline */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-extrabold tracking-tight leading-tight text-white max-w-4xl font-heading">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500">Prodexa</span> — Intelligent Manufacturing & Inventory ERP
          </h1>

          {/* Subtext */}
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed font-normal">
            Coordinate multi-tier BOM planning, FEFO batch allocation, shopfloor routing, and GST compliance in one unified architecture built for mid-market manufacturing.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-row items-center justify-center gap-3 w-full sm:w-auto pb-0.5">
            {/* Primary CTA */}
            <button
              onClick={() => setIsDemoOpen(true)}
              className="px-5 sm:px-6 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-amber-400 transition-all shadow-md cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-slate-950" />
              <span>Book a Demo</span>
            </button>

            {/* Secondary CTA */}
            <Link
              href="/docs"
              className="px-5 sm:px-6 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-white/20 transition-all shadow-xs backdrop-blur-sm"
            >
              <FileCode2 className="w-4 h-4 text-amber-400" />
              <span>View Documentation</span>
            </Link>
          </div>

          {/* Floating Interactive Browser Window Hero Mockup with 350ms tab crossfade */}
          <ScrollReveal direction="scale" delay={100}>
            <div className="w-full max-w-5xl pt-0.5">
              <HeroMockup onOpenDemo={() => setIsDemoOpen(true)} />
            </div>
          </ScrollReveal>
        </div>
      </main>

      {/* 3. Product Modules Section */}
      <section id="modules" className="relative py-20 md:py-24 bg-[#F5EDE3] overflow-hidden">
        <div className="max-w-6xl mx-auto px-8 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block mb-2">Core Enterprise Suite</span>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1E3A8A]">
                Built for Modern Manufacturing Operations
              </h2>
              <p className="text-slate-600 text-sm sm:text-base mt-2">
                Modular enterprise infrastructure engineered to handle continuous production cycles and multi-warehouse logistics.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Manufacturing & Production",
                icon: Factory,
                desc: "Work order scheduling, multi-tier BOM tracking, machine routing, and real-time shopfloor capacity utilization."
              },
              {
                title: "HRMS & Workforce Operations",
                icon: Users,
                desc: "Shift allocation, skill matrix mapping, attendance logging, and contractor labor management."
              },
              {
                title: "Procurement & Purchase Orders",
                icon: ShoppingCart,
                desc: "Automated PO generation upon safety stock shortfall, supplier performance scoring, and quotation comparison."
              },
              {
                title: "Inventory & MRP Planning",
                icon: Package,
                desc: "Multi-warehouse stock reservation, automated reorder triggers, barcode scanning, and safety buffer control."
              },
              {
                title: "GST Invoicing & Compliance",
                icon: FileText,
                desc: "Automated tax invoices, instant E-Way bill generation, and GSTR-1/2B reconciliation data exports."
              },
              {
                title: "Export & Trade Documentation",
                icon: Globe,
                desc: "Multi-currency ledgers, customs dispatch records, packing lists, and commercial shipping invoice generation."
              }
            ].map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <ScrollReveal key={idx} delay={idx * 60}>
                  <div className="p-7 rounded-2xl bg-white border-2 border-[#1E293B]/15 shadow-sm hover:shadow-md hover:border-amber-500/60 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-full group">
                    <div>
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600">
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-semibold text-slate-400 group-hover:text-amber-600 transition-colors">
                          0{idx + 1}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-[#1E293B] mb-2">
                        {mod.title}
                      </h3>
                      <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                        {mod.desc}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Scroll-Linked Sticky Feature Showcase (Primary Wow Interaction) */}
      <StickyFeatureShowcase />

      {/* 5. ROI & Cost Optimization Estimator */}
      <ScrollReveal>
        <RoiCalculator />
      </ScrollReveal>

      {/* 6. Frequently Asked Questions */}
      <section id="faq" className="py-20 bg-[#F5EDE3]">
        <div className="max-w-3xl mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#1E293B]/20 text-xs font-semibold text-slate-800 mb-3 shadow-xs">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Frequently Asked Questions</span>
              </div>
              <h2 className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">Technical & Operational Details</h2>
              <p className="text-slate-600 text-sm mt-2">Key answers regarding deployment, integration, and platform architecture.</p>
            </div>
          </ScrollReveal>

          <div className="space-y-4">
            {[
              {
                q: "How does the FEFO allocation engine handle perishable stock?",
                a: "The FEFO (First-Expired-First-Out) engine systematically indexes all incoming lots with manufacturer expiration timestamps. When sales orders or production batches request raw ingredients, pick lists are automatically generated prioritizing the oldest unexpired lots, preventing warehouse shelf-life losses."
              },
              {
                q: "Can Prodexa ERP operate across multiple physical warehouses and plants?",
                a: "Yes. Prodexa supports multi-location architectures with distinct inventory holding zones, automated inter-plant transfer orders, and unified consolidated visibility for headquarters management."
              },
              {
                q: "How does the system integrate with existing accounting software and GST portals?",
                a: "Prodexa provides direct JSON export schemas for GSTR-1 and GSTR-2B reconciliation alongside automated E-Way bill generation. API connections allow synchronized ledger exports into existing financial software suites."
              },
              {
                q: "What is the typical deployment timeline for a manufacturing facility?",
                a: "Standard mid-market deployments typically take 2 to 4 weeks, including master data import (BOMs, SKUs, vendors), role permission mapping, and shopfloor workstation onboarding."
              }
            ].map((faq, idx) => (
              <ScrollReveal key={idx} delay={idx * 60}>
                <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
                  <h3 className="text-sm sm:text-base font-bold text-[#1E293B] mb-2 flex items-center justify-between">
                    <span>{faq.q}</span>
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-xs sm:text-sm font-normal">
                    {faq.a}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Final Enterprise CTA Banner */}
      <section className="py-20 relative bg-[#1E293B] text-white overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
              Ready to streamline your manufacturing operations?
            </h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto text-sm leading-relaxed font-normal">
              Schedule a focused 1-on-1 demonstration with our engineering team to review how Prodexa integrates into your plant workflow.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setIsDemoOpen(true)}
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-slate-950" />
                <span>Book a Technical Walkthrough</span>
              </button>
              <Link
                href="/docs"
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-semibold hover:bg-white/20 transition-all shadow-xs"
              >
                <span>Explore Technical Documentation</span>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 8. Clean Enterprise Footer */}
      <footer className="border-t border-slate-800 py-8 bg-[#0F172A] text-slate-400">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>
            © {new Date().getFullYear()} Prodexa ERP. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-slate-200 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-200 transition-colors">Terms of Service</Link>
            <Link href="/docs" className="hover:text-slate-200 transition-colors">Documentation</Link>
            <Link href="/support" className="hover:text-slate-200 transition-colors">Support</Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center text-xs text-slate-400">
          <p className="tracking-wide">
            Powered by <span className="text-amber-400 font-bold">Synture</span>
          </p>
        </div>
      </footer>

      {/* Direct Book a Demo Modal */}
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  );
}
