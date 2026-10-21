"use client";

import type { CurrentMedicinePlan } from "./prescriptionApi";
import { controlStyle } from "./PageFrame";

export function CurrentMedicinePlans({ rows, disabled, onChange }: {
  rows: CurrentMedicinePlan[]; disabled: boolean; onChange: (rows: CurrentMedicinePlan[]) => void;
}) {
  if (!rows.length) return null;
  function update(index: number, patch: Partial<CurrentMedicinePlan>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  return <fieldset disabled={disabled} className="space-y-3 rounded-2xl border border-slate-200 p-4 text-xs">
    <legend className="px-1 font-bold">Proposed current-medicine actions</legend>
    <p>Record your proposed management separately from the active medicine history. These notes are not an approved prescription and do not remove duplicate or interaction blocks. A proposed stop does not establish that exposure has ended.</p>
    {rows.map((row, index) => <div key={row.recorded_text} className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="font-semibold">{row.recorded_text}</p>
      <label className="block space-y-1">Proposed action for “{row.recorded_text}”
        <select aria-label={`Proposed action for “${row.recorded_text}”`} className={controlStyle} value={row.action} onChange={(event) => update(index, { action: event.target.value as CurrentMedicinePlan["action"] })}>
          <option value="undecided">Not decided</option><option value="continue">Propose continuing existing medicine</option>
          <option value="change">Propose a change — separate review required</option><option value="stop">Propose stopping — separate review required</option>
        </select>
      </label>
      <label className="block space-y-1">Reason / review needs for “{row.recorded_text}”
        <textarea aria-label={`Reason / review needs for “${row.recorded_text}”`} className={controlStyle} rows={2} maxLength={1000} value={row.note} onChange={(event) => update(index, { note: event.target.value })} />
      </label>
      {row.action !== "undecided" && row.note.trim().length < 10 && <p className="text-amber-900">Add at least 10 characters explaining your proposed action.</p>}
      <p>Saved with Save patient information below. No change to active treatment is applied here.</p>
    </div>)}
  </fieldset>;
}
