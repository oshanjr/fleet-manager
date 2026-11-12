"use client";

import { useMemo, useState } from "react";
import {
  Bus,
  CrewMember,
  Expense,
  MaintenanceItem,
  RouteLog,
  computePeriodReport,
  downloadCSV,
  formatLKR,
  pct,
  PeriodReport,
} from "@/lib/fleet-calc";
import { addDays, daysBetween, monthRange } from "@/lib/dates";

type ReportKind = "pnl" | "bus" | "crew" | "daily";

const field =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none";

export default function ReportsTab(props: {
  buses: Bus[];
  routeLogs: RouteLog[];
  maintenance: MaintenanceItem[];
  crew: CrewMember[];
  expenses: Expense[];
  todayStr: string;
  revenueTarget: number;
}) {
  const { buses, todayStr } = props;
  const [mode, setMode] = useState<"month" | "range" | "day">("month");
  const [month, setMonth] = useState(todayStr.slice(0, 7));
  const [from, setFrom] = useState(addDays(todayStr, -29));
  const [to, setTo] = useState(todayStr);
  const [day, setDay] = useState(todayStr);
  const [busId, setBusId] = useState("");
  const [kind, setKind] = useState<ReportKind>("pnl");

  const period = useMemo(() => {
    if (mode === "month") return monthRange(month);
    if (mode === "day") return { from: day, to: day };
    return from <= to ? { from, to } : { from: to, to: from };
  }, [mode, month, from, to, day]);

  const prevPeriod = useMemo(() => {
    if (mode === "month") {
      const [y, m] = month.split("-").map(Number);
      return monthRange(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
    }
    const len = daysBetween(period.from, period.to) + 1;
    return { from: addDays(period.from, -len), to: addDays(period.from, -1) };
  }, [mode, month, period]);

  const base = {
    buses,
    routeLogs: props.routeLogs,
    maintenance: props.maintenance,
    crew: props.crew,
    expenses: props.expenses,
    busId: busId || undefined,
  };
  const r = useMemo(() => computePeriodReport({ ...base, ...period }), [period, busId, props]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => computePeriodReport({ ...base, ...prevPeriod }), [prevPeriod, busId, props]); // eslint-disable-line react-hooks/exhaustive-deps

  const busLabel = busId ? buses.find((b) => b.id === busId)?.regNumber ?? "" : "All Buses";
  const periodLabel = period.from === period.to ? period.from : `${period.from} → ${period.to}`;
  const fileTag = `${period.from}_${period.to}${busId ? "_" + busLabel.replace(/\s+/g, "") : ""}`;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="no-print rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Financial Reports</h2>
            <p className="text-xs text-slate-400">Profit & loss, vehicle performance, crew payroll and daily breakdown — printable and exportable</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportReport(kind, r, p, fileTag)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
              ⬇ Export CSV
            </button>
            <button onClick={() => window.print()} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
              🖨 Print / Save PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className={field}>
            <option value="month">Monthly</option>
            <option value="day">Single day</option>
            <option value="range">Custom range</option>
          </select>
          {mode === "month" && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={field} />}
          {mode === "day" && <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={field} />}
          {mode === "range" && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
            </>
          )}
          <select value={busId} onChange={(e) => setBusId(e.target.value)} className={field}>
            <option value="">All buses</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>{b.regNumber}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["pnl", "📑 Profit & Loss"],
              ["bus", "🚍 Vehicle Performance"],
              ["crew", "👥 Crew Payroll"],
              ["daily", "📅 Daily Breakdown"],
            ] as [ReportKind, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${kind === k ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Printable report */}
      <div className="print-area rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-500">FleetFlow Manager</div>
            <h3 className="text-xl font-extrabold text-white">
              {kind === "pnl" && "Profit & Loss Statement"}
              {kind === "bus" && "Vehicle Performance Report"}
              {kind === "crew" && "Crew Payroll Summary"}
              {kind === "daily" && "Daily Operations Breakdown"}
            </h3>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Period: <strong className="text-slate-200">{periodLabel}</strong></div>
            <div>Vehicles: <strong className="text-slate-200">{busLabel}</strong></div>
            <div>Generated: {new Date().toLocaleString("en-LK")}</div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Gross Revenue" value={formatLKR(r.revenue)} delta={delta(r.revenue, p.revenue)} good="up" />
          <Kpi label="Total Expenses" value={formatLKR(r.totalExpenses)} delta={delta(r.totalExpenses, p.totalExpenses)} good="down" />
          <Kpi label="Net Profit" value={formatLKR(r.net)} delta={delta(r.net, p.net)} good="up" accent={r.net >= 0 ? "text-emerald-400" : "text-rose-400"} />
          <Kpi label="Profit Margin" value={`${r.margin.toFixed(1)}%`} sub={`${r.operatingDays} operating day(s)`} />
        </div>

        {kind === "pnl" && <PnL r={r} p={p} revenueTarget={mode === "month" && !busId ? props.revenueTarget : 0} />}
        {kind === "bus" && <BusTable r={r} />}
        {kind === "crew" && <CrewTable r={r} />}
        {kind === "daily" && <DailyTable r={r} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function delta(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function Kpi({ label, value, delta, good, sub, accent }: { label: string; value: string; delta?: number | null; good?: "up" | "down"; sub?: string; accent?: string }) {
  const positive = delta != null && (good === "up" ? delta >= 0 : delta <= 0);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-extrabold ${accent || "text-white"}`}>{value}</div>
      {delta != null ? (
        <div className={`text-[11px] ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs previous period
        </div>
      ) : (
        <div className="text-[11px] text-slate-500">{sub || "No previous data"}</div>
      )}
    </div>
  );
}

