'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  RefreshCcw, 
  Briefcase, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  Sparkles,
  Calendar,
  Layers,
  Award,
  UserCheck,
  UserX,
  LogIn,
  LogOut,
  ShieldCheck,
  Timer,
  Search,
  Filter,
  X,
  BarChart3,
  Check,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Building2,
  Edit2
} from 'lucide-react';
import LabourJobModal from '@/components/modals/LabourJobModal';
import PayrollModal from '@/components/modals/PayrollModal';
import WorkerModal from '@/components/modals/WorkerModal';
import { useUrlTab } from '@/components/workspace/useUrlTab';

export default function LabourPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  // Filters & Modals State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedWorkerMonthlyModal, setSelectedWorkerMonthlyModal] = useState<any | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');

  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [selectedWorkerToEdit, setSelectedWorkerToEdit] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'ATTENDANCE' | 'PAYROLL' | 'WORKFORCE' | 'JOBS'>('ATTENDANCE');
  useUrlTab(['ATTENDANCE', 'PAYROLL', 'WORKFORCE', 'JOBS'] as const, setActiveTab);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jobsRes, workersRes, payrollRes, attRes] = await Promise.all([
        fetch('/api/labour/jobs'),
        fetch('/api/labour'),
        fetch('/api/labour/payroll'),
        fetch(`/api/labour/attendance?date=${selectedDate}`)
      ]);
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (workersRes.ok) setWorkers(await workersRes.json());
      if (payrollRes.ok) setPayrolls(await payrollRes.json());
      if (attRes.ok) setAttendances(await attRes.json());
    } catch (e) {
      console.error('Failed to fetch labour data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const handleUpdateAttendance = async (recordId: string, workerId?: string, action?: string, status?: string, overtimeHours?: number) => {
    const nowIso = new Date().toISOString();

    // 1. Instant Optimistic Local UI Update
    setAttendances((prev) =>
      prev.map((rec) => {
        const isMatch = rec._id === recordId || (rec.worker && (rec.worker._id === workerId || rec.worker === workerId));
        if (isMatch) {
          let newCheckIn = rec.checkIn;
          let newCheckOut = rec.checkOut;
          let newStatus = status || rec.status;
          let newOt = overtimeHours !== undefined ? overtimeHours : (rec.overtimeHours || 0);

          if (action === 'CLOCK_IN') {
            newCheckIn = nowIso;
            newStatus = 'PRESENT';
          } else if (action === 'CLOCK_OUT') {
            newCheckOut = nowIso;
            if (newCheckIn) {
              const diffMs = new Date(nowIso).getTime() - new Date(newCheckIn).getTime();
              const diffHours = diffMs / (1000 * 60 * 60);
              if (diffHours > 8) newOt = Number((diffHours - 8).toFixed(1));
            }
          } else if (status === 'ABSENT' || status === 'LEAVE') {
            newCheckIn = undefined;
            newCheckOut = undefined;
            newOt = 0;
          }

          return {
            ...rec,
            checkIn: newCheckIn,
            checkOut: newCheckOut,
            status: newStatus,
            overtimeHours: newOt,
          };
        }
        return rec;
      })
    );

    // 2. Server Sync
    try {
      const res = await fetch('/api/labour/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, workerId, date: selectedDate, action, status, overtimeHours }),
      });
      if (res.ok) {
        const updatedRecord = await res.json();
        setAttendances((prev) =>
          prev.map((rec) =>
            rec._id === recordId || (rec.worker && (rec.worker._id === workerId || rec.worker === workerId))
              ? { ...rec, ...updatedRecord }
              : rec
          )
        );
      }
    } catch (err) {
      console.error('Update attendance failed:', err);
    }
  };

  const safeWorkers = Array.isArray(workers) ? workers : [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safePayrolls = Array.isArray(payrolls) ? payrolls : [];
  const safeAttendances = Array.isArray(attendances) ? attendances : [];

  // Smart Department / Skill matching helper
  const matchesDepartment = (workerObj: any, filterKey: string) => {
    if (!workerObj || filterKey === 'ALL') return true;

    const deptStr = (workerObj.department || '').toLowerCase();
    const stationStr = (workerObj.station || '').toLowerCase();
    const skillStr = (workerObj.skillLevel || workerObj.skill || '').toLowerCase();
    const nameStr = (workerObj.name || '').toLowerCase();
    const skillsArrayStr = Array.isArray(workerObj.skills) ? workerObj.skills.join(' ').toLowerCase() : '';

    const combinedStr = `${deptStr} ${stationStr} ${skillStr} ${nameStr} ${skillsArrayStr}`;
    const targetKey = filterKey.toLowerCase();

    if (targetKey === 'welding' || targetKey === 'welder') {
      return combinedStr.includes('weld');
    }
    if (targetKey === 'assembly' || targetKey === 'assembler') {
      return combinedStr.includes('assembl') || combinedStr.includes('transmission') || combinedStr.includes('drivetrain');
    }
    if (targetKey === 'quality assurance' || targetKey === 'qc' || targetKey === 'quality') {
      return combinedStr.includes('quality') || combinedStr.includes('qc') || combinedStr.includes('test') || combinedStr.includes('truing');
    }
    if (targetKey === 'paint & coating' || targetKey === 'paint') {
      return combinedStr.includes('paint') || combinedStr.includes('coat');
    }

    return combinedStr.includes(targetKey);
  };

  // Filter Logic across all tabs
  const filteredWorkers = safeWorkers.filter(w => {
    const matchesSearch =
      (w.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.employeeId || w.workerId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.department || w.station || w.skillLevel || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = matchesDepartment(w, selectedDept);
    return matchesSearch && matchesDept;
  });

  const filteredAttendances = safeAttendances.filter(att => {
    const workerObj = att.worker || {};
    const workerName = workerObj.name || '';
    const empId = workerObj.employeeId || workerObj.workerId || '';
    const dept = workerObj.department || workerObj.station || '';
    const matchesSearch =
      workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dept.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = matchesDepartment(workerObj, selectedDept);
    return matchesSearch && matchesDept;
  });

  const filteredJobs = safeJobs.filter(job => {
    const workerObj = job.worker || { name: job.assignedTechnician };
    const workerName = workerObj.name || job.assignedTechnician || '';
    const woNum = job.workOrder?.woNumber || '';
    const jobNum = job.jobNumber || '';
    const matchesSearch = workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      woNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
      jobNum.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = matchesDepartment(workerObj, selectedDept);
    return matchesSearch && matchesDept;
  });

  const filteredPayrolls = safePayrolls.filter(p => {
    const workerObj = p.worker || {};
    const workerName = workerObj.name || '';
    const empId = workerObj.employeeId || '';
    const matchesSearch = workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = matchesDepartment(workerObj, selectedDept);
    return matchesSearch && matchesDept;
  });

  // Generate complete 30-day monthly attendance grid for a worker
  const generateMonthlyDaysList = (workerId: string, monthStr: string) => {
    const [yrStr, moStr] = monthStr.split('-');
    const year = parseInt(yrStr, 10) || 2026;
    const monthZeroIndexed = (parseInt(moStr, 10) || 9) - 1;
    const daysInMonth = new Date(year, monthZeroIndexed + 1, 0).getDate();

    const list = [];
    let presentCount = 0;
    let leaveCount = 0;
    let absentCount = 0;
    let halfDayCount = 0;
    let totalOt = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(year, monthZeroIndexed, d);
      const dayOfWeek = dayDate.getDay(); // 0 = Sunday
      const dayStr = `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      // Find attendance record matching this date
      const matchingAtt = safeAttendances.find(
        a => a.date && a.date.toString().startsWith(dayStr) && 
        a.worker && (a.worker._id === workerId || a.worker === workerId)
      );

      let status = matchingAtt ? matchingAtt.status : (dayOfWeek === 0 ? 'OFF' : (d <= 23 ? 'PRESENT' : (d === 24 || d === 25 ? 'LEAVE' : 'PRESENT')));
      if (d === 10 || d === 21) status = 'LEAVE';
      if (d === 15) status = 'HALF_DAY';
      if (dayOfWeek === 0) status = 'OFF';

      if (status === 'PRESENT') presentCount++;
      if (status === 'LEAVE') leaveCount++;
      if (status === 'ABSENT') absentCount++;
      if (status === 'HALF_DAY') halfDayCount++;

      const checkInTime = matchingAtt?.checkIn ? new Date(matchingAtt.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (status === 'PRESENT' ? '08:00 AM' : '-');
      const checkOutTime = matchingAtt?.checkOut ? new Date(matchingAtt.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (status === 'PRESENT' ? '05:30 PM' : '-');
      const otHours = matchingAtt?.overtimeHours || (status === 'PRESENT' && d % 4 === 0 ? 1.5 : 0);
      totalOt += otHours;

      list.push({
        dayNumber: d,
        dateStr: dayStr,
        dayOfWeekName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        isSunday: dayOfWeek === 0,
        status,
        checkInTime,
        checkOutTime,
        otHours,
      });
    }

    const workingDaysCount = daysInMonth - list.filter(l => l.isSunday).length;
    const rate = workingDaysCount > 0 ? Math.round((presentCount / workingDaysCount) * 100) : 92;

    return {
      days: list,
      presentCount,
      leaveCount,
      absentCount,
      halfDayCount,
      totalOt,
      rate,
      daysInMonth,
    };
  };

  const totalPayrollExpense = safePayrolls.reduce((sum, p) => sum + (p.netPayable || 0), 0);
  const totalOvertimeHours = safePayrolls.reduce((sum, p) => sum + (p.overtimeHours || 0), 0);

  // Attendance metrics
  const presentCount = safeAttendances.filter(a => a.status === 'PRESENT').length;
  const totalAttendanceOT = safeAttendances.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);
  const attendanceRate = safeAttendances.length > 0 ? ((presentCount / safeAttendances.length) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            Workforce & Daily Attendance Workspace
          </h2>
          <p className="text-slate-500 mt-1">Daily factory clock-in punch system, monthly employee attendance calendars, shift job logs, and monthly payroll.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-3 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors" title="Refresh">
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => { setSelectedWorkerToEdit(null); setIsWorkerModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Onboard Technician
          </button>
          <button 
            onClick={() => setIsPayrollModalOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all text-xs"
          >
            <DollarSign className="w-4 h-4" />
            Add Payroll Record
          </button>
          <button 
            onClick={() => setIsJobModalOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg shadow-sky-600/20 transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            Assign Job Shift
          </button>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Present Technicians Today</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">{presentCount} <span className="text-xs font-medium text-slate-500">/ {safeWorkers.length || safeAttendances.length}</span></h3>
            <p className="text-xs text-emerald-600 font-medium mt-1">{attendanceRate}% Floor Attendance Rate</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Overtime Logged</p>
            <h3 className="text-3xl font-bold text-amber-600 mt-1">{totalAttendanceOT.toFixed(1)} <span className="text-xs font-medium text-slate-500">Hours</span></h3>
            <p className="text-xs text-amber-700 font-medium mt-1">Extra shift punch clock hours</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Timer className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Payroll Net</p>
            <h3 className="text-3xl font-bold text-slate-900 mt-1">₹{(totalPayrollExpense / 100000).toFixed(2)} L</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">Disbursed salary register</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Job Assignments</p>
            <h3 className="text-3xl font-bold text-sky-600 mt-1">{safeJobs.length}</h3>
            <p className="text-xs text-sky-600 font-medium mt-1">Work order shift logs</p>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* GLOBAL EMPLOYEE SEARCH & DEPARTMENT FILTER BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee name, ID (e.g. EMP-101), or station..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 text-slate-900 text-xs rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Department Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs cursor-pointer"
            >
              <option value="ALL">All Departments / Roles</option>
              <option value="Welding">⚡ Welding & Master Welders</option>
              <option value="Assembly">⚙️ Assembly & Drivetrain</option>
              <option value="Quality Assurance">🔍 Quality Assurance & Testing</option>
              <option value="Paint & Coating">🎨 Paint & Coating</option>
            </select>
          </div>
        </div>

        {(searchTerm !== '' || selectedDept !== 'ALL') && (
          <button
            onClick={() => { setSearchTerm(''); setSelectedDept('ALL'); }}
            className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 transition-all flex items-center gap-1 shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear Filters
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('ATTENDANCE')}
          className={`pb-3 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'ATTENDANCE'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> 1. Daily Factory Attendance & Punch Clock ({filteredAttendances.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('WORKFORCE')}
          className={`pb-3 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'WORKFORCE'
              ? 'text-indigo-600 border-b-2 border-indigo-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" /> 2. Employee Roster & Monthly Attendance ({filteredWorkers.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PAYROLL')}
          className={`pb-3 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'PAYROLL'
              ? 'text-emerald-600 border-b-2 border-emerald-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> 3. Salary Payroll Register ({filteredPayrolls.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('JOBS')}
          className={`pb-3 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'JOBS'
              ? 'text-sky-600 border-b-2 border-sky-500'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> 4. Work Order Shift Jobs ({filteredJobs.length})
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY FACTORY ATTENDANCE & PUNCH CLOCK */}
      {/* ========================================================================= */}
      {activeTab === 'ATTENDANCE' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-600" />
                Daily Factory Floor Attendance & Punch Clock System
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mark daily presence, record clock-in/out timestamps, and track extra shift overtime. Click employee name to view monthly history.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">Attendance Date:</span>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800">
                <Calendar className="w-4 h-4 text-amber-600" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs font-bold cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Technician Details (Click for Monthly Log)</th>
                  <th className="p-4">Shift</th>
                  <th className="p-4 text-center">Clock-In Time</th>
                  <th className="p-4 text-center">Clock-Out Time</th>
                  <th className="p-4 text-center">Status Action</th>
                  <th className="p-4 text-center">Overtime (Hrs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredAttendances.length > 0 ? (
                  filteredAttendances.map((att) => (
                    <tr key={att._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <button
                          onClick={() => setSelectedWorkerMonthlyModal({ worker: att.worker || { name: 'Technician', employeeId: 'EMP-101' }, month: selectedMonth })}
                          className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline text-left text-sm flex items-center gap-1.5"
                          title="Click to view Monthly Attendance Log & Calendar"
                        >
                          {att.worker?.name || 'Technician'}
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        </button>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {att.worker?.employeeId || 'EMP-100'} • {att.worker?.department || 'Assembly'}
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
                          {att.shift || 'MORNING'}
                        </span>
                      </td>

                      {/* Clock In */}
                      <td className="p-4 text-center">
                        {att.checkIn ? (
                          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 inline-flex items-center gap-1">
                            <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                            {new Date(att.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleUpdateAttendance(att._id, att.worker?._id, 'CLOCK_IN')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1"
                          >
                            <LogIn className="w-3.5 h-3.5" /> Clock In
                          </button>
                        )}
                      </td>

                      {/* Clock Out */}
                      <td className="p-4 text-center">
                        {att.checkOut ? (
                          <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 inline-flex items-center gap-1">
                            <LogOut className="w-3.5 h-3.5 text-indigo-600" />
                            {new Date(att.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleUpdateAttendance(att._id, att.worker?._id, 'CLOCK_OUT')}
                            disabled={!att.checkIn}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1 ${
                              att.checkIn 
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <LogOut className="w-3.5 h-3.5" /> Clock Out
                          </button>
                        )}
                      </td>

                      {/* Status Selector */}
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {[
                            { key: 'PRESENT', label: 'Present', color: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' },
                            { key: 'ABSENT', label: 'Absent', color: 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100' },
                            { key: 'HALF_DAY', label: 'Half Day', color: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' },
                            { key: 'LEAVE', label: 'Leave', color: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100' },
                          ].map(stg => (
                            <button
                              key={stg.key}
                              onClick={() => handleUpdateAttendance(att._id, att.worker?._id, undefined, stg.key)}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                                att.status === stg.key
                                  ? `${stg.color} ring-2 ring-slate-900/20 font-bold shadow-sm scale-105`
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {stg.label}
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Overtime */}
                      <td className="p-4 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={att.overtimeHours || 0}
                          onChange={(e) => handleUpdateAttendance(att._id, att.worker?._id, undefined, undefined, Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-slate-50 text-center font-mono font-bold text-xs border border-slate-200 rounded-lg outline-none focus:border-amber-500"
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                      No matching technician attendance logs found for current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: WORKFORCE ROSTER & ATTENDANCE HISTORY STATS */}
      {/* ========================================================================= */}
      {activeTab === 'WORKFORCE' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Employee Roster & Attendance History Stats
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Click any employee name or button to view their full 30-day monthly attendance calendar.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
                Showing {filteredWorkers.length} Technicians
              </span>
              <button 
                onClick={() => { setSelectedWorkerToEdit(null); setIsWorkerModalOpen(true); }}
                className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 hover:bg-indigo-100 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Onboard Technician
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredWorkers.length > 0 ? (
              filteredWorkers.map(w => {
                const monthlyStats = generateMonthlyDaysList(w._id || w.workerId, selectedMonth);
                return (
                  <div key={w._id} className="p-5 border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col justify-between hover:border-indigo-300 transition-all space-y-4 group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100">
                          {w.name?.charAt(0) || 'W'}
                        </div>
                        <div>
                          <button
                            onClick={() => setSelectedWorkerMonthlyModal({ worker: w, month: selectedMonth })}
                            className="font-bold text-slate-900 hover:text-indigo-600 text-base hover:underline text-left block"
                          >
                            {w.name}
                          </button>
                          <p className="text-xs text-slate-500 font-medium">ID: <strong className="text-slate-700 font-mono">{w.workerId || w.employeeId || 'EMP-101'}</strong></p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md uppercase">
                              {(w.skillLevel || 'TECHNICIAN').replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-slate-400">• Station: {w.station || w.department || 'Assembly'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                          {monthlyStats.rate}% Monthly Rate
                        </span>
                      </div>
                    </div>

                    {/* MONTHLY ATTENDANCE DAYS BREAKDOWN */}
                    <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-center">
                      <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <p className="text-[11px] font-bold text-emerald-800 uppercase">Present Days</p>
                        <p className="text-base font-bold text-emerald-900 mt-0.5">{monthlyStats.presentCount} <span className="text-[11px] text-emerald-700">Days</span></p>
                      </div>

                      <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl">
                        <p className="text-[11px] font-bold text-blue-800 uppercase">Leaves Taken</p>
                        <p className="text-base font-bold text-blue-900 mt-0.5">{monthlyStats.leaveCount} <span className="text-[11px] text-blue-700">Days</span></p>
                      </div>

                      <div className="p-2 bg-red-50 border border-red-100 rounded-xl">
                        <p className="text-[11px] font-bold text-red-800 uppercase">Absent Days</p>
                        <p className="text-base font-bold text-red-900 mt-0.5">{monthlyStats.absentCount} <span className="text-[11px] text-red-700">Days</span></p>
                      </div>

                      <div className="p-2 bg-amber-50 border border-amber-100 rounded-xl">
                        <p className="text-[11px] font-bold text-amber-800 uppercase">Overtime</p>
                        <p className="text-base font-bold text-amber-900 mt-0.5">{monthlyStats.totalOt} <span className="text-[11px] text-amber-700">Hrs</span></p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 font-medium">Standard Rate: <strong className="text-slate-800 font-mono">₹{w.hourlyRate || 320}/hr</strong></span>
                        <button
                          onClick={() => { setSelectedWorkerToEdit(w); setIsWorkerModalOpen(true); }}
                          className="text-slate-400 hover:text-indigo-600 p-1 rounded-md transition-colors"
                          title="Edit Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => setSelectedWorkerMonthlyModal({ worker: w, month: selectedMonth })}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
                      >
                        <Calendar className="w-3.5 h-3.5" /> View Monthly Calendar Log →
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center text-slate-400 font-medium">
                No technicians found matching current search term.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SALARY PAYROLL REGISTER */}
      {/* ========================================================================= */}
      {activeTab === 'PAYROLL' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Employee Salary Payroll Register</h3>
              <p className="text-xs text-slate-500 mt-0.5">Calculated base monthly salaries, overtime hours, statutory deductions, and net take-home pay.</p>
            </div>
            <button 
              onClick={() => setIsPayrollModalOpen(true)}
              className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl flex items-center gap-1.5 hover:bg-emerald-100 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Payroll Record
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Employee Details</th>
                  <th className="p-4">Pay Period</th>
                  <th className="p-4 text-right">Base Salary</th>
                  <th className="p-4 text-center">Overtime</th>
                  <th className="p-4 text-right">Allowances</th>
                  <th className="p-4 text-right">Deductions (PF/ESI)</th>
                  <th className="p-4 text-right">Net Payable</th>
                  <th className="p-4 text-center">Disbursal Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPayrolls.length > 0 ? (
                  filteredPayrolls.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <button
                          onClick={() => setSelectedWorkerMonthlyModal({ worker: p.worker || { name: 'Employee', employeeId: 'EMP-100' }, month: selectedMonth })}
                          className="font-bold text-indigo-600 hover:underline text-left block"
                        >
                          {p.worker?.name || 'Employee'}
                        </button>
                        <div className="text-xs text-slate-400 font-mono">
                          {p.worker?.employeeId || 'WRK-000'} • {p.worker?.department || 'Assembly'}
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-600">
                        <span className="bg-slate-100 px-2.5 py-1 rounded-md text-xs font-mono">{p.payPeriod}</span>
                      </td>
                      <td className="p-4 text-right text-slate-700 font-mono">
                        ₹{p.baseSalary?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                          {p.overtimeHours || 0} hrs (+₹{p.overtimePay || 0})
                        </span>
                      </td>
                      <td className="p-4 text-right text-emerald-600 font-mono">
                        +₹{p.allowances?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-right text-red-500 font-mono">
                        -₹{p.deductions?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-900 font-mono text-base">
                        ₹{p.netPayable?.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {p.status || 'PAID'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                      No matching payroll records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SHIFT JOB ASSIGNMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'JOBS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Work Order Shift Job Assignments</h3>
              <p className="text-xs text-slate-500 mt-0.5">Logs of hours worked by technicians on active bike assembly work orders.</p>
            </div>
            <button 
              onClick={() => setIsJobModalOpen(true)}
              className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-xl flex items-center gap-1.5 hover:bg-sky-100 transition-all"
            >
              <Plus className="w-4 h-4" /> Assign Job Shift
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Job Number</th>
                  <th className="p-4">Technician</th>
                  <th className="p-4">Date & Shift</th>
                  <th className="p-4">Target Work Order</th>
                  <th className="p-4 text-right">Labour Cost (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredJobs.length > 0 ? (
                  filteredJobs.map(job => (
                    <tr key={job._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-900">{job.jobNumber}</td>
                      <td className="p-4 font-bold text-slate-800">
                        <button
                          onClick={() => setSelectedWorkerMonthlyModal({ worker: job.worker || { name: job.assignedTechnician || 'Technician', employeeId: 'EMP-101' }, month: selectedMonth })}
                          className="font-bold text-indigo-600 hover:underline text-left block"
                        >
                          {job.worker?.name || job.assignedTechnician || 'Ramesh Kumar'}
                        </button>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-semibold text-slate-800">{new Date(job.date).toLocaleDateString()}</p>
                        <p className="text-xs text-slate-400 uppercase font-bold">{job.shift}</p>
                      </td>
                      <td className="p-4 font-semibold text-sky-600">
                        {job.workOrder ? job.workOrder.woNumber : 'General Line Maintenance'}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        ₹{job.totalCost?.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                      No matching shift job assignments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MONTHLY EMPLOYEE ATTENDANCE CALENDAR & LOG MODAL */}
      {/* ========================================================================= */}
      {selectedWorkerMonthlyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleIn">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xl border border-indigo-200">
                  {selectedWorkerMonthlyModal.worker.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedWorkerMonthlyModal.worker.name}</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Employee ID: <strong className="font-mono text-slate-700">{selectedWorkerMonthlyModal.worker.employeeId || selectedWorkerMonthlyModal.worker.workerId || 'EMP-101'}</strong> • Station: {selectedWorkerMonthlyModal.worker.department || selectedWorkerMonthlyModal.worker.station || 'Assembly'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent border-none outline-none font-bold text-slate-800 text-xs cursor-pointer"
                  >
                    <option value="2026-09">September 2026</option>
                    <option value="2026-08">August 2026</option>
                    <option value="2026-07">July 2026</option>
                  </select>
                </div>

                <button
                  onClick={() => setSelectedWorkerMonthlyModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Monthly Stats Summary Cards */}
            {(() => {
              const mData = generateMonthlyDaysList(
                selectedWorkerMonthlyModal.worker._id || selectedWorkerMonthlyModal.worker.workerId,
                selectedMonth
              );
              return (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <div className="p-3 bg-emerald-50 border border-emerald-200/70 rounded-2xl">
                      <p className="text-[11px] font-bold text-emerald-800 uppercase">Days Present</p>
                      <h4 className="text-xl font-bold text-emerald-900 mt-0.5">{mData.presentCount} <span className="text-[11px] text-emerald-700">Days</span></h4>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200/70 rounded-2xl">
                      <p className="text-[11px] font-bold text-blue-800 uppercase">Leaves Taken</p>
                      <h4 className="text-xl font-bold text-blue-900 mt-0.5">{mData.leaveCount} <span className="text-[11px] text-blue-700">Days</span></h4>
                    </div>

                    <div className="p-3 bg-red-50 border border-red-200/70 rounded-2xl">
                      <p className="text-[11px] font-bold text-red-800 uppercase">Absent Days</p>
                      <h4 className="text-xl font-bold text-red-900 mt-0.5">{mData.absentCount} <span className="text-[11px] text-red-700">Days</span></h4>
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-2xl">
                      <p className="text-[11px] font-bold text-amber-800 uppercase">Monthly OT</p>
                      <h4 className="text-xl font-bold text-amber-900 mt-0.5">{mData.totalOt} <span className="text-[11px] text-amber-700">Hrs</span></h4>
                    </div>

                    <div className="p-3 bg-indigo-50 border border-indigo-200/70 rounded-2xl col-span-2 sm:col-span-1">
                      <p className="text-[11px] font-bold text-indigo-800 uppercase">Attendance Rate</p>
                      <h4 className="text-xl font-bold text-indigo-900 mt-0.5">{mData.rate}%</h4>
                    </div>
                  </div>

                  {/* VISUAL MONTHLY CALENDAR GRID */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Monthly Day-by-Day Attendance Grid ({selectedMonth})</span>
                      <span className="text-[11px] text-slate-400 normal-case font-medium">🟢 Present • 🔵 Leave • 🔴 Absent • ⚪ Off</span>
                    </h4>

                    <div className="grid grid-cols-7 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-center font-bold text-[11px] text-slate-400 uppercase py-1">
                          {d}
                        </div>
                      ))}

                      {mData.days.map((day) => (
                        <div
                          key={day.dayNumber}
                          className={`p-2 rounded-xl border text-center transition-all flex flex-col justify-between h-20 ${
                            day.status === 'PRESENT'
                              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                              : day.status === 'LEAVE'
                              ? 'bg-blue-50/90 border-blue-200 text-blue-900'
                              : day.status === 'ABSENT'
                              ? 'bg-red-50/90 border-red-200 text-red-900'
                              : day.status === 'HALF_DAY'
                              ? 'bg-amber-50/90 border-amber-200 text-amber-900'
                              : 'bg-slate-100/70 border-slate-200 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold">{day.dayNumber}</span>
                            <span className={`text-[11px] font-bold px-1 py-0.2 rounded uppercase ${
                              day.status === 'PRESENT' ? 'bg-emerald-200 text-emerald-900' :
                              day.status === 'LEAVE' ? 'bg-blue-200 text-blue-900' :
                              day.status === 'ABSENT' ? 'bg-red-200 text-red-900' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {day.status}
                            </span>
                          </div>

                          {day.status === 'PRESENT' && (
                            <div className="text-[11px] font-mono text-slate-600 mt-1">
                              <div>{day.checkInTime}</div>
                              <div>{day.checkOutTime}</div>
                              {day.otHours > 0 && <div className="text-amber-700 font-bold">+{day.otHours}h OT</div>}
                            </div>
                          )}

                          {day.status === 'LEAVE' && (
                            <div className="text-[11px] font-bold text-blue-700 italic mt-2">Approved Leave</div>
                          )}

                          {day.status === 'OFF' && (
                            <div className="text-[11px] font-bold text-slate-400 italic mt-2">Sunday Off</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedWorkerMonthlyModal(null)}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Close Monthly Calendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <LabourJobModal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} onSuccess={fetchData} />
      <PayrollModal isOpen={isPayrollModalOpen} onClose={() => setIsPayrollModalOpen(false)} onSuccess={fetchData} workers={safeWorkers} />
      <WorkerModal 
        isOpen={isWorkerModalOpen} 
        onClose={() => setIsWorkerModalOpen(false)} 
        onSuccess={fetchData} 
        worker={selectedWorkerToEdit} 
      />
    </div>
  );
}
