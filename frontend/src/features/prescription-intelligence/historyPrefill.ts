import { readComponent1Payload } from "./analysisData";
import type { Consultation, ConsultationAnalysis, ContextStatus, PatientContext } from "./prescriptionApi";

export interface HistoryFields {
  allergyStatus: ContextStatus; medicineStatus: ContextStatus;
  allergyText: string; medicineText: string;
}
export function historyEntries(text: string) {
  return text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}
function status(value: string | undefined): ContextStatus {
  return value === "confirmed" || value === "none" ? value : "unknown";
}
function merge(saved: string[], reported: string[]) {
  const seen = new Set<string>();
  return [...saved, ...reported].filter((text) => {
    const key = text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function patientHistoryPrefill(visit: Consultation, analysis: ConsultationAnalysis | null, context: PatientContext | null) {
  const saved = context?.patient === visit.patient ? context : null;
  const parsed = analysis?.consultation === visit.id ? readComponent1Payload(analysis.payload) : null;
  const linked = parsed?.patient_id === visit.patient && parsed.consultation_id === visit.id
    && (parsed.schema_version === "1.0" || parsed.doctor_id === visit.doctor);
  const notes = linked ? parsed.member1?.raw_output.payload.extracted_clinical_notes : null;
  const allergies = notes?.patient_reported_allergies ?? [];
  const medicines = notes?.patient_current_medications ?? [];
  const reviewed = saved?.provenance.last_reviewed_consultation === visit.id
    && saved.provenance.last_reviewed_by === visit.doctor;
  const baseAllergies = saved?.allergy_status === "confirmed" ? saved.allergies : [];
  const baseMedicines = saved?.medicine_status === "confirmed" ? saved.current_medicines : [];
  const allergyProposal = merge(baseAllergies, allergies), medicineProposal = merge(baseMedicines, medicines);
  const reviewTime = Date.parse(String(saved?.provenance.last_reviewed_at ?? ""));
  const reportTime = Date.parse(analysis?.imported_at ?? "");
  // Browser dates have millisecond precision: equal timestamps cannot prove
  // that a new positive finding was already included in the saved review.
  const laterReport = !Number.isFinite(reviewTime) || !Number.isFinite(reportTime) || reportTime >= reviewTime;
  const newReportedHistory = reviewed && laterReport && (allergyProposal.length > baseAllergies.length || medicineProposal.length > baseMedicines.length);
  const keepReviewed = reviewed && !newReportedHistory;
  // Reported positives are proposals, not a saved doctor review. Never infer "none"
  // from an empty/missing extraction, or erase established history with one.
  const combinedAllergies = keepReviewed ? baseAllergies : allergyProposal;
  const combinedMedicines = keepReviewed ? baseMedicines : medicineProposal;
  const fields: HistoryFields = {
    allergyStatus: combinedAllergies.length ? "confirmed" : status(saved?.allergy_status),
    medicineStatus: combinedMedicines.length ? "confirmed" : status(saved?.medicine_status),
    allergyText: combinedAllergies.join("\n"), medicineText: combinedMedicines.join("\n"),
  };
  return { fields, reportedAllergies: allergies, reportedMedicines: medicines,
    hasReported: allergies.length > 0 || medicines.length > 0, reviewedForVisit: keepReviewed };
}