function Row({ label, cur, prev, bold, neg, indent }: { label: string; cur: number; prev?: number; bold?: boolean; neg?: boolean; indent?: boolean }) {
  const d = prev !== undefined ? delta(cur, prev) : null;
  return (
    <tr className={bold ? "font-bold text-white" : "text-slate-300"}>
      <td className={`py-1.5 ${indent ? "pl-6" : ""}`}>{label}</td>
      <td className={`py-1.5 text-right font-mono ${neg ? "text-rose-300" : ""}`}>{neg && cur ? `(${formatLKR(cur)})` : formatLKR(cur)}</td>
      <td className="py-1.5 text-right font-mono text-slate-500">{prev !== undefined ? formatLKR(prev) : ""}</td>
      <td className="py-1.5 text-right text-[11px] text-slate-500 w-20">{d != null ? `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` : ""}</td>
    </tr>
  );
}

function PnL({ r, p, revenueTarget }: { r: PeriodReport; p: PeriodReport; revenueTarget: number }) {
  const cats = Array.from(new Set([...r.expensesByCategory.map((c) => c.category), ...p.expensesByCategory.map((c) => c.category)]));
  const catAmt = (rep: PeriodReport, c: string) => rep.expensesByCategory.find((x) => x.category === c)?.amount ?? 0;
  const tripCrew = r.commission + r.crewWages;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2 text-left">Item</th>
              <th className="py-2 text-right">This Period</th>
              <th className="py-2 text-right">Previous</th>
              <th className="py-2 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={4} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400">Income</td></tr>
            <Row label="Morning fare collections" cur={r.morning} prev={p.morning} indent />
            <Row label="Evening fare collections" cur={r.evening} prev={p.evening} indent />
            <Row label="Gross Revenue" cur={r.revenue} prev={p.revenue} bold />

            <tr><td colSpan={4} className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-rose-400">Direct Operating Costs</td></tr>
            <Row label="Diesel / fuel" cur={r.fuel} prev={p.fuel} neg indent />
            <Row label="Tolls & line fees" cur={r.tolls} prev={p.tolls} neg indent />
            <Row label="Other trip expenses" cur={r.tripOther} prev={p.tripOther} neg indent />

            <tr><td colSpan={4} className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-purple-400">Crew Costs</td></tr>
            <Row label="Driver commission" cur={r.driverCommission} prev={p.driverCommission} neg indent />
            <Row label="Conductor commission" cur={r.conductorCommission} prev={p.conductorCommission} neg indent />
            <Row label="Daily wages (attendance)" cur={r.crewWages} prev={p.crewWages} neg indent />

            <tr><td colSpan={4} className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-amber-400">Maintenance & Overheads</td></tr>
            <Row label="Workshop maintenance & repairs" cur={r.maintenance} prev={p.maintenance} neg indent />
            {cats.map((c) => (
              <Row key={c} label={c} cur={catAmt(r, c)} prev={catAmt(p, c)} neg indent />
            ))}

            <tr className="border-t border-slate-700"><td colSpan={4} /></tr>
            <Row label="Total Expenses" cur={r.totalExpenses} prev={p.totalExpenses} bold />
            <tr className="border-t-2 border-slate-600 text-sm font-extrabold">
              <td className="py-2">NET PROFIT / (LOSS)</td>
              <td className={`py-2 text-right font-mono ${r.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatLKR(r.net)}</td>
              <td className="py-2 text-right font-mono text-slate-500">{formatLKR(p.net)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
          <h4 className="text-sm font-bold text-white">Key Ratios</h4>
          <Ratio label="Fuel cost / revenue" v={`${pct(r.fuel, r.revenue).toFixed(1)}%`} />
          <Ratio label="Crew cost / revenue" v={`${pct(tripCrew, r.revenue).toFixed(1)}%`} />
          <Ratio label="Maintenance / revenue" v={`${pct(r.maintenance, r.revenue).toFixed(1)}%`} />
          <Ratio label="Avg revenue / operating day" v={formatLKR(r.avgDailyRevenue)} />
          <Ratio label="Avg net / operating day" v={formatLKR(r.avgDailyNet)} />
          <Ratio label="Total km run" v={r.km ? r.km.toLocaleString("en-LK") + " km" : "—"} />
          <Ratio label="Fuel consumed" v={r.liters ? r.liters.toLocaleString("en-LK") + " L" : "—"} />
          <Ratio label="Fuel efficiency" v={r.kmPerLiter ? r.kmPerLiter.toFixed(2) + " km/L" : "—"} />
          <Ratio label="Cost per km" v={r.costPerKm ? formatLKR(r.costPerKm) : "—"} />
          <Ratio label="Avg diesel price" v={r.liters ? formatLKR(r.fuel / r.liters) + " /L" : "—"} />
        </div>

        {revenueTarget > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
            <h4 className="text-sm font-bold text-white">Monthly Revenue Target</h4>
            <div className="flex justify-between text-slate-400">
              <span>{formatLKR(r.revenue)}</span>
              <span>of {formatLKR(revenueTarget)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, pct(r.revenue, revenueTarget))}%` }} />
            </div>
            <div className="text-slate-300">{pct(r.revenue, revenueTarget).toFixed(1)}% achieved</div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
          <h4 className="text-sm font-bold text-white">Crew Liabilities</h4>
          <Ratio label="Wages earned" v={formatLKR(r.crewWages)} />
          <Ratio label="Advances paid" v={formatLKR(r.crewAdvances)} />
          <Ratio label="Balance still owed" v={formatLKR(r.crewBalance)} />
        </div>
      </div>
    </div>
  );
}

