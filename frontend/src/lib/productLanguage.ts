// Presentation only. API field names, stored provenance and version hashes stay intact.
export function interfaceText(text: string): string {
  return text.replace(/\bcomponent[ _-]?1\b/gi, "analysis service")
    .replace(/\bmember[ _-]?1\b/gi, "consultation analysis")
    .replace(/\bpp1[-_ ]*/gi, "")
    .replace(/\bdemo\b/gi, "research")
    .replace(/\s{2,}/g, " ").trim();
}

export function analysisRecordLabel(reference: string, id: number): string {
  return /\b(?:pp1|demo|component[ _-]?1|member[ _-]?1)\b/i.test(reference) ? `Analysis #${id}` : reference;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function clinicalAnalysisDetails(value: unknown) {
  const analysis = record(value);
  const reported = record(record(record(analysis.member1).raw_output).payload);
  if (Object.keys(reported).length) return reported;
  return { symptoms: analysis.symptoms ?? [], condition_candidates: analysis.condition_candidates ?? [], severity: analysis.severity ?? null };
}

export function clinicalInputSummary(value: unknown) {
  const snapshot = record(value), history = record(snapshot.context), diagnosis = record(snapshot.diagnosis);
  return { patient: snapshot.patient, history: { allergy_status: history.allergy_status, allergies: history.allergies,
      medicine_status: history.medicine_status, current_medicines: history.current_medicines },
    diagnosis: { condition: diagnosis.condition, condition_code: diagnosis.condition_code, condition_label: diagnosis.condition_label },
    clinical_assessment: snapshot.clinical, assessment_date: snapshot.as_of_date,
    synthetic_context: snapshot.is_demo === true };
}
