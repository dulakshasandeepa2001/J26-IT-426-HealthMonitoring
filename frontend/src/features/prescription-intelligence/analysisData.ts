export type PilotCondition = "influenza" | "chickenpox";
export type DemoScenario = PilotCondition | "member1_influenza";

export interface Member1Diagnosis { condition_code: string; condition_label: string; confidence: number }
export interface Member1Details {
  adapter_version: string;
  red_flag_assessment: "assessed" | "not_assessed";
  mapping_issues: { field: string; reason: string }[];
  raw_output: {
    timestamp: string;
    payload: {
      audio_metadata: { duration_seconds: number; language: string; audio_quality: string };
      transcript_summary: string;
      extracted_symptoms: { symptom: string; duration: string; severity: string; confidence: number; present?: boolean; code?: string; duration_days?: number | null }[];
      primary_diagnosis: Member1Diagnosis & { severity_level: string; icd_10_code?: string | null };
      differential_diagnoses: Member1Diagnosis[];
      extracted_clinical_notes: { chief_complaint: string; patient_reported_allergies: string[]; patient_current_medications: string[]; vital_signs_mentioned: Record<string, string> };
      suggested_treatment_categories: string[];
    };
  };
}

export interface Component1Payload extends Record<string, unknown> {
  schema_version: "1.0" | "2.0";
  analysis_reference: string;
  patient_id: number;
  consultation_id: string;
  doctor_id?: number;
  source: "component_1_sample" | "component_1";
  is_demo: boolean;
  symptoms: { code: string; present: boolean; duration_days: number | null }[];
  condition_candidates: { code: PilotCondition; confidence: number }[];
  severity: { level: string; red_flags: string[] };
  review_status: "unconfirmed";
  model_version: string;
  member1?: Member1Details;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function score(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function diagnosis(value: unknown): boolean {
  return record(value) && typeof value.condition_code === "string" && typeof value.condition_label === "string" && score(value.confidence);
}
function member1(value: unknown): value is Member1Details {
  if (!record(value) || typeof value.adapter_version !== "string"
    || !["assessed", "not_assessed"].includes(String(value.red_flag_assessment))
    || !Array.isArray(value.mapping_issues) || !value.mapping_issues.every((item) => record(item) && typeof item.field === "string" && typeof item.reason === "string")
    || !record(value.raw_output) || typeof value.raw_output.timestamp !== "string"
    || !Number.isFinite(Date.parse(value.raw_output.timestamp)) || !record(value.raw_output.payload)) return false;
  const body = value.raw_output.payload;
  const audio = body.audio_metadata;
  const primary = body.primary_diagnosis;
  const notes = body.extracted_clinical_notes;
  return record(audio) && typeof audio.duration_seconds === "number" && Number.isFinite(audio.duration_seconds)
    && typeof audio.language === "string" && typeof audio.audio_quality === "string"
    && typeof body.transcript_summary === "string"
    && Array.isArray(body.extracted_symptoms) && body.extracted_symptoms.every((item) => record(item)
      && typeof item.symptom === "string" && typeof item.duration === "string" && typeof item.severity === "string" && score(item.confidence)
      && (item.present === undefined || typeof item.present === "boolean"))
    && record(primary) && diagnosis(primary) && typeof primary.severity_level === "string"
    && (primary.icd_10_code === undefined || primary.icd_10_code === null || typeof primary.icd_10_code === "string")
    && Array.isArray(body.differential_diagnoses) && body.differential_diagnoses.every(diagnosis)
    && record(notes) && typeof notes.chief_complaint === "string" && stringList(notes.patient_reported_allergies)
    && stringList(notes.patient_current_medications) && record(notes.vital_signs_mentioned)
    && Object.values(notes.vital_signs_mentioned).every((item) => typeof item === "string")
    && stringList(body.suggested_treatment_categories);
}

export function readComponent1Payload(payload: Record<string, unknown>): Component1Payload | null {
  if (!["1.0", "2.0"].includes(String(payload.schema_version)) || payload.review_status !== "unconfirmed"
    || typeof payload.is_demo !== "boolean" || typeof payload.patient_id !== "number"
    || typeof payload.consultation_id !== "string" || typeof payload.analysis_reference !== "string"
    || typeof payload.model_version !== "string"
    || payload.source !== (payload.is_demo ? "component_1_sample" : "component_1")) return null;
  if (!Array.isArray(payload.symptoms) || !payload.symptoms.every((item) => record(item)
    && typeof item.code === "string" && typeof item.present === "boolean"
    && (item.duration_days === null || typeof item.duration_days === "number"))) return null;
  if (!Array.isArray(payload.condition_candidates) || (payload.schema_version === "1.0" && !payload.condition_candidates.length)
    || !payload.condition_candidates.every((item) => record(item)
      && ["influenza", "chickenpox"].includes(String(item.code))
      && typeof item.confidence === "number" && Number.isFinite(item.confidence)
      && item.confidence >= 0 && item.confidence <= 1)) return null;
  if (!record(payload.severity) || typeof payload.severity.level !== "string"
    || !Array.isArray(payload.severity.red_flags) || !payload.severity.red_flags.every((item) => typeof item === "string")) return null;
  if (payload.schema_version === "2.0" && (typeof payload.doctor_id !== "number" || !member1(payload.member1))) return null;
  return payload as Component1Payload;
}

export function conditionLabel(code: string) {
  if (code === "influenza") return "Influenza";
  if (code === "chickenpox") return "Chickenpox";
  return code.replaceAll("_", " ");
}

export function suggestedDiagnosis(payload: Record<string, unknown>): string {
  const parsed = readComponent1Payload(payload);
  if (!parsed || !parsed.condition_candidates.length) return "";
  const top = parsed.condition_candidates.reduce((best, item) => item.confidence > best.confidence ? item : best);
  return conditionLabel(top.code);
}
