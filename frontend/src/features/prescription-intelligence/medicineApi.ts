import { apiRequest } from "@/lib/api";

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
