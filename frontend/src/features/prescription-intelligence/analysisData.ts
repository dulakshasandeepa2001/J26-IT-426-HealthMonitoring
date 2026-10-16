export type PilotCondition = "influenza" | "chickenpox";
export const HANDOFF_CONDITIONS = ["influenza", "chickenpox", "measles", "mumps", "viral_conjunctivitis", "viral_gastroenteritis"] as const;
export type HandoffCondition = typeof HANDOFF_CONDITIONS[number];
export type DemoScenario = PilotCondition | "member1_influenza" | `member1_v21_${HandoffCondition}`;
export const HANDOFF_SYMPTOMS = ["fever", "cough", "sore_throat", "body_aches", "rash", "itching", "jaw_pain", "ocular_dryness", "ocular_irritation", "diarrhoea", "vomiting", "recent_fluid_loss"] as const;
export const BOOLEAN_OBSERVATIONS = ["respiratory_concern", "neurological_concern", "hydration_concern", "intake_difficulty", "abdominal_pain", "testicular_pain_or_swelling", "eye_pain", "photophobia", "vision_change", "marked_or_worsening_redness", "contact_lens_use", "suspected_herpetic_eye_disease", "blood_in_stool", "severe_abdominal_pain", "fluid_restriction", "immunocompromised", "pregnant_or_breastfeeding"] as const;
export type ReportedAssessments = Record<typeof BOOLEAN_OBSERVATIONS[number], boolean | null> & {
  dehydration_assessment: "unknown" | "none" | "mild" | "moderate" | "severe";
  oral_fluid_tolerance: "unknown" | "tolerated" | "not_tolerated";
  reported_onset_hours: number | null;
  reported_weight_kg: number | null;
  weight_recorded_at: string | null;
  ors_product_name: string | null;
};

export interface Member1Diagnosis { condition_code: string; condition_label: string; confidence: number }
export interface Member1Details {
  adapter_version: string;
  red_flag_assessment: "assessed" | "not_assessed";
  mapping_issues: { field: string; reason: string }[];
  reported_assessments?: ReportedAssessments;
  assessment_review_status?: "unverified";
  raw_output: {
    timestamp: string;
    payload: {
      audio_metadata: { duration_seconds: number; language: string; audio_quality: string };
      transcript_summary: string;
      extracted_symptoms: { symptom: string; duration?: string | null; severity: string; confidence: number; present?: boolean | null; code?: string; duration_days?: number | null; duration_hours?: number | null }[];
      primary_diagnosis: Member1Diagnosis & { severity_level: string; icd_10_code?: string | null };
      differential_diagnoses: Member1Diagnosis[];
      extracted_clinical_notes: { chief_complaint: string; patient_reported_allergies: string[]; patient_current_medications: string[]; vital_signs_mentioned: Record<string, string> };
      suggested_treatment_categories: string[];
    };
  };
}

export interface Component1Payload extends Record<string, unknown> {
  schema_version: "1.0" | "2.0" | "2.1";
  analysis_reference: string;
  patient_id: number;
  consultation_id: string;
  doctor_id?: number;
  source: "component_1_sample" | "component_1";
  is_demo: boolean;
  symptoms: { code: string; present: boolean | null; duration_days: number | null; duration_hours?: number | null }[];
  condition_candidates: { code: HandoffCondition; confidence: number }[];
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
function member1(value: unknown, v21 = false): value is Member1Details {
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
      && typeof item.symptom === "string" && (v21 ? item.duration == null || typeof item.duration === "string" : typeof item.duration === "string") && typeof item.severity === "string" && score(item.confidence)
      && (item.present === undefined || typeof item.present === "boolean" || (v21 && item.present === null))
      && (!v21 || (item.duration_hours == null || boundedNumber(item.duration_hours, 0, 8760))))
    && record(primary) && diagnosis(primary) && typeof primary.severity_level === "string"
    && (primary.icd_10_code === undefined || primary.icd_10_code === null || typeof primary.icd_10_code === "string")
    && Array.isArray(body.differential_diagnoses) && body.differential_diagnoses.every(diagnosis)
    && record(notes) && typeof notes.chief_complaint === "string" && stringList(notes.patient_reported_allergies)
    && stringList(notes.patient_current_medications) && record(notes.vital_signs_mentioned)
    && Object.values(notes.vital_signs_mentioned).every((item) => typeof item === "string")
    && stringList(body.suggested_treatment_categories);
}

