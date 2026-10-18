import { apiRequest } from "@/lib/api";

type ObjectValue = Record<string, unknown>;
interface ResearchFlags {
  presentation_label: "Experimental ML";
  consultation_id: string;
  experiment_version: string;
  dataset_version: string;
  algorithm: string;
  clinical_review_status: "not_reviewed";
  synthetic_only: true;
  live_patient_data_used: false;
  prescription_eligible: false;
  approved: false;
  published: false;
  medical_confidence_calibrated: false;
  label_provenance: { label_method: "rule_derived"; criteria_version: string; source: string; independent_clinical_validation: false };
}
export interface ResearchOptions extends ResearchFlags {
  scenarios: { scenario_id: string; template_family: string; condition: string | null; split: string }[];
  candidates: { candidate_id: string; display_name: string; purpose: string; identity_status: string }[];
  coverage_limits: string[];
  fit_unique_inputs: number;
  test_agreement: Record<"all_mapped_unique" | "novel_mapped_unique", { inputs: number; correct: number; errors_including_abstentions: number; agreement_with_provisional_labels: number; prediction_coverage: number }>;
}
export interface ResearchPrediction extends ResearchFlags {
  scenario_id: string;
  candidate_id: string;
  candidate_purpose: string;
  clinical_role: string;
  mapping_status: string;
  fixture: { scenario_id: string; template_family: string; condition: string | null; split: string; patient_features: ObjectValue };
  model_features: ObjectValue;
  reference_label: { value: string; label_method: "rule_derived"; clinical_review_status: "not_reviewed"; criterion_id: string };
  provisional_prediction: { label: "relevant" | "not_relevant" | "undetermined" | null; status: "predicted" | "abstained"; reason: string; unseen_features: string[]; evidence: ObjectValue };
  deterministic_safety: {
    aggregate_status: string; evaluation_status: string;
    findings: { category: string; status: string; reason_code: string; source_ids: string[] }[];
    simulation_only: true; review_gate_evaluated: false; eligible_for_prescription: false;
    full_safety_clearance: false; approved: false; published: false;
  };
  evidence_references: { id: string; title?: string; url: string }[];
}

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Experimental ML response. Results have been cleared.");
  return value as ObjectValue;
}
function requireValue(valid: boolean): asserts valid {
  if (!valid) throw new Error("Invalid Experimental ML response. Results have been cleared.");
}
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);

function flags(value: unknown, consultation: string): ObjectValue {
  const data = object(value), provenance = object(data.label_provenance);
  requireValue(data.consultation_id === consultation && data.presentation_label === "Experimental ML"
    && data.clinical_review_status === "not_reviewed" && data.synthetic_only === true
    && ["live_patient_data_used", "prescription_eligible", "approved", "published", "medical_confidence_calibrated"].every((key) => data[key] === false)
    && ["experiment_version", "dataset_version", "algorithm"].every((key) => text(data[key]))
    && provenance.label_method === "rule_derived" && provenance.independent_clinical_validation === false
    && text(provenance.criteria_version) && text(provenance.source));
  return data;
}
const endpoint = (consultation: string) => `/api/prescription/consultations/${encodeURIComponent(consultation)}/experimental-ml/`;

export async function getResearchOptions(consultation: string, signal: AbortSignal): Promise<ResearchOptions> {
  const data = flags(await apiRequest(endpoint(consultation), { signal }), consultation);
  requireValue(Array.isArray(data.scenarios) && data.scenarios.length > 0 && data.scenarios.every((row) => {
    const item = object(row); return ["scenario_id", "template_family", "split"].every((key) => text(item[key])) && (item.condition === null || text(item.condition));
  }));
  requireValue(Array.isArray(data.candidates) && data.candidates.length > 0 && data.candidates.every((row) => {
    const item = object(row); return ["candidate_id", "display_name", "purpose", "identity_status"].every((key) => text(item[key]));
  }));
  requireValue(strings(data.coverage_limits) && Number.isInteger(data.fit_unique_inputs) && Number(data.fit_unique_inputs) > 0);
  const metrics = object(data.test_agreement);
  for (const name of ["all_mapped_unique", "novel_mapped_unique"]) {
    const metric = object(metrics[name]);
    requireValue(["inputs", "correct", "errors_including_abstentions"].every((key) => Number.isInteger(metric[key]) && Number(metric[key]) >= 0)
      && Number(metric.inputs) > 0 && Number(metric.correct) + Number(metric.errors_including_abstentions) === metric.inputs
      && ["agreement_with_provisional_labels", "prediction_coverage"].every((key) => typeof metric[key] === "number" && Number(metric[key]) >= 0 && Number(metric[key]) <= 1));
  }
  return data as unknown as ResearchOptions;
}

export async function predictResearchFixture(options: ResearchOptions, scenario: string, candidate: string, signal: AbortSignal): Promise<ResearchPrediction> {
  const data = flags(await apiRequest(endpoint(options.consultation_id), {
    method: "POST", signal, body: JSON.stringify({ synthetic_demo: true, scenario_id: scenario, candidate_id: candidate }),
  }), options.consultation_id);
  requireValue(data.scenario_id === scenario && data.candidate_id === candidate
    && data.experiment_version === options.experiment_version && data.dataset_version === options.dataset_version
    && data.algorithm === options.algorithm && JSON.stringify(data.label_provenance) === JSON.stringify(options.label_provenance));
  const prediction = object(data.provisional_prediction), safety = object(data.deterministic_safety);
  requireValue((prediction.status === "predicted" && ["relevant", "not_relevant", "undetermined"].includes(String(prediction.label)))
    || (prediction.status === "abstained" && prediction.label === null));
  requireValue(text(prediction.reason) && strings(prediction.unseen_features));
  object(prediction.evidence);
  const fixture = object(data.fixture), reference = object(data.reference_label);
  object(fixture.patient_features); object(data.model_features);
  requireValue(fixture.scenario_id === scenario && ["template_family", "split"].every((key) => text(fixture[key])) && (fixture.condition === null || text(fixture.condition))
    && ["candidate_purpose", "clinical_role", "mapping_status"].every((key) => text(data[key]))
    && reference.label_method === "rule_derived" && reference.clinical_review_status === "not_reviewed" && text(reference.value));
  requireValue(safety.simulation_only === true
    && ["review_gate_evaluated", "eligible_for_prescription", "full_safety_clearance", "approved", "published"].every((key) => safety[key] === false)
    && text(safety.aggregate_status) && text(safety.evaluation_status) && Array.isArray(safety.findings)
    && safety.findings.every((row) => { const item = object(row); return ["category", "status", "reason_code"].every((key) => text(item[key])) && strings(item.source_ids); }));
  requireValue(Array.isArray(data.evidence_references) && data.evidence_references.every((row) => {
    const item = object(row); return text(item.id) && (item.title === undefined || text(item.title)) && text(item.url) && item.url.startsWith("https://");
  }));
  return data as unknown as ResearchPrediction;
}
