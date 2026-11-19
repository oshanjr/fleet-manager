"use client";

import { useMemo, useState } from "react";
import { addExpenseAction, updateExpenseAction, deleteExpenseAction } from "@/app/actions/fleet";
import { Bus, Expense, EXPENSE_CATEGORIES, formatLKR, downloadCSV, pct } from "@/lib/fleet-calc";

const input =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none";

export default function ExpensesTab({
  expenses,
  buses,
  todayStr,
  onChanged,
}: {
  expenses: Expense[];
  buses: Bus[];
  todayStr: string;
  onChanged: () => Promise<void>;
}) {
  const [month, setMonth] = useState(todayStr.slice(0, 7));
  const [category, setCategory] = useState("");
  const [busFilter, setBusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ date: todayStr, category: EXPENSE_CATEGORIES[0] as string, description: "", amount: "", paidTo: "", busId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (!month || e.date.startsWith(month)) &&
          (!category || e.category === category) &&
          (!busFilter || (busFilter === "__general" ? !e.busId : e.busId === busFilter)) &&
          (!search ||
            `${e.description} ${e.paidTo} ${e.busReg}`.toLowerCase().includes(search.toLowerCase()))
      ),
    [expenses, month, category, busFilter, search]
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const prevMonthTotal = useMemo(() => {
    if (!month) return 0;
    const [y, m] = month.split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    return expenses.filter((e) => e.date.startsWith(prev)).reduce((s, e) => s + e.amount, 0);
  }, [expenses, month]);

  const openAdd = () => {
    setEditing(null);
    setForm({ date: todayStr, category: EXPENSE_CATEGORIES[0], description: "", amount: "", paidTo: "", busId: "" });
    setError("");
    setOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ date: e.date, category: e.category, description: e.description, amount: String(e.amount), paidTo: e.paidTo, busId: e.busId || "" });
    setError("");
    setOpen(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setError("");
    const payload = { ...form, amount: Number(form.amount) };
    const res = editing ? await updateExpenseAction(editing.id, payload) : await addExpenseAction(payload);
    setSaving(false);
    if (!res.success) return setError(res.error);
    await onChanged();
    setOpen(false);
  };

  const remove = async (e: Expense) => {
    if (!confirm(`Delete expense "${e.description}" (${formatLKR(e.amount)})?`)) return;
    const res = await deleteExpenseAction(e.id);
    if (!res.success) return alert(res.error);
    await onChanged();
  };

  const exportCSV = () =>
    downloadCSV(`fleet-expenses-${month || "all"}.csv`, [
      ["Date", "Category", "Description", "Bus", "Paid To", "Amount (LKR)"],
      ...filtered.map((e) => [e.date, e.category, e.description, e.busReg || "General", e.paidTo, e.amount]),
      ["", "", "", "", "TOTAL", total],
    ]);

  const change = prevMonthTotal > 0 ? ((total - prevMonthTotal) / prevMonthTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div>
          <h2 className="text-lg font-bold text-white">Other Expenses</h2>
          <p className="text-xs text-slate-400">
            Insurance, yearly licence, permits, lease payments, tyres, rent and other costs not in daily cash entries
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
            ⬇ CSV
          </button>
          <button onClick={openAdd} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20">
            + Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Total ({month || "All time"})</div>
          <div className="mt-2 text-2xl font-extrabold text-rose-400">{formatLKR(total)}</div>
          <div className="mt-1 text-xs text-slate-400">{filtered.length} entries</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">vs Previous Month</div>
          <div className={`mt-2 text-2xl font-extrabold ${change > 0 ? "text-rose-400" : "text-emerald-400"}`}>
            {month && prevMonthTotal > 0 ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-400">Previous: {formatLKR(prevMonthTotal)}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Largest Category</div>
          <div className="mt-2 text-lg font-extrabold text-amber-400">{byCat[0]?.[0] || "—"}</div>
          <div className="mt-1 text-xs text-slate-400">{byCat[0] ? formatLKR(byCat[0][1]) : "No expenses"}</div>
        </div>
      </div>

      <div className={open ? "grid grid-cols-1 xl:grid-cols-[1fr_390px] gap-6 items-start" : ""}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">By Category</h3>
          {byCat.length === 0 && <p className="text-xs text-slate-500">No expenses for this filter.</p>}
          {byCat.map(([cat, amt]) => (
            <div key={cat} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">{cat}</span>
                <span className="font-mono text-slate-200">
                  {formatLKR(amt)} <span className="text-slate-500">({pct(amt, total).toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct(amt, total)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={input + " mt-0"} title="Month (clear for all)" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={input + " mt-0"}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={busFilter} onChange={(e) => setBusFilter(e.target.value)} className={input + " mt-0"}>
              <option value="">All buses</option>
              <option value="__general">General (no bus)</option>
              {buses.map((b) => (
                <option key={b.id} value={b.id}>{b.regNumber}</option>
              ))}
            </select>
            <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className={input + " mt-0"} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Bus</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">No expenses recorded.</td>
                  </tr>
                )}
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-mono text-slate-400">{e.date}</td>
                    <td className="py-3 px-3"><span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold">{e.category}</span></td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{e.description}</div>
                      {e.paidTo && <div className="text-[10px] text-slate-500">Paid to: {e.paidTo}</div>}
                    </td>
                    <td className="py-3 px-3 font-mono text-amber-400">{e.busReg || <span className="text-slate-500">General</span>}</td>
                    <td className="py-3 px-3 text-right font-bold text-rose-400">{formatLKR(e.amount)}</td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(e)} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-slate-700 mr-1.5">✏️ Edit</button>
                      <button onClick={() => remove(e)} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20">🗑️ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        {open && (
          <div className="order-first xl:order-last rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-xl space-y-4 xl:sticky xl:top-20">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">{editing ? "Edit Expense" : "Add Operating Expense"}</h3>
              <button onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white">✕ Close</button>
            </div>
            {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Date</label>
                  <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Amount (LKR)</label>
                  <input type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300">Description</label>
                <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} placeholder="e.g. Annual comprehensive insurance renewal" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Bus (optional)</label>
                  <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })} className={input}>
                    <option value="">General / whole fleet</option>
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>{b.regNumber}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Paid To (optional)</label>
                  <input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} className={input} placeholder="e.g. Sri Lanka Insurance" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

