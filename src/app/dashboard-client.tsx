"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import {
  getFleetDataAction,
  addBusAction,
  updateBusAction,
  deleteBusAction,
  addRouteLogAction,
  updateRouteLogAction,
  deleteRouteLogAction,
  addMaintenanceAction,
  updateMaintenanceAction,
  deleteMaintenanceAction,
  addCrewAction,
  updateCrewAction,
  deleteCrewAction,
  copyCrewToDateAction,
  syncWithCentralHubAction,
  generateSampleHistoryAction,
} from "@/app/actions/fleet";
import { SessionUser } from "@/lib/auth";
import {
  Bus,
  RouteLog,
  MaintenanceItem,
  CrewMember,
  Employee,
  SalaryPayment,
  Expense,
  Settings,
  DEFAULT_SETTINGS,
  DOCUMENT_FIELDS,
  formatLKR,
  formatCompactLKR,
  computePeriodReport,
  daysUntil,
  downloadCSV,
} from "@/lib/fleet-calc";
import { todayLK, addDays } from "@/lib/dates";
import EmployeesTab from "./components/employees-tab";
import ExpensesTab from "./components/expenses-tab";
import ReportsTab from "./components/reports-tab";
import SettingsModal from "./components/settings-modal";

function DocBadge({ date, today }: { date?: string; today: string }) {
  const d = daysUntil(date, today);
  if (d === null) return <span className="text-slate-600">—</span>;
  const cls =
    d < 0
      ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
      : d <= 30
      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`} title={date}>
      {d < 0 ? `Expired ${-d}d` : d === 0 ? "Today" : `${d}d`}
    </span>
  );
}

export default function FleetDashboardClient({
  initialUser,
}: {
  initialUser: SessionUser;
}) {
  const router = useRouter();
  const [currentUser] = useState<SessionUser>(initialUser);

  const [activeTab, setActiveTab] = useState<
    "overview" | "analytics" | "buses" | "logs" | "maintenance" | "crew" | "expenses" | "reports" | "sync"
  >("overview");

  const [buses, setBuses] = useState<Bus[]>([]);
  const [routeLogs, setRouteLogs] = useState<RouteLog[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceItem[]>([]);
  const [crewRoster, setCrewRoster] = useState<CrewMember[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const isManager = currentUser.role === "FLEET_MANAGER";

  // Maintenance Monthly Budget (persisted in settings)
  const maintenanceBudget = settings.maintenanceBudget;

  // Analytics filter state
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly" | "all">("monthly");
  const todayStr = todayLK();
  const thisMonthStr = todayStr.slice(0, 7); // "YYYY-MM"
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthStr);

  // List filters
  const [logFilterMonth, setLogFilterMonth] = useState<string>(thisMonthStr);
  const [logFilterBus, setLogFilterBus] = useState<string>("");
  const [maintFilterBus, setMaintFilterBus] = useState<string>("");
  const [crewFilterDate, setCrewFilterDate] = useState<string>(todayStr);

  const loadData = async () => {
    try {
      const res = await getFleetDataAction();
      if (res.success && res.data) {
        setBuses(res.data.buses as Bus[]);
        setRouteLogs(res.data.routeLogs as RouteLog[]);
        setMaintenanceRecords(res.data.maintenanceRecords as MaintenanceItem[]);
        setCrewRoster(res.data.crewRoster as CrewMember[]);
        setEmployees((res.data.employees ?? []) as Employee[]);
        setSalaryPayments((res.data.salaryPayments ?? []) as SalaryPayment[]);
        setExpenses(res.data.expenses as Expense[]);
        setSettings(res.data.settings);
        setLoadError("");
      } else if (!res.success) {
        setLoadError(res.error);
      }
    } catch (err) {
      console.error("Failed to load fleet data:", err);
      setLoadError("Could not load fleet data. Check your connection and try again.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await logoutAction();
    router.push("/login");
    router.refresh();
  };

  const handleGenerateHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await generateSampleHistoryAction();
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "Failed to generate history");
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  // --- ANALYTICS COMPUTATIONS ---
  const filteredData = useMemo(() => {
    let filteredLogs = [...routeLogs];
    let filteredMaint = [...maintenanceRecords];
    let filteredCrew = [...crewRoster];
    let filteredExpenses = [...expenses];

    if (timeframe === "daily") {
      filteredLogs = filteredLogs.filter((l) => l.date === selectedDate);
      filteredMaint = filteredMaint.filter((m) => m.date === selectedDate);
      filteredCrew = filteredCrew.filter((c) => c.date === selectedDate);
      filteredExpenses = filteredExpenses.filter((e) => e.date === selectedDate);
    } else if (timeframe === "weekly") {
      const minDateStr = addDays(selectedDate, -6);
      filteredLogs = filteredLogs.filter((l) => l.date >= minDateStr && l.date <= selectedDate);
      filteredMaint = filteredMaint.filter((m) => m.date >= minDateStr && m.date <= selectedDate);
      filteredCrew = filteredCrew.filter((c) => (c.date || "") >= minDateStr && (c.date || "") <= selectedDate);
      filteredExpenses = filteredExpenses.filter((e) => e.date >= minDateStr && e.date <= selectedDate);
    } else if (timeframe === "monthly") {
      filteredLogs = filteredLogs.filter((l) => l.date.startsWith(selectedMonth));
      filteredMaint = filteredMaint.filter((m) => m.date.startsWith(selectedMonth));
      filteredCrew = filteredCrew.filter((c) => (c.date || "").startsWith(selectedMonth));
      filteredExpenses = filteredExpenses.filter((e) => e.date.startsWith(selectedMonth));
    }

    const totalMorning = filteredLogs.reduce((acc, curr) => acc + curr.morningCollection, 0);
    const totalEvening = filteredLogs.reduce((acc, curr) => acc + curr.eveningCollection, 0);
    const grossRevenue = totalMorning + totalEvening;

    const totalFuel = filteredLogs.reduce((acc, curr) => acc + curr.fuelCost, 0);
    const totalLiters = filteredLogs.reduce((acc, curr) => acc + (curr.fuelLiters ?? 0), 0);
    const totalKm = filteredLogs.reduce((acc, curr) => acc + (curr.kmRun ?? 0), 0);
    const totalTolls = filteredLogs.reduce((acc, curr) => acc + curr.tollFees, 0);
    const totalTripOther = filteredLogs.reduce((acc, curr) => acc + (curr.otherExpenses ?? 0), 0);
    const totalCommissions = filteredLogs.reduce((acc, curr) => acc + curr.commission, 0);
    const totalMaintenanceCost = filteredMaint.reduce((acc, curr) => acc + curr.cost, 0);
    const totalCrewWages = filteredCrew.reduce((acc, curr) => acc + curr.wage, 0);
    const totalGeneralExpenses = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);

    const uniqueDays = Array.from(new Set(filteredLogs.map((l) => l.date))).length || 1;

    const totalExpenses =
      totalFuel +
      totalTolls +
      totalTripOther +
      totalCommissions +
      totalCrewWages +
      totalMaintenanceCost +
      totalGeneralExpenses;
    const netProfit = grossRevenue - totalExpenses;
    const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const fuelRatio = grossRevenue > 0 ? (totalFuel / grossRevenue) * 100 : 0;
    const kmPerLiter = totalLiters > 0 ? totalKm / totalLiters : 0;
    const costPerKm = totalKm > 0 ? totalExpenses / totalKm : 0;

    // Daily Timeline Series
    const dateMap: {
      [key: string]: {
        date: string;
        revenue: number;
        fuel: number;
        tolls: number;
        commission: number;
        maintenance: number;
        other: number;
        expenses: number;
        profit: number;
      };
    } = {};

    const ensureDay = (d: string) => {
      if (!dateMap[d]) {
        dateMap[d] = {
          date: d,
          revenue: 0,
          fuel: 0,
          tolls: 0,
          commission: 0,
          maintenance: 0,
          other: 0,
          expenses: 0,
          profit: 0,
        };
      }
      return dateMap[d];
    };

    filteredLogs.forEach((log) => {
      const row = ensureDay(log.date);
      row.revenue += log.morningCollection + log.eveningCollection;
      row.fuel += log.fuelCost;
      row.tolls += log.tollFees;
      row.commission += log.commission;
      row.other += log.otherExpenses ?? 0;
    });

    filteredMaint.forEach((m) => {
      ensureDay(m.date).maintenance += m.cost;
    });

    filteredCrew.forEach((c) => {
      if (c.date) ensureDay(c.date).commission += c.wage;
    });

    filteredExpenses.forEach((e) => {
      ensureDay(e.date).other += e.amount;
    });

    Object.keys(dateMap).forEach((d) => {
      const item = dateMap[d];
      item.expenses = item.fuel + item.tolls + item.commission + item.maintenance + item.other;
      item.profit = item.revenue - item.expenses;
    });

    const timelineData = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

    // Per-Bus Breakdown
    const busPerfMap: {
      [busReg: string]: {
        busReg: string;
        route: string;
        daysCount: number;
        revenue: number;
        fuel: number;
        km: number;
        liters: number;
        tolls: number;
        commission: number;
        maintenance: number;
        other: number;
        net: number;
      };
    } = {};

    buses.forEach((b) => {
      busPerfMap[b.regNumber] = {
        busReg: b.regNumber,
        route: b.route,
        daysCount: 0,
        revenue: 0,
        fuel: 0,
        km: 0,
        liters: 0,
        tolls: 0,
        commission: 0,
        maintenance: 0,
        other: 0,
        net: 0,
      };
    });

    filteredLogs.forEach((l) => {
      if (!busPerfMap[l.busReg]) {
        busPerfMap[l.busReg] = {
          busReg: l.busReg,
          route: l.route,
          daysCount: 0,
          revenue: 0,
          fuel: 0,
          km: 0,
          liters: 0,
          tolls: 0,
          commission: 0,
          maintenance: 0,
          other: 0,
          net: 0,
        };
      }
      const rev = l.morningCollection + l.eveningCollection;
      busPerfMap[l.busReg].daysCount += 1;
      busPerfMap[l.busReg].revenue += rev;
      busPerfMap[l.busReg].fuel += l.fuelCost;
      busPerfMap[l.busReg].km += l.kmRun ?? 0;
      busPerfMap[l.busReg].liters += l.fuelLiters ?? 0;
      busPerfMap[l.busReg].tolls += l.tollFees;
      busPerfMap[l.busReg].commission += l.commission;
      busPerfMap[l.busReg].other += l.otherExpenses ?? 0;
    });

    filteredMaint.forEach((m) => {
      if (busPerfMap[m.busReg]) {
        busPerfMap[m.busReg].maintenance += m.cost;
      }
    });

    filteredExpenses.forEach((e) => {
      if (e.busReg && busPerfMap[e.busReg]) {
        busPerfMap[e.busReg].other += e.amount;
      }
    });

    Object.keys(busPerfMap).forEach((reg) => {
      const b = busPerfMap[reg];
      b.net = b.revenue - (b.fuel + b.tolls + b.commission + b.maintenance + b.other);
    });

    const busPerformance = Object.values(busPerfMap).sort((a, b) => b.net - a.net);

    return {
      filteredLogs,
      filteredMaint,
      filteredCrew,
      filteredExpenses,
      grossRevenue,
      totalMorning,
      totalEvening,
      totalFuel,
      totalLiters,
      totalKm,
      totalTolls,
      totalTripOther,
      totalCommissions,
      totalCrewWages,
      totalMaintenanceCost,
      totalGeneralExpenses,
      totalExpenses,
      netProfit,
      profitMargin,
      fuelRatio,
      kmPerLiter,
      costPerKm,
      timelineData,
      busPerformance,
      uniqueDays: uniqueDays || 1,
    };
  }, [routeLogs, maintenanceRecords, buses, crewRoster, expenses, timeframe, selectedDate, selectedMonth]);

  // Compliance & Maintenance Alerts (expiring within 30 days or overdue)
  const complianceAlerts = useMemo(() => {
    const items: { busReg: string; label: string; date: string; days: number }[] = [];
    for (const b of buses) {
      for (const f of DOCUMENT_FIELDS) {
        const val = b[f.key] as string | undefined;
        const d = daysUntil(val, todayStr);
        if (d !== null && d <= 30 && val) {
          items.push({ busReg: b.regNumber, label: f.label, date: val, days: d });
        }
      }
    }
    for (const m of maintenanceRecords) {
      const d = daysUntil(m.nextServiceDate, todayStr);
      if (d !== null && d <= 14 && m.nextServiceDate) {
        items.push({
          busReg: m.busReg,
          label: `Next Service (${m.type})`,
          date: m.nextServiceDate,
          days: d,
        });
      }
    }
    return items.sort((a, b) => a.days - b.days);
  }, [buses, maintenanceRecords, todayStr]);

  // Export CSV Report in LKR
  const handleExportCSV = () => {
    downloadCSV(`fleetflow-analytics-${timeframe}-${selectedDate}-lkr.csv`, [
      [
        "Date",
        "Bus",
        "Route",
        "Morning Fare (LKR)",
        "Evening Fare (LKR)",
        "Total Fare (LKR)",
        "Km Run",
        "Fuel Litres",
        "Fuel Cost (LKR)",
        "Toll Fees (LKR)",
        "Other Trip Cost (LKR)",
        "Commission (LKR)",
        "Net Bus Profit (LKR)",
      ],
      ...filteredData.filteredLogs.map((l) => {
        const total = l.morningCollection + l.eveningCollection;
        const net = total - (l.fuelCost + l.tollFees + (l.otherExpenses ?? 0) + l.commission);
        return [
          l.date,
          l.busReg,
          l.route,
          l.morningCollection,
          l.eveningCollection,
          total,
          l.kmRun ?? 0,
          l.fuelLiters ?? 0,
          l.fuelCost,
          l.tollFees,
          l.otherExpenses ?? 0,
          l.commission,
          net,
        ];
      }),
    ]);
  };

  // ============================================================================
  // BUS MANAGEMENT STATE (ADD, EDIT, DELETE + STATUTORY DOCUMENTS)
  // ============================================================================
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [busReg, setBusReg] = useState("");
  const [busRoute, setBusRoute] = useState("");
  const [busCapacity, setBusCapacity] = useState(54);
  const [busActive, setBusActive] = useState(true);
  const [busDocs, setBusDocs] = useState({
    insuranceExpiry: "",
    revenueLicenseExpiry: "",
    routePermitExpiry: "",
    emissionTestExpiry: "",
    fitnessCertExpiry: "",
  });
  const [submittingBus, setSubmittingBus] = useState(false);

  const handleOpenAddBus = () => {
    setEditingBus(null);
    setBusReg("");
    setBusRoute("");
    setBusCapacity(54);
    setBusActive(true);
    setBusDocs({
      insuranceExpiry: "",
      revenueLicenseExpiry: "",
      routePermitExpiry: "",
      emissionTestExpiry: "",
      fitnessCertExpiry: "",
    });
    setShowAddBusModal(true);
  };

  const handleOpenEditBus = (bus: Bus) => {
    setEditingBus(bus);
    setBusReg(bus.regNumber);
    setBusRoute(bus.route);
    setBusCapacity(bus.capacity);
    setBusActive(bus.status === "ACTIVE");
    setBusDocs({
      insuranceExpiry: bus.insuranceExpiry || "",
      revenueLicenseExpiry: bus.revenueLicenseExpiry || "",
      routePermitExpiry: bus.routePermitExpiry || "",
      emissionTestExpiry: bus.emissionTestExpiry || "",
      fitnessCertExpiry: bus.fitnessCertExpiry || "",
    });
    setShowAddBusModal(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busReg || !busRoute) return;
    setSubmittingBus(true);
    try {
      const payload = {
        regNumber: busReg,
        routeName: busRoute,
        seatingCapacity: busCapacity,
        isActive: busActive,
        ...busDocs,
      };
      const res = editingBus
        ? await updateBusAction(editingBus.id, payload)
        : await addBusAction(payload);
      if (res.success) {
        await loadData();
        setShowAddBusModal(false);
      } else {
        alert(res.error || "Failed to save vehicle");
      }
    } finally {
      setSubmittingBus(false);
    }
  };

  const handleDeleteBus = async (bus: Bus) => {
    if (confirm(`Are you sure you want to delete bus ${bus.regNumber}? This will remove associated route logs and maintenance records.`)) {
      const res = await deleteBusAction(bus.id);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "Failed to delete bus");
      }
    }
  };

  // ============================================================================
  // ROUTE LOG MANAGEMENT STATE (ADD, EDIT, DELETE + KM, LITRES, NOTES)
  // ============================================================================
  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState<RouteLog | null>(null);
  const [logBusId, setLogBusId] = useState("");
  const [logDate, setLogDate] = useState(todayStr);
  const [logMorning, setLogMorning] = useState("");
  const [logEvening, setLogEvening] = useState("");
  const [logFuel, setLogFuel] = useState("");
  const [logTolls, setLogTolls] = useState("");
  const [logKmRun, setLogKmRun] = useState("");
  const [logFuelLiters, setLogFuelLiters] = useState("");
  const [logOtherExpenses, setLogOtherExpenses] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [submittingLog, setSubmittingLog] = useState(false);

  const handleOpenAddLog = () => {
    setEditingLog(null);
    setLogBusId(buses[0]?.id || "");
    setLogDate(todayStr);
    setLogMorning("");
    setLogEvening("");
    setLogFuel("");
    setLogTolls("");
    setLogKmRun("");
    setLogFuelLiters("");
    setLogOtherExpenses("");
    setLogNotes("");
    setShowAddLogModal(true);
  };

  const handleOpenEditLog = (log: RouteLog) => {
    setEditingLog(log);
    setLogBusId(log.busId);
    setLogDate(log.date);
    setLogMorning(log.morningCollection.toString());
    setLogEvening(log.eveningCollection.toString());
    setLogFuel(log.fuelCost.toString());
    setLogTolls(log.tollFees.toString());
    setLogKmRun(log.kmRun ? log.kmRun.toString() : "");
    setLogFuelLiters(log.fuelLiters ? log.fuelLiters.toString() : "");
    setLogOtherExpenses(log.otherExpenses ? log.otherExpenses.toString() : "");
    setLogNotes(log.notes || "");
    setShowAddLogModal(true);
  };

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logBusId) return;
    setSubmittingLog(true);
    try {
      const payload = {
        busId: logBusId,
        date: logDate,
        morningCollection: Number(logMorning) || 0,
        eveningCollection: Number(logEvening) || 0,
        fuelCost: Number(logFuel) || 0,
        tollAndLineFees: Number(logTolls) || 0,
        kmRun: logKmRun,
        fuelLiters: logFuelLiters,
        otherExpenses: logOtherExpenses,
        notes: logNotes,
      };
      const res = editingLog
        ? await updateRouteLogAction(editingLog.id, payload)
        : await addRouteLogAction(payload);
      if (res.success) {
        await loadData();
        setShowAddLogModal(false);
      } else {
        alert(res.error || "Failed to save route log");
      }
    } finally {
      setSubmittingLog(false);
    }
  };

  const handleDeleteLog = async (log: RouteLog) => {
    if (confirm(`Delete route fare entry for ${log.busReg} on ${log.date}?`)) {
      const res = await deleteRouteLogAction(log.id);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "Failed to delete log");
      }
    }
  };

  // Live calculation preview for the Route Log modal
  const logPreview = useMemo(() => {
    const gross = (Number(logMorning) || 0) + (Number(logEvening) || 0);
    const driverComm = (gross * settings.driverCommissionPct) / 100;
    const conductorComm = (gross * settings.conductorCommissionPct) / 100;
    const comm = driverComm + conductorComm;
    const fuel = Number(logFuel) || 0;
    const tolls = Number(logTolls) || 0;
    const other = Number(logOtherExpenses) || 0;
    const totalExp = fuel + tolls + other + comm;
    const net = gross - totalExp;
    const km = Number(logKmRun) || 0;
    const liters = Number(logFuelLiters) || 0;
    return {
      gross,
      driverComm,
      conductorComm,
      comm,
      totalExp,
      net,
      kmPerLiter: liters > 0 ? km / liters : 0,
      costPerKm: km > 0 ? totalExp / km : 0,
    };
  }, [logMorning, logEvening, logFuel, logTolls, logOtherExpenses, logKmRun, logFuelLiters, settings]);

  // ============================================================================
  // VEHICLE MAINTENANCE & BUDGETING STATE (ADD, EDIT, DELETE, BUDGET)
  // ============================================================================
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [editingMaint, setEditingMaint] = useState<MaintenanceItem | null>(null);
  const [maintBusId, setMaintBusId] = useState("");
  const [maintDate, setMaintDate] = useState(todayStr);
  const [maintType, setMaintType] = useState("");
  const [maintVendor, setMaintVendor] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [maintOdometer, setMaintOdometer] = useState("");
  const [maintNextDate, setMaintNextDate] = useState("");
  const [maintNotes, setMaintNotes] = useState("");
  const [submittingMaint, setSubmittingMaint] = useState(false);

  // Common service presets for Sri Lankan bus fleets
  const servicePresets = [
    "Full Engine Oil & Filter Change",
    "Brake Liner & Drum Servicing",
    "Brake Pad Replacement & Hydraulic Check",
    "Tire Replacement & Wheel Alignment",
    "Suspension Leaf Spring & Bushing Repair",
    "Transmission / Gearbox Overhaul",
    "Alternator & Heavy Battery Servicing",
    "Radiator & Coolant Flush",
    "Air Conditioning Repair & Gas Refill",
    "Full Body Paint & Seat Reupholstery",
    "Annual Roadworthiness Inspection Service",
  ];

  const handleOpenAddMaint = () => {
    setEditingMaint(null);
    setMaintBusId(buses[0]?.id || "");
    setMaintDate(todayStr);
    setMaintType(servicePresets[0]);
    setMaintVendor("Castrol Express Care");
    setMaintCost("28500.00");
    setMaintOdometer("");
    setMaintNextDate("");
    setMaintNotes("");
    setShowMaintModal(true);
  };

  const handleOpenEditMaint = (m: MaintenanceItem) => {
    setEditingMaint(m);
    setMaintBusId(m.busId);
    setMaintDate(m.date);
    setMaintType(m.type);
    setMaintVendor(m.vendor);
    setMaintCost(m.cost.toString());
    setMaintOdometer(m.odometerKm ? m.odometerKm.toString() : "");
    setMaintNextDate(m.nextServiceDate || "");
    setMaintNotes(m.notes || "");
    setShowMaintModal(true);
  };

  const handleSaveMaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintBusId || !maintType) return;
    setSubmittingMaint(true);
    try {
      const payload = {
        busId: maintBusId,
        date: maintDate,
        serviceType: maintType,
        vendorName: maintVendor,
        cost: Number(maintCost) || 0,
        odometerKm: maintOdometer,
        nextServiceDate: maintNextDate,
        notes: maintNotes,
      };
      const res = editingMaint
        ? await updateMaintenanceAction(editingMaint.id, payload)
        : await addMaintenanceAction(payload);
      if (res.success) {
        await loadData();
        setShowMaintModal(false);
      } else {
        alert(res.error || "Failed to save maintenance record");
      }
    } finally {
      setSubmittingMaint(false);
    }
  };

  const handleDeleteMaint = async (m: MaintenanceItem) => {
    if (confirm(`Delete maintenance record (${m.type}) for ${m.busReg}?`)) {
      const res = await deleteMaintenanceAction(m.id);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "Failed to delete maintenance log");
      }
    }
  };

  // Maintenance Budget Calculations
  const currentMonthMaintSpend = useMemo(() => {
    return maintenanceRecords
      .filter((m) => m.date.startsWith(thisMonthStr))
      .reduce((sum, m) => sum + m.cost, 0);
  }, [maintenanceRecords, thisMonthStr]);

  const budgetUsagePercent = maintenanceBudget > 0 ? (currentMonthMaintSpend / maintenanceBudget) * 100 : 0;
  const remainingBudget = maintenanceBudget - currentMonthMaintSpend;

  // Highest Maintenance Bus
  const highestMaintenanceBus = useMemo(() => {
    const costMap: { [reg: string]: number } = {};
    maintenanceRecords.forEach((m) => {
      costMap[m.busReg] = (costMap[m.busReg] || 0) + m.cost;
    });
    const sorted = Object.entries(costMap).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { reg: sorted[0][0], cost: sorted[0][1] } : null;
  }, [maintenanceRecords]);

  // ============================================================================
  // CREW MANAGEMENT STATE (ADD, EDIT, DELETE + DATE & COPY ROSTER)
  // ============================================================================
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [editingCrew, setEditingCrew] = useState<CrewMember | null>(null);
  const [crewName, setCrewName] = useState("");
  const [crewRole, setCrewRole] = useState<"DRIVER" | "CONDUCTOR">("DRIVER");
  const [crewBusId, setCrewBusId] = useState("");
  const [crewDate, setCrewDate] = useState(todayStr);
  const [crewWage, setCrewWage] = useState("3500");
  const [crewAdvance, setCrewAdvance] = useState("0");
  const [submittingCrew, setSubmittingCrew] = useState(false);
  const [copyingCrew, setCopyingCrew] = useState(false);

  const handleOpenAddCrew = () => {
    setEditingCrew(null);
    setCrewName("");
    setCrewRole("DRIVER");
    setCrewBusId(buses[0]?.id || "");
    setCrewDate(crewFilterDate || todayStr);
    setCrewWage(String(settings.driverBaseWage));
    setCrewAdvance("0");
    setShowCrewModal(true);
  };

  const handleOpenEditCrew = (c: CrewMember) => {
    setEditingCrew(c);
    setCrewName(c.name);
    setCrewRole(c.role);
    setCrewBusId(c.busId || "");
    setCrewDate(c.date || todayStr);
    setCrewWage(c.wage.toString());
    setCrewAdvance(c.advance.toString());
    setShowCrewModal(true);
  };

  const handleSaveCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewName) return;
    setSubmittingCrew(true);
    try {
      const payload = {
        employeeName: crewName,
        role: crewRole,
        dailyWage: Number(crewWage) || 0,
        advanceTaken: Number(crewAdvance) || 0,
        busId: crewBusId || undefined,
        date: crewDate,
      };
      const res = editingCrew
        ? await updateCrewAction(editingCrew.id, payload)
        : await addCrewAction(payload);
      if (res.success) {
        await loadData();
        setShowCrewModal(false);
      } else {
        alert(res.error || "Failed to save crew attendance");
      }
    } finally {
      setSubmittingCrew(false);
    }
  };

  const handleDeleteCrew = async (c: CrewMember) => {
    if (confirm(`Remove ${c.name} (${c.role}) on ${c.date}?`)) {
      const res = await deleteCrewAction(c.id);
      if (res.success) {
        await loadData();
      } else {
        alert(res.error || "Failed to delete crew member");
      }
    }
  };

  const handleCopyPreviousCrew = async () => {
    const target = crewFilterDate || todayStr;
    setCopyingCrew(true);
    try {
      const res = await copyCrewToDateAction(target);
      if (res.success) {
        await loadData();
        if (res.data.created === 0) {
          alert(`All known crew members are already marked for ${target}.`);
        }
      } else {
        alert(res.error);
      }
    } finally {
      setCopyingCrew(false);
    }
  };

  // Filtered table rows
  const visibleLogs = useMemo(
    () =>
      routeLogs.filter(
        (l) =>
          (!logFilterMonth || l.date.startsWith(logFilterMonth)) &&
          (!logFilterBus || l.busId === logFilterBus)
      ),
    [routeLogs, logFilterMonth, logFilterBus]
  );

  const visibleMaint = useMemo(
    () => maintenanceRecords.filter((m) => !maintFilterBus || m.busId === maintFilterBus),
    [maintenanceRecords, maintFilterBus]
  );

  const visibleCrew = useMemo(
    () => crewRoster.filter((c) => !crewFilterDate || c.date === crewFilterDate),
    [crewRoster, crewFilterDate]
  );

  // Sync Hub Action
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced">("idle");
  const [syncDate, setSyncDate] = useState<string>(todayStr);

  const handleTriggerSync = async () => {
    setSyncStatus("syncing");
    try {
      const res = await syncWithCentralHubAction(syncDate);
      if (res.success) {
        setSyncStatus("synced");
        await loadData();
      } else {
        alert(res.error || "Sync failed");
        setSyncStatus("idle");
      }
    } catch {
      setSyncStatus("idle");
    }
  };

  const syncDayReport = useMemo(
    () =>
      computePeriodReport({
        from: syncDate,
        to: syncDate,
        buses,
        routeLogs,
        maintenance: maintenanceRecords,
        crew: crewRoster,
        expenses,
      }),
    [syncDate, buses, routeLogs, maintenanceRecords, crewRoster, expenses]
  );

  const maxChartVal = useMemo(() => {
    if (filteredData.timelineData.length === 0) return 50000;
    const maxRev = Math.max(...filteredData.timelineData.map((d) => d.revenue));
    const maxExp = Math.max(...filteredData.timelineData.map((d) => d.expenses));
    return Math.max(maxRev, maxExp, 10000);
  }, [filteredData.timelineData]);

  const navSections = [
    {
      title: "Analytics & Reports",
      items: [
        { id: "overview", label: "Fleet Overview", icon: "📊" },
        { id: "analytics", label: "Daily & Monthly Analytics", icon: "📈" },
        { id: "reports", label: "Financial Reports", icon: "📑" },
      ],
    },
    {
      title: "Operations",
      items: [
        { id: "logs", label: "Daily Route Fares", icon: "📋" },
        { id: "maintenance", label: "Maintenance & Budget", icon: "🔧" },
        { id: "expenses", label: "Operating Expenses", icon: "🧾" },
      ],
    },
    {
      title: "People & Fleet",
      items: [
        { id: "crew", label: "Employees & Payroll", icon: "👥" },
        { id: "buses", label: "Vehicles & Documents", icon: "🚍" },
        { id: "sync", label: "Central Hub Sync", icon: "🔄" },
      ],
    },
  ] as const;

  const renderNavItems = (onSelect?: () => void) => (
    <nav className="flex-1 space-y-5 px-3 py-4 overflow-y-auto">
      {navSections.map((section) => (
        <div key={section.title} className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {section.title}
          </div>
          {section.items.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onSelect?.();
                }}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                  active
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm"
                    : "border border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
              aria-label="Open navigation menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">FleetFlow Manager</h1>
                <span className="hidden sm:inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                  LKR Currency (Rs.)
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Dispatch
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400">Bus Operations, Workshop Servicing, Budget & Financials (LKR)</p>
            </div>
          </div>

          {/* User profile, Settings & Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-slate-700 transition-colors"
              title="Commission Rates, Base Wages & Monthly Budgets"
            >
              ⚙️ <span className="hidden sm:inline">Settings</span>
            </button>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-white">{currentUser.name}</div>
              <div className="text-[10px] font-mono text-amber-400">
                {currentUser.role === "FLEET_MANAGER" ? "Fleet Manager (Admin)" : "Dispatch Supervisor"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Sidebar */}
      {sidebarOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col border-r border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3.5">
              <span className="text-sm font-bold text-white">Navigation</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>
            {renderNavItems(() => setSidebarOpen(false))}
            <div className="border-t border-slate-800 p-3 text-xs text-slate-400">
              <div className="font-semibold text-white">{currentUser.name}</div>
              <div className="text-[10px] text-amber-400">
                {currentUser.role === "FLEET_MANAGER" ? "Fleet Manager" : "Dispatch Supervisor"}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Body: Desktop Sidebar + Main Content */}
      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 border-r border-slate-800 bg-slate-900/50 sticky top-[65px] h-[calc(100vh-65px)]">
          {renderNavItems()}
          <div className="border-t border-slate-800 p-3">
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
            >
              <span>⚙️</span>
              <span>Rates &amp; Budgets</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 space-y-6">
          <div className="mx-auto max-w-7xl space-y-6">
        {loadError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 flex items-center justify-between">
            <span>⚠️ {loadError}</span>
            <button onClick={loadData} className="underline font-semibold hover:text-white">
              Retry
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: OPERATING EXPENSES */}
        {/* ============================================================== */}
        {activeTab === "expenses" && (
          <ExpensesTab
            expenses={expenses}
            buses={buses}
            todayStr={todayStr}
            onChanged={loadData}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: FINANCIAL REPORTS (P&L, VEHICLE, CREW, DAILY + PRINT/CSV) */}
        {/* ============================================================== */}
        {activeTab === "reports" && (
          <ReportsTab
            buses={buses}
            routeLogs={routeLogs}
            maintenance={maintenanceRecords}
            crew={crewRoster}
            expenses={expenses}
            todayStr={todayStr}
            revenueTarget={settings.monthlyRevenueTarget}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: VEHICLE MAINTENANCE & WORKSHOP SERVICING & BUDGETING */}
        {/* ============================================================== */}
        {activeTab === "maintenance" && (
          <div className="space-y-6">
            {/* Header & Quick Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-md">
              <div>
                <h2 className="text-lg font-bold text-white">Vehicle Maintenance, Servicing & Budget Control</h2>
                <p className="text-xs text-slate-400">
                  Track workshop work orders, odometer readings, next service dates, vendor billing, and monthly budget in LKR
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    downloadCSV(`maintenance-logs-${todayStr}.csv`, [
                      ["Date", "Bus", "Service Type", "Vendor", "Odometer (km)", "Next Service Date", "Cost (LKR)", "Notes"],
                      ...visibleMaint.map((m) => [
                        m.date,
                        m.busReg,
                        m.type,
                        m.vendor,
                        m.odometerKm || "",
                        m.nextServiceDate || "",
                        m.cost,
                        m.notes || "",
                      ]),
                    ])
                  }
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  ⬇ CSV
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  ⚙️ Set Budget
                </button>
                <button
                  onClick={handleOpenAddMaint}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20"
                >
                  + Record Maintenance Service
                </button>
              </div>
            </div>

            {/* Maintenance Budget Meter & Calculating Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Monthly Budget Consumption Meter */}
              <div className="sm:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Workshop Budget</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        budgetUsagePercent > 100
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : budgetUsagePercent > 75
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {budgetUsagePercent.toFixed(1)}% Consumed
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-white">{formatLKR(maintenanceBudget)}</span>
                </div>

                <div className="space-y-1">
                  <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800 p-0.5">
                    <div
                      style={{ width: `${Math.min(100, Math.max(2, budgetUsagePercent))}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        budgetUsagePercent > 100 ? "bg-rose-500 animate-pulse" : budgetUsagePercent > 75 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>Spent this Month: <strong className="text-white">{formatLKR(currentMonthMaintSpend)}</strong></span>
                    <span>
                      {remainingBudget >= 0 ? (
                        <span className="text-emerald-400">Remaining: {formatLKR(remainingBudget)}</span>
                      ) : (
                        <span className="text-rose-400 font-bold">Over Budget: {formatLKR(Math.abs(remainingBudget))}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Workshop Spend */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Total Recorded Repairs</span>
                  <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">🔧</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white">
                    {formatLKR(maintenanceRecords.reduce((sum, m) => sum + m.cost, 0))}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400">Across {maintenanceRecords.length} completed work orders</div>
              </div>

              {/* Highest Maintenance Vehicle */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Highest Repair Vehicle</span>
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">⚠️</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-xl font-extrabold text-amber-400 font-mono">
                    {highestMaintenanceBus ? highestMaintenanceBus.reg : "None"}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {highestMaintenanceBus ? `Total Spend: ${formatLKR(highestMaintenanceBus.cost)}` : "No repairs recorded yet"}
                </div>
              </div>
            </div>

            {/* Maintenance Work Orders Table with Full Edit & Delete */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">Workshop Work Orders & Repair Logs</h3>
                  <p className="text-xs text-slate-400">Click Edit to modify service details or Delete to remove entries</p>
                </div>
                <select
                  value={maintFilterBus}
                  onChange={(e) => setMaintFilterBus(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">All Buses</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.regNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Bus Vehicle</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Service Performed</th>
                      <th className="py-3 px-4">Workshop / Vendor</th>
                      <th className="py-3 px-4">Odometer</th>
                      <th className="py-3 px-4">Next Service</th>
                      <th className="py-3 px-4 text-rose-400 font-bold">Cost (LKR)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {visibleMaint.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-400">{m.busReg}</td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono">{m.date}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{m.type}</div>
                          {m.notes && <div className="text-[10px] text-slate-500">{m.notes}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{m.vendor}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {m.odometerKm ? `${m.odometerKm.toLocaleString("en-LK")} km` : "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          <DocBadge date={m.nextServiceDate} today={todayStr} />
                        </td>
                        <td className="py-3.5 px-4 font-bold text-rose-400">{formatLKR(m.cost)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditMaint(m)}
                              title="Edit Maintenance Log"
                              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-slate-700 transition-colors"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteMaint(m)}
                              title="Delete Maintenance Log"
                              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add / Edit Maintenance Modal */}
            {showMaintModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">
                      {editingMaint ? "Edit Maintenance Service Log" : "Record Maintenance Work Order"}
                    </h3>
                    <button onClick={() => setShowMaintModal(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>

                  <form onSubmit={handleSaveMaint} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Select Bus</label>
                        <select
                          required
                          value={maintBusId}
                          onChange={(e) => setMaintBusId(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        >
                          {buses.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.regNumber}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Date of Service</label>
                        <input
                          type="date"
                          required
                          value={maintDate}
                          onChange={(e) => setMaintDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Service Type / Work Performed</label>
                      <input
                        type="text"
                        required
                        list="service-presets-list"
                        value={maintType}
                        onChange={(e) => setMaintType(e.target.value)}
                        placeholder="e.g. Engine Oil & Filter Change"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                      <datalist id="service-presets-list">
                        {servicePresets.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Workshop / Vendor</label>
                        <input
                          type="text"
                          required
                          value={maintVendor}
                          onChange={(e) => setMaintVendor(e.target.value)}
                          placeholder="e.g. Castrol Express Hub"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Cost (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={maintCost}
                          onChange={(e) => setMaintCost(e.target.value)}
                          placeholder="28500.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Odometer (km, optional)</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={maintOdometer}
                          onChange={(e) => setMaintOdometer(e.target.value)}
                          placeholder="e.g. 142500"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Next Service Due (optional)</label>
                        <input
                          type="date"
                          value={maintNextDate}
                          onChange={(e) => setMaintNextDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Notes / Parts Replaced (optional)</label>
                      <input
                        type="text"
                        value={maintNotes}
                        onChange={(e) => setMaintNotes(e.target.value)}
                        placeholder="e.g. Replaced 15W-40 oil 14L + oil & diesel filters"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowMaintModal(false)}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingMaint}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        {submittingMaint ? "Saving..." : editingMaint ? "Save Changes" : "Save Record"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: DAILY & MONTHLY ANALYTICS & EXPENSES */}
        {/* ============================================================== */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-md">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">Financial & Expense Analytics (LKR)</h2>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
                    {timeframe.toUpperCase()} VIEW
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Granular breakdown of fare revenues, fuel costs, toll fees, and workshop maintenance in Sri Lankan Rupees (Rs.)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
                  {(["daily", "weekly", "monthly", "all"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTimeframe(mode)}
                      className={`rounded-lg px-3 py-1.5 capitalize transition-all ${
                        timeframe === mode
                          ? "bg-amber-500 font-bold text-slate-950 shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {mode === "all" ? "All Time" : mode}
                    </button>
                  ))}
                </div>

                {timeframe === "daily" && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                )}

                {timeframe === "monthly" && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                )}

                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV (LKR)
                </button>

                {routeLogs.length < 5 && (
                  <button
                    onClick={handleGenerateHistory}
                    disabled={loadingHistory}
                    className="rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                  >
                    {loadingHistory ? "Generating..." : "+ Seed 14-Day History (LKR)"}
                  </button>
                )}
              </div>
            </div>

            {/* KPI Cards in LKR */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Gross Fares Collected</span>
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">💵</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white">{formatLKR(filteredData.grossRevenue)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                  <span>Morning: {formatCompactLKR(filteredData.totalMorning)}</span>
                  <span>Evening: {formatCompactLKR(filteredData.totalEvening)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Total Operating Expenses</span>
                  <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">📉</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-rose-400">{formatLKR(filteredData.totalExpenses)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {filteredData.grossRevenue > 0
                    ? `${((filteredData.totalExpenses / filteredData.grossRevenue) * 100).toFixed(1)}% of total revenues`
                    : "No operations in window"}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900/80 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-amber-300">
                  <span className="text-xs font-semibold uppercase tracking-wider">Net Fleet Profit</span>
                  <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">📈</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className={`text-2xl sm:text-3xl font-extrabold ${filteredData.netProfit >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                    {formatLKR(filteredData.netProfit)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-amber-200/80 font-medium flex items-center justify-between">
                  <span>Margin: {filteredData.profitMargin.toFixed(1)}%</span>
                  <span>Avg/Day: {formatCompactLKR(filteredData.netProfit / filteredData.uniqueDays)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Fuel Cost & Efficiency</span>
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">⛽</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white">{formatLKR(filteredData.totalFuel)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                  <span>Fuel Ratio: {filteredData.fuelRatio.toFixed(1)}%</span>
                  <span className="text-emerald-400">Normal Range</span>
                </div>
              </div>
            </div>

            {/* Visual Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white">Daily Operational Timeline (LKR)</h3>
                    <p className="text-xs text-slate-400">Comparative revenue vs expenses per operating day</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-emerald-500"></span>
                      <span className="text-slate-300">Revenue</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-rose-500"></span>
                      <span className="text-slate-300">Expenses</span>
                    </div>
                  </div>
                </div>

                {filteredData.timelineData.length === 0 ? (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500">
                    No timeline logs recorded for the selected period.
                  </div>
                ) : (
                  <div className="space-y-2 pt-4">
                    <div className="relative h-60 w-full overflow-hidden rounded-xl bg-slate-950/60 p-4 border border-slate-800/80">
                      <div className="flex h-full items-end gap-2 sm:gap-3 justify-between">
                        {filteredData.timelineData.map((day) => {
                          const revHeight = (day.revenue / maxChartVal) * 100;
                          const expHeight = (day.expenses / maxChartVal) * 100;

                          return (
                            <div key={day.date} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                              <div className="absolute -top-16 z-20 hidden group-hover:flex flex-col items-center pointer-events-none">
                                <div className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-[10px] text-white shadow-xl whitespace-nowrap">
                                  <div className="font-bold text-amber-400">{day.date}</div>
                                  <div>Rev: {formatCompactLKR(day.revenue)}</div>
                                  <div>Exp: {formatCompactLKR(day.expenses)}</div>
                                  <div className="text-emerald-400 font-bold">Net: {formatCompactLKR(day.profit)}</div>
                                </div>
                                <div className="w-2 h-2 rotate-45 bg-slate-900 border-r border-b border-slate-700 -mt-1"></div>
                              </div>

                              <div className="w-full flex items-end justify-center gap-1 h-44">
                                <div
                                  style={{ height: `${Math.min(100, Math.max(4, revHeight))}%` }}
                                  className="w-1/2 rounded-t bg-emerald-500/80 group-hover:bg-emerald-400 transition-all"
                                ></div>
                                <div
                                  style={{ height: `${Math.min(100, Math.max(4, expHeight))}%` }}
                                  className="w-1/2 rounded-t bg-rose-500/80 group-hover:bg-rose-400 transition-all"
                                ></div>
                              </div>

                              <span className="text-[10px] text-slate-500 mt-2 font-mono truncate max-w-[40px]">
                                {day.date.slice(-5)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Expense Distribution */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-white">Expense Distribution (LKR)</h3>
                  <p className="text-xs text-slate-400">Cost allocation across operational categories</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-200">
                        <span>⛽</span> Fuel Consumption
                      </span>
                      <span className="font-mono text-amber-400 font-semibold">
                        {formatLKR(filteredData.totalFuel)} (
                        {filteredData.totalExpenses > 0
                          ? ((filteredData.totalFuel / filteredData.totalExpenses) * 100).toFixed(1)
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{
                          width: `${filteredData.totalExpenses > 0 ? (filteredData.totalFuel / filteredData.totalExpenses) * 100 : 0}%`,
                        }}
                        className="h-full rounded-full bg-amber-500"
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-200">
                        <span>🔧</span> Maintenance & Repairs
                      </span>
                      <span className="font-mono text-rose-400 font-semibold">
                        {formatLKR(filteredData.totalMaintenanceCost)} (
                        {filteredData.totalExpenses > 0
                          ? ((filteredData.totalMaintenanceCost / filteredData.totalExpenses) * 100).toFixed(1)
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{
                          width: `${filteredData.totalExpenses > 0 ? (filteredData.totalMaintenanceCost / filteredData.totalExpenses) * 100 : 0}%`,
                        }}
                        className="h-full rounded-full bg-rose-500"
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-200">
                        <span>🛣️</span> Tolls & Highway Permits
                      </span>
                      <span className="font-mono text-blue-400 font-semibold">
                        {formatLKR(filteredData.totalTolls)} (
                        {filteredData.totalExpenses > 0
                          ? ((filteredData.totalTolls / filteredData.totalExpenses) * 100).toFixed(1)
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{
                          width: `${filteredData.totalExpenses > 0 ? (filteredData.totalTolls / filteredData.totalExpenses) * 100 : 0}%`,
                        }}
                        className="h-full rounded-full bg-blue-500"
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-200">
                        <span>👥</span> Crew Commissions & Wages
                      </span>
                      <span className="font-mono text-purple-400 font-semibold">
                        {formatLKR(filteredData.totalCommissions)} (
                        {filteredData.totalExpenses > 0
                          ? ((filteredData.totalCommissions / filteredData.totalExpenses) * 100).toFixed(1)
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{
                          width: `${filteredData.totalExpenses > 0 ? (filteredData.totalCommissions / filteredData.totalExpenses) * 100 : 0}%`,
                        }}
                        className="h-full rounded-full bg-purple-500"
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-400">
                  💡 <strong className="text-slate-300">Cost Optimization:</strong> Diesel fuel remains the largest operational expense in LKR. Keep buses serviced and monitor route turnouts regularly.
                </div>
              </div>
            </div>

            {/* Vehicle Profitability Matrix */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">Vehicle Profitability & Cost Ranking (LKR)</h3>
                <p className="text-xs text-slate-400">Performance and net contribution per commercial vehicle</p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Bus Vehicle</th>
                      <th className="py-3 px-4">Route Assignment</th>
                      <th className="py-3 px-4">Turnouts (Days)</th>
                      <th className="py-3 px-4 text-emerald-400">Gross Fares (LKR)</th>
                      <th className="py-3 px-4 text-rose-400">Fuel Cost (LKR)</th>
                      <th className="py-3 px-4 text-rose-400">Maintenance (LKR)</th>
                      <th className="py-3 px-4 text-amber-400 font-bold">Net Profit (LKR)</th>
                      <th className="py-3 px-4">Efficiency ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {filteredData.busPerformance.map((bus, idx) => {
                      const totalBusExp = bus.fuel + bus.tolls + bus.maintenance;
                      const roi = totalBusExp > 0 ? ((bus.revenue - totalBusExp) / totalBusExp) * 100 : 0;

                      return (
                        <tr key={bus.busReg} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-amber-400 flex items-center gap-2">
                            {idx === 0 && <span title="Top Earner">🏆</span>}
                            {bus.busReg}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-300">{bus.route}</td>
                          <td className="py-3.5 px-4">{bus.daysCount} runs</td>
                          <td className="py-3.5 px-4 font-semibold text-emerald-400">{formatLKR(bus.revenue)}</td>
                          <td className="py-3.5 px-4 text-rose-300">{formatLKR(bus.fuel)}</td>
                          <td className="py-3.5 px-4 text-rose-300">{formatLKR(bus.maintenance)}</td>
                          <td className={`py-3.5 px-4 font-bold ${bus.net >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                            {formatLKR(bus.net)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                roi > 50
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : roi > 0
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              {roi > 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW */}
        {/* ============================================================== */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {complianceAlerts.length > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    ⚠️ Document & Service Alerts ({complianceAlerts.length})
                  </div>
                  <button
                    onClick={() => setActiveTab("buses")}
                    className="text-xs font-semibold text-amber-400 underline hover:text-white"
                  >
                    Manage Documents →
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {complianceAlerts.map((a, i) => (
                    <span
                      key={i}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        a.days < 0
                          ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                          : "border-amber-500/40 bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      <strong className="font-mono">{a.busReg}</strong> — {a.label}:{" "}
                      {a.days < 0 ? `expired ${-a.days}d ago` : a.days === 0 ? "due today" : `in ${a.days}d`} ({a.date})
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Active Fleet</span>
                  <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">🚍</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">
                    {buses.filter((b) => b.status === "ACTIVE").length}
                  </span>
                  <span className="text-sm font-medium text-slate-400">/ {buses.length} Buses</span>
                </div>
                <div className="mt-2 text-xs text-emerald-400 font-medium">● All lines active in database</div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Today's Collections</span>
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">💰</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white">
                    {formatLKR(
                      routeLogs
                        .filter((l) => l.date === todayStr)
                        .reduce((s, c) => s + c.morningCollection + c.eveningCollection, 0)
                    )}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400">Morning & evening runs</div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Total Recorded Outflow</span>
                  <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">⛽</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white">{formatLKR(filteredData.totalExpenses)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-1.5">
                  <span>Fuel: {formatCompactLKR(filteredData.totalFuel)}</span>
                  <span>•</span>
                  <span>Maint: {formatCompactLKR(filteredData.totalMaintenanceCost)}</span>
                  <span>•</span>
                  <span>Other: {formatCompactLKR(filteredData.totalGeneralExpenses)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900/80 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between text-amber-300">
                  <span className="text-xs font-semibold uppercase tracking-wider">Net Operating Balance</span>
                  <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">📈</div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-amber-400">{formatLKR(filteredData.netProfit)}</span>
                </div>
                <div className="mt-2 text-xs text-amber-200/80 flex gap-3">
                  <button onClick={() => setActiveTab("reports")} className="underline hover:text-white">
                    P&L & Reports →
                  </button>
                  <button onClick={() => setActiveTab("analytics")} className="underline hover:text-white">
                    Charts →
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Live Bus Operations Roster</h2>
                    <p className="text-xs text-slate-400">Commercial fleet vehicles and assigned lines</p>
                  </div>
                  <button onClick={() => setActiveTab("buses")} className="text-xs text-amber-400 hover:text-amber-300 font-semibold">
                    Manage All →
                  </button>
                </div>

                {loaded && buses.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center space-y-3">
                    <p className="text-xs text-slate-400">No buses registered yet. Register your first vehicle to begin logging fares and expenses.</p>
                    <button
                      onClick={handleOpenAddBus}
                      className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                    >
                      + Register First Bus
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-800">
                  {buses.slice(0, 6).map((bus) => (
                    <div
                      key={bus.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2 hover:bg-slate-800/30 px-2 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 font-mono text-xs font-bold text-amber-400">
                          {bus.regNumber.split("-")[1] || bus.regNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">{bus.regNumber}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                bus.status === "ACTIVE"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              {bus.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">{bus.route}</div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 font-mono">Capacity: {bus.capacity} seats</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <h2 className="text-base font-bold text-white">Quick Actions</h2>
                  <div className="space-y-2">
                    <button
                      onClick={handleOpenAddLog}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span>📝</span> Record Daily Route Fare
                      </span>
                      <span className="text-amber-400">+</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("expenses")}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span>🧾</span> Record Operating Expense
                      </span>
                      <span className="text-amber-400">→</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("maintenance")}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span>🔧</span> Maintenance & Workshop Budget
                      </span>
                      <span className="text-amber-400">→</span>
                    </button>

                    <button
                      onClick={() => setActiveTab("reports")}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span>📑</span> P&L, Vehicle & Crew Reports
                      </span>
                      <span className="text-amber-400">→</span>
                    </button>

                    <button
                      onClick={handleOpenAddBus}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span>🚌</span> Register Bus
                      </span>
                      <span className="text-amber-400">+</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: BUSES & STATUTORY DOCUMENTS (FULL EDIT & DELETE) */}
        {/* ============================================================== */}
        {activeTab === "buses" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Fleet Inventory, Routing & Statutory Documents</h2>
                <p className="text-xs text-slate-400">
                  Manage registrations, routes, seating capacity, and expiry dates for Insurance, Revenue Licence, Route Permit, Emission & Fitness
                </p>
              </div>
              <button
                onClick={handleOpenAddBus}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20"
              >
                + Register New Bus
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Reg Number</th>
                    <th className="py-3 px-4">Route Assignment</th>
                    <th className="py-3 px-4">Seats</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-3">Insurance</th>
                    <th className="py-3 px-3">Rev. Licence</th>
                    <th className="py-3 px-3">Route Permit</th>
                    <th className="py-3 px-3">Emission</th>
                    <th className="py-3 px-3">Fitness</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {buses.map((bus) => (
                    <tr key={bus.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">{bus.regNumber}</td>
                      <td className="py-3.5 px-4 font-medium">{bus.route}</td>
                      <td className="py-3.5 px-4">{bus.capacity}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            bus.status === "ACTIVE"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {bus.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3"><DocBadge date={bus.insuranceExpiry} today={todayStr} /></td>
                      <td className="py-3.5 px-3"><DocBadge date={bus.revenueLicenseExpiry} today={todayStr} /></td>
                      <td className="py-3.5 px-3"><DocBadge date={bus.routePermitExpiry} today={todayStr} /></td>
                      <td className="py-3.5 px-3"><DocBadge date={bus.emissionTestExpiry} today={todayStr} /></td>
                      <td className="py-3.5 px-3"><DocBadge date={bus.fitnessCertExpiry} today={todayStr} /></td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditBus(bus)}
                            className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-slate-700 transition-colors"
                          >
                            ✏️ Edit
                          </button>
                          {isManager && (
                            <button
                              onClick={() => handleDeleteBus(bus)}
                              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bus Modal (Add / Edit) */}
            {showAddBusModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">
                      {editingBus ? "Edit Fleet Vehicle & Documents" : "Register New Fleet Vehicle"}
                    </h3>
                    <button onClick={() => setShowAddBusModal(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <form onSubmit={handleSaveBus} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Registration Number</label>
                        <input
                          type="text"
                          required
                          value={busReg}
                          onChange={(e) => setBusReg(e.target.value)}
                          placeholder="e.g. WP NB-9912"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Seating Capacity</label>
                        <input
                          type="number"
                          min="10"
                          max="80"
                          value={busCapacity}
                          onChange={(e) => setBusCapacity(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Assigned Route</label>
                      <input
                        type="text"
                        required
                        value={busRoute}
                        onChange={(e) => setBusRoute(e.target.value)}
                        placeholder="Route 138 (Pettah - Homagama)"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Statutory Document Expiry Dates (optional — alerts 30 days before expiry)
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold text-slate-300">Insurance Expiry</label>
                          <input
                            type="date"
                            value={busDocs.insuranceExpiry}
                            onChange={(e) => setBusDocs({ ...busDocs, insuranceExpiry: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-300">Revenue Licence Expiry</label>
                          <input
                            type="date"
                            value={busDocs.revenueLicenseExpiry}
                            onChange={(e) => setBusDocs({ ...busDocs, revenueLicenseExpiry: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-300">Route Permit Expiry</label>
                          <input
                            type="date"
                            value={busDocs.routePermitExpiry}
                            onChange={(e) => setBusDocs({ ...busDocs, routePermitExpiry: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-300">Emission Test Expiry</label>
                          <input
                            type="date"
                            value={busDocs.emissionTestExpiry}
                            onChange={(e) => setBusDocs({ ...busDocs, emissionTestExpiry: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-300">Fitness Certificate Expiry</label>
                          <input
                            type="date"
                            value={busDocs.fitnessCertExpiry}
                            onChange={(e) => setBusDocs({ ...busDocs, fitnessCertExpiry: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {editingBus && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="busActiveCheck"
                          checked={busActive}
                          onChange={(e) => setBusActive(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        />
                        <label htmlFor="busActiveCheck" className="text-xs font-semibold text-slate-300">
                          Active in Service (Uncheck for Maintenance/Off-duty)
                        </label>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddBusModal(false)}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingBus}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        {submittingBus ? "Saving..." : editingBus ? "Save Changes" : "Save Bus"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: DAILY ROUTE LOGS (FULL EDIT & DELETE + KM & LITRES) */}
        {/* ============================================================== */}
        {activeTab === "logs" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Daily Route Collections & Expenses (LKR)</h2>
                <p className="text-xs text-slate-400">
                  Logged fare turnouts, km run, diesel litres & cost, highway tolls, trip expenses, and crew commission ({settings.driverCommissionPct}% driver + {settings.conductorCommissionPct}% conductor)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={logFilterMonth}
                  onChange={(e) => setLogFilterMonth(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                  title="Filter by month (clear for all)"
                />
                <select
                  value={logFilterBus}
                  onChange={(e) => setLogFilterBus(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">All Buses</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.regNumber}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleOpenAddLog}
                  className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/20"
                >
                  + Record Daily Fare
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Bus</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Morning</th>
                    <th className="py-3 px-3">Evening</th>
                    <th className="py-3 px-3 text-emerald-400">Total Fare</th>
                    <th className="py-3 px-3">Km / Fuel</th>
                    <th className="py-3 px-3 text-rose-400">Fuel Cost</th>
                    <th className="py-3 px-3 text-rose-400">Tolls / Other</th>
                    <th className="py-3 px-3">Commission</th>
                    <th className="py-3 px-3 text-amber-400 font-bold">Net Profit</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {visibleLogs.map((log) => {
                    const gross = log.morningCollection + log.eveningCollection;
                    const other = log.otherExpenses ?? 0;
                    const exp = log.fuelCost + log.tollFees + other + log.commission;
                    const profit = gross - exp;
                    const kml = log.fuelLiters && log.kmRun ? (log.kmRun / log.fuelLiters).toFixed(2) : null;
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-3 font-mono font-bold text-amber-400">
                          <div>{log.busReg}</div>
                          {log.notes && <div className="text-[10px] font-sans font-normal text-slate-500">{log.notes}</div>}
                        </td>
                        <td className="py-3.5 px-3 text-slate-400 font-mono">{log.date}</td>
                        <td className="py-3.5 px-3">{formatLKR(log.morningCollection)}</td>
                        <td className="py-3.5 px-3">{formatLKR(log.eveningCollection)}</td>
                        <td className="py-3.5 px-3 font-semibold text-emerald-400">{formatLKR(gross)}</td>
                        <td className="py-3.5 px-3 font-mono text-slate-400">
                          {log.kmRun ? `${log.kmRun} km` : "—"}
                          {log.fuelLiters ? ` / ${log.fuelLiters}L` : ""}
                          {kml && <div className="text-[10px] text-emerald-400">{kml} km/L</div>}
                        </td>
                        <td className="py-3.5 px-3 text-rose-300">-{formatLKR(log.fuelCost)}</td>
                        <td className="py-3.5 px-3 text-rose-300">-{formatLKR(log.tollFees + other)}</td>
                        <td className="py-3.5 px-3">-{formatLKR(log.commission)}</td>
                        <td className={`py-3.5 px-3 font-bold ${profit >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                          {formatLKR(profit)}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditLog(log)}
                              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-slate-700 transition-colors"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteLog(log)}
                              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Route Log Modal (Add / Edit) */}
            {showAddLogModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">
                      {editingLog ? "Edit Daily Bus Turnout" : "Record Daily Bus Turnout (LKR)"}
                    </h3>
                    <button onClick={() => setShowAddLogModal(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <form onSubmit={handleSaveLog} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Select Bus</label>
                        <select
                          required
                          value={logBusId}
                          onChange={(e) => setLogBusId(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        >
                          {buses.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.regNumber} - {b.route}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Date of Turnout</label>
                        <input
                          type="date"
                          required
                          value={logDate}
                          onChange={(e) => setLogDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Morning Collection (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={logMorning}
                          onChange={(e) => setLogMorning(e.target.value)}
                          placeholder="45000.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Evening Collection (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={logEvening}
                          onChange={(e) => setLogEvening(e.target.value)}
                          placeholder="52000.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Fuel Cost (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={logFuel}
                          onChange={(e) => setLogFuel(e.target.value)}
                          placeholder="18500.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Tolls & Line Fees (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={logTolls}
                          onChange={(e) => setLogTolls(e.target.value)}
                          placeholder="1200.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Distance Run (km)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={logKmRun}
                          onChange={(e) => setLogKmRun(e.target.value)}
                          placeholder="220"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Diesel Litres (L)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={logFuelLiters}
                          onChange={(e) => setLogFuelLiters(e.target.value)}
                          placeholder="55"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Other Trip Cost (LKR)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={logOtherExpenses}
                          onChange={(e) => setLogOtherExpenses(e.target.value)}
                          placeholder="0.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300">Notes (optional)</label>
                      <input
                        type="text"
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        placeholder="e.g. 4 round trips, rain delay in evening"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    {/* Live Calculation Preview */}
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Gross Collection:</span>
                        <span className="font-mono font-semibold text-emerald-400">{formatLKR(logPreview.gross)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Driver ({settings.driverCommissionPct}%) + Conductor ({settings.conductorCommissionPct}%) Commission:</span>
                        <span className="font-mono text-rose-300">-{formatLKR(logPreview.comm)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-white border-t border-slate-800 pt-1">
                        <span>Net Bus Profit:</span>
                        <span className={`font-mono ${logPreview.net >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                          {formatLKR(logPreview.net)}
                        </span>
                      </div>
                      {(logPreview.kmPerLiter > 0 || logPreview.costPerKm > 0) && (
                        <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
                          <span>Efficiency: {logPreview.kmPerLiter ? `${logPreview.kmPerLiter.toFixed(2)} km/L` : "—"}</span>
                          <span>Cost/km: {logPreview.costPerKm ? formatLKR(logPreview.costPerKm) : "—"}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddLogModal(false)}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingLog}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        {submittingLog ? "Saving..." : editingLog ? "Save Changes" : "Save Log"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: EMPLOYEES, ATTENDANCE & PAYROLL */}
        {/* ============================================================== */}
        {activeTab === "crew" && (
          <EmployeesTab
            employees={employees}
            crewRoster={crewRoster}
            salaryPayments={salaryPayments}
            buses={buses}
            settings={settings}
            todayStr={todayStr}
            onChanged={loadData}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 6: CENTRAL HUB SYNC */}
        {/* ============================================================== */}
        {activeTab === "sync" && (
          <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Day Close & Central Admin Hub Synchronizer</h2>
                <p className="text-xs text-slate-400">
                  Calculates and persists `DailyFleetSummary` in MongoDB for the selected operating day
                </p>
              </div>
              <input
                type="date"
                value={syncDate}
                onChange={(e) => {
                  setSyncDate(e.target.value);
                  setSyncStatus("idle");
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Day Closing Summary ({syncDate} — LKR)
                </h3>
                <div className="space-y-2 text-xs divide-y divide-slate-800">
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Total Route Collections:</span>
                    <span className="font-mono font-semibold text-emerald-400">{formatLKR(syncDayReport.revenue)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Fuel Expenses:</span>
                    <span className="font-mono text-rose-400">-{formatLKR(syncDayReport.fuel)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Tolls & Other Trip Costs:</span>
                    <span className="font-mono text-rose-400">-{formatLKR(syncDayReport.tolls + syncDayReport.tripOther)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Crew Commissions & Wages:</span>
                    <span className="font-mono text-rose-400">-{formatLKR(syncDayReport.commission + syncDayReport.crewWages)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Maintenance & Operating Expenses:</span>
                    <span className="font-mono text-rose-400">-{formatLKR(syncDayReport.maintenance + syncDayReport.generalExpenses)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm font-bold text-white pt-3 border-t-2 border-slate-700">
                    <span>Net Closing Balance:</span>
                    <span className={`font-mono ${syncDayReport.net >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                      {formatLKR(syncDayReport.net)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleTriggerSync}
                  disabled={syncStatus === "syncing"}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {syncStatus === "syncing"
                    ? "Persisting to MongoDB & Pushing to Hub..."
                    : syncStatus === "synced"
                    ? `Successfully Closed & Synced (${syncDate}) ✓`
                    : `Execute Day Close & Hub Sync (${syncDate})`}
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outbound JSON Payload (Hub Contract)</h3>
                  <span className="text-[10px] text-amber-400 font-mono">src/types/hub.ts</span>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-[11px] font-mono text-emerald-300 border border-slate-800">
                  {JSON.stringify(
                    {
                      currency: "LKR",
                      date: syncDate,
                      totalCollection: syncDayReport.revenue.toFixed(2),
                      totalExpenses: syncDayReport.totalExpenses.toFixed(2),
                      expenseBreakdown: {
                        fuel: syncDayReport.fuel.toFixed(2),
                        tollAndLineFees: (syncDayReport.tolls + syncDayReport.tripOther).toFixed(2),
                        crewPay: (syncDayReport.commission + syncDayReport.crewWages).toFixed(2),
                        maintenance: (syncDayReport.maintenance + syncDayReport.generalExpenses).toFixed(2),
                      },
                      netProfit: syncDayReport.net.toFixed(2),
                      source: "fleet-management",
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        )}
          </div>
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          canEdit={isManager}
          onClose={() => setShowSettings(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
