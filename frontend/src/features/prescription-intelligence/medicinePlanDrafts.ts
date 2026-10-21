import type { CurrentMedicinePlan, CurrentMedicinePlanRecord } from "./prescriptionApi";

export function prepareMedicinePlans(medicines: string[], visit: string, saved?: CurrentMedicinePlanRecord): CurrentMedicinePlan[] {
  const reusable = saved?.version === "current-medicine-proposals-v1" && saved.consultation_id === visit
    && saved.status === "proposed_only" && saved.changes_active_history === false && saved.reviewed_by && saved.reviewed_at;
  return medicines.map((recorded_text) => {
    const matches = reusable ? saved.details.filter((row) => row.recorded_text === recorded_text) : [];
    return matches.length === 1 ? { ...matches[0] } : { recorded_text, action: "undecided", note: "" };
  });
}

export function medicinePlansValid(rows: CurrentMedicinePlan[]) {
  return rows.every((row) => row.action === "undecided" || row.note.trim().length >= 10);
}
