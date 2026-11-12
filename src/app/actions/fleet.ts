"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";
import { dayStr, toDayDate, toOptionalDayDate, todayLK } from "@/lib/dates";

// ============================================================================
// AUTH GUARDS — every server action is a public HTTP endpoint, so each one
// must verify the session itself.
// ============================================================================
async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated. Please sign in again.");
  return user;
}

async function requireManager() {
  const user = await requireUser();
  if (user.role !== "FLEET_MANAGER") {
    throw new Error("Only a Fleet Manager can perform this action.");
  }
  return user;
}

function fail(error: unknown): { success: false; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
    return { success: false, error: "A record with the same unique value already exists." };
  }
  return { success: false, error: msg };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const optNum = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const optStr = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

// ============================================================================
// SETTINGS (commission rates, base wages, maintenance budget)
// ============================================================================
const DEFAULT_SETTINGS = {
  driverCommissionPct: 5,
  conductorCommissionPct: 4,
  driverBaseWage: 3500,
  conductorBaseWage: 2800,
  maintenanceBudget: 250000,
  monthlyRevenueTarget: 0,
};

export type FleetSettings = typeof DEFAULT_SETTINGS;

async function loadSettings(): Promise<FleetSettings> {
  const [rates, rows] = await Promise.all([
    prisma.crewRate.findMany(),
    prisma.appSetting.findMany({
      where: { key: { in: ["maintenanceBudget", "monthlyRevenueTarget"] } },
    }),
  ]);
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rates) {
    if (r.role === "DRIVER") {
      s.driverCommissionPct = r.commissionPercent;
      s.driverBaseWage = r.baseDailyWage;
    } else {
      s.conductorCommissionPct = r.commissionPercent;
      s.conductorBaseWage = r.baseDailyWage;
    }
  }
  for (const row of rows) {
    const v = Number(row.value);
    if (Number.isFinite(v)) (s as any)[row.key] = v;
  }
  return s;
}

