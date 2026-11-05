"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  ensureDefaultUsers,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  SessionUser,
} from "@/lib/auth";
import { ActionResult } from "@/types";

export async function loginAction(
  email: string,
  password: string
): Promise<ActionResult<SessionUser>> {
  try {
    await ensureDefaultUsers();

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return { success: false, error: "Invalid email or password." };
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Invalid email or password." };
    }

    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    await setSessionCookie(sessionUser);
    return { success: true, data: sessionUser };
  } catch (error: any) {
    console.error("Login failed:", error);
    return {
      success: false,
      error: error.message || "An error occurred during sign in.",
    };
  }
}

export async function logoutAction(): Promise<ActionResult<void>> {
  try {
    await clearSessionCookie();
    return { success: true, data: undefined };
  } catch (error: any) {
    return { success: false, error: error.message || "Logout failed." };
  }
}

export async function getCurrentUserAction(): Promise<SessionUser | null> {
  await ensureDefaultUsers();
  return getSessionUser();
}

/**
 * Seeds demo buses, route logs, and maintenance into MongoDB Atlas if empty
 */
export async function seedInitialDataAction(): Promise<ActionResult<string>> {
  try {
    await ensureDefaultUsers();

    const busCount = await prisma.busVehicle.count();
    if (busCount === 0) {
      const b1 = await prisma.busVehicle.create({
        data: {
          registrationNumber: "NB-4012",
          routeName: "Express Route 100 (Metro - Coastal)",
          seatingCapacity: 54,
          isActive: true,
        },
      });

      const b2 = await prisma.busVehicle.create({
        data: {
          registrationNumber: "NB-4088",
          routeName: "Suburban Route 154 (City Center - Hills)",
          seatingCapacity: 48,
          isActive: true,
        },
      });

      const b3 = await prisma.busVehicle.create({
        data: {
          registrationNumber: "ND-1205",
          routeName: "Highway Route 02 (South Corridor)",
          seatingCapacity: 52,
          isActive: true,
        },
      });

      const b4 = await prisma.busVehicle.create({
        data: {
          registrationNumber: "WP-7729",
          routeName: "Feeder Route 255 (Airport Link)",
          seatingCapacity: 42,
          isActive: true,
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Create Route logs
      await prisma.dailyRouteLog.createMany({
        data: [
          {
            busId: b1.id,
            date: today,
            routeName: b1.routeName,
            morningCollection: 480.0,
            eveningCollection: 540.0,
            fuelCost: 195.0,
            tollAndLineFees: 40.0,
            conductorCommission: 40.0,
            driverCommission: 45.0,
          },
          {
            busId: b2.id,
            date: today,
            routeName: b2.routeName,
            morningCollection: 390.0,
            eveningCollection: 430.0,
            fuelCost: 160.0,
            tollAndLineFees: 25.0,
            conductorCommission: 32.0,
            driverCommission: 36.0,
          },
        ],
      });

      // Create Maintenance
      await prisma.busMaintenanceLog.create({
        data: {
          busId: b3.id,
          date: today,
          serviceType: "Brake Pad Replacement & Hydraulic Check",
          cost: 340.0,
          vendorName: "Apex Auto Engineering",
        },
      });

      // Create Crew payroll
      await prisma.crewAttendancePayroll.createMany({
        data: [
          {
            employeeName: "Kamal Perera",
            role: "DRIVER",
            busId: b1.id,
            date: today,
            dailyWage: 65.0,
            advanceTaken: 20.0,
            balanceOwed: 45.0,
          },
          {
            employeeName: "Sunil Silva",
            role: "CONDUCTOR",
            busId: b1.id,
            date: today,
            dailyWage: 50.0,
            advanceTaken: 10.0,
            balanceOwed: 40.0,
          },
        ],
      });
    }

    return { success: true, data: "Database seeded successfully!" };
  } catch (error: any) {
    console.error("Seeding error:", error);
    return { success: false, error: error.message };
  }
}

