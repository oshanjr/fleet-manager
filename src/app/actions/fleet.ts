"use server";

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";

export async function getFleetDataAction() {
  try {
    const [buses, routeLogs, maintenanceRecords, crewRoster, summary] =
      await Promise.all([
        prisma.busVehicle.findMany({
          orderBy: { createdAt: "desc" },
        }),
        prisma.dailyRouteLog.findMany({
          include: { bus: true },
          orderBy: { date: "desc" },
          take: 50,
        }),
        prisma.busMaintenanceLog.findMany({
          include: { bus: true },
          orderBy: { date: "desc" },
          take: 50,
        }),
        prisma.crewAttendancePayroll.findMany({
          include: { bus: true },
          orderBy: { date: "desc" },
          take: 50,
        }),
        prisma.dailyFleetSummary.findFirst({
          orderBy: { date: "desc" },
        }),
      ]);

    return {
      success: true,
      data: {
        buses: buses.map((b) => ({
          id: b.id,
          regNumber: b.registrationNumber,
          route: b.routeName,
          capacity: b.seatingCapacity,
          status: b.isActive ? "ACTIVE" : "MAINTENANCE",
        })),
        routeLogs: routeLogs.map((l) => ({
          id: l.id,
          busReg: l.bus.registrationNumber,
          route: l.routeName,
          morningCollection: l.morningCollection,
          eveningCollection: l.eveningCollection,
          fuelCost: l.fuelCost,
          tollFees: l.tollAndLineFees,
          commission: l.conductorCommission + l.driverCommission,
          date: l.date.toISOString().split("T")[0],
        })),
        maintenanceRecords: maintenanceRecords.map((m) => ({
          id: m.id,
          busReg: m.bus.registrationNumber,
          type: m.serviceType,
          vendor: m.vendorName,
          cost: m.cost,
          date: m.date.toISOString().split("T")[0],
          status: "Completed",
        })),
        crewRoster: crewRoster.map((c) => ({
          id: c.id,
          name: c.employeeName,
          role: c.role,
          assignedBus: c.bus ? c.bus.registrationNumber : "Unassigned",
          wage: c.dailyWage,
          advance: c.advanceTaken,
          balance: c.balanceOwed,
          present: true,
        })),
        lastSummary: summary
          ? {
              date: summary.date.toISOString().split("T")[0],
              totalCollection: summary.totalCollection,
              netProfit: summary.netProfit,
              isSyncedWithHub: summary.isSyncedWithHub,
              syncedAt: summary.syncedAt?.toISOString() || null,
            }
          : null,
      },
    };
  } catch (error: any) {
    console.error("Failed to load fleet data:", error);
    return { success: false, error: error.message };
  }
}

export async function addBusAction(
  regNumber: string,
  routeName: string,
  seatingCapacity: number
): Promise<ActionResult<any>> {
  try {
    const bus = await prisma.busVehicle.create({
      data: {
        registrationNumber: regNumber.trim().toUpperCase(),
        routeName: routeName.trim(),
        seatingCapacity: Number(seatingCapacity),
        isActive: true,
      },
    });
    revalidatePath("/");
    return { success: true, data: bus };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function addRouteLogAction(
  busId: string,
  morningCollection: number,
  eveningCollection: number,
  fuelCost: number,
  tollAndLineFees: number
): Promise<ActionResult<any>> {
  try {
    const bus = await prisma.busVehicle.findUnique({ where: { id: busId } });
    if (!bus) return { success: false, error: "Bus vehicle not found" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const morning = Number(morningCollection) || 0;
    const evening = Number(eveningCollection) || 0;
    const gross = morning + evening;

    // Rates: ~4% conductor, ~5% driver
    const conductorCommission = Number((gross * 0.04).toFixed(2));
    const driverCommission = Number((gross * 0.05).toFixed(2));

    const log = await prisma.dailyRouteLog.upsert({
      where: {
        busId_date: {
          busId,
          date: today,
        },
      },
      update: {
        morningCollection: morning,
        eveningCollection: evening,
        fuelCost: Number(fuelCost) || 0,
        tollAndLineFees: Number(tollAndLineFees) || 0,
        conductorCommission,
        driverCommission,
      },
      create: {
        busId,
        date: today,
        routeName: bus.routeName,
        morningCollection: morning,
        eveningCollection: evening,
        fuelCost: Number(fuelCost) || 0,
        tollAndLineFees: Number(tollAndLineFees) || 0,
        conductorCommission,
        driverCommission,
      },
    });

    revalidatePath("/");
    return { success: true, data: log };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function syncWithCentralHubAction(): Promise<ActionResult<any>> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [logs, maintenance, crew] = await Promise.all([
      prisma.dailyRouteLog.findMany({ where: { date: today } }),
      prisma.busMaintenanceLog.findMany({ where: { date: today } }),
      prisma.crewAttendancePayroll.findMany({ where: { date: today } }),
    ]);

    const totalCollection = logs.reduce(
      (sum, l) => sum + l.morningCollection + l.eveningCollection,
      0
    );
    const totalFuelExpense = logs.reduce((sum, l) => sum + l.fuelCost, 0);
    const totalTollAndLineFees = logs.reduce(
      (sum, l) => sum + l.tollAndLineFees,
      0
    );
    const totalMaintenanceCost = maintenance.reduce(
      (sum, m) => sum + m.cost,
      0
    );
    const totalCrewPay = crew.reduce((sum, c) => sum + c.dailyWage, 0);

    const totalExpenses =
      totalFuelExpense +
      totalTollAndLineFees +
      totalMaintenanceCost +
      totalCrewPay;
    const netProfit = totalCollection - totalExpenses;

    const summary = await prisma.dailyFleetSummary.upsert({
      where: { date: today },
      update: {
        totalCollection,
        totalFuelExpense,
        totalTollAndLineFees,
        totalMaintenanceCost,
        totalCrewPay,
        netProfit,
        isSyncedWithHub: true,
        syncedAt: new Date(),
      },
      create: {
        date: today,
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
    return { success: true, data: summary };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

