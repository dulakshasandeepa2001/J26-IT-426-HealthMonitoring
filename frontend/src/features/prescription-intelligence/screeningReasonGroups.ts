import type { ScreeningCandidate, ScreeningResult } from "./clinicalScreeningApi";

type Check = ScreeningCandidate["checks"][number];
export const reasonKey = (check: Check) => JSON.stringify([check.category, check.status, check.message, check.trace?.inputs]);
export const blocksAvailability = (check: Check) => check.blocks_availability ?? (["blocked", "cannot_validate"].includes(check.status)
  || check.status === "warning" && !["coverage", "topical_precaution", "guideline"].includes(check.category));

export function historyActionGroups(result: ScreeningResult) {
  const groups = { unresolved: [] as string[], duplicate: [] as string[], allergy: [] as string[], interaction: [] as string[] };
  for (const candidate of result.candidates) {
    for (const check of candidate.checks.filter(blocksAvailability)) {
      if (!["allergy", "duplicate_ingredient", "interaction"].includes(check.category)) continue;
      let group: keyof typeof groups = "unresolved";
      if (check.category === "duplicate_ingredient" && check.status === "blocked") group = "duplicate";
      else if (check.category === "allergy" && check.status === "blocked") group = "allergy";
      else if (check.category === "interaction") {
        const rows = check.trace?.inputs.normalized_current_medicines;
        if (check.status === "blocked" || Array.isArray(rows) && rows.length > 0
          && rows.every((row) => row?.status === "recognized") && check.trace?.inputs["context.medicine_status"] === "confirmed") group = "interaction";
      }
      if (!groups[group].includes(candidate.generic_name)) groups[group].push(candidate.generic_name);
    }
  }
  return groups;
}

export function sharedAssessmentReasons(result: ScreeningResult) {
  const groups = new Map<string, { key: string; check: Check; candidates: string[] }>();
  for (const candidate of result.candidates) {
    for (const check of candidate.checks) {
      // Dose, guideline, duplicate, reviews and product coverage stay local.
      const sharedCategory = ["clinical_scope", "red_flags", "special_population", "age", "age_scope", "allergy", "interaction"].includes(check.category)
        || check.category.startsWith("condition_scope:");
      if (!sharedCategory || !blocksAvailability(check)) continue;
      const key = reasonKey(check), group = groups.get(key) ?? { key, check, candidates: [] };
      if (!group.candidates.includes(candidate.generic_name)) group.candidates.push(candidate.generic_name);
      groups.set(key, group);
    }
  }
  return [...groups.values()].filter((group) => group.candidates.length > 1);
}
