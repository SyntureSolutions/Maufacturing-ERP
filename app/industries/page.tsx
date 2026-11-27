'use client';

import React, { useState } from 'react';
import LandingNavbar from "@/components/landing/LandingNavbar";
import IndustriesExplorer from "@/components/landing/IndustriesExplorer";
import DemoModal from "@/components/landing/DemoModal";

export default function IndustriesPage() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF6F1] text-slate-900 font-sans selection:bg-amber-200">
      {/* Top Navbar with all Section Links */}
      <LandingNavbar onOpenDemo={() => setIsDemoOpen(true)} />

      {/* Main Industries Component with distinct sections for each field */}
      <IndustriesExplorer onOpenDemo={() => setIsDemoOpen(true)} />

      {/* Interactive Demo Gateway Modal */}
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  );
}
