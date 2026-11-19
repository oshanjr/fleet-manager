"use client";

import { useMemo, useState } from "react";
import {
  addEmployeeAction,
  updateEmployeeAction,
  deleteEmployeeAction,
  markBulkAttendanceAction,
  addCrewAction,
  updateCrewAction,
  deleteCrewAction,
  addSalaryPaymentAction,
  updateSalaryPaymentAction,
  deleteSalaryPaymentAction,
} from "@/app/actions/fleet";
import {
  Bus,
  CrewMember,
  Employee,
  SalaryPayment,
  Settings,
  formatLKR,
  downloadCSV,
} from "@/lib/fleet-calc";

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none";

type SubTab = "roster" | "attendance" | "payments";
type AttendanceStatus = "PRESENT" | "HALF_DAY" | "ABSENT";

export default function EmployeesTab({
  employees,
  crewRoster,
  salaryPayments,
  buses,
  settings,
  todayStr,
  onChanged,
}: {
  employees: Employee[];
  crewRoster: CrewMember[];
  salaryPayments: SalaryPayment[];
  buses: Bus[];
  settings: Settings;
  todayStr: string;
  onChanged: () => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<SubTab>("roster");
  const [periodMonth, setPeriodMonth] = useState(todayStr.slice(0, 7));
  const [attendanceDate, setAttendanceDate] = useState(todayStr);
  const [showAllDates, setShowAllDates] = useState(false);

  // Filters
  const [roleFilter, setRoleFilter] = useState<"" | "DRIVER" | "CONDUCTOR">("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [search, setSearch] = useState("");
  const [paymentEmpFilter, setPaymentEmpFilter] = useState("");

  // Employee Modal
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    name: "",
    role: "DRIVER" as "DRIVER" | "CONDUCTOR",
    phone: "",
    nic: "",
    licenseNumber: "",
    salaryType: "DAILY" as "DAILY" | "MONTHLY",
    baseSalary: String(settings.driverBaseWage),
    busId: "",
    isActive: true,
    joinedDate: todayStr,
    notes: "",
  });

  // Bulk attendance draft state keyed by employeeId
  const [bulkDraft, setBulkDraft] = useState<
    Record<string, { status: AttendanceStatus; busId: string; advanceTaken: string }>
  >({});

  // Single attendance edit modal
  const [attModalOpen, setAttModalOpen] = useState(false);
  const [editingAtt, setEditingAtt] = useState<CrewMember | null>(null);
  const [attForm, setAttForm] = useState({
    employeeId: "",
    employeeName: "",
    role: "DRIVER" as "DRIVER" | "CONDUCTOR",
    busId: "",
    date: todayStr,
    status: "PRESENT" as AttendanceStatus,
    dailyWage: String(settings.driverBaseWage),
    advanceTaken: "0",
  });

  // Salary Payment Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [editingPay, setEditingPay] = useState<SalaryPayment | null>(null);
  const [payForm, setPayForm] = useState({
    employeeId: "",
    paymentDate: todayStr,
    periodMonth: todayStr.slice(0, 7),
    grossEarned: "0",
    bonus: "0",
    deductions: "0",
    netPaid: "0",
    paymentMethod: "Cash",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((prev) => (prev === msg ? "" : prev)), 4000);
  };

  // Compute per-employee financial summary for selected periodMonth
  const employeeStats = useMemo(() => {
    const map = new Map<
      string,
      {
        daysPresent: number;
        halfDays: number;
        daysAbsent: number;
        wagesEarned: number;
        advancesTaken: number;
        salaryPaid: number;
        balanceOwed: number;
      }
    >();

    for (const emp of employees) {
      map.set(emp.id, {
        daysPresent: 0,
        halfDays: 0,
        daysAbsent: 0,
        wagesEarned: 0,
        advancesTaken: 0,
        salaryPaid: 0,
        balanceOwed: 0,
      });
    }

    for (const c of crewRoster) {
      if (periodMonth && !(c.date || "").startsWith(periodMonth)) continue;
      const empId =
        c.employeeId ||
        employees.find((e) => e.name.toLowerCase() === c.name.toLowerCase())?.id;
      if (!empId) continue;
      const st = map.get(empId);
      if (!st) continue;
      const status = c.status ?? (c.present ? "PRESENT" : "ABSENT");
      if (status === "PRESENT") st.daysPresent += 1;
      else if (status === "HALF_DAY") st.halfDays += 1;
      else st.daysAbsent += 1;
      st.wagesEarned += c.wage;
      st.advancesTaken += c.advance;
    }

    for (const p of salaryPayments) {
      if (periodMonth && p.periodMonth !== periodMonth) continue;
      const st = map.get(p.employeeId);
      if (!st) continue;
      st.salaryPaid += p.netPaid;
    }

    for (const emp of employees) {
      const st = map.get(emp.id)!;
      // For MONTHLY employees without attendance logs, show baseSalary as reference earned if wagesEarned == 0
      const grossRef =
        emp.salaryType === "MONTHLY" && st.wagesEarned === 0 && st.daysPresent === 0
          ? emp.baseSalary
          : st.wagesEarned;
      st.balanceOwed = Math.max(0, grossRef - st.advancesTaken - st.salaryPaid);
    }

    return map;
  }, [employees, crewRoster, salaryPayments, periodMonth]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (roleFilter && e.role !== roleFilter) return false;
      if (statusFilter === "ACTIVE" && !e.isActive) return false;
      if (statusFilter === "INACTIVE" && e.isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !`${e.name} ${e.phone} ${e.nic} ${e.assignedBus}`.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [employees, roleFilter, statusFilter, search]);

  const kpis = useMemo(() => {
    const activeCount = employees.filter((e) => e.isActive).length;
    let totalEarned = 0;
    let totalAdvances = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    for (const emp of employees) {
      const st = employeeStats.get(emp.id);
      if (!st) continue;
      totalEarned += st.wagesEarned;
      totalAdvances += st.advancesTaken;
      totalPaid += st.salaryPaid;
      totalBalance += st.balanceOwed;
    }
    return { activeCount, totalEarned, totalAdvances, totalPaid, totalBalance };
  }, [employees, employeeStats]);

  // Existing attendance records for attendanceDate
  const dateAttendanceMap = useMemo(() => {
    const m = new Map<string, CrewMember>();
    for (const c of crewRoster) {
      if (c.date !== attendanceDate) continue;
      if (c.employeeId) m.set(c.employeeId, c);
      else {
        const match = employees.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
        if (match) m.set(match.id, c);
      }
    }
    return m;
  }, [crewRoster, attendanceDate, employees]);

  const getDraftForEmployee = (emp: Employee) => {
    const draft = bulkDraft[emp.id];
    if (draft) return draft;
    const existing = dateAttendanceMap.get(emp.id);
    if (existing) {
      return {
        status: (existing.status ?? (existing.present ? "PRESENT" : "ABSENT")) as AttendanceStatus,
        busId: existing.busId || "",
        advanceTaken: String(existing.advance || 0),
      };
    }
    return {
      status: "PRESENT" as AttendanceStatus,
      busId: emp.busId || "",
      advanceTaken: "0",
    };
  };

  const setDraftField = (
    emp: Employee,
    patch: Partial<{ status: AttendanceStatus; busId: string; advanceTaken: string }>
  ) => {
    const curr = getDraftForEmployee(emp);
    setBulkDraft((prev) => ({
      ...prev,
      [emp.id]: { ...curr, ...patch },
    }));
  };

  const computeDailyRate = (emp: Employee, status: AttendanceStatus) => {
    const full = emp.salaryType === "MONTHLY" ? Math.round(emp.baseSalary / 30) : emp.baseSalary;
    if (status === "PRESENT") return full;
    if (status === "HALF_DAY") return Math.round(full / 2);
    return 0;
  };

  // Employee CRUD handlers
  const closeAllPanels = () => {
    setEmpModalOpen(false);
    setAttModalOpen(false);
    setPayModalOpen(false);
  };

  const openAddEmployee = () => {
    closeAllPanels();
    setEditingEmp(null);
    setError("");
    setEmpForm({
      name: "",
      role: "DRIVER",
      phone: "",
      nic: "",
      licenseNumber: "",
      salaryType: "DAILY",
      baseSalary: String(settings.driverBaseWage),
      busId: "",
      isActive: true,
      joinedDate: todayStr,
      notes: "",
    });
    setEmpModalOpen(true);
  };

  const openEditEmployee = (emp: Employee) => {
    closeAllPanels();
    setEditingEmp(emp);
    setError("");
    setEmpForm({
      name: emp.name,
      role: emp.role,
      phone: emp.phone,
      nic: emp.nic,
      licenseNumber: emp.licenseNumber,
      salaryType: emp.salaryType,
      baseSalary: String(emp.baseSalary),
      busId: emp.busId || "",
      isActive: emp.isActive,
      joinedDate: emp.joinedDate || todayStr,
      notes: emp.notes,
    });
    setEmpModalOpen(true);
  };

  const saveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      name: empForm.name,
      role: empForm.role,
      phone: empForm.phone,
      nic: empForm.nic,
      licenseNumber: empForm.licenseNumber,
      salaryType: empForm.salaryType,
      baseSalary: Number(empForm.baseSalary) || 0,
      busId: empForm.busId || undefined,
      isActive: empForm.isActive,
      joinedDate: empForm.joinedDate,
      notes: empForm.notes,
    };
    const res = editingEmp
      ? await updateEmployeeAction(editingEmp.id, payload)
      : await addEmployeeAction(payload);
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setEmpModalOpen(false);
    await onChanged();
    flashNotice(editingEmp ? "Employee updated." : "Employee added to roster.");
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!confirm(`Delete employee ${emp.name}? Their salary payment records will also be removed.`)) {
      return;
    }
    const res = await deleteEmployeeAction(emp.id);
    if (!res.success) {
      alert(res.error);
      return;
    }
    await onChanged();
    flashNotice(`Deleted ${emp.name}.`);
  };

  const handleQuickAssignBus = async (emp: Employee, busId: string) => {
    const res = await updateEmployeeAction(emp.id, {
      name: emp.name,
      role: emp.role,
      phone: emp.phone,
      nic: emp.nic,
      licenseNumber: emp.licenseNumber,
      salaryType: emp.salaryType,
      baseSalary: emp.baseSalary,
      busId: busId || undefined,
      isActive: emp.isActive,
      joinedDate: emp.joinedDate,
      notes: emp.notes,
    });
    if (!res.success) {
      alert(res.error);
      return;
    }
    await onChanged();
    flashNotice(`Updated bus assignment for ${emp.name}.`);
  };

  // Bulk attendance save
  const handleSaveBulkAttendance = async (markAllPresent = false) => {
    const activeEmps = employees.filter((e) => e.isActive);
    if (!activeEmps.length) {
      alert("Add active employees first.");
      return;
    }
    setSaving(true);
    const entries = activeEmps.map((emp) => {
      const d = getDraftForEmployee(emp);
      return {
        employeeId: emp.id,
        status: markAllPresent ? ("PRESENT" as AttendanceStatus) : d.status,
        busId: d.busId || undefined,
        advanceTaken: Number(d.advanceTaken) || 0,
      };
    });
    const res = await markBulkAttendanceAction(attendanceDate, entries);
    setSaving(false);
    if (!res.success) {
      alert(res.error);
      return;
    }
    setBulkDraft({});
    await onChanged();
    flashNotice(
      `Attendance saved for ${attendanceDate}: ${res.data.created} added, ${res.data.updated} updated.`
    );
  };

  // Single attendance modal
  const openEditAttendance = (c: CrewMember) => {
    closeAllPanels();
    setEditingAtt(c);
    setError("");
    setAttForm({
      employeeId: c.employeeId || "",
      employeeName: c.name,
      role: c.role,
      busId: c.busId || "",
      date: c.date || attendanceDate,
      status: (c.status ?? (c.present ? "PRESENT" : "ABSENT")) as AttendanceStatus,
      dailyWage: String(c.wage),
      advanceTaken: String(c.advance),
    });
    setAttModalOpen(true);
  };

  const openAddAttendance = () => {
    closeAllPanels();
    setEditingAtt(null);
    setError("");
    const first = employees.find((e) => e.isActive);
    setAttForm({
      employeeId: first?.id || "",
      employeeName: first?.name || "",
      role: first?.role || "DRIVER",
      busId: first?.busId || "",
      date: attendanceDate,
      status: "PRESENT",
      dailyWage: String(
        first ? computeDailyRate(first, "PRESENT") : settings.driverBaseWage
      ),
      advanceTaken: "0",
    });
    setAttModalOpen(true);
  };

  const saveSingleAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      employeeId: attForm.employeeId || undefined,
      employeeName: attForm.employeeName,
      role: attForm.role,
      dailyWage: Number(attForm.dailyWage) || 0,
      advanceTaken: Number(attForm.advanceTaken) || 0,
      busId: attForm.busId || undefined,
      date: attForm.date,
      status: attForm.status,
    };
    const res = editingAtt
      ? await updateCrewAction(editingAtt.id, payload)
      : await addCrewAction(payload);
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setAttModalOpen(false);
    await onChanged();
    flashNotice(editingAtt ? "Attendance updated." : "Attendance recorded.");
  };

  const handleDeleteAttendance = async (c: CrewMember) => {
    if (!confirm(`Delete attendance record for ${c.name} on ${c.date}?`)) return;
    const res = await deleteCrewAction(c.id);
    if (!res.success) {
      alert(res.error);
      return;
    }
    await onChanged();
  };

  // Salary Payment helpers
  const computeMonthBreakdown = (empId: string, month: string) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return { gross: 0, advances: 0, alreadyPaid: 0, recommendedNet: 0 };

    const logs = crewRoster.filter(
      (c) =>
        (c.date || "").startsWith(month) &&
        (c.employeeId === empId ||
          (!c.employeeId && c.name.toLowerCase() === emp.name.toLowerCase()))
    );
    const attendanceWages = logs.reduce((s, c) => s + c.wage, 0);
    const advances = logs.reduce((s, c) => s + c.advance, 0);
    const gross =
      emp.salaryType === "MONTHLY" && attendanceWages === 0
        ? emp.baseSalary
        : attendanceWages;
    const alreadyPaid = salaryPayments
      .filter((p) => p.employeeId === empId && p.periodMonth === month)
      .reduce((s, p) => s + p.netPaid, 0);
    const recommendedNet = Math.max(0, gross - advances - alreadyPaid);
    return { gross, advances, alreadyPaid, recommendedNet };
  };

  const openPaySalaryModal = (emp?: Employee) => {
    closeAllPanels();
    setEditingPay(null);
    setError("");
    const targetEmp = emp || employees.find((e) => e.isActive) || employees[0];
    const targetMonth = periodMonth || todayStr.slice(0, 7);
    if (targetEmp) {
      const b = computeMonthBreakdown(targetEmp.id, targetMonth);
      setPayForm({
        employeeId: targetEmp.id,
        paymentDate: todayStr,
        periodMonth: targetMonth,
        grossEarned: String(b.gross),
        bonus: "0",
        deductions: String(b.advances + b.alreadyPaid),
        netPaid: String(b.recommendedNet),
        paymentMethod: "Cash",
        notes: "",
      });
    } else {
      setPayForm({
        employeeId: "",
        paymentDate: todayStr,
        periodMonth: targetMonth,
        grossEarned: "0",
        bonus: "0",
        deductions: "0",
        netPaid: "0",
        paymentMethod: "Cash",
        notes: "",
      });
    }
    setPayModalOpen(true);
  };

  const openEditPaymentModal = (p: SalaryPayment) => {
    closeAllPanels();
    setEditingPay(p);
    setError("");
    setPayForm({
      employeeId: p.employeeId,
      paymentDate: p.paymentDate,
      periodMonth: p.periodMonth,
      grossEarned: String(p.grossEarned),
      bonus: String(p.bonus),
      deductions: String(p.deductions),
      netPaid: String(p.netPaid),
      paymentMethod: p.paymentMethod,
      notes: p.notes,
    });
    setPayModalOpen(true);
  };

  const saveSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      employeeId: payForm.employeeId,
      paymentDate: payForm.paymentDate,
      periodMonth: payForm.periodMonth,
      grossEarned: Number(payForm.grossEarned) || 0,
      bonus: Number(payForm.bonus) || 0,
      deductions: Number(payForm.deductions) || 0,
      netPaid: Number(payForm.netPaid) || 0,
      paymentMethod: payForm.paymentMethod,
      notes: payForm.notes,
    };
    const res = editingPay
      ? await updateSalaryPaymentAction(editingPay.id, payload)
      : await addSalaryPaymentAction(payload);
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setPayModalOpen(false);
    await onChanged();
    flashNotice(editingPay ? "Salary payment updated." : "Salary payment recorded.");
  };

  const handleDeletePayment = async (p: SalaryPayment) => {
    if (!confirm(`Delete salary payment of ${formatLKR(p.netPaid)} to ${p.employeeName}?`)) {
      return;
    }
    const res = await deleteSalaryPaymentAction(p.id);
    if (!res.success) {
      alert(res.error);
      return;
    }
    await onChanged();
  };

  const visibleAttendanceRows = useMemo(() => {
    return crewRoster.filter((c) => showAllDates || c.date === attendanceDate);
  }, [crewRoster, showAllDates, attendanceDate]);

  const filteredPayments = useMemo(() => {
    return salaryPayments.filter(
      (p) =>
        (!periodMonth || p.periodMonth === periodMonth) &&
        (!paymentEmpFilter || p.employeeId === paymentEmpFilter)
    );
  }, [salaryPayments, periodMonth, paymentEmpFilter]);

  const totalPaymentsShown = filteredPayments.reduce((s, p) => s + p.netPaid, 0);

  return (
    <div className="space-y-6">
      {/* Header + Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Staff &amp; Salaries</h2>
          <p className="text-xs text-slate-400">
            Add drivers &amp; conductors, set daily or monthly pay, assign buses, mark attendance, and pay salaries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
            <span className="text-slate-400">Month:</span>
            <input
              type="month"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
            />
          </div>
          <button
            onClick={openAddEmployee}
            className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            + Add Staff
          </button>
          <button
            onClick={() => openPaySalaryModal()}
            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            💵 Pay Salary
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          {notice}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Working Staff</div>
          <div className="mt-1 text-2xl font-bold text-white">{kpis.activeCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">{employees.length} total staff</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Total Earned ({periodMonth || "All"})</div>
          <div className="mt-1 text-2xl font-bold text-sky-400">{formatLKR(kpis.totalEarned)}</div>
          <div className="mt-1 text-[11px] text-slate-500">From daily attendance</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Advances Taken</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{formatLKR(kpis.totalAdvances)}</div>
          <div className="mt-1 text-[11px] text-slate-500">Cut from salary</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Paid Out</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{formatLKR(kpis.totalPaid)}</div>
          <div className="mt-1 text-[11px] text-slate-500">Already paid</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Balance to Pay</div>
          <div className="mt-1 text-2xl font-bold text-rose-400">{formatLKR(kpis.totalBalance)}</div>
          <div className="mt-1 text-[11px] text-slate-500">Still to pay</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {(
          [
            ["roster", `👥 Staff & Pay (${employees.length})`],
            ["attendance", `✅ Attendance (${dateAttendanceMap.size} on ${attendanceDate})`],
            ["payments", `💵 Pay History (${filteredPayments.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
              subTab === key
                ? "bg-amber-500 text-slate-950 font-semibold"
                : "bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Content + Side Panel Layout */}
      <div className={empModalOpen || attModalOpen || payModalOpen ? "grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start" : ""}>
        <div className="min-w-0">
      {/* SUB-TAB 1: EMPLOYEES & SALARY SETUP */}
      {subTab === "roster" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "" | "DRIVER" | "CONDUCTOR")}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
            >
              <option value="">All Roles</option>
              <option value="DRIVER">Drivers</option>
              <option value="CONDUCTOR">Conductors</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ACTIVE" | "INACTIVE" | "ALL")}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
            >
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
              <option value="ALL">All Statuses</option>
            </select>
            <input
              type="text"
              placeholder="Search name, phone, NIC, bus..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500"
            />
            <button
              onClick={() =>
                downloadCSV(`employees-${periodMonth || "all"}.csv`, [
                  [
                    "Name",
                    "Role",
                    "Phone",
                    "NIC",
                    "License",
                    "AssignedBus",
                    "SalaryType",
                    "BaseSalary",
                    "DaysPresent",
                    "HalfDays",
                    "WagesEarned",
                    "Advances",
                    "SalaryPaid",
                    "BalanceOwed",
                  ],
                  ...filteredEmployees.map((e) => {
                    const st = employeeStats.get(e.id);
                    return [
                      e.name,
                      e.role,
                      e.phone,
                      e.nic,
                      e.licenseNumber,
                      e.assignedBus,
                      e.salaryType,
                      e.baseSalary,
                      st?.daysPresent ?? 0,
                      st?.halfDays ?? 0,
                      st?.wagesEarned ?? 0,
                      st?.advancesTaken ?? 0,
                      st?.salaryPaid ?? 0,
                      st?.balanceOwed ?? 0,
                    ];
                  }),
                ])
              }
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assigned Bus</th>
                  <th className="px-4 py-3">Salary Setup</th>
                  <th className="px-4 py-3 text-right">Days</th>
                  <th className="px-4 py-3 text-right">Earned</th>
                  <th className="px-4 py-3 text-right">Advance</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      No employees found. Click <strong>+ Add Employee</strong> to create your crew roster.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const st = employeeStats.get(emp.id)!;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{emp.name}</span>
                            {!emp.isActive && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {[emp.phone, emp.nic].filter(Boolean).join(" • ") || "No contact info"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              emp.role === "DRIVER"
                                ? "bg-sky-500/15 text-sky-300"
                                : "bg-purple-500/15 text-purple-300"
                            }`}
                          >
                            {emp.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={emp.busId || ""}
                            onChange={(e) => handleQuickAssignBus(emp, e.target.value)}
                            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                          >
                            <option value="">Unassigned</option>
                            {buses.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.regNumber}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{formatLKR(emp.baseSalary)}</div>
                          <div className="text-[10px] text-slate-400">
                            {emp.salaryType === "DAILY" ? "Per Day" : "Per Month"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {st.daysPresent}
                          {st.halfDays > 0 ? `+${st.halfDays}½` : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-sky-400">
                          {formatLKR(st.wagesEarned)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-400">
                          {formatLKR(st.advancesTaken)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-400">
                          {formatLKR(st.salaryPaid)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-400">
                          {formatLKR(st.balanceOwed)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openPaySalaryModal(emp)}
                              className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                            >
                              Pay
                            </button>
                            <button
                              onClick={() => openEditEmployee(emp)}
                              className="text-amber-400 hover:text-amber-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp)}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DAILY ATTENDANCE */}
      {subTab === "attendance" && (
        <div className="space-y-5">
          {/* Quick Bulk Attendance Marker */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-300">Attendance Date:</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => {
                    setAttendanceDate(e.target.value);
                    setBulkDraft({});
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={saving}
                  onClick={() => handleSaveBulkAttendance(true)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  ✓ Mark All Present
                </button>
                <button
                  disabled={saving}
                  onClick={() => handleSaveBulkAttendance(false)}
                  className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </div>
            </div>

            {employees.filter((e) => e.isActive).length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No active employees on roster. Add employees in the first tab to use bulk attendance, or use{" "}
                <button
                  onClick={openAddAttendance}
                  className="text-amber-400 underline"
                >
                  + Add Manual Entry
                </button>
                .
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2 pr-3">Employee</th>
                      <th className="py-2 px-3">Bus</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Wage (Rs.)</th>
                      <th className="py-2 pl-3 text-right">Advance Taken (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {employees
                      .filter((e) => e.isActive)
                      .map((emp) => {
                        const d = getDraftForEmployee(emp);
                        const wagePreview = computeDailyRate(emp, d.status);
                        const alreadyMarked = dateAttendanceMap.has(emp.id);
                        return (
                          <tr key={emp.id}>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{emp.name}</span>
                                <span className="text-[10px] text-slate-400">{emp.role}</span>
                                {alreadyMarked && (
                                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                    Saved
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                value={d.busId}
                                onChange={(e) => setDraftField(emp, { busId: e.target.value })}
                                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                              >
                                <option value="">Unassigned</option>
                                {buses.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.regNumber}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                                {(["PRESENT", "HALF_DAY", "ABSENT"] as const).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => setDraftField(emp, { status: st })}
                                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                                      d.status === st
                                        ? st === "PRESENT"
                                          ? "bg-emerald-500 text-slate-950"
                                          : st === "HALF_DAY"
                                          ? "bg-amber-500 text-slate-950"
                                          : "bg-rose-500 text-white"
                                        : "text-slate-400 hover:text-white"
                                    }`}
                                  >
                                    {st === "PRESENT" ? "Present" : st === "HALF_DAY" ? "Half" : "Absent"}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-sky-400">
                              {formatLKR(wagePreview)}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={d.advanceTaken}
                                onChange={(e) =>
                                  setDraftField(emp, { advanceTaken: e.target.value })
                                }
                                className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recorded Attendance Log Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                Attendance Records ({visibleAttendanceRows.length})
              </h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={showAllDates}
                    onChange={(e) => setShowAllDates(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950"
                  />
                  Show all dates
                </label>
                <button
                  onClick={openAddAttendance}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  + Add Manual Entry
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 px-3">Employee</th>
                    <th className="py-2 px-3">Role</th>
                    <th className="py-2 px-3">Bus</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Wage</th>
                    <th className="py-2 px-3 text-right">Advance</th>
                    <th className="py-2 px-3 text-right">Net Day</th>
                    <th className="py-2 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visibleAttendanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500">
                        No attendance records for {showAllDates ? "any date" : attendanceDate}.
                      </td>
                    </tr>
                  ) : (
                    visibleAttendanceRows.map((c) => {
                      const st = c.status ?? (c.present ? "PRESENT" : "ABSENT");
                      return (
                        <tr key={c.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 pr-3 text-slate-300">{c.date}</td>
                          <td className="py-2.5 px-3 font-medium text-white">{c.name}</td>
                          <td className="py-2.5 px-3 text-slate-400">{c.role}</td>
                          <td className="py-2.5 px-3 text-slate-300">{c.assignedBus}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                st === "PRESENT"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : st === "HALF_DAY"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-rose-500/15 text-rose-300"
                              }`}
                            >
                              {st}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-sky-400">
                            {formatLKR(c.wage)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-400">
                            {formatLKR(c.advance)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-white">
                            {formatLKR(c.balance)}
                          </td>
                          <td className="py-2.5 pl-3 text-right space-x-2">
                            <button
                              onClick={() => openEditAttendance(c)}
                              className="text-amber-400 hover:text-amber-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteAttendance(c)}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              Del
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SALARY PAYMENTS */}
      {subTab === "payments" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={paymentEmpFilter}
                onChange={(e) => setPaymentEmpFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              >
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.role})
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">
                Total Paid Shown:{" "}
                <strong className="text-emerald-400">{formatLKR(totalPaymentsShown)}</strong>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  downloadCSV(`salary-payments-${periodMonth || "all"}.csv`, [
                    [
                      "Employee",
                      "PeriodMonth",
                      "PaymentDate",
                      "GrossEarned",
                      "Bonus",
                      "Deductions",
                      "NetPaid",
                      "Method",
                      "Notes",
                    ],
                    ...filteredPayments.map((p) => [
                      p.employeeName,
                      p.periodMonth,
                      p.paymentDate,
                      p.grossEarned,
                      p.bonus,
                      p.deductions,
                      p.netPaid,
                      p.paymentMethod,
                      p.notes,
                    ]),
                  ])
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Export CSV
              </button>
              <button
                onClick={() => openPaySalaryModal()}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                + Record Salary Payment
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Payment Date</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Bonus</th>
                  <th className="px-4 py-3 text-right">Deductions</th>
                  <th className="px-4 py-3 text-right">Net Paid</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      No salary payments recorded for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-300">{p.paymentDate}</td>
                      <td className="px-4 py-3 font-semibold text-white">{p.employeeName}</td>
                      <td className="px-4 py-3 text-slate-300">{p.periodMonth}</td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatLKR(p.grossEarned)}
                      </td>
                      <td className="px-4 py-3 text-right text-sky-400">
                        {formatLKR(p.bonus)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-400">
                        {formatLKR(p.deductions)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">
                        {formatLKR(p.netPaid)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{p.paymentMethod}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate">
                        {p.notes || "-"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => openEditPaymentModal(p)}
                          className="text-amber-400 hover:text-amber-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePayment(p)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Del
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>

      {/* SIDE PANEL: ADD / EDIT EMPLOYEE */}
      {empModalOpen && (
        <div className="order-first lg:order-last rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-xl space-y-4 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">
                {editingEmp ? `Edit Employee — ${editingEmp.name}` : "Add New Employee"}
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Set role, salary rate (daily or monthly), and default bus assignment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEmpModalOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
          <div>
            {error && (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                {error}
              </div>
            )}
            <form onSubmit={saveEmployee} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Full Name *</label>
                  <input
                    required
                    value={empForm.name}
                    onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Kamal Perera"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Role *</label>
                  <select
                    value={empForm.role}
                    onChange={(e) => {
                      const role = e.target.value as "DRIVER" | "CONDUCTOR";
                      setEmpForm({
                        ...empForm,
                        role,
                        baseSalary:
                          !editingEmp && empForm.salaryType === "DAILY"
                            ? String(
                                role === "DRIVER"
                                  ? settings.driverBaseWage
                                  : settings.conductorBaseWage
                              )
                            : empForm.baseSalary,
                      });
                    }}
                    className={inputCls}
                  >
                    <option value="DRIVER">Driver</option>
                    <option value="CONDUCTOR">Conductor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Salary Type *</label>
                  <select
                    value={empForm.salaryType}
                    onChange={(e) =>
                      setEmpForm({
                        ...empForm,
                        salaryType: e.target.value as "DAILY" | "MONTHLY",
                      })
                    }
                    className={inputCls}
                  >
                    <option value="DAILY">Daily Wage</option>
                    <option value="MONTHLY">Monthly Fixed Salary</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">
                    {empForm.salaryType === "DAILY"
                      ? "Daily Wage (Rs.) *"
                      : "Monthly Salary (Rs.) *"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={empForm.baseSalary}
                    onChange={(e) => setEmpForm({ ...empForm, baseSalary: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Assigned Bus</label>
                  <select
                    value={empForm.busId}
                    onChange={(e) => setEmpForm({ ...empForm, busId: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Unassigned</option>
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.regNumber} — {b.route}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Phone Number</label>
                  <input
                    value={empForm.phone}
                    onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                    className={inputCls}
                    placeholder="0771234567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400">NIC Number</label>
                  <input
                    value={empForm.nic}
                    onChange={(e) => setEmpForm({ ...empForm, nic: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">License No.</label>
                  <input
                    value={empForm.licenseNumber}
                    onChange={(e) => setEmpForm({ ...empForm, licenseNumber: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Joined Date</label>
                  <input
                    type="date"
                    value={empForm.joinedDate}
                    onChange={(e) => setEmpForm({ ...empForm, joinedDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Notes</label>
                <input
                  value={empForm.notes}
                  onChange={(e) => setEmpForm({ ...empForm, notes: e.target.value })}
                  className={inputCls}
                  placeholder="Optional remarks..."
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 pt-1">
                <input
                  type="checkbox"
                  checked={empForm.isActive}
                  onChange={(e) => setEmpForm({ ...empForm, isActive: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950"
                />
                Active employee (included in daily bulk attendance)
              </label>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEmpModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingEmp ? "Save Changes" : "Add Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIDE PANEL: ADD / EDIT SINGLE ATTENDANCE */}
      {attModalOpen && (
        <div className="order-first lg:order-last rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-xl space-y-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white">
              {editingAtt ? "Edit Attendance Record" : "Add Attendance Entry"}
            </h3>
            <button
              type="button"
              onClick={() => setAttModalOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
          <div>
            {error && (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                {error}
              </div>
            )}
            <form onSubmit={saveSingleAttendance} className="mt-4 space-y-3">
              {employees.length > 0 && !editingAtt && (
                <div>
                  <label className="text-xs text-slate-400">Select Roster Employee</label>
                  <select
                    value={attForm.employeeId}
                    onChange={(e) => {
                      const emp = employees.find((x) => x.id === e.target.value);
                      if (emp) {
                        setAttForm({
                          ...attForm,
                          employeeId: emp.id,
                          employeeName: emp.name,
                          role: emp.role,
                          busId: emp.busId || "",
                          dailyWage: String(computeDailyRate(emp, attForm.status)),
                        });
                      } else {
                        setAttForm({ ...attForm, employeeId: "" });
                      }
                    }}
                    className={inputCls}
                  >
                    <option value="">-- Custom / Manual --</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Employee Name *</label>
                  <input
                    required
                    value={attForm.employeeName}
                    onChange={(e) => setAttForm({ ...attForm, employeeName: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Role</label>
                  <select
                    value={attForm.role}
                    onChange={(e) =>
                      setAttForm({ ...attForm, role: e.target.value as "DRIVER" | "CONDUCTOR" })
                    }
                    className={inputCls}
                  >
                    <option value="DRIVER">Driver</option>
                    <option value="CONDUCTOR">Conductor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Date *</label>
                  <input
                    type="date"
                    required
                    value={attForm.date}
                    onChange={(e) => setAttForm({ ...attForm, date: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Status</label>
                  <select
                    value={attForm.status}
                    onChange={(e) =>
                      setAttForm({ ...attForm, status: e.target.value as AttendanceStatus })
                    }
                    className={inputCls}
                  >
                    <option value="PRESENT">Present</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Assigned Bus</label>
                <select
                  value={attForm.busId}
                  onChange={(e) => setAttForm({ ...attForm, busId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Unassigned</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.regNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Daily Wage (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={attForm.dailyWage}
                    onChange={(e) => setAttForm({ ...attForm, dailyWage: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Advance Taken (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={attForm.advanceTaken}
                    onChange={(e) => setAttForm({ ...attForm, advanceTaken: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setAttModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIDE PANEL: PAY SALARY */}
      {payModalOpen && (
        <div className="order-first lg:order-last rounded-2xl border border-emerald-500/30 bg-slate-900 p-5 shadow-xl space-y-4 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">
                {editingPay ? "Edit Salary Payment" : "Pay Employee Salary"}
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Auto-calculates attendance wages earned minus advances & prior payments for the period.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPayModalOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
          <div>
            {error && (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                {error}
              </div>
            )}
            <form onSubmit={saveSalaryPayment} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Employee *</label>
                  <select
                    required
                    value={payForm.employeeId}
                    onChange={(e) => {
                      const empId = e.target.value;
                      const b = computeMonthBreakdown(empId, payForm.periodMonth);
                      setPayForm({
                        ...payForm,
                        employeeId: empId,
                        grossEarned: String(b.gross),
                        deductions: String(b.advances + b.alreadyPaid),
                        netPaid: String(Math.max(0, b.recommendedNet + (Number(payForm.bonus) || 0))),
                      });
                    }}
                    className={inputCls}
                  >
                    <option value="">Select Employee...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Salary Period (Month) *</label>
                  <input
                    type="month"
                    required
                    value={payForm.periodMonth}
                    onChange={(e) => {
                      const m = e.target.value;
                      const b = computeMonthBreakdown(payForm.employeeId, m);
                      setPayForm({
                        ...payForm,
                        periodMonth: m,
                        grossEarned: String(b.gross),
                        deductions: String(b.advances + b.alreadyPaid),
                        netPaid: String(Math.max(0, b.recommendedNet + (Number(payForm.bonus) || 0))),
                      });
                    }}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Payment Method</label>
                  <select
                    value={payForm.paymentMethod}
                    onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                    className={inputCls}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Gross Earned (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={payForm.grossEarned}
                    onChange={(e) => {
                      const gross = Number(e.target.value) || 0;
                      const bonus = Number(payForm.bonus) || 0;
                      const ded = Number(payForm.deductions) || 0;
                      setPayForm({
                        ...payForm,
                        grossEarned: e.target.value,
                        netPaid: String(Math.max(0, gross + bonus - ded)),
                      });
                    }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Bonus / Allowance (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={payForm.bonus}
                    onChange={(e) => {
                      const gross = Number(payForm.grossEarned) || 0;
                      const bonus = Number(e.target.value) || 0;
                      const ded = Number(payForm.deductions) || 0;
                      setPayForm({
                        ...payForm,
                        bonus: e.target.value,
                        netPaid: String(Math.max(0, gross + bonus - ded)),
                      });
                    }}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Deductions / Advances (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={payForm.deductions}
                    onChange={(e) => {
                      const gross = Number(payForm.grossEarned) || 0;
                      const bonus = Number(payForm.bonus) || 0;
                      const ded = Number(e.target.value) || 0;
                      setPayForm({
                        ...payForm,
                        deductions: e.target.value,
                        netPaid: String(Math.max(0, gross + bonus - ded)),
                      });
                    }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-emerald-400 font-semibold">Net Amount Paid (Rs.) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={payForm.netPaid}
                    onChange={(e) => setPayForm({ ...payForm, netPaid: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Notes</label>
                <input
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. October salary settlement"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingPay ? "Save Changes" : "Confirm & Pay Salary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

