export type DemoScenario = "influenza" | "chickenpox";

export interface Component1Payload extends Record<string, unknown> {
  schema_version: "1.0";
  analysis_reference: string;
  patient_id: number;
  consultation_id: string;
  source: "component_1_sample" | "component_1";
  is_demo: boolean;
  symptoms: { code: string; present: boolean; duration_days: number | null }[];
  condition_candidates: { code: DemoScenario; confidence: number }[];
  severity: { level: string; red_flags: string[] };
  review_status: "unconfirmed";
  model_version: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readComponent1Payload(payload: Record<string, unknown>): Component1Payload | null {
  if (payload.schema_version !== "1.0" || payload.review_status !== "unconfirmed"
    || typeof payload.is_demo !== "boolean" || typeof payload.patient_id !== "number"
    || typeof payload.consultation_id !== "string" || typeof payload.analysis_reference !== "string"
    || typeof payload.model_version !== "string"
    || payload.source !== (payload.is_demo ? "component_1_sample" : "component_1")) return null;
  if (!Array.isArray(payload.symptoms) || !payload.symptoms.every((item) => record(item)
    && typeof item.code === "string" && typeof item.present === "boolean"
    && (item.duration_days === null || typeof item.duration_days === "number"))) return null;
  if (!Array.isArray(payload.condition_candidates) || !payload.condition_candidates.length
    || !payload.condition_candidates.every((item) => record(item)
      && ["influenza", "chickenpox"].includes(String(item.code))
      && typeof item.confidence === "number" && Number.isFinite(item.confidence)
      && item.confidence >= 0 && item.confidence <= 1)) return null;
  if (!record(payload.severity) || typeof payload.severity.level !== "string"
    || !Array.isArray(payload.severity.red_flags) || !payload.severity.red_flags.every((item) => typeof item === "string")) return null;
  return payload as Component1Payload;
}

export function conditionLabel(code: string) {
  if (code === "influenza") return "Influenza";
  if (code === "chickenpox") return "Chickenpox";
  return code.replaceAll("_", " ");
}

export function suggestedDiagnosis(payload: Record<string, unknown>): string {
  const parsed = readComponent1Payload(payload);
  if (!parsed) return "";
  const top = parsed.condition_candidates.reduce((best, item) => item.confidence > best.confidence ? item : best);
  return conditionLabel(top.code);
}
