/**
 * Shared client-side types + pure financial calculations used by the
 * dashboard, analytics, expenses and reports tabs.
 */

export interface Bus {
  id: string;
  regNumber: string;
  route: string;
  capacity: number;
  status: "ACTIVE" | "MAINTENANCE" | "IDLE";
  isActive?: boolean;
  insuranceExpiry?: string;
  revenueLicenseExpiry?: string;
  routePermitExpiry?: string;
  emissionTestExpiry?: string;
  fitnessCertExpiry?: string;
}

export interface RouteLog {
  id: string;
  busId: string;
  busReg: string;
  route: string;
  morningCollection: number;
  eveningCollection: number;
  fuelCost: number;
  tollFees: number;
  commission: number;
  conductorCommission?: number;
  driverCommission?: number;
  kmRun?: number;
  fuelLiters?: number;
  otherExpenses?: number;
  notes?: string;
  date: string;
}

export interface MaintenanceItem {
  id: string;
  busId: string;
  busReg: string;
  type: string;
  vendor: string;
  cost: number;
  odometerKm?: number;
  nextServiceDate?: string;
  notes?: string;
  date: string;
  status: string;
}

export interface CrewMember {
  id: string;
  busId?: string | null;
  name: string;
  role: "DRIVER" | "CONDUCTOR";
  assignedBus: string;
  wage: number;
  advance: number;
  balance: number;
  date?: string;
  present: boolean;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidTo: string;
  busId: string | null;
  busReg: string;
}

export interface Settings {
  driverCommissionPct: number;
  conductorCommissionPct: number;
  driverBaseWage: number;
  conductorBaseWage: number;
  maintenanceBudget: number;
  monthlyRevenueTarget: number;
}

export const DEFAULT_SETTINGS: Settings = {
  driverCommissionPct: 5,
  conductorCommissionPct: 4,
  driverBaseWage: 3500,
  conductorBaseWage: 2800,
  maintenanceBudget: 250000,
  monthlyRevenueTarget: 0,
};

export const EXPENSE_CATEGORIES = [
  "Insurance",
  "Revenue Licence",
  "Route Permit (NTC / Provincial)",
  "Emission Test / Fitness",
  "Lease / Loan Installment",
  "Tyres",
  "Lubricants & Spares",
  "Bus Wash & Cleaning",
  "Parking / Depot Rent",
  "Fines & Penalties",
  "Staff Welfare / Meals",
  "Office & Admin",
  "Bank Charges",
  "Other",
] as const;

export const DOCUMENT_FIELDS: { key: keyof Bus; label: string }[] = [
  { key: "insuranceExpiry", label: "Insurance" },
  { key: "revenueLicenseExpiry", label: "Revenue Licence" },
  { key: "routePermitExpiry", label: "Route Permit" },
  { key: "emissionTestExpiry", label: "Emission Test" },
  { key: "fitnessCertExpiry", label: "Fitness Cert." },
];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export const formatLKR = (val: number | string | undefined | null) => {
  const n = typeof val === "string" ? parseFloat(val) : val ?? 0;
  if (!Number.isFinite(n)) return "Rs. 0.00";
  const s = Math.abs(n).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-Rs. " : "Rs. ") + s;
};

export const formatCompactLKR = (val: number | string | undefined | null) => {
  const n = typeof val === "string" ? parseFloat(val) : val ?? 0;
  if (!Number.isFinite(n)) return "Rs. 0";
  return (n < 0 ? "-Rs. " : "Rs. ") + Math.round(Math.abs(n)).toLocaleString("en-LK");
};

export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

// ---------------------------------------------------------------------------
// Period report
// ---------------------------------------------------------------------------
export interface BusReportRow {
  busId: string;
  busReg: string;
  route: string;
  days: number;
  revenue: number;
  fuel: number;
  liters: number;
  km: number;
  tolls: number;
  commission: number;
  other: number;
  maintenance: number;
  fixedExpenses: number;
  crewWages: number;
  totalCost: number;
  net: number;
  kmPerLiter: number;
  costPerKm: number;
  revenuePerKm: number;
  avgDailyRevenue: number;
  margin: number;
}

export interface CrewReportRow {
  name: string;
  role: "DRIVER" | "CONDUCTOR";
  buses: string;
  days: number;
  wages: number;
  advances: number;
  balance: number;
  commission: number;
}

export interface DailyReportRow {
  date: string;
  revenue: number;
  fuel: number;
  tolls: number;
  commission: number;
  crewWages: number;
  maintenance: number;
  other: number;
  expenses: number;
  net: number;
  busesRun: number;
}

