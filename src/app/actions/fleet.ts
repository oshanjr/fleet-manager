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
          take: 500,
        }),
        prisma.busMaintenanceLog.findMany({
          include: { bus: true },
          orderBy: { date: "desc" },
          take: 500,
        }),
        prisma.crewAttendancePayroll.findMany({
          include: { bus: true },
          orderBy: { date: "desc" },
          take: 500,
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
          isActive: b.isActive,
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
          date: l.date.toISOString().split("T")[0],
        })),
        maintenanceRecords: maintenanceRecords.map((m) => ({
          id: m.id,
          busId: m.busId,
          busReg: m.bus ? m.bus.registrationNumber : "Unknown",
          type: m.serviceType,
          vendor: m.vendorName,
          cost: m.cost,
          date: m.date.toISOString().split("T")[0],
          status: "Completed",
        })),
        crewRoster: crewRoster.map((c) => ({
          id: c.id,
          busId: c.busId,
          name: c.employeeName,
          role: c.role,
          assignedBus: c.bus ? c.bus.registrationNumber : "Unassigned",
          wage: c.dailyWage,
          advance: c.advanceTaken,
          balance: c.balanceOwed,
          date: c.date.toISOString().split("T")[0],
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

// ============================================================================
// BUS VEHICLE ACTIONS (CREATE, UPDATE, DELETE)
// ============================================================================
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

export async function updateBusAction(
  id: string,
  regNumber: string,
  routeName: string,
  seatingCapacity: number,
  isActive: boolean
): Promise<ActionResult<any>> {
  try {
    const updated = await prisma.busVehicle.update({
      where: { id },
      data: {
        registrationNumber: regNumber.trim().toUpperCase(),
        routeName: routeName.trim(),
        seatingCapacity: Number(seatingCapacity),
        isActive: Boolean(isActive),
      },
    });
    revalidatePath("/");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteBusAction(id: string): Promise<ActionResult<void>> {
  try {
    await prisma.$transaction([
      prisma.dailyRouteLog.deleteMany({ where: { busId: id } }),
      prisma.busMaintenanceLog.deleteMany({ where: { busId: id } }),
      prisma.crewAttendancePayroll.updateMany({
        where: { busId: id },
        data: { busId: null },
      }),
      prisma.busVehicle.delete({ where: { id } }),
    ]);
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DAILY ROUTE LOG ACTIONS (CREATE, UPDATE, DELETE)
// ============================================================================
export async function addRouteLogAction(
  busId: string,
  morningCollection: number,
  eveningCollection: number,
  fuelCost: number,
  tollAndLineFees: number,
  dateStr?: string
): Promise<ActionResult<any>> {
  try {
    const bus = await prisma.busVehicle.findUnique({ where: { id: busId } });
    if (!bus) return { success: false, error: "Bus vehicle not found" };

    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const morning = Number(morningCollection) || 0;
    const evening = Number(eveningCollection) || 0;
    const gross = morning + evening;

    const conductorCommission = Number((gross * 0.04).toFixed(2));
    const driverCommission = Number((gross * 0.05).toFixed(2));

    const log = await prisma.dailyRouteLog.upsert({
      where: {
        busId_date: {
          busId,
          date: targetDate,
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
        date: targetDate,
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

export async function updateRouteLogAction(
  id: string,
  busId: string,
  morningCollection: number,
  eveningCollection: number,
  fuelCost: number,
  tollAndLineFees: number,
  dateStr: string
): Promise<ActionResult<any>> {
  try {
    const bus = await prisma.busVehicle.findUnique({ where: { id: busId } });
    if (!bus) return { success: false, error: "Bus vehicle not found" };

    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    const morning = Number(morningCollection) || 0;
    const evening = Number(eveningCollection) || 0;
    const gross = morning + evening;
    const conductorCommission = Number((gross * 0.04).toFixed(2));
    const driverCommission = Number((gross * 0.05).toFixed(2));

    const updated = await prisma.dailyRouteLog.update({
      where: { id },
      data: {
        busId,
        routeName: bus.routeName,
        date: targetDate,
        morningCollection: morning,
        eveningCollection: evening,
        fuelCost: Number(fuelCost) || 0,
        tollAndLineFees: Number(tollAndLineFees) || 0,
        conductorCommission,
        driverCommission,
      },
    });

    revalidatePath("/");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteRouteLogAction(id: string): Promise<ActionResult<void>> {
  try {
    await prisma.dailyRouteLog.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// MAINTENANCE ACTIONS (CREATE, UPDATE, DELETE)
// ============================================================================
export async function addMaintenanceAction(
  busId: string,
  serviceType: string,
  cost: number,
  vendorName: string,
  dateStr?: string
): Promise<ActionResult<any>> {
  try {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const maintenance = await prisma.busMaintenanceLog.create({
      data: {
        busId,
        serviceType: serviceType.trim(),
        cost: Number(cost) || 0,
        vendorName: vendorName.trim(),
        date: targetDate,
      },
    });

    revalidatePath("/");
    return { success: true, data: maintenance };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateMaintenanceAction(
  id: string,
  busId: string,
  serviceType: string,
  cost: number,
  vendorName: string,
  dateStr: string
): Promise<ActionResult<any>> {
  try {
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    const updated = await prisma.busMaintenanceLog.update({
      where: { id },
      data: {
        busId,
        serviceType: serviceType.trim(),
        cost: Number(cost) || 0,
        vendorName: vendorName.trim(),
        date: targetDate,
      },
    });

    revalidatePath("/");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteMaintenanceAction(id: string): Promise<ActionResult<void>> {
  try {
    await prisma.busMaintenanceLog.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CREW ATTENDANCE & PAYROLL ACTIONS (CREATE, UPDATE, DELETE)
// ============================================================================
export async function addCrewAction(
  employeeName: string,
  role: "DRIVER" | "CONDUCTOR",
  dailyWage: number,
  advanceTaken: number,
  busId?: string,
  dateStr?: string
): Promise<ActionResult<any>> {
  try {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const wage = Number(dailyWage) || 0;
    const advance = Number(advanceTaken) || 0;
    const balance = wage - advance;

    const crew = await prisma.crewAttendancePayroll.create({
      data: {
        employeeName: employeeName.trim(),
        role,
        dailyWage: wage,
        advanceTaken: advance,
        balanceOwed: balance,
        busId: busId ? busId : null,
        date: targetDate,
      },
    });

    revalidatePath("/");
    return { success: true, data: crew };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCrewAction(
  id: string,
  employeeName: string,
  role: "DRIVER" | "CONDUCTOR",
  dailyWage: number,
  advanceTaken: number,
  busId?: string,
  dateStr?: string
): Promise<ActionResult<any>> {
  try {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const wage = Number(dailyWage) || 0;
    const advance = Number(advanceTaken) || 0;
    const balance = wage - advance;

    const updated = await prisma.crewAttendancePayroll.update({
      where: { id },
      data: {
        employeeName: employeeName.trim(),
        role,
        dailyWage: wage,
        advanceTaken: advance,
        balanceOwed: balance,
        busId: busId ? busId : null,
        date: targetDate,
      },
    });

    revalidatePath("/");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCrewAction(id: string): Promise<ActionResult<void>> {
  try {
    await prisma.crewAttendancePayroll.delete({ where: { id } });
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CENTRAL HUB SYNC ACTION
// ============================================================================
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

// ============================================================================
// SAMPLE DATA GENERATOR (14 DAYS IN LKR)
// ============================================================================
export async function generateSampleHistoryAction(): Promise<ActionResult<string>> {
  try {
    const buses = await prisma.busVehicle.findMany();
    if (buses.length === 0) {
      return { success: false, error: "No buses found. Please register buses first." };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= 14; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);

      for (const bus of buses) {
        const baseMorning = 35000 + Math.floor(Math.sin(i + bus.seatingCapacity) * 4000) + (bus.seatingCapacity * 120);
        const baseEvening = 40000 + Math.floor(Math.cos(i) * 5000) + (bus.seatingCapacity * 150);
        const gross = baseMorning + baseEvening;
        const fuel = 18500 + Math.floor(Math.random() * 4000);
        const tolls = 800 + (i % 2 === 0 ? 400 : 0);
        const conductorComm = Number((gross * 0.04).toFixed(2));
        const driverComm = Number((gross * 0.05).toFixed(2));

        await prisma.dailyRouteLog.upsert({
          where: {
            busId_date: {
              busId: bus.id,
              date: targetDate,
            },
          },
          update: {
            morningCollection: baseMorning,
            eveningCollection: baseEvening,
            fuelCost: fuel,
            tollAndLineFees: tolls,
            conductorCommission: conductorComm,
            driverCommission: driverComm,
          },
          create: {
            busId: bus.id,
            date: targetDate,
            routeName: bus.routeName,
            morningCollection: baseMorning,
            eveningCollection: baseEvening,
            fuelCost: fuel,
            tollAndLineFees: tolls,
            conductorCommission: conductorComm,
            driverCommission: driverComm,
          },
        });
      }

      if (i % 4 === 0 && buses.length > 0) {
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
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
