import { BOOLEAN_OBSERVATIONS, type HandoffCondition } from "./analysisData";
import type { ClinicalAssessment } from "./clinicalScreeningApi";

export function emptyAssessment(): ClinicalAssessment {
  return { reviewed: false, symptoms_reviewed: false, verified_symptoms: [], symptom_durations: {},
    onset_hours: null, weight_kg: null, red_flags: "unknown", renal_assessment: "unknown", hepatic_assessment: "unknown",
    special_population: "unknown", varicella_risk: "unknown", laiv_timing: "unknown", topical_assessment: "unknown",
    condition_assessments: Object.fromEntries(BOOLEAN_OBSERVATIONS.map((name) => [name, null])),
    care_setting: "unknown", condition_severity: "unknown", influenza_guideline: "unselected", ophthalmic_integrity: "unknown",
    excipient_assessment: "unknown", dehydration_assessment: "unknown", oral_fluid_tolerance: "unknown", nsaid_assessment: "unknown",
    gi_bleeding_assessment: "unknown", cardiovascular_assessment: "unknown" };
}
export const symptomNames: Record<string, string> = { fever: "Fever", body_aches: "Body aches", itching: "Itching", jaw_pain: "Jaw pain", ocular_dryness: "Eye dryness", ocular_irritation: "Eye irritation", diarrhoea: "Diarrhoea", vomiting: "Vomiting", recent_fluid_loss: "Recent fluid loss" };
export const conditionSymptoms: Record<HandoffCondition, string[]> = {
  influenza: ["fever", "body_aches"], chickenpox: ["fever", "body_aches", "itching"], measles: ["fever", "body_aches"],
  mumps: ["fever", "body_aches", "jaw_pain"], viral_conjunctivitis: ["ocular_dryness", "ocular_irritation"],
  viral_gastroenteritis: ["diarrhoea", "vomiting", "recent_fluid_loss"],
};
const commonConcerns = ["respiratory_concern", "neurological_concern", "hydration_concern", "immunocompromised", "pregnant_or_breastfeeding"];
export const conditionConcerns: Record<HandoffCondition, string[]> = {
  influenza: commonConcerns, chickenpox: commonConcerns,
  measles: [...commonConcerns, "intake_difficulty"],
  mumps: [...commonConcerns, "intake_difficulty", "abdominal_pain", "testicular_pain_or_swelling"],
  viral_conjunctivitis: [...commonConcerns, "eye_pain", "photophobia", "vision_change", "marked_or_worsening_redness", "contact_lens_use", "suspected_herpetic_eye_disease"],
  viral_gastroenteritis: [...commonConcerns, "blood_in_stool", "severe_abdominal_pain", "fluid_restriction"],
};
type SelectKey = Exclude<keyof ClinicalAssessment, "reviewed" | "symptoms_reviewed" | "verified_symptoms" | "symptom_durations" | "condition_assessments" | "onset_hours" | "weight_kg" | "selected_pair_review">;
export interface AssessmentSelect { key: SelectKey; label: string; options: [string, string][]; conditions?: HandoffCondition[] }
const unknown: [string, string] = ["unknown", "Unknown / not assessed"];
export const assessmentSelects: AssessmentSelect[] = [
  { key: "care_setting", label: "Care setting", options: [unknown, ["outpatient", "Assessed outpatient context"], ["hospital", "Hospital care"]] },
  { key: "condition_severity", label: "Condition severity", options: [unknown, ["mild", "Assessed mild"], ["moderate", "Assessed moderate"], ["severe", "Assessed severe"]] },
  { key: "red_flags", label: "Red-flag assessment", options: [unknown, ["none", "Doctor assessed: none reported"], ["present", "Red flags present"]] },
  { key: "special_population", label: "Special population assessment", options: [unknown, ["standard", "Reviewed: standard context"], ["requires_review", "Specialist / additional review required"]] },
  { key: "renal_assessment", label: "Renal dosing assessment", conditions: ["influenza", "chickenpox", "measles", "mumps"], options: [unknown, ["standard", "Reviewed: standard renal context"], ["requires_adjustment", "Adjusted dosing needs review"]] },
  { key: "hepatic_assessment", label: "Hepatic and alcohol-risk assessment", conditions: ["influenza", "chickenpox", "measles", "mumps"], options: [unknown, ["standard", "Reviewed: standard context"], ["requires_review", "Individual review required"]] },
  { key: "influenza_guideline", label: "Influenza guideline pathway", conditions: ["influenza"], options: [["unselected", "Not selected"], ["CDC_2026", "CDC 2026 outpatient pathway"], ["WHO_2024", "WHO 2024 (different non-severe pathway)"]] },
  { key: "laiv_timing", label: "Live intranasal influenza vaccine timing", conditions: ["influenza"], options: [unknown, ["no_conflict", "Reviewed: no label timing conflict"], ["requires_review", "Timing needs review"]] },
  { key: "varicella_risk", label: "Varicella indication assessment", conditions: ["chickenpox"], options: [unknown, ["risk_group_confirmed", "Applicable risk-group indication confirmed"], ["typical_uncomplicated_child", "Typical uncomplicated varicella in healthy child"]] },
  { key: "topical_assessment", label: "Topical use assessment", conditions: ["chickenpox"], options: [unknown, ["standard", "Reviewed: suitable external-use context"], ["requires_review", "Individualized topical review required"]] },
  { key: "excipient_assessment", label: "Exact product and excipient assessment", conditions: ["mumps", "viral_conjunctivitis"], options: [unknown, ["acceptable", "Independently assessed: acceptable"], ["requires_review", "Individual review required"]] },
  { key: "ophthalmic_integrity", label: "Sterile eye product and dropper integrity", conditions: ["viral_conjunctivitis"], options: [unknown, ["acceptable", "Independently assessed: acceptable"], ["requires_review", "Individual review required"]] },
  { key: "nsaid_assessment", label: "NSAID product assessment", conditions: ["mumps"], options: [unknown, ["standard", "Reviewed: standard context"], ["requires_review", "Individual review required"]] },
  { key: "gi_bleeding_assessment", label: "GI bleeding assessment", conditions: ["mumps"], options: [unknown, ["none", "Assessed: none"], ["present", "Present"]] },
  { key: "cardiovascular_assessment", label: "Cardiovascular assessment", conditions: ["mumps"], options: [unknown, ["standard", "Reviewed: standard context"], ["requires_review", "Individual review required"]] },
  { key: "dehydration_assessment", label: "Dehydration assessment", conditions: ["viral_gastroenteritis"], options: [unknown, ["none", "Assessed: none"], ["mild", "Mild"], ["moderate", "Moderate"], ["severe", "Severe"]] },
  { key: "oral_fluid_tolerance", label: "Oral fluid tolerance", conditions: ["viral_gastroenteritis"], options: [unknown, ["tolerated", "Assessed: tolerated"], ["not_tolerated", "Not tolerated"]] },
];
