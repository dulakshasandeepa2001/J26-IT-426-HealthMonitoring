"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchConsultations,
  fetchDiagnoses,
  fetchAnalyses,
  fetchPatientContexts,
  createConsultation,
  createDiagnosis,
  type Consultation,
  type DiagnosisConfirmation,
  type ConsultationAnalysis,
  type PatientContext,
} from "./prescriptionApi";

export type WorkflowStep = 0 | 1 | 2 | 3 | 4;

export interface PrescriptionState {
  // Loading / error
  loading: boolean;
  error: string | null;

  // Backend data
  consultations: Consultation[];
  diagnoses: DiagnosisConfirmation[];
  analyses: ConsultationAnalysis[];
  patientContexts: PatientContext[];

  // Active selection
  activeConsultation: Consultation | null;
  activeAnalysis: ConsultationAnalysis | null;
  activePatientContext: PatientContext | null;

  // Workflow
  step: WorkflowStep;

  // Diagnosis form
  diagnosisContext: string;
  diagnosisConfirmed: boolean;

  // Review / approval
  approvalStatus: "idle" | "approved" | "rejected";
  rejectionReason: string;
  medicineCorrection: string;
  proposedDose: string;
  regimenCorrection: string;
  correctionReason: string;
}

export function usePrescription() {
  const [state, setState] = useState<PrescriptionState>({
    loading: false,
    error: null,
    consultations: [],
    diagnoses: [],
    analyses: [],
    patientContexts: [],
    activeConsultation: null,
    activeAnalysis: null,
    activePatientContext: null,
    step: 0,
    diagnosisContext: "",
    diagnosisConfirmed: false,
    approvalStatus: "idle",
    rejectionReason: "",
    medicineCorrection: "",
    proposedDose: "",
    regimenCorrection: "",
    correctionReason: "",
  });

  // ── Load all data from backend ───────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [consultations, diagnoses, analyses, patientContexts] = await Promise.all([
        fetchConsultations(),
        fetchDiagnoses(),
        fetchAnalyses(),
        fetchPatientContexts(),
      ]);

      // Auto-select the latest consultation
      const latest = consultations.length > 0 ? consultations[0] : null;
      const linkedAnalysis = latest
        ? analyses.find((a) => a.consultation === latest.id) ?? null
        : null;
      const linkedContext = latest
        ? patientContexts.find((c) => c.patient === latest.patient) ?? null
        : null;

      setState((s) => ({
        ...s,
        loading: false,
        consultations,
        diagnoses,
        analyses,
        patientContexts,
        activeConsultation: latest,
        activeAnalysis: linkedAnalysis,
        activePatientContext: linkedContext,
        // Pre-fill diagnosis if already confirmed for this consultation
        diagnosisContext:
          diagnoses.find((d) => d.consultation === latest?.id)?.condition_label ?? "",
        diagnosisConfirmed: diagnoses.some((d) => d.consultation === latest?.id),
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load prescription data.",
      }));
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Select a consultation ────────────────────────────────────────────────
  const selectConsultation = useCallback(
    (id: string) => {
      const found = state.consultations.find((c) => c.id === id) ?? null;
      const linkedAnalysis = found
        ? state.analyses.find((a) => a.consultation === found.id) ?? null
        : null;
      const linkedContext = found
        ? state.patientContexts.find((c) => c.patient === found.patient) ?? null
        : null;
      setState((s) => ({
        ...s,
        activeConsultation: found,
        activeAnalysis: linkedAnalysis,
        activePatientContext: linkedContext,
        diagnosisContext:
          state.diagnoses.find((d) => d.consultation === found?.id)?.condition_label ?? "",
        diagnosisConfirmed: state.diagnoses.some((d) => d.consultation === found?.id),
        approvalStatus: "idle",
        step: 0,
      }));
    },
    [state.consultations, state.analyses, state.patientContexts, state.diagnoses]
  );

  // ── Confirm diagnosis ────────────────────────────────────────────────────
  const confirmDiagnosis = useCallback(async () => {
    if (!state.activeConsultation || !state.diagnosisContext.trim()) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const saved = await createDiagnosis({
        consultation: state.activeConsultation.id,
        doctor: state.activeConsultation.doctor,
        condition_code: "MANUAL",
        condition_label: state.diagnosisContext.trim(),
        analysis_reference: state.activeAnalysis?.analysis_reference ?? null,
      });
      setState((s) => ({
        ...s,
        loading: false,
        diagnoses: [...s.diagnoses, saved],
        diagnosisConfirmed: true,
        step: 2,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to confirm diagnosis.",
      }));
    }
  }, [state.activeConsultation, state.diagnosisContext, state.activeAnalysis]);

  // ── Approve prescription ─────────────────────────────────────────────────
  const approvePrescription = useCallback(() => {
    setState((s) => ({ ...s, approvalStatus: "approved", step: 4 }));
  }, []);

  // ── Reject prescription ──────────────────────────────────────────────────
  const rejectPrescription = useCallback(() => {
    setState((s) => ({ ...s, approvalStatus: "rejected" }));
  }, []);

  // ── Generic field setter ─────────────────────────────────────────────────
  const setField = useCallback(
    <K extends keyof PrescriptionState>(key: K, value: PrescriptionState[K]) => {
      setState((s) => ({ ...s, [key]: value }));
    },
    []
  );

  return {
    ...state,
    loadAll,
    selectConsultation,
    confirmDiagnosis,
    approvePrescription,
    rejectPrescription,
    setField,
  };
}

