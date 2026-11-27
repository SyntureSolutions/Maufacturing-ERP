'use client';

import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Plus, 
  RefreshCcw, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Layers,
  Bike,
  AlertCircle,
  Loader2
} from 'lucide-react';
import ProjectModal from '@/components/modals/ProjectModal';
import AttachmentDrawer from '@/components/common/AttachmentDrawer';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } else {
        setProjects([]);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectsSafely = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } else {
        setProjects([]);
      }
    } catch (e) {
      console.error(e);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectsSafely();
  }, []);

  const safeProjects = Array.isArray(projects) ? projects : [];

  const totalBudget = safeProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalSpent = safeProjects.reduce((sum, p) => sum + (p.spent || p.actualCost || 0), 0);
  const activeCount = safeProjects.filter(p => p.status === 'IN_PROGRESS').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Bicycle Manufacturing Projects
          </h2>
          <p className="text-slate-500 mt-1">Track long-term bulk supply contracts, assembly line setups, and R&D projects.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchProjectsSafely} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-5 h-5" />
            New Contract / Project
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Contracts</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{safeProjects.length}</h3>
            <p className="text-xs text-indigo-600 font-medium mt-1">Bulk production lines</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Manufacturing</p>
            <h3 className="text-3xl font-bold text-emerald-600 mt-1">{activeCount} <span className="text-sm text-slate-500 font-medium">Projects</span></h3>
            <p className="text-xs text-emerald-600 font-medium mt-1">Currently in progress</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Contract Budget</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">₹{(totalBudget / 100000).toFixed(2)} L</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">Allocated capital</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Utilized Budget</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">₹{(totalSpent / 100000).toFixed(2)} L</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">Actual expenditure</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {loading && safeProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-lg">Retrieving projects...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {safeProjects.map(project => {
            const statusStr = (project.status || 'IN_PROGRESS').replace(/_/g, ' ');
            const spentVal = project.spent !== undefined ? project.spent : (project.actualCost || 0);
            const budgetVal = project.budget || 0;
            const progressPct = budgetVal > 0 ? Math.min(100, Math.round((spentVal / budgetVal) * 100)) : 0;

            return (
              <div key={project._id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold font-mono bg-slate-100 px-2.5 py-1 rounded-lg text-slate-700">
                      {project.projectNumber || 'PRJ-001'}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      project.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      project.status === 'IN_PROGRESS' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {statusStr}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 leading-snug">{project.name}</h3>
                  <p className="text-xs text-indigo-600 font-medium mt-1">Client: {project.customer?.name || 'Internal Manufacturing'}</p>
                  
                  {project.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}
                </div>

                {/* Budget Progress Bar */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Budget Progress</span>
                    <span className="font-bold text-slate-800">{progressPct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${progressPct > 90 ? 'bg-red-500' : 'bg-indigo-600'}`} 
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="text-[11px] text-slate-400 font-bold uppercase block">Budget</span>
                      <strong className="text-slate-800">₹{budgetVal.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="text-[11px] text-slate-400 font-bold uppercase block">Spent</span>
                      <strong className={spentVal > budgetVal ? 'text-red-600' : 'text-slate-800'}>
                        ₹{spentVal.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Footer Manager & Date */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Target: {project.targetEndDate || project.startDate || '2026-06-30'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AttachmentDrawer entityType="PROJECT" entityId={project._id} label="Contract / CAD Docs" />
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm" title={project.manager?.name}>
                      {project.manager?.name?.charAt(0) || 'M'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {safeProjects.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 font-medium bg-white rounded-2xl border border-slate-200">
              No project contracts found. Click "New Contract / Project" to create one.
            </div>
          )}
        </div>
      )}

      <ProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchProjectsSafely} />
    </div>
  );
}
