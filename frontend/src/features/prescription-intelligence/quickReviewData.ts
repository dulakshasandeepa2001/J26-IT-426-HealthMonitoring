import type { HandoffCondition } from "./analysisData";
import type { ClinicalAssessment, ScreeningInputs } from "./clinicalScreeningApi";
import type { ConditionScope } from "./medicineApi";
import type { SafetyProfile } from "./draftApi";
import { conditionConcerns, conditionSymptoms, emptyAssessment, type AssessmentSelect } from "./clinicalAssessmentFields";

export type SymptomPresence = Record<string, boolean | null>;
export type Guideline = ClinicalAssessment["influenza_guideline"];
export interface QuickRequirements { fields: Set<keyof ClinicalAssessment>; concerns: Set<string>; targets: Set<string>; activeCandidates: number; coverageKnown: boolean }
export function knownNumber(value: unknown, minimum = 0, maximum = 8760): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) return null;
  return String(value);
}
export function sourcePresence(inputs: ScreeningInputs, condition: HandoffCondition): SymptomPresence {
  return Object.fromEntries(conditionSymptoms[condition].map((name) => {
    const rows = inputs.source_observations.symptoms.filter((row) => row.code === name);
    return [name, rows.length === 1 && typeof rows[0].present === "boolean" ? rows[0].present : null];
  }));
}
export function prefillReported(inputs: ScreeningInputs, condition: HandoffCondition, guideline: Guideline = "unselected"): ClinicalAssessment {
  // Only explicit typed source facts are proposed. No clinical clearance or review
  // flag is inferred. Symptom duration is never substituted for antiviral onset.
  const clinical = emptyAssessment(), source = inputs.source_observations, facts = source.assessments;
  const presence = sourcePresence(inputs, condition);
  clinical.verified_symptoms = conditionSymptoms[condition].filter((name) => presence[name] === true);
  clinical.symptom_durations = Object.fromEntries(clinical.verified_symptoms.map((name) => {
    const row = source.symptoms.find((symptom) => symptom.code === name)!;
    return [name, row.duration_hours != null ? knownNumber(row.duration_hours) : row.duration_days != null ? knownNumber(row.duration_days * 24) : null];
  }));
  if (["mild", "moderate", "severe"].includes(source.severity)) clinical.condition_severity = source.severity as ClinicalAssessment["condition_severity"];
  if (source.red_flags.length) clinical.red_flags = "present";
  else if (inputs.source_red_flag_assessment === "assessed") clinical.red_flags = "none";
  for (const name of conditionConcerns[condition]) if (typeof facts[name] === "boolean") clinical.condition_assessments[name] = facts[name] as boolean;
  if (["influenza", "chickenpox"].includes(condition)) clinical.onset_hours = knownNumber(facts.reported_onset_hours);
  if (inputs.patient_age_years != null && inputs.patient_age_years < 18 && typeof facts.weight_recorded_at === "string"
    && Number.isFinite(Date.parse(facts.weight_recorded_at)) && Date.parse(facts.weight_recorded_at) <= Date.now()) {
    clinical.weight_kg = knownNumber(facts.reported_weight_kg, 0.1, 350);
  }
  if (condition === "viral_gastroenteritis") {
    if (["none", "mild", "moderate", "severe"].includes(String(facts.dehydration_assessment))) clinical.dehydration_assessment = facts.dehydration_assessment as ClinicalAssessment["dehydration_assessment"];
    if (["tolerated", "not_tolerated"].includes(String(facts.oral_fluid_tolerance))) clinical.oral_fluid_tolerance = facts.oral_fluid_tolerance as ClinicalAssessment["oral_fluid_tolerance"];
  }
  if (condition === "influenza") clinical.influenza_guideline = guideline;
  return clinical;
}

export function quickRequirements(condition: HandoffCondition, profiles: SafetyProfile[], scopes: ConditionScope[], age: number | null, coverageKnown = true): QuickRequirements {
  const fields = new Set<keyof ClinicalAssessment>(), concerns = new Set<string>(), targets = new Set<string>();
  const policies = profiles.filter((row) => row.conditions.includes(condition) && row.review_is_current && row.catalogue_review_current)
    .map((row) => ({ handler: row.content.kind, targets: Array.isArray(row.content.parameters.relevant_symptoms) ? row.content.parameters.relevant_symptoms as string[] : [], concerns: [] as string[] }));
  for (const row of scopes.filter((scope) => scope.condition === condition && scope.content.product && scope.content_review.is_current && scope.safety_review.is_current
    && !["catalogue_only", "unresolved_ors"].includes(scope.rules.policy.handler))) {
    // The shared pilot product must retain its own genuine review as well.
    const base = profiles.find((profile) => profile.medicine === row.medicine_id);
    if (base && (!base.review_is_current || !base.catalogue_review_current)) continue;
    policies.push({ handler: row.rules.policy.handler, targets: row.rules.policy.target_symptoms, concerns: row.rules.policy.concern_fields });
  }
  for (const policy of policies) {
    for (const name of ["care_setting", "condition_severity", "red_flags", "special_population"] as const) fields.add(name);
    policy.targets.forEach((name) => targets.add(name));
    if (!["influenza", "chickenpox"].includes(condition)) conditionConcerns[condition].forEach((name) => concerns.add(name));
    policy.concerns.forEach((name) => concerns.add(name));
    if (policy.handler === "paracetamol") fields.add("hepatic_assessment");
    if (["oseltamivir", "acyclovir"].includes(policy.handler)) { fields.add("renal_assessment"); fields.add("onset_hours"); }
    if (policy.handler === "oseltamivir") { fields.add("laiv_timing"); fields.add("influenza_guideline"); }
    if (policy.handler === "acyclovir") fields.add("varicella_risk");
    if (policy.handler === "calamine") fields.add("topical_assessment");
    if (["ophthalmic_lubricant", "hypromellose"].includes(policy.handler)) { fields.add("ophthalmic_integrity"); fields.add("excipient_assessment"); }
    if (policy.handler === "ibuprofen") for (const name of ["renal_assessment", "hepatic_assessment", "nsaid_assessment", "gi_bleeding_assessment", "cardiovascular_assessment", "excipient_assessment"] as const) fields.add(name);
    if (["paracetamol", "oseltamivir", "acyclovir"].includes(policy.handler) && (age == null || age < 18)) fields.add("weight_kg");
  }
  return { fields, concerns, targets, activeCandidates: policies.length, coverageKnown };
}
export function missingValue(value: unknown): boolean { return value == null || value === "unknown" || value === "unselected"; }
export function selectLabel(field: AssessmentSelect, value: unknown): string { return field.options.find(([option]) => option === value)?.[1] ?? "Unknown / not assessed"; }

export function guidelineStorageKey(doctor: number, version: string): string { return `meditrack_guideline_preference_v1:${doctor}:${version}`; }
export function readGuideline(doctor: number, version: string): Guideline {
  if (!version) return "unselected";
  try { const value = localStorage.getItem(guidelineStorageKey(doctor, version)); return value === "CDC_2026" || value === "WHO_2024" ? value : "unselected"; }
  catch { return "unselected"; }
}
export function writeGuideline(doctor: number, version: string, choice: Guideline, remember: boolean) {
  if (!version) return;
  try { if (remember && (choice === "CDC_2026" || choice === "WHO_2024")) localStorage.setItem(guidelineStorageKey(doctor, version), choice); else localStorage.removeItem(guidelineStorageKey(doctor, version)); }
  catch { /* Optional preference; no patient facts are cached. */ }
}
