import { apiRequest } from "@/lib/api";
import type { IdentityPolicy } from "./HistoryIdentityPolicy";

export type MedicineReviewStatus = "pending" | "reviewed" | "rejected";
export interface EvidenceSource {
  id: string; title: string; publisher: string; url: string;
  published_date: string | null; accessed_date: string; sections: string[];
}
export interface StandardMedicineConcept { rxcui: string; name: string; term_type: "SCD"; source_id: string }
export interface MedicineEntry {
  id: string;
  content: {
    schema_version: string; catalogue_version: string; generic_name: string;
    form: string; route: string; strength: string;
    ingredients: { name: string; strength: string }[];
    aliases: { name: string; level: "ingredient" | "product"; source_id: string }[];
    standard_concept: StandardMedicineConcept;
    uses: { condition: "influenza" | "chickenpox"; purpose: string; basis: string; summary: string; scope: string; source_ids: string[] }[];
    warnings: { category: string; summary: string; source_ids: string[] }[];
    sources: EvidenceSource[];
  };
  content_hash: string; review_status: MedicineReviewStatus; review_is_current: boolean;
  reviewed_by: number | null; reviewer_name: string | null; reviewed_at: string | null;
  review_notes: string; updated_at: string;
}
export interface MedicineReview {
  id: number; reviewer_name: string; decision: MedicineReviewStatus;
  previous_status: MedicineReviewStatus; notes: string; content_hash: string; catalogue_version: string; recorded_at: string;
}
export interface MedicineNameResult {
  input: string; status: "recognized" | "ambiguous" | "unrecognized";
  requires_clarification: boolean; reason: string;
  matches: { entry_id: string; generic_name: string; match_level: "ingredient" | "product";
    matched_alias: string; ingredients: string[]; standard_concept: StandardMedicineConcept | null;
    review_status: MedicineReviewStatus }[];
}
export function fetchMedicines(): Promise<MedicineEntry[]> { return apiRequest("/api/prescription/medicines/"); }
export function fetchMedicineReviews(id: string): Promise<MedicineReview[]> {
  return apiRequest(`/api/prescription/medicines/${encodeURIComponent(id)}/history/`);
}
export function reviewMedicine(entry: MedicineEntry, decision: MedicineReviewStatus, notes: string, evidenceChecked: boolean): Promise<MedicineEntry> {
  return apiRequest(`/api/prescription/medicines/${encodeURIComponent(entry.id)}/review/`, {
    method: "POST", body: JSON.stringify({ decision, notes, evidence_checked: evidenceChecked,
      expected_content_hash: entry.content_hash, expected_updated_at: entry.updated_at }),
  });
}
export function checkMedicineNames(names: string[]): Promise<{ results: MedicineNameResult[]; safety_assessed: false }> {
  return apiRequest("/api/prescription/medicines/normalize/", { method: "POST", body: JSON.stringify({ names }) });
}

export interface ScopeReview {
  status: MedicineReviewStatus; is_current: boolean; reason: string | null;
  review_scope?: "content" | "executable" | "reference_only"; reference_review_is_current?: boolean;
  reviewer_name: string | null; reviewed_at: string | null; notes: string;
}
export interface ConditionScope {
  id: string; medicine_id: string; condition: string; content_hash: string; rules_hash: string; updated_at: string;
  safety_review_mode?: "executable" | "reference_only";
  content: { condition: string; display_name?: string; product: (Omit<MedicineEntry["content"], "standard_concept"> & { standard_concept: StandardMedicineConcept | null; reference_product_identifier?: string }) | null; identity_status: string; purpose: string; knowledge_version: string;
    unresolved_product?: { gap: string; source_ids: string[]; source_urls: string[]; strength: null; rxcui: null; regimen: null } };
  rules: { policy: { scope: string; concern_fields: string[]; target_symptoms: string[]; handler: string }; reference_profile: unknown; scope: string; implementation_source: string; implementation_bindings: Record<string, string>; history_identity_policy?: IdentityPolicy };
  content_review: ScopeReview; safety_review: ScopeReview; live_screening_enabled: false;
}
export function fetchConditionKnowledge(): Promise<ConditionScope[]> { return apiRequest("/api/prescription/condition-knowledge/"); }
export function refreshConditionScopeVersion(scope: ConditionScope): Promise<ConditionScope> {
  return apiRequest(`/api/prescription/condition-knowledge/${encodeURIComponent(scope.id)}/refresh-version/`, {
    method: "POST", body: JSON.stringify({ expected_content_hash: scope.content_hash, expected_rules_hash: scope.rules_hash, expected_updated_at: scope.updated_at }),
  });
}
export function reviewConditionScope(scope: ConditionScope, kind: "content" | "safety", decision: MedicineReviewStatus, notes: string, evidence: boolean, referenceOnly = false): Promise<ConditionScope> {
  return apiRequest(`/api/prescription/condition-knowledge/${encodeURIComponent(scope.id)}/review/${kind}/`, {
    method: "POST", body: JSON.stringify({ decision, notes, evidence_checked: evidence, ...(referenceOnly ? { review_scope: "reference_only" } : {}),
      expected_content_hash: kind === "content" ? scope.content_hash : scope.rules_hash, expected_updated_at: scope.updated_at }),
  });
}