function Ratio({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-800/60 pb-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-200">{v}</span>
    </div>
  );
}

const th = "py-2.5 px-3 text-right";
function BusTable({ r }: { r: PeriodReport }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
          <tr>
            <th className="py-2.5 px-3 text-left">Bus</th>
            <th className={th}>Days</th>
            <th className={th}>Revenue</th>
            <th className={th}>Avg/Day</th>
            <th className={th}>Fuel</th>
            <th className={th}>Km</th>
            <th className={th}>km/L</th>
            <th className={th}>Crew</th>
            <th className={th}>Maint.</th>
            <th className={th}>Other</th>
            <th className={th}>Total Cost</th>
            <th className={th}>Cost/km</th>
            <th className={th}>Net</th>
            <th className={th}>Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {r.perBus.map((b) => (
            <tr key={b.busId}>
              <td className="py-2.5 px-3">
                <div className="font-mono font-bold text-amber-400">{b.busReg}</div>
                <div className="text-[10px] text-slate-500">{b.route}</div>
              </td>
              <td className={th}>{b.days}</td>
              <td className={th + " text-emerald-400"}>{formatLKR(b.revenue)}</td>
              <td className={th}>{formatLKR(b.avgDailyRevenue)}</td>
              <td className={th}>{formatLKR(b.fuel)}</td>
              <td className={th}>{b.km ? b.km.toLocaleString("en-LK") : "—"}</td>
              <td className={th}>{b.kmPerLiter ? b.kmPerLiter.toFixed(2) : "—"}</td>
              <td className={th}>{formatLKR(b.commission + b.crewWages)}</td>
              <td className={th}>{formatLKR(b.maintenance)}</td>
              <td className={th}>{formatLKR(b.tolls + b.other + b.fixedExpenses)}</td>
              <td className={th + " text-rose-300"}>{formatLKR(b.totalCost)}</td>
              <td className={th}>{b.costPerKm ? formatLKR(b.costPerKm) : "—"}</td>
              <td className={th + ` font-bold ${b.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatLKR(b.net)}</td>
              <td className={th}>{b.revenue ? b.margin.toFixed(1) + "%" : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-700 font-bold text-white">
          <tr>
            <td className="py-2.5 px-3">Fleet Total</td>
            <td className={th}>{r.perBus.reduce((s, b) => s + b.days, 0)}</td>
            <td className={th}>{formatLKR(r.revenue)}</td>
            <td className={th}>{formatLKR(r.avgDailyRevenue)}</td>
            <td className={th}>{formatLKR(r.fuel)}</td>
            <td className={th}>{r.km ? r.km.toLocaleString("en-LK") : "—"}</td>
            <td className={th}>{r.kmPerLiter ? r.kmPerLiter.toFixed(2) : "—"}</td>
            <td className={th}>{formatLKR(r.commission + r.crewWages)}</td>
            <td className={th}>{formatLKR(r.maintenance)}</td>
            <td className={th}>{formatLKR(r.tolls + r.tripOther + r.generalExpenses)}</td>
            <td className={th}>{formatLKR(r.totalExpenses)}</td>
            <td className={th}>{r.costPerKm ? formatLKR(r.costPerKm) : "—"}</td>
            <td className={th}>{formatLKR(r.net)}</td>
            <td className={th}>{r.margin.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
      <p className="p-3 text-[10px] text-slate-500">
        Fleet total includes general expenses not linked to a specific bus. Km and km/L appear once km run and fuel litres are entered in daily fare logs.
      </p>
    </div>
  );
}

function CrewTable({ r }: { r: PeriodReport }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
          <tr>
            <th className="py-2.5 px-3 text-left">Employee</th>
            <th className="py-2.5 px-3 text-left">Role</th>
            <th className="py-2.5 px-3 text-left">Bus(es)</th>
            <th className={th}>Days Worked</th>
            <th className={th}>Wages Earned</th>
            <th className={th}>Commission</th>
            <th className={th}>Gross Pay</th>
            <th className={th}>Advances</th>
            <th className={th}>Net Payable</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {r.crew.length === 0 && (
            <tr><td colSpan={9} className="py-6 text-center text-slate-500">No attendance records in this period.</td></tr>
          )}
          {r.crew.map((c) => (
            <tr key={c.name + c.role}>
              <td className="py-2.5 px-3 font-semibold text-white">{c.name}</td>
              <td className="py-2.5 px-3">{c.role === "DRIVER" ? "Driver" : "Conductor"}</td>
              <td className="py-2.5 px-3 font-mono text-slate-400">{c.buses}</td>
              <td className={th}>{c.days}</td>
              <td className={th}>{formatLKR(c.wages)}</td>
              <td className={th}>{formatLKR(c.commission)}</td>
              <td className={th}>{formatLKR(c.wages + c.commission)}</td>
              <td className={th + " text-rose-300"}>{formatLKR(c.advances)}</td>
              <td className={th + " font-bold text-amber-400"}>{formatLKR(c.wages + c.commission - c.advances)}</td>
            </tr>
          ))}
        </tbody>
        {r.crew.length > 0 && (
          <tfoot className="border-t-2 border-slate-700 font-bold text-white">
            <tr>
              <td className="py-2.5 px-3" colSpan={3}>Total</td>
              <td className={th}>{r.crew.reduce((s, c) => s + c.days, 0)}</td>
              <td className={th}>{formatLKR(r.crew.reduce((s, c) => s + c.wages, 0))}</td>
              <td className={th}>{formatLKR(r.crew.reduce((s, c) => s + c.commission, 0))}</td>
              <td className={th}>{formatLKR(r.crew.reduce((s, c) => s + c.wages + c.commission, 0))}</td>
              <td className={th}>{formatLKR(r.crew.reduce((s, c) => s + c.advances, 0))}</td>
              <td className={th}>{formatLKR(r.crew.reduce((s, c) => s + c.wages + c.commission - c.advances, 0))}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <p className="p-3 text-[10px] text-slate-500">
        Commission is attributed to the driver/conductor marked on the same bus and date as a fare log. Unattributed commission (no crew marked) remains in the P&L only.
      </p>
    </div>
  );
}

function DailyTable({ r }: { r: PeriodReport }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
          <tr>
            <th className="py-2.5 px-3 text-left">Date</th>
            <th className={th}>Buses</th>
            <th className={th}>Revenue</th>
            <th className={th}>Fuel</th>
            <th className={th}>Tolls</th>
            <th className={th}>Commission</th>
            <th className={th}>Wages</th>
            <th className={th}>Maint.</th>
            <th className={th}>Other</th>
            <th className={th}>Expenses</th>
            <th className={th}>Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {r.daily.length === 0 && (
            <tr><td colSpan={11} className="py-6 text-center text-slate-500">No records in this period.</td></tr>
          )}
          {r.daily.map((d) => (
            <tr key={d.date}>
              <td className="py-2.5 px-3 font-mono text-slate-300">{d.date}</td>
              <td className={th}>{d.busesRun}</td>
              <td className={th + " text-emerald-400"}>{formatLKR(d.revenue)}</td>
              <td className={th}>{formatLKR(d.fuel)}</td>
              <td className={th}>{formatLKR(d.tolls)}</td>
              <td className={th}>{formatLKR(d.commission)}</td>
              <td className={th}>{formatLKR(d.crewWages)}</td>
              <td className={th}>{formatLKR(d.maintenance)}</td>
              <td className={th}>{formatLKR(d.other)}</td>
              <td className={th + " text-rose-300"}>{formatLKR(d.expenses)}</td>
              <td className={th + ` font-bold ${d.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatLKR(d.net)}</td>
            </tr>
          ))}
        </tbody>
        {r.daily.length > 0 && (
          <tfoot className="border-t-2 border-slate-700 font-bold text-white">
            <tr>
              <td className="py-2.5 px-3">Total</td>
              <td className={th}>{r.daily.reduce((s, d) => s + d.busesRun, 0)}</td>
              <td className={th}>{formatLKR(r.revenue)}</td>
              <td className={th}>{formatLKR(r.fuel)}</td>
              <td className={th}>{formatLKR(r.tolls)}</td>
              <td className={th}>{formatLKR(r.commission)}</td>
              <td className={th}>{formatLKR(r.crewWages)}</td>
              <td className={th}>{formatLKR(r.maintenance)}</td>
              <td className={th}>{formatLKR(r.tripOther + r.generalExpenses)}</td>
              <td className={th}>{formatLKR(r.totalExpenses)}</td>
              <td className={th}>{formatLKR(r.net)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
function exportReport(kind: ReportKind, r: PeriodReport, p: PeriodReport, tag: string) {
  if (kind === "pnl") {
    const rows: (string | number)[][] = [
      ["Item", "This Period (LKR)", "Previous Period (LKR)"],
      ["Morning collections", r.morning, p.morning],
      ["Evening collections", r.evening, p.evening],
      ["GROSS REVENUE", r.revenue, p.revenue],
      ["Fuel", r.fuel, p.fuel],
      ["Tolls & line fees", r.tolls, p.tolls],
      ["Other trip expenses", r.tripOther, p.tripOther],
      ["Driver commission", r.driverCommission, p.driverCommission],
      ["Conductor commission", r.conductorCommission, p.conductorCommission],
      ["Crew daily wages", r.crewWages, p.crewWages],
      ["Maintenance & repairs", r.maintenance, p.maintenance],
      ...r.expensesByCategory.map((c) => [c.category, c.amount, p.expensesByCategory.find((x) => x.category === c.category)?.amount ?? 0]),
      ["TOTAL EXPENSES", r.totalExpenses, p.totalExpenses],
      ["NET PROFIT", r.net, p.net],
      ["Profit margin %", r.margin, p.margin],
      ["Km run", r.km, p.km],
      ["Fuel litres", r.liters, p.liters],
      ["km per litre", r.kmPerLiter, p.kmPerLiter],
    ];
    return downloadCSV(`profit-loss_${tag}.csv`, rows);
  }
  if (kind === "bus") {
    return downloadCSV(`vehicle-performance_${tag}.csv`, [
      ["Bus", "Route", "Days", "Revenue", "Fuel", "Litres", "Km", "km/L", "Tolls", "Commission", "Crew Wages", "Maintenance", "Other Trip", "Bus Expenses", "Total Cost", "Cost/km", "Net", "Margin %"],
      ...r.perBus.map((b) => [b.busReg, b.route, b.days, b.revenue, b.fuel, b.liters, b.km, b.kmPerLiter, b.tolls, b.commission, b.crewWages, b.maintenance, b.other, b.fixedExpenses, b.totalCost, b.costPerKm, b.net, b.margin]),
    ]);
  }
  if (kind === "crew") {
    return downloadCSV(`crew-payroll_${tag}.csv`, [
      ["Employee", "Role", "Buses", "Days", "Wages", "Commission", "Gross Pay", "Advances", "Net Payable"],
      ...r.crew.map((c) => [c.name, c.role, c.buses, c.days, c.wages, c.commission, c.wages + c.commission, c.advances, c.wages + c.commission - c.advances]),
    ]);
  }
  return downloadCSV(`daily-breakdown_${tag}.csv`, [
    ["Date", "Buses Run", "Revenue", "Fuel", "Tolls", "Commission", "Wages", "Maintenance", "Other", "Total Expenses", "Net"],
    ...r.daily.map((d) => [d.date, d.busesRun, d.revenue, d.fuel, d.tolls, d.commission, d.crewWages, d.maintenance, d.other, d.expenses, d.net]),
  ]);
}

