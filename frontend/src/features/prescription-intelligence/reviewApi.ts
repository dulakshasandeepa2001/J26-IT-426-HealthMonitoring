import { apiRequest } from "@/lib/api";
import type { ScreeningCandidate } from "./clinicalScreeningApi";

export interface DoctorDecision {
  id: string; revision: number; action: "edited" | "approved" | "rejected"; selected_ids: string[];
  reason: string; doctor: number; created_at: string; synthetic_only: true; published: false;
}
export interface MedicineProposal {
  id: string; consultation_id: string; draft_id: string; revision: number; proposal_hash: string;
  current_state: { is_current: boolean; reason: string | null };
  snapshot: { synthetic_only: true; patient: { id: number; name: string; age_years: number | null; birthday: string | null }; condition: string };
  result: { approved: false; published: false; candidates: ScreeningCandidate[]; default_ids: string[];
    ml: { presentation_label: "Experimental ML"; algorithm: string; model_version: string; label_method: string; clinical_review_status: "not_reviewed";
      adapter_version?: string; supporting_models?: { version: string; role: string; hash: string }[];
      limits: string[]; predictions: { medicine_id: string; label: string | null; status: string; reason: string; suggested: boolean;
        rule_predictions?: Record<string, { predicted: string | null; status: string; reason: string; deterministic_reference: string | null; agrees_with_selected_check: boolean | null; unseen_features: string[] }>;
        rule_disagreements_or_abstentions?: string[];
        symptom_match_rf?: { label: number | null; status: string; reason: string };
        ml_can_override_rules?: false;
      }[] } };
  decisions: DoctorDecision[];
}
export interface PrescriptionSlip {
  decision_id: string; approved_at: string; synthetic_only: true; research_demo_only: true; published: false; valid_for_dispensing: false;
  patient: MedicineProposal["snapshot"]["patient"];
  doctor: { name: string; qualifications: string; university: string; hospital: string; credentials_verified: false };
  medicines: ScreeningCandidate[]; print_size: "A6";
}
function checked(row: MedicineProposal, visit: string, draft?: string) {
  if (row.consultation_id !== visit || draft && row.draft_id !== draft || row.snapshot.synthetic_only !== true
    || row.result.approved !== false || row.result.published !== false || row.result.ml.clinical_review_status !== "not_reviewed") throw new Error("Unsupported proposal binding. Refresh the saved draft.");
  if (row.result.ml.algorithm === "random_forest" && (!row.result.ml.supporting_models?.length
    || row.result.ml.predictions.some((prediction) => prediction.ml_can_override_rules !== false))) throw new Error("Invalid RF safety boundary. Refresh the saved draft.");
  return row;
}
export async function loadProposals(visit: string) {
  const rows: MedicineProposal[] = await apiRequest(`/api/prescription/consultations/${visit}/medicine-proposals/`);
  return rows.map((row) => checked(row, visit));
}
export async function createMedicineProposal(visit: string, draft: string, key: string) {
  const row: MedicineProposal = await apiRequest(`/api/prescription/consultations/${visit}/medicine-proposals/`, { method: "POST", body: JSON.stringify({ draft_id: draft, request_key: key, synthetic_demo: true }) });
  return checked(row, visit, draft);
}
export async function recordDecision(proposal: MedicineProposal, data: { action: DoctorDecision["action"]; selected_ids: string[]; reason: string; reviewed: boolean; combination_reviewed: boolean; request_key: string }) {
  const response: { proposal: MedicineProposal; decision: DoctorDecision } = await apiRequest(`/api/prescription/medicine-proposals/${proposal.id}/decisions/`, { method: "POST", body: JSON.stringify({ ...data, expected_revision: proposal.decisions[0]?.revision ?? 0, expected_proposal_hash: proposal.proposal_hash }) });
  checked(response.proposal, proposal.consultation_id, proposal.draft_id);
  if (response.proposal.id !== proposal.id || response.proposal.decisions[0]?.id !== response.decision.id
    || response.decision.action !== data.action || JSON.stringify(response.decision.selected_ids) !== JSON.stringify(data.selected_ids)) throw new Error("Decision response does not match this proposal and selection.");
  return response.proposal;
}
export async function loadPrescriptionSlip(id: string) {
  const row: PrescriptionSlip = await apiRequest(`/api/prescription/prescription-slips/${id}/`);
  if (row.decision_id !== id || row.synthetic_only !== true || row.research_demo_only !== true || row.published !== false || row.valid_for_dispensing !== false) throw new Error("Unsupported prescription slip response.");
  return row;
}
