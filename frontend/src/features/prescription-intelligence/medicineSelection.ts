import type { ScreeningCandidate } from "./clinicalScreeningApi";

// Selection convenience only, not an interaction clearance or an ML prediction.
// Ambiguous alternatives require the doctor's explicit individual choice.
export function compatibleSelection(candidates: ScreeningCandidate[], selected: string[]) {
  const groups = new Map<string, ScreeningCandidate[]>();
  for (const row of candidates) {
    if (row.status !== "candidate_for_clinician_review" || !row.regimen) continue;
    const key = JSON.stringify([row.purpose, row.clinical_role]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const choices: ScreeningCandidate[] = [];
  for (const rows of groups.values()) {
    const explicit = rows.filter((row) => selected.includes(row.medicine_id));
    if (rows.length === 1) choices.push(rows[0]);
    else if (explicit.length === 1) choices.push(explicit[0]);
  }
  const ingredients = (row: ScreeningCandidate) => row.product?.ingredients?.map((item) => item.name.trim().toLowerCase()) ?? [];
  const safeToSelect = choices.filter((row) => {
    const present = ingredients(row);
    return present.length > 0 && !choices.some((other) => other.medicine_id !== row.medicine_id && ingredients(other).some((name) => present.includes(name)));
  });
  return { ids: [...new Set(safeToSelect.map((row) => row.medicine_id))], needsIndividualChoice: safeToSelect.length !== groups.size };
}