export interface PeriodReport {
  from: string;
  to: string;
  days: number;
  operatingDays: number;
  morning: number;
  evening: number;
  revenue: number;
  fuel: number;
  liters: number;
  km: number;
  tolls: number;
  driverCommission: number;
  conductorCommission: number;
  commission: number;
  crewWages: number;
  crewAdvances: number;
  crewBalance: number;
  maintenance: number;
  tripOther: number;
  expensesByCategory: { category: string; amount: number }[];
  generalExpenses: number;
  totalExpenses: number;
  net: number;
  margin: number;
  avgDailyRevenue: number;
  avgDailyNet: number;
  kmPerLiter: number;
  costPerKm: number;
  perBus: BusReportRow[];
  crew: CrewReportRow[];
  daily: DailyReportRow[];
  logs: RouteLog[];
  maint: MaintenanceItem[];
  crewRecords: CrewMember[];
  expenses: Expense[];
}

const inRange = (d: string | undefined, from: string, to: string) => !!d && d >= from && d <= to;

export function computePeriodReport(args: {
  from: string;
  to: string;
  buses: Bus[];
  routeLogs: RouteLog[];
  maintenance: MaintenanceItem[];
  crew: CrewMember[];
  expenses: Expense[];
  busId?: string; // optional filter to a single bus
}): PeriodReport {
  const { from, to, busId } = args;
  const byBus = <T extends { busId?: string | null }>(x: T) => !busId || x.busId === busId;

  const logs = args.routeLogs.filter((l) => inRange(l.date, from, to) && byBus(l));
  const maint = args.maintenance.filter((m) => inRange(m.date, from, to) && byBus(m));
  const crewRecords = args.crew.filter((c) => inRange(c.date, from, to) && byBus(c));
  const expenses = args.expenses.filter((e) => inRange(e.date, from, to) && byBus(e));

  const sum = <T>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + (f(x) || 0), 0);

  const morning = sum(logs, (l) => l.morningCollection);
  const evening = sum(logs, (l) => l.eveningCollection);
  const revenue = morning + evening;
  const fuel = sum(logs, (l) => l.fuelCost);
  const liters = sum(logs, (l) => l.fuelLiters ?? 0);
  const km = sum(logs, (l) => l.kmRun ?? 0);
  const tolls = sum(logs, (l) => l.tollFees);
  const driverCommission = sum(logs, (l) => l.driverCommission ?? 0);
  const conductorCommission = sum(logs, (l) => l.conductorCommission ?? 0);
  const commission = sum(logs, (l) => l.commission);
  const tripOther = sum(logs, (l) => l.otherExpenses ?? 0);
  const crewWages = sum(crewRecords, (c) => c.wage);
  const crewAdvances = sum(crewRecords, (c) => c.advance);
  const crewBalance = sum(crewRecords, (c) => c.balance);
  const maintenance = sum(maint, (m) => m.cost);

  const catMap = new Map<string, number>();
  for (const e of expenses) catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount);
  const expensesByCategory = [...catMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const generalExpenses = sum(expenses, (e) => e.amount);

  const totalExpenses = fuel + tolls + commission + tripOther + crewWages + maintenance + generalExpenses;
  const net = revenue - totalExpenses;

  // ---- daily
  const dayMap = new Map<string, DailyReportRow>();
  const day = (d: string) => {
    let r = dayMap.get(d);
    if (!r) {
      r = { date: d, revenue: 0, fuel: 0, tolls: 0, commission: 0, crewWages: 0, maintenance: 0, other: 0, expenses: 0, net: 0, busesRun: 0 };
      dayMap.set(d, r);
    }
    return r;
  };
  for (const l of logs) {
    const r = day(l.date);
    r.revenue += l.morningCollection + l.eveningCollection;
    r.fuel += l.fuelCost;
    r.tolls += l.tollFees;
    r.commission += l.commission;
    r.other += l.otherExpenses ?? 0;
    r.busesRun += 1;
  }
  for (const c of crewRecords) if (c.date) day(c.date).crewWages += c.wage;
  for (const m of maint) day(m.date).maintenance += m.cost;
  for (const e of expenses) day(e.date).other += e.amount;
  for (const r of dayMap.values()) {
    r.expenses = r.fuel + r.tolls + r.commission + r.crewWages + r.maintenance + r.other;
    r.net = r.revenue - r.expenses;
  }
  const daily = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // ---- per bus
  const busRows = new Map<string, BusReportRow>();
  const busRow = (id: string, reg: string, route: string) => {
    let r = busRows.get(id);
    if (!r) {
      r = {
        busId: id, busReg: reg, route, days: 0, revenue: 0, fuel: 0, liters: 0, km: 0, tolls: 0, commission: 0,
        other: 0, maintenance: 0, fixedExpenses: 0, crewWages: 0, totalCost: 0, net: 0, kmPerLiter: 0,
        costPerKm: 0, revenuePerKm: 0, avgDailyRevenue: 0, margin: 0,
      };
      busRows.set(id, r);
    }
    return r;
  };
  for (const b of args.buses) if (!busId || b.id === busId) busRow(b.id, b.regNumber, b.route);
  for (const l of logs) {
    const r = busRow(l.busId, l.busReg, l.route);
    r.days += 1;
    r.revenue += l.morningCollection + l.eveningCollection;
    r.fuel += l.fuelCost;
    r.liters += l.fuelLiters ?? 0;
    r.km += l.kmRun ?? 0;
    r.tolls += l.tollFees;
    r.commission += l.commission;
    r.other += l.otherExpenses ?? 0;
  }
  for (const m of maint) busRow(m.busId, m.busReg, "").maintenance += m.cost;
  for (const e of expenses) if (e.busId) busRow(e.busId, e.busReg, "").fixedExpenses += e.amount;
  for (const c of crewRecords) if (c.busId) busRow(c.busId, c.assignedBus, "").crewWages += c.wage;
  for (const r of busRows.values()) {
    r.totalCost = r.fuel + r.tolls + r.commission + r.other + r.maintenance + r.fixedExpenses + r.crewWages;
    r.net = r.revenue - r.totalCost;
    r.kmPerLiter = r.liters > 0 ? r.km / r.liters : 0;
    r.costPerKm = r.km > 0 ? r.totalCost / r.km : 0;
    r.revenuePerKm = r.km > 0 ? r.revenue / r.km : 0;
    r.avgDailyRevenue = r.days > 0 ? r.revenue / r.days : 0;
    r.margin = pct(r.net, r.revenue);
  }
  const perBus = [...busRows.values()].sort((a, b) => b.net - a.net);

  // ---- crew payroll
  const crewMap = new Map<string, CrewReportRow & { busSet: Set<string> }>();
  for (const c of crewRecords) {
    const key = `${c.name.toLowerCase()}|${c.role}`;
    let r = crewMap.get(key);
    if (!r) {
      r = { name: c.name, role: c.role, buses: "", days: 0, wages: 0, advances: 0, balance: 0, commission: 0, busSet: new Set() };
      crewMap.set(key, r);
    }
    r.days += 1;
    r.wages += c.wage;
    r.advances += c.advance;
    r.balance += c.balance;
    if (c.assignedBus && c.assignedBus !== "Unassigned") r.busSet.add(c.assignedBus);
  }
  // attribute commissions to crew on the same bus+day
  for (const l of logs) {
    const onBus = crewRecords.filter((c) => c.busId === l.busId && c.date === l.date);
    for (const c of onBus) {
      const r = crewMap.get(`${c.name.toLowerCase()}|${c.role}`);
      if (r) r.commission += c.role === "DRIVER" ? l.driverCommission ?? 0 : l.conductorCommission ?? 0;
    }
  }
  const crew = [...crewMap.values()]
    .map(({ busSet, ...r }) => ({ ...r, buses: [...busSet].join(", ") || "—" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const operatingDays = new Set(logs.map((l) => l.date)).size;

  return {
    from, to, days, operatingDays, morning, evening, revenue, fuel, liters, km, tolls,
    driverCommission, conductorCommission, commission, crewWages, crewAdvances, crewBalance,
    maintenance, tripOther, expensesByCategory, generalExpenses, totalExpenses, net,
    margin: pct(net, revenue),
    avgDailyRevenue: operatingDays ? revenue / operatingDays : 0,
    avgDailyNet: operatingDays ? net / operatingDays : 0,
    kmPerLiter: liters > 0 ? km / liters : 0,
    costPerKm: km > 0 ? totalExpenses / km : 0,
    perBus, crew, daily, logs, maint, crewRecords, expenses,
  };
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Days until a "YYYY-MM-DD" date from today (negative = expired). */
export function daysUntil(dateStr: string | undefined, today: string): number | null {
  if (!dateStr) return null;
  return Math.round((Date.parse(dateStr) - Date.parse(today)) / 86400000);
}

