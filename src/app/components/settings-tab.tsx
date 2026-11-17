"use client";

import { useState } from "react";
import { updateSettingsAction } from "@/app/actions/fleet";
import { Settings } from "@/lib/fleet-calc";

const field =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none";

export default function SettingsTab({
  settings,
  canEdit,
  onSaved,
}: {
  settings: Settings;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const [s, setS] = useState(() =>
    Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])) as Record<
      keyof Settings,
      string
    >
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS({ ...s, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedMsg("");
    const res = await updateSettingsAction(
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v) || 0])) as Partial<Settings>
    );
    setSaving(false);
    if (!res.success) return setError(res.error);
    await onSaved();
    setSavedMsg("Settings saved successfully.");
  };

  return (
    <div className="max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">⚙️ Fleet Settings &amp; Budgets</h2>
        <p className="text-xs text-slate-400">
          Configure crew commission percentages, default daily wages, monthly maintenance budget, and revenue targets (LKR).
        </p>
      </div>

      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          View only — only a Fleet Manager can change settings.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          ✓ {savedMsg}
        </div>
      )}

      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={!canEdit} className="space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Crew Commission (% of daily gross fare)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-300">
                Driver %
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={s.driverCommissionPct}
                  onChange={set("driverCommissionPct")}
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-300">
                Conductor %
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={s.conductorCommissionPct}
                  onChange={set("conductorCommissionPct")}
                  className={field}
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              Applied to new and edited fare logs. Existing logs keep their saved commission until edited.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Default Daily Wage (LKR)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-300">
                Driver Base Wage
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={s.driverBaseWage}
                  onChange={set("driverBaseWage")}
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-300">
                Conductor Base Wage
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={s.conductorBaseWage}
                  onChange={set("conductorBaseWage")}
                  className={field}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Budgets &amp; Targets (LKR / month)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-300">
                Monthly Maintenance Budget
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={s.maintenanceBudget}
                  onChange={set("maintenanceBudget")}
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-300">
                Monthly Revenue Target
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={s.monthlyRevenueTarget}
                  onChange={set("monthlyRevenueTarget")}
                  className={field}
                />
              </label>
            </div>
          </div>
        </fieldset>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 shadow-md shadow-amber-500/20"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
