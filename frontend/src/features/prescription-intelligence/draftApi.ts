import { apiRequest } from "@/lib/api";
import type { IdentityPolicy } from "./HistoryIdentityPolicy";
import type { EvidenceSource, MedicineReviewStatus, StandardMedicineConcept, MedicineNameResult } from "./medicineApi";

export interface SafetyProfile {
  medicine: string; generic_name: string; content: { version: string; kind: string; scope: string; parameters: Record<string, unknown>; allergy_names: string[]; source_ids: string[]; source_sections: Record<string, string[]> };
  content_hash: string; medicine_content_hash: string; review_status: MedicineReviewStatus; review_is_current: boolean;
  catalogue_review_current: boolean; reviewer_name: string | null; reviewed_at: string | null; review_notes: string; updated_at: string;
  sources: EvidenceSource[]; product: { strength: string; form: string; route: "oral" | "topical"; standard_concept: StandardMedicineConcept }; conditions: string[];
  engine_version?: string;
  review_binding?: { reasons: string[]; reviewed_engine_hash?: string; current_engine_hash?: string };
  history_identity_policy?: IdentityPolicy;
}
export interface ClinicalDetails {
  reviewed: boolean; onset_hours: string | null; weight_kg: string | null;
  red_flags: "none" | "present" | "unknown"; renal_assessment: "standard" | "requires_adjustment" | "unknown";
  hepatic_assessment: "standard" | "requires_review" | "unknown"; special_population: "standard" | "requires_review" | "unknown";
  varicella_risk: "risk_group_confirmed" | "typical_uncomplicated_child" | "unknown";
  laiv_timing: "no_conflict" | "requires_review" | "unknown";
  verified_symptoms?: string[]; symptoms_reviewed?: boolean; symptom_durations?: Record<string, string | null>;
  topical_assessment?: "standard" | "requires_review" | "unknown";
}
export interface ProposedDose {
  amount: string | null; unit: "mg" | "g" | "mL" | null; doses_per_day: number | null; duration_days: number | null; route: "oral" | "topical";
  schedule_type?: "scheduled" | "oral_prn" | "topical_prn"; interval_hours?: number | null; max_doses_per_day?: number | null;
  max_daily_amount_mg?: number | null; review_after_days?: number | null; instructions?: string;
}
export type RegimenOrigin = "manual" | "rule_suggestion";
export interface RegimenRequest { diagnosis_id: number; expected_context_updated_at: string; clinical: ClinicalDetails }
export interface RegimenSuggestion {
  medicine_id: string; generic_name?: string; status: "suggested" | "unavailable" | "not_needed"; dose: ProposedDose | null; review_required: true; message: string;
  reasons: { category: string; status: CheckStatus; message: string; source_ids: string[] }[];
  sources: EvidenceSource[]; source_sections: Record<string, string[]>; rule_version: string; rule_content_hash: string; medicine_content_hash: string;
}
export interface RegimenResponse { consultation_id: string; diagnosis_id: number; context_updated_at: string; plan_hash: string; approved: false; published: false; suggestions: RegimenSuggestion[]; omitted_unreviewed?: { medicine_id: string; generic_name: string; reason: string }[] }
export interface DraftRequest {
  request_key: string; diagnosis_id: number; expected_context_updated_at: string; expected_latest_revision: number;
  selection_mode?: "manual" | "automatic";
  expected_plan_hash?: string;
  clinical: ClinicalDetails; proposals: { medicine_id: string; dose: ProposedDose | null; origin?: RegimenOrigin }[];
}
export type CheckStatus = "passed" | "warning" | "blocked" | "cannot_validate";
export interface ScreenedCandidate {
  medicine_id: string; generic_name: string; strength: string; form: string; route: string; purpose: string;
  screening_status: CheckStatus; checks: { category: string; status: CheckStatus; message: string; source_ids: string[] }[];
  proposed_dose: ProposedDose | null; sources: EvidenceSource[]; source_sections: Record<string, string[]>; rule_version: string; scope: string;
  regimen_origin?: RegimenOrigin;
  standard_concept: StandardMedicineConcept;
}
export interface PrescriptionDraft {
  id: string; consultation_id: string; patient: number; doctor: number; revision: number; request_key: string; created_at: string;
  snapshot: { clinical: ClinicalDetails; proposals: DraftRequest["proposals"]; diagnosis: { condition: string; condition_label: string }; is_demo: boolean } & Record<string, unknown>;
  result: { mode: "rules_only_unranked"; status: "draft"; approved: false; published: false; candidates: ScreenedCandidate[];
    normalization: MedicineNameResult[]; omitted_unreviewed: { medicine_id: string; generic_name: string; reason: string }[]; limitations: string;
    selection_mode?: "manual" | "automatic"; excluded_candidates?: RegimenSuggestion[] };
  current_state: { is_current: boolean; reason: string | null };
}
export function fetchSafetyProfiles(medicine?: string): Promise<SafetyProfile[]> {
  return apiRequest("/api/prescription/safety-profiles/" + (medicine ? `?medicine=${encodeURIComponent(medicine)}` : ""));
}
export function reviewSafetyProfile(profile: SafetyProfile, decision: MedicineReviewStatus, notes: string, evidence: boolean): Promise<SafetyProfile> {
  return apiRequest(`/api/prescription/safety-profiles/${profile.medicine}/review/`, { method: "POST", body: JSON.stringify({
    decision, notes, evidence_checked: evidence, expected_content_hash: profile.content_hash, expected_updated_at: profile.updated_at,
  }) });
}
export function fetchDrafts(consultation?: string): Promise<PrescriptionDraft[]> {
  return apiRequest("/api/prescription/drafts/" + (consultation ? `?consultation=${consultation}` : ""));
}
export function generateDraft(consultation: string, data: DraftRequest): Promise<PrescriptionDraft> {
  return apiRequest(`/api/prescription/drafts/generate/${consultation}/`, { method: "POST", body: JSON.stringify(data) });
}
export function fetchRegimenSuggestions(consultation: string, data: RegimenRequest, signal?: AbortSignal): Promise<RegimenResponse> {
  return apiRequest(`/api/prescription/drafts/regimens/${consultation}/`, { method: "POST", body: JSON.stringify(data), signal });
}