export async function updateSettingsAction(
  input: Partial<FleetSettings>
): Promise<ActionResult<FleetSettings>> {
  try {
    await requireManager();
    const cur = await loadSettings();
    const next = { ...cur, ...Object.fromEntries(Object.entries(input).map(([k, v]) => [k, num(v)])) };

    if (next.driverCommissionPct < 0 || next.driverCommissionPct > 50 || next.conductorCommissionPct < 0 || next.conductorCommissionPct > 50) {
      return { success: false, error: "Commission percentage must be between 0 and 50." };
    }

    await prisma.$transaction([
      prisma.crewRate.upsert({
        where: { role: "DRIVER" },
        update: { commissionPercent: next.driverCommissionPct, baseDailyWage: next.driverBaseWage },
        create: { role: "DRIVER", commissionPercent: next.driverCommissionPct, baseDailyWage: next.driverBaseWage },
      }),
      prisma.crewRate.upsert({
        where: { role: "CONDUCTOR" },
        update: { commissionPercent: next.conductorCommissionPct, baseDailyWage: next.conductorBaseWage },
        create: { role: "CONDUCTOR", commissionPercent: next.conductorCommissionPct, baseDailyWage: next.conductorBaseWage },
      }),
      prisma.appSetting.upsert({
        where: { key: "maintenanceBudget" },
        update: { value: String(next.maintenanceBudget) },
        create: { key: "maintenanceBudget", value: String(next.maintenanceBudget) },
      }),
      prisma.appSetting.upsert({
        where: { key: "monthlyRevenueTarget" },
        update: { value: String(next.monthlyRevenueTarget) },
        create: { key: "monthlyRevenueTarget", value: String(next.monthlyRevenueTarget) },
      }),
    ]);

    revalidatePath("/");
    return { success: true, data: next };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// LOAD EVERYTHING FOR THE DASHBOARD
// ============================================================================
export async function getFleetDataAction() {
  try {
    await requireUser();
    const [
      buses,
      routeLogs,
      maintenanceRecords,
      crewRoster,
      expenses,
      summary,
      settings,
      employees,
      salaryPayments,
    ] = await Promise.all([
      prisma.busVehicle.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.dailyRouteLog.findMany({
        include: { bus: true },
        orderBy: { date: "desc" },
        take: 3000,
      }),
      prisma.busMaintenanceLog.findMany({
        include: { bus: true },
        orderBy: { date: "desc" },
        take: 2000,
      }),
      prisma.crewAttendancePayroll.findMany({
        include: { bus: true },
        orderBy: { date: "desc" },
        take: 5000,
      }),
      prisma.fleetExpense.findMany({
        include: { bus: true },
        orderBy: { date: "desc" },
        take: 2000,
      }),
      prisma.dailyFleetSummary.findFirst({ orderBy: { date: "desc" } }),
      loadSettings(),
      prisma.employee.findMany({
        include: { bus: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.salaryPayment.findMany({
        include: { employee: true },
        orderBy: { paymentDate: "desc" },
        take: 2000,
      }),
    ]);

    return {
      success: true as const,
      data: {
        settings,
        buses: buses.map((b) => ({
          id: b.id,
          regNumber: b.registrationNumber,
          route: b.routeName,
          capacity: b.seatingCapacity,
          status: (b.isActive ? "ACTIVE" : "MAINTENANCE") as "ACTIVE" | "MAINTENANCE",
          isActive: b.isActive,
          insuranceExpiry: dayStr(b.insuranceExpiry),
          revenueLicenseExpiry: dayStr(b.revenueLicenseExpiry),
          routePermitExpiry: dayStr(b.routePermitExpiry),
          emissionTestExpiry: dayStr(b.emissionTestExpiry),
          fitnessCertExpiry: dayStr(b.fitnessCertExpiry),
        })),
        routeLogs: routeLogs.map((l) => ({
          id: l.id,
          busId: l.busId,
          busReg: l.bus ? l.bus.registrationNumber : "Unknown",
          route: l.routeName,
          morningCollection: l.morningCollection,
          eveningCollection: l.eveningCollection,
          fuelCost: l.fuelCost,
          tollFees: l.tollAndLineFees,
          commission: l.conductorCommission + l.driverCommission,
          conductorCommission: l.conductorCommission,
          driverCommission: l.driverCommission,
          kmRun: l.kmRun ?? 0,
          fuelLiters: l.fuelLiters ?? 0,
          otherExpenses: l.otherExpenses ?? 0,
          notes: l.notes ?? "",
          date: dayStr(l.date),
        })),
        maintenanceRecords: maintenanceRecords.map((m) => ({
          id: m.id,
          busId: m.busId,
          busReg: m.bus ? m.bus.registrationNumber : "Unknown",
          type: m.serviceType,
          vendor: m.vendorName,
          cost: m.cost,
          odometerKm: m.odometerKm ?? 0,
          nextServiceDate: dayStr(m.nextServiceDate),
          notes: m.notes ?? "",
          date: dayStr(m.date),
          status: "Completed",
        })),
        crewRoster: crewRoster.map((c) => ({
          id: c.id,
          employeeId: c.employeeId ?? null,
          busId: c.busId,
          name: c.employeeName,
          role: c.role,
          assignedBus: c.bus ? c.bus.registrationNumber : "Unassigned",
          wage: c.dailyWage,
          advance: c.advanceTaken,
          balance: c.balanceOwed,
          date: dayStr(c.date),
          status: c.status,
          present: c.status !== "ABSENT",
        })),
        employees: employees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          phone: e.phone ?? "",
          nic: e.nic ?? "",
          licenseNumber: e.licenseNumber ?? "",
          salaryType: e.salaryType,
          baseSalary: e.baseSalary,
          busId: e.busId,
          assignedBus: e.bus ? e.bus.registrationNumber : "Unassigned",
          isActive: e.isActive,
          joinedDate: dayStr(e.joinedDate),
          notes: e.notes ?? "",
        })),
        salaryPayments: salaryPayments.map((p) => ({
          id: p.id,
          employeeId: p.employeeId,
          employeeName: p.employee ? p.employee.name : "Unknown",
          paymentDate: dayStr(p.paymentDate),
          periodMonth: p.periodMonth,
          grossEarned: p.grossEarned,
          bonus: p.bonus,
          deductions: p.deductions,
          netPaid: p.netPaid,
          paymentMethod: p.paymentMethod,
          notes: p.notes ?? "",
        })),
        expenses: expenses.map((e) => ({
          id: e.id,
          date: dayStr(e.date),
          category: e.category,
          description: e.description,
          amount: e.amount,
          paidTo: e.paidTo ?? "",
          busId: e.busId,
          busReg: e.bus ? e.bus.registrationNumber : "",
        })),
        lastSummary: summary
          ? {
              date: dayStr(summary.date),
              totalCollection: summary.totalCollection,
              netProfit: summary.netProfit,
              isSyncedWithHub: summary.isSyncedWithHub,
              syncedAt: summary.syncedAt?.toISOString() || null,
            }
          : null,
      },
    };
  } catch (error) {
    console.error("Failed to load fleet data:", error);
    return fail(error);
  }
}

// ============================================================================
// BUS VEHICLE ACTIONS
// ============================================================================
export interface BusInput {
  regNumber: string;
  routeName: string;
  seatingCapacity: number;
  isActive?: boolean;
  insuranceExpiry?: string;
  revenueLicenseExpiry?: string;
  routePermitExpiry?: string;
  emissionTestExpiry?: string;
  fitnessCertExpiry?: string;
}

function busData(input: BusInput) {
  const reg = (input.regNumber || "").trim().toUpperCase();
  const route = (input.routeName || "").trim();
  if (!reg) throw new Error("Registration number is required.");
  if (!route) throw new Error("Route is required.");
  const seats = Math.round(num(input.seatingCapacity));
  if (seats < 1 || seats > 120) throw new Error("Seating capacity must be between 1 and 120.");
  return {
    registrationNumber: reg,
    routeName: route,
    seatingCapacity: seats,
    isActive: input.isActive ?? true,
    insuranceExpiry: toOptionalDayDate(input.insuranceExpiry),
    revenueLicenseExpiry: toOptionalDayDate(input.revenueLicenseExpiry),
    routePermitExpiry: toOptionalDayDate(input.routePermitExpiry),
    emissionTestExpiry: toOptionalDayDate(input.emissionTestExpiry),
    fitnessCertExpiry: toOptionalDayDate(input.fitnessCertExpiry),
  };
}

export async function addBusAction(input: BusInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const bus = await prisma.busVehicle.create({ data: busData(input) });
    revalidatePath("/");
    return { success: true, data: { id: bus.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateBusAction(id: string, input: BusInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const data = busData(input);
    await prisma.busVehicle.update({ where: { id }, data });
    // keep route name on logs in sync for future entries only (historical logs keep their route)
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBusAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireManager();
    await prisma.$transaction([
      prisma.dailyRouteLog.deleteMany({ where: { busId: id } }),
      prisma.busMaintenanceLog.deleteMany({ where: { busId: id } }),
      prisma.crewAttendancePayroll.updateMany({ where: { busId: id }, data: { busId: null } }),
      prisma.fleetExpense.updateMany({ where: { busId: id }, data: { busId: null } }),
      prisma.busVehicle.delete({ where: { id } }),
    ]);
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// DAILY ROUTE LOG ACTIONS
// ============================================================================
export interface RouteLogInput {
  busId: string;
  date: string;
  morningCollection: number;
  eveningCollection: number;
  fuelCost: number;
  tollAndLineFees: number;
  kmRun?: number | string;
  fuelLiters?: number | string;
  otherExpenses?: number | string;
  notes?: string;
}

async function routeLogData(input: RouteLogInput) {
  const bus = await prisma.busVehicle.findUnique({ where: { id: input.busId } });
  if (!bus) throw new Error("Bus vehicle not found");

  const morning = num(input.morningCollection);
  const evening = num(input.eveningCollection);
  const values = [morning, evening, num(input.fuelCost), num(input.tollAndLineFees), num(input.otherExpenses)];
  if (values.some((v) => v < 0)) throw new Error("Amounts cannot be negative.");

  const settings = await loadSettings();
  const gross = morning + evening;
  return {
    busId: bus.id,
    routeName: bus.routeName,
    date: toDayDate(input.date),
    morningCollection: morning,
    eveningCollection: evening,
    fuelCost: num(input.fuelCost),
    tollAndLineFees: num(input.tollAndLineFees),
    conductorCommission: Number(((gross * settings.conductorCommissionPct) / 100).toFixed(2)),
    driverCommission: Number(((gross * settings.driverCommissionPct) / 100).toFixed(2)),
    kmRun: optNum(input.kmRun),
    fuelLiters: optNum(input.fuelLiters),
    otherExpenses: optNum(input.otherExpenses),
    notes: optStr(input.notes),
  };
}

export async function addRouteLogAction(input: RouteLogInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const data = await routeLogData(input);
    const existing = await prisma.dailyRouteLog.findUnique({
      where: { busId_date: { busId: data.busId, date: data.date } },
    });
    if (existing) {
      return {
        success: false,
        error: `A fare entry already exists for this bus on ${dayStr(data.date)}. Edit the existing entry instead.`,
      };
    }
    const log = await prisma.dailyRouteLog.create({ data });
    revalidatePath("/");
    return { success: true, data: { id: log.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateRouteLogAction(id: string, input: RouteLogInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const data = await routeLogData(input);
    await prisma.dailyRouteLog.update({ where: { id }, data });
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRouteLogAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireUser();
    await prisma.dailyRouteLog.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// MAINTENANCE ACTIONS
// ============================================================================
export interface MaintenanceInput {
  busId: string;
  date: string;
  serviceType: string;
  vendorName: string;
  cost: number;
  odometerKm?: number | string;
  nextServiceDate?: string;
  notes?: string;
}

function maintenanceData(input: MaintenanceInput) {
  if (!input.busId) throw new Error("Select a bus.");
  if (!input.serviceType?.trim()) throw new Error("Service type is required.");
  const cost = num(input.cost);
  if (cost < 0) throw new Error("Cost cannot be negative.");
  return {
    busId: input.busId,
    date: toDayDate(input.date),
    serviceType: input.serviceType.trim(),
    vendorName: (input.vendorName || "").trim() || "Unspecified",
    cost,
    odometerKm: optNum(input.odometerKm),
    nextServiceDate: toOptionalDayDate(input.nextServiceDate),
    notes: optStr(input.notes),
  };
}

export async function addMaintenanceAction(input: MaintenanceInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const m = await prisma.busMaintenanceLog.create({ data: maintenanceData(input) });
    revalidatePath("/");
    return { success: true, data: { id: m.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateMaintenanceAction(id: string, input: MaintenanceInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    await prisma.busMaintenanceLog.update({ where: { id }, data: maintenanceData(input) });
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteMaintenanceAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireUser();
    await prisma.busMaintenanceLog.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// CREW ATTENDANCE & PAYROLL ACTIONS
// Each record = one crew member's attendance for one day.
// ============================================================================
export interface CrewInput {
  employeeId?: string;
  employeeName: string;
  role: "DRIVER" | "CONDUCTOR";
  dailyWage: number;
  advanceTaken: number;
  busId?: string;
  date: string;
  status?: "PRESENT" | "HALF_DAY" | "ABSENT";
}

function crewData(input: CrewInput) {
  const name = (input.employeeName || "").trim();
  if (!name) throw new Error("Employee name is required.");
  if (input.role !== "DRIVER" && input.role !== "CONDUCTOR") throw new Error("Invalid crew role.");
  const status = input.status ?? "PRESENT";
  if (status !== "PRESENT" && status !== "HALF_DAY" && status !== "ABSENT") {
    throw new Error("Invalid attendance status.");
  }
  const wage = num(input.dailyWage);
  const advance = num(input.advanceTaken);
  if (wage < 0 || advance < 0) throw new Error("Wage and advance cannot be negative.");
  return {
    employeeId: input.employeeId ? input.employeeId : null,
    employeeName: name,
    role: input.role,
    dailyWage: wage,
    advanceTaken: advance,
    balanceOwed: Number((wage - advance).toFixed(2)),
    busId: input.busId ? input.busId : null,
    date: toDayDate(input.date),
    status,
  };
}

export async function addCrewAction(input: CrewInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const data = crewData(input);
    const dup = await prisma.crewAttendancePayroll.findFirst({
      where: { employeeName: data.employeeName, date: data.date },
    });
    if (dup) {
      return { success: false, error: `${data.employeeName} is already marked for ${dayStr(data.date)}.` };
    }
    const crew = await prisma.crewAttendancePayroll.create({ data });
    revalidatePath("/");
    return { success: true, data: { id: crew.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCrewAction(id: string, input: CrewInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    await prisma.crewAttendancePayroll.update({ where: { id }, data: crewData(input) });
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCrewAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireUser();
    await prisma.crewAttendancePayroll.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Copies each crew member's most recent attendance record to the target date
 * (skips anyone already marked). Saves re-typing the roster every day.
 */
export async function copyCrewToDateAction(
  dateStr: string,
  names?: string[]
): Promise<ActionResult<{ created: number }>> {
  try {
    await requireUser();
    const target = toDayDate(dateStr);
    const all = await prisma.crewAttendancePayroll.findMany({
      where: { date: { lt: target } },
      orderBy: { date: "desc" },
      take: 5000,
    });
    const latest = new Map<string, (typeof all)[number]>();
    for (const r of all) if (!latest.has(r.employeeName)) latest.set(r.employeeName, r);

    const already = await prisma.crewAttendancePayroll.findMany({
      where: { date: target },
      select: { employeeName: true },
    });
    const skip = new Set(already.map((a) => a.employeeName));

    const rows = [...latest.values()]
      .filter((r) => !skip.has(r.employeeName))
      .filter((r) => !names || names.includes(r.employeeName))
      .map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        role: r.role,
        dailyWage: r.dailyWage,
        advanceTaken: 0,
        balanceOwed: r.dailyWage,
        busId: r.busId,
        date: target,
        status: "PRESENT" as const,
      }));

    if (rows.length) await prisma.crewAttendancePayroll.createMany({ data: rows });
    revalidatePath("/");
    return { success: true, data: { created: rows.length } };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// EMPLOYEE ROSTER, SALARY SETUP, BULK ATTENDANCE & SALARY PAYMENTS
// ============================================================================
export interface EmployeeInput {
  name: string;
  role: "DRIVER" | "CONDUCTOR";
  phone?: string;
  nic?: string;
  licenseNumber?: string;
  salaryType: "DAILY" | "MONTHLY";
  baseSalary: number;
  busId?: string;
  isActive?: boolean;
  joinedDate?: string;
  notes?: string;
}

function employeeData(input: EmployeeInput) {
  const name = (input.name || "").trim();
  if (!name) throw new Error("Employee name is required.");
  if (input.role !== "DRIVER" && input.role !== "CONDUCTOR") throw new Error("Invalid employee role.");
  if (input.salaryType !== "DAILY" && input.salaryType !== "MONTHLY") {
    throw new Error("Invalid salary type.");
  }
  const baseSalary = num(input.baseSalary);
  if (baseSalary < 0) throw new Error("Base salary / wage cannot be negative.");
  return {
    name,
    role: input.role,
    phone: optStr(input.phone),
    nic: optStr(input.nic),
    licenseNumber: optStr(input.licenseNumber),
    salaryType: input.salaryType,
    baseSalary,
    busId: input.busId ? input.busId : null,
    isActive: input.isActive !== false,
    joinedDate: toDayDate(input.joinedDate),
    notes: optStr(input.notes),
  };
}

export async function addEmployeeAction(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const emp = await prisma.employee.create({ data: employeeData(input) });
    revalidatePath("/");
    return { success: true, data: { id: emp.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateEmployeeAction(
  id: string,
  input: EmployeeInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    await prisma.employee.update({ where: { id }, data: employeeData(input) });
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireManager();
    await prisma.employee.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export interface BulkAttendanceEntry {
  employeeId: string;
  status: "PRESENT" | "HALF_DAY" | "ABSENT";
  busId?: string;
  advanceTaken?: number;
}

/**
 * Marks or updates attendance for multiple employees on a given date.
 * Automatically calculates daily wage from employee's salary settings:
 * - DAILY: 1x baseSalary (PRESENT), 0.5x (HALF_DAY), 0 (ABSENT)
 * - MONTHLY: round(baseSalary / 30) (PRESENT), round(baseSalary / 60) (HALF_DAY), 0 (ABSENT)
 */
export async function markBulkAttendanceAction(
  dateStr: string,
  entries: BulkAttendanceEntry[]
): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    await requireUser();
    const target = toDayDate(dateStr);
    const empIds = entries.map((e) => e.employeeId).filter(Boolean);
    if (!empIds.length) return { success: true, data: { created: 0, updated: 0 } };

    const employees = await prisma.employee.findMany({
      where: { id: { in: empIds } },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const existing = await prisma.crewAttendancePayroll.findMany({
      where: { date: target },
    });
    const byEmpId = new Map<string, (typeof existing)[number]>();
    const byName = new Map<string, (typeof existing)[number]>();
    for (const r of existing) {
      if (r.employeeId) byEmpId.set(r.employeeId, r);
      byName.set(r.employeeName, r);
    }

    let created = 0;
    let updated = 0;

    for (const entry of entries) {
      const emp = empMap.get(entry.employeeId);
      if (!emp) continue;

      const fullDaily =
        emp.salaryType === "MONTHLY" ? Math.round(emp.baseSalary / 30) : emp.baseSalary;
      const wage =
        entry.status === "PRESENT"
          ? fullDaily
          : entry.status === "HALF_DAY"
          ? Math.round(fullDaily / 2)
          : 0;
      const advance = Math.max(0, num(entry.advanceTaken));
      const balanceOwed = Number((wage - advance).toFixed(2));
      const busId = entry.busId !== undefined ? (entry.busId || null) : emp.busId;

      const prev = byEmpId.get(emp.id) ?? byName.get(emp.name);
      if (prev) {
        await prisma.crewAttendancePayroll.update({
          where: { id: prev.id },
          data: {
            employeeId: emp.id,
            employeeName: emp.name,
            role: emp.role,
            dailyWage: wage,
            advanceTaken: advance,
            balanceOwed,
            busId,
            status: entry.status,
          },
        });
        updated++;
      } else {
        await prisma.crewAttendancePayroll.create({
          data: {
            employeeId: emp.id,
            employeeName: emp.name,
            role: emp.role,
            dailyWage: wage,
            advanceTaken: advance,
            balanceOwed,
            busId,
            date: target,
            status: entry.status,
          },
        });
        created++;
      }
    }

    revalidatePath("/");
    return { success: true, data: { created, updated } };
  } catch (error) {
    return fail(error);
  }
}

export interface SalaryPaymentInput {
  employeeId: string;
  paymentDate: string;
  periodMonth: string; // YYYY-MM
  grossEarned: number;
  bonus: number;
  deductions: number;
  netPaid: number;
  paymentMethod: string;
  notes?: string;
}

async function salaryPaymentData(input: SalaryPaymentInput) {
  if (!input.employeeId) throw new Error("Select an employee.");
  if (!/^\d{4}-\d{2}$/.test(input.periodMonth || "")) {
    throw new Error("Period month must be in YYYY-MM format.");
  }
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!emp) throw new Error("Employee not found.");
  const grossEarned = num(input.grossEarned);
  const bonus = num(input.bonus);
  const deductions = num(input.deductions);
  const netPaid = num(input.netPaid);
  if (grossEarned < 0 || bonus < 0 || deductions < 0 || netPaid < 0) {
    throw new Error("Salary amounts cannot be negative.");
  }
  return {
    employeeId: input.employeeId,
    employeeName: emp.name,
    paymentDate: toDayDate(input.paymentDate),
    periodMonth: input.periodMonth,
    grossEarned,
    bonus,
    deductions,
    netPaid,
    paymentMethod: (input.paymentMethod || "Cash").trim(),
    notes: optStr(input.notes),
  };
}

export async function addSalaryPaymentAction(
  input: SalaryPaymentInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const data = await salaryPaymentData(input);
    const p = await prisma.salaryPayment.create({ data });
    revalidatePath("/");
    return { success: true, data: { id: p.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSalaryPaymentAction(
  id: string,
  input: SalaryPaymentInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const data = await salaryPaymentData(input);
    await prisma.salaryPayment.update({ where: { id }, data });
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSalaryPaymentAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireUser();
    await prisma.salaryPayment.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// GENERAL OPERATING EXPENSES
// ============================================================================
export interface ExpenseInput {
  date: string;
  category: string;
  description: string;
  amount: number;
  paidTo?: string;
  busId?: string;
}

function expenseData(input: ExpenseInput) {
  if (!input.category?.trim()) throw new Error("Category is required.");
  if (!input.description?.trim()) throw new Error("Description is required.");
  const amount = num(input.amount);
  if (amount <= 0) throw new Error("Amount must be greater than zero.");
  return {
    date: toDayDate(input.date),
    category: input.category.trim(),
    description: input.description.trim(),
    amount,
    paidTo: optStr(input.paidTo),
    busId: input.busId ? input.busId : null,
  };
}

export async function addExpenseAction(input: ExpenseInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const e = await prisma.fleetExpense.create({ data: expenseData(input) });
    revalidatePath("/");
    return { success: true, data: { id: e.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateExpenseAction(id: string, input: ExpenseInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    await prisma.fleetExpense.update({ where: { id }, data: expenseData(input) });
    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult<void>> {
  try {
    await requireUser();
    await prisma.fleetExpense.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// DAY CLOSE & CENTRAL HUB SYNC
// ============================================================================
export async function syncWithCentralHubAction(dateStr?: string): Promise<ActionResult<any>> {
  try {
    await requireUser();
    const day = toDayDate(dateStr || todayLK());

    const [logs, maintenance, crew, expenses] = await Promise.all([
      prisma.dailyRouteLog.findMany({ where: { date: day } }),
      prisma.busMaintenanceLog.findMany({ where: { date: day } }),
      prisma.crewAttendancePayroll.findMany({ where: { date: day } }),
      prisma.fleetExpense.findMany({ where: { date: day } }),
    ]);

    const totalCollection = logs.reduce((s, l) => s + l.morningCollection + l.eveningCollection, 0);
    const totalFuelExpense = logs.reduce((s, l) => s + l.fuelCost, 0);
    const totalTollAndLineFees = logs.reduce((s, l) => s + l.tollAndLineFees, 0);
    const totalMaintenanceCost = maintenance.reduce((s, m) => s + m.cost, 0);
    const commissions = logs.reduce((s, l) => s + l.conductorCommission + l.driverCommission, 0);
    const totalCrewPay = crew.reduce((s, c) => s + c.dailyWage, 0) + commissions;
    const otherCosts =
      logs.reduce((s, l) => s + (l.otherExpenses ?? 0), 0) + expenses.reduce((s, e) => s + e.amount, 0);

    const netProfit =
      totalCollection - (totalFuelExpense + totalTollAndLineFees + totalMaintenanceCost + totalCrewPay + otherCosts);

    const summary = await prisma.dailyFleetSummary.upsert({
      where: { date: day },
      update: {
        totalCollection,
        totalFuelExpense,
        totalTollAndLineFees,
        totalMaintenanceCost,
        totalCrewPay,
        netProfit,
        isSyncedWithHub: true,
        syncedAt: new Date(),
        lastSyncError: null,
      },
      create: {
        date: day,
        totalCollection,
        totalFuelExpense,
        totalTollAndLineFees,
        totalMaintenanceCost,
        totalCrewPay,
        netProfit,
        isSyncedWithHub: true,
        syncedAt: new Date(),
      },
    });

    revalidatePath("/");
    return { success: true, data: { ...summary, otherCosts } };
  } catch (error) {
    return fail(error);
  }
}

// ============================================================================
// SAMPLE DATA GENERATOR (14 DAYS IN LKR)
// ============================================================================
export async function generateSampleHistoryAction(): Promise<ActionResult<string>> {
  try {
    await requireManager();
    const buses = await prisma.busVehicle.findMany();
    if (buses.length === 0) {
      return { success: false, error: "No buses found. Please register buses first." };
    }
    const settings = await loadSettings();
    const today = toDayDate(todayLK());

    for (let i = 1; i <= 14; i++) {
      const targetDate = new Date(today);
      targetDate.setUTCDate(today.getUTCDate() - i);

      for (const bus of buses) {
        const morning = 35000 + Math.floor(Math.sin(i + bus.seatingCapacity) * 4000) + bus.seatingCapacity * 120;
        const evening = 40000 + Math.floor(Math.cos(i) * 5000) + bus.seatingCapacity * 150;
        const gross = morning + evening;
        const liters = 52 + Math.floor(Math.random() * 12);
        const fuel = Math.round(liters * 340);
        const km = 210 + Math.floor(Math.random() * 40);
        const tolls = 800 + (i % 2 === 0 ? 400 : 0);
        const data = {
          morningCollection: morning,
          eveningCollection: evening,
          fuelCost: fuel,
          fuelLiters: liters,
          kmRun: km,
          tollAndLineFees: tolls,
          otherExpenses: i % 3 === 0 ? 500 : 0,
          conductorCommission: Number(((gross * settings.conductorCommissionPct) / 100).toFixed(2)),
          driverCommission: Number(((gross * settings.driverCommissionPct) / 100).toFixed(2)),
        };

        await prisma.dailyRouteLog.upsert({
          where: { busId_date: { busId: bus.id, date: targetDate } },
          update: data,
          create: { ...data, busId: bus.id, date: targetDate, routeName: bus.routeName },
        });
      }

      if (i % 4 === 0) {
        const busToService = buses[i % buses.length];
        await prisma.busMaintenanceLog.create({
          data: {
            busId: busToService.id,
            date: targetDate,
            serviceType: i === 4 ? "Full Engine Oil & Filter Change" : "Brake Liner & Drum Servicing",
            cost: i === 4 ? 28500.0 : 19200.0,
            vendorName: "Castrol Express Hub",
          },
        });
      }
    }

    revalidatePath("/");
    return { success: true, data: "Successfully generated 14-day history in LKR!" };
  } catch (error) {
    return fail(error);
  }
}
