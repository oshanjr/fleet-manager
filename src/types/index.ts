import { Role, CrewRole } from "@prisma/client";

export { Role, CrewRole };

/** Result type for server actions */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Serialized Decimal values (for client transport) */
export type SerializedDecimal = string;

/** Bus vehicle as returned to the client */
export interface BusVehicleRow {
  id: string;
  registrationNumber: string;
  routeName: string;
  seatingCapacity: number;
  isActive: boolean;
}

/** Daily route log as returned to the client */
export interface DailyRouteLogRow {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  busId: string;
  busRegistration: string;
  routeName: string;
  morningCollection: SerializedDecimal;
  eveningCollection: SerializedDecimal;
  fuelCost: SerializedDecimal;
  tollAndLineFees: SerializedDecimal;
  conductorCommission: SerializedDecimal;
  driverCommission: SerializedDecimal;
}

/** Maintenance log row for client */
export interface MaintenanceLogRow {
  id: string;
  date: string;
  busId: string;
  busRegistration: string;
  serviceType: string;
  cost: SerializedDecimal;
  vendorName: string;
}

/** Crew attendance/payroll row for client */
export interface CrewAttendanceRow {
  id: string;
  date: string;
  employeeName: string;
  role: CrewRole;
  dailyWage: SerializedDecimal;
  advanceTaken: SerializedDecimal;
  balanceOwed: SerializedDecimal;
  busId: string | null;
  busRegistration: string | null;
}

/** Crew rate settings (manager only) */
export interface CrewRateRow {
  id: string;
  role: CrewRole;
  baseDailyWage: SerializedDecimal;
  commissionPercent: SerializedDecimal;
}

/** Daily fleet summary for closing page */
export interface DailyFleetSummaryRow {
  id: string;
  date: string;
  totalCollection: SerializedDecimal;
  totalFuelExpense: SerializedDecimal;
  totalTollAndLineFees: SerializedDecimal;
  totalMaintenanceCost: SerializedDecimal;
  totalCrewPay: SerializedDecimal;
  netProfit: SerializedDecimal;
  isSyncedWithHub: boolean;
  syncedAt: string | null;
  lastSyncError: string | null;
}
