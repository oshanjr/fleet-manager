"use client";

import { useState } from "react";
import { updateSettingsAction } from "@/app/actions/fleet";
import { Settings } from "@/lib/fleet-calc";

const field =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none";

export default function SettingsModal({
  settings,
  canEdit,
  onClose,
  onSaved,
}: {
  settings: Settings;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [s, setS] = useState(() =>
    Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])) as Record<keyof Settings, string>
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await updateSettingsAction(
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v) || 0])) as Partial<Settings>
    );
    setSaving(false);
    if (!res.success) return setError(res.error);
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-white">⚙️ Fleet Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        {!canEdit && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            View only — only a Fleet Manager can change settings.
          </div>
        )}
        {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Crew Commission (% of daily gross fare)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-300">Driver %<input type="number" step="0.1" min="0" max="50" value={s.driverCommissionPct} onChange={set("driverCommissionPct")} className={field} /></label>
                <label className="text-xs font-semibold text-slate-300">Conductor %<input type="number" step="0.1" min="0" max="50" value={s.conductorCommissionPct} onChange={set("conductorCommissionPct")} className={field} /></label>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Applied to new and edited fare logs. Existing logs keep their saved commission until edited.</p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Default Daily Wage (LKR)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-300">Driver<input type="number" step="50" min="0" value={s.driverBaseWage} onChange={set("driverBaseWage")} className={field} /></label>
                <label className="text-xs font-semibold text-slate-300">Conductor<input type="number" step="50" min="0" value={s.conductorBaseWage} onChange={set("conductorBaseWage")} className={field} /></label>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Budgets & Targets (LKR / month)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-300">Maintenance budget<input type="number" step="1000" min="0" value={s.maintenanceBudget} onChange={set("maintenanceBudget")} className={field} /></label>
                <label className="text-xs font-semibold text-slate-300">Revenue target<input type="number" step="1000" min="0" value={s.monthlyRevenueTarget} onChange={set("monthlyRevenueTarget")} className={field} /></label>
              </div>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700">Close</button>
            {canEdit && (
              <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                {saving ? "Saving..." : "Save Settings"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

