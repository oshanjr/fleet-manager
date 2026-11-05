"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logoutAction, seedInitialDataAction } from "@/app/actions/auth";
import {
  getFleetDataAction,
  addBusAction,
  addRouteLogAction,
  syncWithCentralHubAction,
} from "@/app/actions/fleet";
import { SessionUser } from "@/lib/auth";

interface Bus {
  id: string;
  regNumber: string;
  route: string;
  capacity: number;
  status: "ACTIVE" | "MAINTENANCE" | "IDLE";
  driver?: string;
  conductor?: string;
}

interface RouteLog {
  id: string;
  busReg: string;
  route: string;
  morningCollection: number;
  eveningCollection: number;
  fuelCost: number;
  tollFees: number;
  commission: number;
  date: string;
}

interface MaintenanceItem {
  id: string;
  busReg: string;
  type: string;
  vendor: string;
  cost: number;
  date: string;
  status: string;
}

interface CrewMember {
  id: string;
  name: string;
  role: "DRIVER" | "CONDUCTOR";
  assignedBus: string;
  wage: number;
  advance: number;
  balance: number;
  present: boolean;
}

export default function FleetDashboardClient({
  initialUser,
}: {
  initialUser: SessionUser;
}) {
  const router = useRouter();
  const [currentUser] = useState<SessionUser>(initialUser);

  const [activeTab, setActiveTab] = useState<
    "overview" | "buses" | "logs" | "maintenance" | "crew" | "sync"
  >("overview");

  const [buses, setBuses] = useState<Bus[]>([]);
  const [routeLogs, setRouteLogs] = useState<RouteLog[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceItem[]>([]);
  const [crewRoster, setCrewRoster] = useState<CrewMember[]>([]);

  const loadData = async () => {
    try {
      const res = await getFleetDataAction();
      if (res.success && res.data) {
        if (res.data.buses.length > 0) {
          setBuses(res.data.buses as any);
          setRouteLogs(res.data.routeLogs as any);
          setMaintenanceRecords(res.data.maintenanceRecords as any);
          setCrewRoster(res.data.crewRoster as any);
        } else {
          await seedInitialDataAction();
          const secondTry = await getFleetDataAction();
          if (secondTry.success && secondTry.data) {
            setBuses(secondTry.data.buses as any);
            setRouteLogs(secondTry.data.routeLogs as any);
            setMaintenanceRecords(secondTry.data.maintenanceRecords as any);
            setCrewRoster(secondTry.data.crewRoster as any);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load fleet data:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    await logoutAction();
    router.push("/login");
    router.refresh();
  };

  // Computations
  const totalCollections = routeLogs.reduce(
    (acc, curr) => acc + curr.morningCollection + curr.eveningCollection,
    0
  );
  const totalFuel = routeLogs.reduce((acc, curr) => acc + curr.fuelCost, 0);
  const totalTolls = routeLogs.reduce((acc, curr) => acc + curr.tollFees, 0);
  const totalCommissions = routeLogs.reduce(
    (acc, curr) => acc + curr.commission,
    0
  );
  const totalMaintenance = maintenanceRecords.reduce(
    (acc, curr) => acc + curr.cost,
    0
  );
  const totalExpenses =
    totalFuel + totalTolls + totalCommissions + totalMaintenance;
  const netProfit = totalCollections - totalExpenses;

  // Modals & form state
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [newReg, setNewReg] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [newCapacity, setNewCapacity] = useState(50);
  const [submittingBus, setSubmittingBus] = useState(false);

  const handleAddBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReg || !newRoute) return;
    setSubmittingBus(true);
    try {
      const res = await addBusAction(newReg, newRoute, newCapacity);
      if (res.success) {
        await loadData();
        setNewReg("");
        setNewRoute("");
        setShowAddBusModal(false);
      } else {
        alert(res.error || "Failed to create bus");
      }
    } finally {
      setSubmittingBus(false);
    }
  };

  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [selectedBusId, setSelectedBusId] = useState("");
  const [morningCollection, setMorningCollection] = useState("");
  const [eveningCollection, setEveningCollection] = useState("");
  const [fuelCost, setFuelCost] = useState("");
  const [tollFees, setTollFees] = useState("");
  const [submittingLog, setSubmittingLog] = useState(false);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusId) return;
    setSubmittingLog(true);
    try {
      const res = await addRouteLogAction(
        selectedBusId,
        Number(morningCollection) || 0,
        Number(eveningCollection) || 0,
        Number(fuelCost) || 0,
        Number(tollFees) || 0
      );
      if (res.success) {
        await loadData();
        setShowAddLogModal(false);
        setMorningCollection("");
        setEveningCollection("");
        setFuelCost("");
        setTollFees("");
      } else {
        alert(res.error || "Failed to add route log");
      }
    } finally {
      setSubmittingLog(false);
    }
  };

  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced">(
    "idle"
  );

  const handleTriggerSync = async () => {
    setSyncStatus("syncing");
    try {
      const res = await syncWithCentralHubAction();
      if (res.success) {
        setSyncStatus("synced");
      } else {
        alert(res.error || "Sync failed");
        setSyncStatus("idle");
      }
    } catch {
      setSyncStatus("idle");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  FleetFlow Manager
                </h1>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Dispatch
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Bus Operations & Central Logistics
              </p>
            </div>
          </div>

          {/* Right Header: User Info & Logout */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-bold text-white">
                {currentUser.name}
              </div>
              <div className="text-[10px] font-mono text-amber-400">
                {currentUser.role === "FLEET_MANAGER"
                  ? "Fleet Manager (Admin)"
                  : "Dispatch Supervisor"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto w-full max-w-7xl px-6 py-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">
                Active Fleet
              </span>
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                🚍
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">
                {buses.filter((b) => b.status === "ACTIVE").length}
              </span>
              <span className="text-sm font-medium text-slate-400">
                / {buses.length} Buses
              </span>
            </div>
            <div className="mt-2 text-xs text-emerald-400 font-medium">
              ● All lines active
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">
                Today's Gross Fares
              </span>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                💰
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">
                ${totalCollections.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Morning & evening runs
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">
                Operating Outflow
              </span>
              <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
                ⛽
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">
                ${totalExpenses.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400 flex gap-1.5">
              <span>Fuel: ${totalFuel}</span>
              <span>•</span>
              <span>Tolls: ${totalTolls}</span>
              <span>•</span>
              <span>Maint: ${totalMaintenance}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900/80 p-5 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-amber-300">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Day Net Margin
              </span>
              <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">
                📈
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-400">
                ${netProfit.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 text-xs text-amber-200/80">
              Ready for Daily Closing & Hub Sync
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
          {[
            { id: "overview", label: "Fleet Overview", icon: "📊" },
            { id: "buses", label: "Vehicles & Routes", icon: "🚍" },
            { id: "logs", label: "Daily Route Fares", icon: "📋" },
            { id: "maintenance", label: "Maintenance Logs", icon: "🔧" },
            { id: "crew", label: "Crew & Attendance", icon: "👥" },
            { id: "sync", label: "Central Hub Sync", icon: "🔄" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab.id
                  ? "border-amber-500 bg-slate-900 text-amber-400 shadow-sm"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Live Bus Operations Roster
                  </h2>
                  <p className="text-xs text-slate-400">
                    Line vehicles and operational status
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("buses")}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
                >
                  Manage All →
                </button>
              </div>

              <div className="divide-y divide-slate-800">
                {buses.slice(0, 5).map((bus) => (
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
                          <span className="font-semibold text-white text-sm">
                            {bus.regNumber}
                          </span>
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
                        <div className="text-xs text-slate-400">
                          {bus.route}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 font-mono">
                      Capacity: {bus.capacity} seats
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <h2 className="text-base font-bold text-white">
                  Quick Actions
                </h2>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setActiveTab("buses");
                      setShowAddBusModal(true);
                    }}
                    className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <span>🚌</span> Register Bus
                    </span>
                    <span className="text-amber-400">+</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab("logs");
                      setShowAddLogModal(true);
                    }}
                    className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <span>📝</span> Record Daily Route Fare
                    </span>
                    <span className="text-amber-400">+</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("sync")}
                    className="w-full flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition-all border border-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      <span>⚡</span> Execute Day Close & Hub Sync
                    </span>
                    <span className="text-amber-400">→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BUSES */}
        {activeTab === "buses" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Fleet Inventory & Routing
                </h2>
                <p className="text-xs text-slate-400">
                  Manage commercial bus registrations and route allocations
                </p>
              </div>
              <button
                onClick={() => setShowAddBusModal(true)}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
              >
                + Register New Bus
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Reg Number</th>
                    <th className="py-3 px-4">Route Assignment</th>
                    <th className="py-3 px-4">Seating</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {buses.map((bus) => (
                    <tr
                      key={bus.id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        {bus.regNumber}
                      </td>
                      <td className="py-3.5 px-4 font-medium">{bus.route}</td>
                      <td className="py-3.5 px-4">{bus.capacity} seats</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal */}
            {showAddBusModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">
                      Register Bus
                    </h3>
                    <button
                      onClick={() => setShowAddBusModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleAddBus} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">
                        Registration Number
                      </label>
                      <input
                        type="text"
                        required
                        value={newReg}
                        onChange={(e) => setNewReg(e.target.value)}
                        placeholder="e.g. WP-9912"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">
                        Assigned Route
                      </label>
                      <input
                        type="text"
                        required
                        value={newRoute}
                        onChange={(e) => setNewRoute(e.target.value)}
                        placeholder="Route 138 (Pettah - Homagama)"
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">
                        Seating Capacity
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="80"
                        value={newCapacity}
                        onChange={(e) => setNewCapacity(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
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
                        {submittingBus ? "Saving..." : "Save Bus"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DAILY ROUTE LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Daily Route Collections & Expenses
                </h2>
                <p className="text-xs text-slate-400">
                  Logged collections, fuel costs, toll fees, and commissions
                </p>
              </div>
              <button
                onClick={() => setShowAddLogModal(true)}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
              >
                + Record Daily Fare
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Bus</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Morning Fare</th>
                    <th className="py-3 px-4">Evening Fare</th>
                    <th className="py-3 px-4 text-emerald-400">Total Fare</th>
                    <th className="py-3 px-4 text-rose-400">Fuel</th>
                    <th className="py-3 px-4 text-rose-400">Tolls</th>
                    <th className="py-3 px-4">Commission</th>
                    <th className="py-3 px-4 text-amber-400 font-bold">
                      Net Bus Profit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {routeLogs.map((log) => {
                    const gross =
                      log.morningCollection + log.eveningCollection;
                    const exp = log.fuelCost + log.tollFees + log.commission;
                    const profit = gross - exp;
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                          {log.busReg}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {log.date}
                        </td>
                        <td className="py-3.5 px-4">
                          ${log.morningCollection.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          ${log.eveningCollection.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-emerald-400">
                          ${gross.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-rose-300">
                          -${log.fuelCost.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-rose-300">
                          -${log.tollFees.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          -${log.commission.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-amber-400">
                          ${profit.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal */}
            {showAddLogModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">
                      Record Daily Bus Turnout
                    </h3>
                    <button
                      onClick={() => setShowAddLogModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleAddLog} className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">
                        Select Bus
                      </label>
                      <select
                        required
                        value={selectedBusId}
                        onChange={(e) => setSelectedBusId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">-- Choose Bus --</option>
                        {buses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.regNumber} - {b.route}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">
                          Morning Collection ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={morningCollection}
                          onChange={(e) =>
                            setMorningCollection(e.target.value)
                          }
                          placeholder="450.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">
                          Evening Collection ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={eveningCollection}
                          onChange={(e) =>
                            setEveningCollection(e.target.value)
                          }
                          placeholder="520.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">
                          Fuel Cost ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={fuelCost}
                          onChange={(e) => setFuelCost(e.target.value)}
                          placeholder="180.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-300">
                          Tolls & Line Fees ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={tollFees}
                          onChange={(e) => setTollFees(e.target.value)}
                          placeholder="35.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
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
                        {submittingLog ? "Saving..." : "Save Log"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MAINTENANCE */}
        {activeTab === "maintenance" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div>
              <h2 className="text-lg font-bold text-white">
                Vehicle Maintenance & Servicing
              </h2>
              <p className="text-xs text-slate-400">
                Workshop orders and vendor repair costs
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {maintenanceRecords.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {m.busReg}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-400">
                      {m.status}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-white">
                      {m.type}
                    </h4>
                    <p className="text-xs text-slate-400">Vendor: {m.vendor}</p>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                    <span className="text-slate-500">{m.date}</span>
                    <span className="font-bold text-rose-400 text-sm">
                      ${m.cost.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: CREW & ATTENDANCE */}
        {activeTab === "crew" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div>
              <h2 className="text-lg font-bold text-white">
                Crew Attendance & Payroll
              </h2>
              <p className="text-xs text-slate-400">
                Driver and conductor daily wages and balance settlements
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Crew Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Assigned Bus</th>
                    <th className="py-3 px-4">Base Daily Wage</th>
                    <th className="py-3 px-4">Advance Paid</th>
                    <th className="py-3 px-4 text-amber-400">Balance Owed</th>
                    <th className="py-3 px-4">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {crewRoster.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {c.name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold">
                          {c.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {c.assignedBus}
                      </td>
                      <td className="py-3.5 px-4">${c.wage.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-rose-300">
                        ${c.advance.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-amber-400">
                        ${c.balance.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                          Present
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: CENTRAL HUB SYNC */}
        {activeTab === "sync" && (
          <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div>
              <h2 className="text-lg font-bold text-white">
                Central Admin Hub Synchronizer
              </h2>
              <p className="text-xs text-slate-400">
                Calculates and records `DailyFleetSummary` in MongoDB and
                dispatches to the Central Hub
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Audit Summary
                </h3>
                <div className="space-y-2 text-xs divide-y divide-slate-800">
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Total Route Collections:</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      ${totalCollections.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Fuel Expenses:</span>
                    <span className="font-mono text-rose-400">
                      -${totalFuel.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Tolls & Line Fees:</span>
                    <span className="font-mono text-rose-400">
                      -${totalTolls.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Commissions:</span>
                    <span className="font-mono text-rose-400">
                      -${totalCommissions.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-300">
                    <span>Maintenance & Repairs:</span>
                    <span className="font-mono text-rose-400">
                      -${totalMaintenance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 text-sm font-bold text-white pt-3 border-t-2 border-slate-700">
                    <span>Net Closing Balance:</span>
                    <span className="font-mono text-amber-400">
                      ${netProfit.toFixed(2)}
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
                    ? "Successfully Synced with Central Hub ✓"
                    : "Execute Day Close & Hub Sync"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Outbound JSON Payload (Hub Contract)
                  </h3>
                  <span className="text-[10px] text-amber-400 font-mono">
                    src/types/hub.ts
                  </span>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-[11px] font-mono text-emerald-300 border border-slate-800">
                  {JSON.stringify(
                    {
                      date: new Date().toISOString().split("T")[0],
                      totalCollection: totalCollections.toFixed(2),
                      totalExpenses: totalExpenses.toFixed(2),
                      expenseBreakdown: {
                        fuel: totalFuel.toFixed(2),
                        tollAndLineFees: totalTolls.toFixed(2),
                        crewPay: totalCommissions.toFixed(2),
                        maintenance: totalMaintenance.toFixed(2),
                      },
                      netProfit: netProfit.toFixed(2),
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
    </div>
  );
}

