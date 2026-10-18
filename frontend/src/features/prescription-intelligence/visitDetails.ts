import { readComponent1Payload } from "./analysisData";
import type { Consultation, ConsultationAnalysis } from "./prescriptionApi";

// Only the selected visit supplies its complaint; a previous visit is never a fallback.
export function visitDetails(visit: Consultation, analysis: ConsultationAnalysis | null) {
  const parsed = analysis?.consultation === visit.id ? readComponent1Payload(analysis.payload) : null;
  const linked = parsed?.consultation_id === visit.id && parsed.patient_id === visit.patient
    && (parsed.schema_version === "1.0" || parsed.doctor_id === visit.doctor);
  const complaint = linked ? parsed.member1?.raw_output.payload.extracted_clinical_notes.chief_complaint.trim() : "";
  return { reason: visit.reason.trim(), complaint: complaint ?? "" };
}
