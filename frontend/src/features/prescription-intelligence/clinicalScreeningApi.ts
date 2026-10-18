import { apiRequest } from "@/lib/api";
import { HANDOFF_CONDITIONS, type HandoffCondition } from "./analysisData";
import type { ClinicalDetails, CheckStatus } from "./draftApi";
import type { EvidenceSource } from "./medicineApi";

export interface ClinicalAssessment extends ClinicalDetails {
  condition_assessments: Record<string, boolean | null>;
  care_setting: "unknown" | "outpatient" | "hospital";
  condition_severity: "unknown" | "mild" | "moderate" | "severe";
  influenza_guideline: "unselected" | "CDC_2026" | "WHO_2024";
  ophthalmic_integrity: "unknown" | "acceptable" | "requires_review";
  excipient_assessment: "unknown" | "acceptable" | "requires_review";
  dehydration_assessment: "unknown" | "none" | "mild" | "moderate" | "severe";
  oral_fluid_tolerance: "unknown" | "tolerated" | "not_tolerated";
  nsaid_assessment: "unknown" | "standard" | "requires_review";
  gi_bleeding_assessment: "unknown" | "none" | "present";
  cardiovascular_assessment: "unknown" | "standard" | "requires_review";
}
export interface ScreeningInputs {
  consultation_id: string; supported_conditions: HandoffCondition[];
  engine_version: string; source_red_flag_assessment: "assessed" | "not_assessed";
  patient_age_years: number | null; dob_status: string; age_source: "registered_dob";
  expected_context_updated_at: string | null; expected_analysis_hash: string;
  confirmed_diagnoses: { id: number; condition_code: string; condition_label: string }[];
  clinical_template: ClinicalAssessment;
  source_observations: { assessment_status: "unverified"; assessments: Record<string, boolean | string | number | null>;
    red_flags: string[]; severity: string; symptoms: { code: string; present: boolean | null; duration_days?: number | null; duration_hours?: number | null }[] };
  source_observations_verified: false;
}
// Qualitative topical/ophthalmic regimens must retain their units and nullable fields.
export interface ScreeningRegimen {
  schedule_type?: string; amount?: string | null; amount_range?: number[]; unit?: string | null; route: string;
  doses_per_day?: number | null; duration_days?: number | null; frequency?: string;
  interval_hours?: number | null; interval_hours_range?: number[]; max_doses_per_day?: number | null;
  max_daily_amount_mg?: number | null; review_after_days?: number | null; reassessment_limit_hours?: number;
  instructions?: string;
}
export interface ScreeningCandidate {
  scope_id: string; medicine_id: string; generic_name: string; purpose: string; clinical_role: string;
  status: "unavailable" | "candidate_for_clinician_review"; screening_status: CheckStatus;
  checks: { category: string; status: CheckStatus; message: string; source_ids: string[] }[];
  regimen: ScreeningRegimen | null;
  product: { strength: string; form: string; route: string; standard_concept: { rxcui: string; name: string } | null; reference_product_identifier?: string } | null;
  sources: (EvidenceSource | string)[];
}
export interface ScreeningResult {
  mode: "deterministic_six_condition_draft"; engine_version: string; condition: HandoffCondition;
  candidates: ScreeningCandidate[];
  purpose_groups: { purpose: string; clinical_role: string; candidate_ids: string[];
    selection: "clinician_choice_required" | "single_candidate_applicability_only" }[];
  model_used: false; approved: false; published: false; prescription_eligible: false;
  clinical_validation_status: "not_validated"; limitations: string;
}
export interface ScreeningRequest {
  diagnosis_id: number; expected_context_updated_at: string; expected_analysis_hash: string; clinical: ClinicalAssessment;
}
export interface ScreeningPreview {
  consultation_id: string; diagnosis_id: number; plan_hash: string; expected_latest_revision: number;
  patient_age_years: number | null; age_source: "registered_dob"; result: ScreeningResult;
}
export interface ScreeningDraft {
  id: string; consultation_id: string; patient: number; doctor: number; revision: number; request_key: string; created_at: string;
  snapshot: { clinical: ClinicalAssessment; diagnosis: { id: number; condition: HandoffCondition }; is_demo: boolean;
    patient: { id: number; birthday: string | null; age_years: number | null }; [key: string]: unknown };
  result: ScreeningResult; current_state: { is_current: boolean; reason: string | null };
}

export function screeningCondition(code: string, label: string): HandoffCondition | null {
  const value = (code.toLowerCase() === "manual" ? label : code).toLowerCase().replaceAll(" ", "_");
  return HANDOFF_CONDITIONS.find((condition) => condition === value) ?? null;
}
function checkResult(result: ScreeningResult) {
  if (!result || result.mode !== "deterministic_six_condition_draft" || result.model_used !== false
    || result.approved !== false || result.published !== false || result.prescription_eligible !== false
    || !HANDOFF_CONDITIONS.includes(result.condition) || !Array.isArray(result.candidates) || !Array.isArray(result.purpose_groups)) {
    throw new Error("Screening response is unsupported. Refresh before reviewing a draft.");
  }
}
export async function fetchScreeningInputs(visit: string): Promise<ScreeningInputs> {
  const row: ScreeningInputs = await apiRequest(`/api/prescription/consultations/${encodeURIComponent(visit)}/clinical-screening/inputs/`);
  if (row.consultation_id !== visit || row.source_observations_verified !== false || row.age_source !== "registered_dob" || !row.clinical_template) throw new Error("Screening input binding is invalid.");
  return row;
}
export async function previewScreening(visit: string, body: ScreeningRequest, signal?: AbortSignal): Promise<ScreeningPreview> {
  const row: ScreeningPreview = await apiRequest(`/api/prescription/consultations/${encodeURIComponent(visit)}/clinical-screening/preview/`, { method: "POST", body: JSON.stringify(body), signal });
  checkResult(row.result);
  if (row.consultation_id !== visit || row.diagnosis_id !== body.diagnosis_id) throw new Error("Screening preview belongs to different inputs.");
  return row;
}
export async function saveScreeningDraft(visit: string, body: ScreeningRequest & { request_key: string; expected_plan_hash: string; expected_latest_revision: number }): Promise<ScreeningDraft> {
  const row: ScreeningDraft = await apiRequest(`/api/prescription/consultations/${encodeURIComponent(visit)}/clinical-screening/drafts/`, { method: "POST", body: JSON.stringify(body) });
  checkResult(row.result);
  if (row.consultation_id !== visit || row.request_key !== body.request_key) throw new Error("Saved draft binding is invalid. Refresh the saved records.");
  return row;
}
export async function fetchScreeningDrafts(visit?: string): Promise<ScreeningDraft[]> {
  const rows: ScreeningDraft[] = await apiRequest("/api/prescription/six-condition-drafts/" + (visit ? `?consultation=${encodeURIComponent(visit)}` : ""));
  for (const row of rows) {
    checkResult(row.result);
    if (visit && row.consultation_id !== visit) throw new Error("Draft history belongs to another consultation.");
  }
  return rows;
}
