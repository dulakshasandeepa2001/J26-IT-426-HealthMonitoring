// prescriptionApi.ts
// All API calls for the Prescription Intelligence feature.
// Base URL resolves from the shared api.ts helper.

import { apiRequest } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientContext {
  id: number;
  patient: number;
  date_of_birth: string | null;
  weight: string | null;
  weight_unit: string | null;
  allergy_status: string;          // "confirmed" | "unknown" | "none"
  allergies: string[];
  medicine_status: string;         // "confirmed" | "unknown" | "none"
  current_medicines: string[];
  provenance: Record<string, unknown>;
  updated_at: string;
  updated_by: number;
}

export interface DiagnosisConfirmation {
  id: number;
  consultation: string;            // UUID
  doctor: number;
  condition_code: string;
  condition_label: string;
  analysis_reference: string | null;
  confirmed_at: string;
}

export interface Consultation {
  id: string;                      // UUID
  started_at: string;
  reason: string;
  is_demo: boolean;
  created_at: string;
  doctor: number;
  patient: number;
  assigned_by: number | null;
}

export interface ConsultationAnalysis {
  id: number;
  consultation: string;
  imported_by: number;
  analysis_reference: string;
  payload: Record<string, unknown>;
  imported_at: string;
}

export interface ContextRevision {
  id: number;
  consultation: string;
  context: number;
  doctor: number;
  snapshot: Record<string, unknown>;
  changed_fields: string[];
  recorded_at: string;
}

// ─── Patient Context ──────────────────────────────────────────────────────────

export async function fetchPatientContexts(): Promise<PatientContext[]> {
  return apiRequest("/api/prescription/patient-contexts/");
}

export async function fetchPatientContextByPatient(patientId: number): Promise<PatientContext | null> {
  const all: PatientContext[] = await apiRequest(`/api/prescription/patient-contexts/?patient=${patientId}`);
  return all.length > 0 ? all[0] : null;
}

// ─── Consultations ────────────────────────────────────────────────────────────

export async function fetchConsultations(): Promise<Consultation[]> {
  return apiRequest("/api/prescription/consultations/");
}

export async function fetchConsultationById(id: string): Promise<Consultation> {
  return apiRequest(`/api/prescription/consultations/${id}/`);
}

export async function createConsultation(
  data: Omit<Consultation, "id" | "created_at">
): Promise<Consultation> {
  return apiRequest("/api/prescription/consultations/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Diagnoses ────────────────────────────────────────────────────────────────

export async function fetchDiagnoses(consultationId?: string): Promise<DiagnosisConfirmation[]> {
  const query = consultationId ? `?consultation=${consultationId}` : "";
  return apiRequest(`/api/prescription/diagnoses/${query}`);
}

export async function createDiagnosis(
  data: Omit<DiagnosisConfirmation, "id" | "confirmed_at">
): Promise<DiagnosisConfirmation> {
  return apiRequest("/api/prescription/diagnoses/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Analyses ────────────────────────────────────────────────────────────────

export async function fetchAnalyses(consultationId?: string): Promise<ConsultationAnalysis[]> {
  const query = consultationId ? `?consultation=${consultationId}` : "";
  return apiRequest(`/api/prescription/analyses/${query}`);
}

// ─── Revisions ────────────────────────────────────────────────────────────────

export async function fetchRevisions(consultationId?: string): Promise<ContextRevision[]> {
  const query = consultationId ? `?consultation=${consultationId}` : "";
  return apiRequest(`/api/prescription/revisions/${query}`);
}