export function readComponent1Payload(payload: Record<string, unknown>): Component1Payload | null {
  const v21 = payload.schema_version === "2.1";
  if (!["1.0", "2.0", "2.1"].includes(String(payload.schema_version)) || payload.review_status !== "unconfirmed"
    || typeof payload.is_demo !== "boolean" || typeof payload.patient_id !== "number"
    || typeof payload.consultation_id !== "string" || typeof payload.analysis_reference !== "string"
    || typeof payload.model_version !== "string"
    || payload.source !== (payload.is_demo ? "component_1_sample" : "component_1")) return null;
  if (!Array.isArray(payload.symptoms) || !payload.symptoms.every((item) => record(item)
    && typeof item.code === "string" && (typeof item.present === "boolean" || (v21 && item.present === null))
    && (item.duration_days === null || (boundedNumber(item.duration_days, 0, 365) && Number.isInteger(item.duration_days)))
    && (!v21 || (HANDOFF_SYMPTOMS.includes(item.code as typeof HANDOFF_SYMPTOMS[number])
      && (item.duration_hours === null || boundedNumber(item.duration_hours, 0, 8760))
      && (item.present === true || (item.duration_hours === null && item.duration_days === null))
      && (item.duration_days === null || item.duration_hours === item.duration_days * 24))))) return null;
  if (!Array.isArray(payload.condition_candidates) || (payload.schema_version === "1.0" && !payload.condition_candidates.length)
    || !payload.condition_candidates.every((item) => record(item)
      && (v21 ? HANDOFF_CONDITIONS : ["influenza", "chickenpox"]).includes(String(item.code) as HandoffCondition)
      && typeof item.confidence === "number" && Number.isFinite(item.confidence)
      && item.confidence >= 0 && item.confidence <= 1)) return null;
  if (!record(payload.severity) || typeof payload.severity.level !== "string"
    || !Array.isArray(payload.severity.red_flags) || !payload.severity.red_flags.every((item) => typeof item === "string")) return null;
  if (["2.0", "2.1"].includes(String(payload.schema_version)) && (typeof payload.doctor_id !== "number" || !member1(payload.member1, v21))) return null;
  if (v21 && !validV21(payload)) return null;
  return payload as Component1Payload;
}

export function conditionLabel(code: string) {
  if (code === "influenza") return "Influenza";
  if (code === "chickenpox") return "Chickenpox";
  if (code === "measles") return "Measles";
  if (code === "mumps") return "Mumps";
  if (code === "viral_conjunctivitis") return "Viral conjunctivitis";
  if (code === "viral_gastroenteritis") return "Viral gastroenteritis";
  return code.replaceAll("_", " ");
}

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validV21(payload: Record<string, unknown>): boolean {
  if (!Number.isInteger(payload.patient_id) || Number(payload.patient_id) <= 0 || !Number.isInteger(payload.doctor_id) || Number(payload.doctor_id) <= 0
    || !record(payload.member1) || payload.member1.adapter_version !== "member1-v2.1.0" || payload.member1.assessment_review_status !== "unverified"
    || !record(payload.member1.reported_assessments) || !record(payload.member1.raw_output)) return false;
  const facts = payload.member1.reported_assessments;
  if (!BOOLEAN_OBSERVATIONS.every((name) => facts[name] === null || typeof facts[name] === "boolean")
    || !["unknown", "none", "mild", "moderate", "severe"].includes(String(facts.dehydration_assessment))
    || !["unknown", "tolerated", "not_tolerated"].includes(String(facts.oral_fluid_tolerance))
    || !(facts.reported_onset_hours === null || boundedNumber(facts.reported_onset_hours, 0, 8760))
    || !(facts.reported_weight_kg === null || boundedNumber(facts.reported_weight_kg, 0.1, 350))
    || !(facts.weight_recorded_at === null || (typeof facts.weight_recorded_at === "string" && Number.isFinite(Date.parse(facts.weight_recorded_at))))
    || (facts.weight_recorded_at !== null && facts.reported_weight_kg === null)
    || !(facts.ors_product_name === null || typeof facts.ors_product_name === "string")) return false;
  const raw = payload.member1.raw_output;
  if (raw.schema_version !== "2.1" || raw.patient_id !== payload.patient_id || raw.doctor_id !== payload.doctor_id || raw.consultation_id !== payload.consultation_id
    || !record(raw.payload) || !record(raw.payload.primary_diagnosis) || typeof raw.payload.primary_diagnosis.condition_code !== "string") return false;
  const primary = raw.payload.primary_diagnosis.condition_code.toLowerCase();
  const candidates = payload.condition_candidates;
  if (!Array.isArray(candidates) || candidates.length !== (HANDOFF_CONDITIONS.includes(primary as HandoffCondition) ? 1 : 0)) return false;
  if (candidates.length && (!record(candidates[0]) || candidates[0].code !== primary || candidates[0].confidence !== raw.payload.primary_diagnosis.confidence)) return false;
  const symptoms = payload.symptoms;
  return Array.isArray(symptoms) && new Set(symptoms.map((row) => row.code)).size === symptoms.length
    && symptoms.length === HANDOFF_SYMPTOMS.length;
}

export function prescriptionCondition(code: string, label: string): PilotCondition | null {
  const normalized = code.toLowerCase();
  if (normalized === "influenza" || normalized === "chickenpox") return normalized;
  if (normalized === "manual" && ["influenza", "chickenpox"].includes(label.toLowerCase())) return label.toLowerCase() as PilotCondition;
  return null;
}

export function symptomDuration(symptom: Component1Payload["symptoms"][number]): string {
  if (symptom.duration_hours != null) return `${symptom.duration_hours} ${symptom.duration_hours === 1 ? "hour" : "hours"}`;
  if (symptom.duration_days != null) return `${symptom.duration_days} ${symptom.duration_days === 1 ? "day" : "days"}`;
  return "Duration not reported";
}

export function suggestedDiagnosis(payload: Record<string, unknown>): string {
  const parsed = readComponent1Payload(payload);
  if (!parsed || !parsed.condition_candidates.length) return "";
  const top = parsed.condition_candidates.reduce((best, item) => item.confidence > best.confidence ? item : best);
  return conditionLabel(top.code);
}
