"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ApiError, getSession } from "@/lib/api";
import { conditionLabel, readComponent1Payload, suggestedDiagnosis, type DemoScenario } from "./analysisData";
import {
  fetchPatients, fetchConsultations, fetchDiagnoses, fetchAnalyses, fetchPatientContexts,
  createConsultation, createDiagnosis, savePatientContext, loadDemoAnalysis,
  type RegisteredPatient, type Consultation, type DiagnosisConfirmation,
  type ConsultationAnalysis, type PatientContext, type PatientContextReview,
} from "./prescriptionApi";

export type WorkflowStep = 0 | 1 | 2 | 3 | 4;

export interface PrescriptionState {
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
  patients: RegisteredPatient[];
  consultations: Consultation[];
  diagnoses: DiagnosisConfirmation[];
  analyses: ConsultationAnalysis[];
  patientContexts: PatientContext[];
  activePatient: RegisteredPatient | null;
  activeConsultation: Consultation | null;
  activeAnalysis: ConsultationAnalysis | null;
  activePatientContext: PatientContext | null;
  step: WorkflowStep;
  diagnosisContext: string;
  diagnosisConfirmed: boolean;
  approvalStatus: "idle" | "approved" | "rejected";
  rejectionReason: string;
  medicineCorrection: string;
  proposedDose: string;
  regimenCorrection: string;
  correctionReason: string;
}

const emptyReview = {
  step: 0 as WorkflowStep,
  diagnosisContext: "",
  diagnosisConfirmed: false,
  approvalStatus: "idle" as const,
  rejectionReason: "",
  medicineCorrection: "",
  proposedDose: "",
  regimenCorrection: "",
  correctionReason: "",
};

const initialState: PrescriptionState = {
  ...emptyReview,
  loading: true,
  error: null,
  accessDenied: false,
  patients: [],
  consultations: [],
  diagnoses: [],
  analyses: [],
  patientContexts: [],
  activePatient: null,
  activeConsultation: null,
  activeAnalysis: null,
  activePatientContext: null,
};

function selectEncounter(
  state: PrescriptionState, patient: RegisteredPatient | null, encounter: Consultation | null
): PrescriptionState {
  const diagnosis = state.diagnoses.find((item) => item.consultation === encounter?.id);
  const analysis = state.analyses.find((item) => item.consultation === encounter?.id) ?? null;
  return {
    ...state, ...emptyReview,
    activePatient: patient,
    activeConsultation: encounter,
    activeAnalysis: analysis,
    activePatientContext: state.patientContexts.find((item) => item.patient === patient?.id) ?? null,
    diagnosisContext: diagnosis?.condition_label ?? (analysis ? suggestedDiagnosis(analysis.payload) : ""),
    diagnosisConfirmed: !!diagnosis,
  };
}

export function usePrescription(requestedConsultation?: string) {
  const [state, setState] = useState<PrescriptionState>(initialState);
  const selectionKey = useRef<string | null>(null);
  const saving = useRef(false);
  const loadSequence = useRef(0);
  const requestedVisit = useRef(requestedConsultation);

  const rememberEncounter = useCallback((encounter: Consultation | null) => {
    if (!selectionKey.current) return;
    if (encounter) sessionStorage.setItem(selectionKey.current, encounter.id);
    else sessionStorage.removeItem(selectionKey.current);
    // Keep reload/retry aligned with an explicit selection after an appointment handoff.
    requestedVisit.current = encounter?.id;
    const url = new URL(window.location.href);
    if (encounter) url.searchParams.set("consultation", encounter.id);
    else url.searchParams.delete("consultation");
    window.history.replaceState(null, "", url);
  }, []);

  const loadAll = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { user } = await getSession();
      if (sequence !== loadSequence.current) return;
      if (user) localStorage.setItem("meditrack_user", JSON.stringify(user));
      else localStorage.removeItem("meditrack_user");
      window.dispatchEvent(new Event("storage"));
      if (!user) throw new ApiError("Sign in with your approved doctor account to open patient encounters.", 401);
      if (user.role !== "doctor") throw new ApiError("This workspace requires an approved doctor account.", 403);
      selectionKey.current = "meditrack_active_encounter_" + user.id;
      const [patients, consultations, diagnoses, analyses, patientContexts] = await Promise.all([
        fetchPatients(), fetchConsultations(), fetchDiagnoses(), fetchAnalyses(), fetchPatientContexts(),
      ]);
      if (sequence !== loadSequence.current) return;
      const hasHandoff = requestedVisit.current !== undefined;
      const selectedId = hasHandoff ? requestedVisit.current : sessionStorage.getItem(selectionKey.current);
      const encounter = consultations.find((item) => item.id === selectedId && item.doctor === user.id) ?? null;
      const patient = patients.find((item) => item.id === encounter?.patient) ?? null;
      setState(selectEncounter({
        ...initialState, loading: false, patients, consultations, diagnoses, analyses, patientContexts,
        error: hasHandoff && (!encounter || !patient)
          ? "The requested consultation is unavailable for your account. Select an assigned patient and visit."
          : null,
      }, patient, patient ? encounter : null));
      if (patient && encounter) sessionStorage.setItem(selectionKey.current, encounter.id);
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      selectionKey.current = null;
      setState({
        ...initialState, loading: false,
        error: err instanceof Error ? err.message : "Failed to load prescription data.",
        accessDenied: err instanceof ApiError && [401, 403].includes(err.status),
      });
    }
  }, []);

  const invalidateLoads = useCallback(() => { ++loadSequence.current; }, []);

  useEffect(() => {
    void loadAll();
    return invalidateLoads;
  }, [loadAll, invalidateLoads]);

  const receiveAnalysis = useCallback((analysis: ConsultationAnalysis) => {
    setState((s) => {
      if (s.activeConsultation?.id !== analysis.consultation || s.activeAnalysis) return s;
      return {
        ...s, activeAnalysis: analysis,
        analyses: [analysis, ...s.analyses.filter((item) => item.consultation !== analysis.consultation)],
        diagnosisContext: s.diagnosisContext.trim() ? s.diagnosisContext : suggestedDiagnosis(analysis.payload),
      };
    });
  }, []);

  const handleAnalysisError = useCallback((err: unknown) => {
    if (err instanceof ApiError && [401, 403].includes(err.status)) {
      setState({ ...initialState, loading: false, accessDenied: true, error: err.message });
    }
  }, []);

  const refreshAnalysis = useCallback(async () => {
    const id = state.activeConsultation?.id;
    if (!id) return;
    try {
      const results = await fetchAnalyses(id);
      if (results[0]) receiveAnalysis(results[0]);
    } catch (err) {
      handleAnalysisError(err);
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : "Unable to refresh the analysis result." }));
    }
  }, [state.activeConsultation?.id, receiveAnalysis, handleAnalysisError]);

  useEffect(() => {
    const id = state.activeConsultation?.id;
    if (!id || state.activeAnalysis || state.diagnosisConfirmed) return;
    let cancelled = false;
    let pending = false;
    function check() {
      if (cancelled || pending || document.hidden) return;
      pending = true;
      void fetchAnalyses(id!).then((results) => {
        if (!cancelled && results[0]) receiveAnalysis(results[0]);
      }).catch((err: unknown) => {
        if (!cancelled) handleAnalysisError(err);
      }).finally(() => { pending = false; });
    }
    check();
    const interval = window.setInterval(check, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [state.activeConsultation?.id, state.activeAnalysis, state.diagnosisConfirmed, receiveAnalysis, handleAnalysisError]);

  const loadDemo = useCallback(async (scenario: DemoScenario) => {
    if (!state.activeConsultation || state.loading || saving.current) return;
    saving.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const saved = await loadDemoAnalysis(state.activeConsultation.id, scenario);
      receiveAnalysis(saved);
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      const accessDenied = err instanceof ApiError && [401, 403].includes(err.status);
      setState((s) => ({
        ...(accessDenied ? initialState : s), loading: false, accessDenied,
        error: err instanceof Error ? err.message : "Unable to load the analysis result.",
      }));
    } finally { saving.current = false; }
  }, [state.activeConsultation, state.loading, receiveAnalysis]);

  const selectPatient = useCallback((id: number) => {
    if (state.loading) return;
    const patient = state.patients.find((item) => item.id === id) ?? null;
    const encounter = state.consultations.find((item) => item.patient === patient?.id) ?? null;
    rememberEncounter(encounter);
    setState((s) => selectEncounter({ ...s, error: null }, patient, encounter));
  }, [state.loading, state.patients, state.consultations, rememberEncounter]);

  const selectConsultation = useCallback((id: string) => {
    if (state.loading) return;
    const encounter = state.consultations.find(
      (item) => item.id === id && item.patient === state.activePatient?.id
    ) ?? null;
    rememberEncounter(encounter);
    setState((s) => selectEncounter({ ...s, error: null }, s.activePatient, encounter));
  }, [state.loading, state.activePatient, state.consultations, rememberEncounter]);

  const startConsultation = useCallback(async (reason: string): Promise<boolean> => {
    if (!state.activePatient || !reason.trim() || saving.current) return false;
    saving.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const saved = await createConsultation({ patient: state.activePatient.id, reason: reason.trim() });
      rememberEncounter(saved);
      setState((s) => selectEncounter({
        ...s, loading: false, consultations: [saved, ...s.consultations],
      }, s.activePatient, saved));
      return true;
    } catch (err) {
      const accessDenied = err instanceof ApiError && [401, 403].includes(err.status);
      setState((s) => ({
        ...(accessDenied ? initialState : s), loading: false, accessDenied,
        error: err instanceof Error ? err.message : "Failed to save the new visit. Please retry.",
      }));
      return false;
    } finally {
      saving.current = false;
    }
  }, [state.activePatient, rememberEncounter]);

  const confirmDiagnosis = useCallback(async () => {
    if (!state.activeConsultation || !state.diagnosisContext.trim() || state.loading) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const candidate = state.activeAnalysis ? readComponent1Payload(state.activeAnalysis.payload)?.condition_candidates.find(
        (item) => conditionLabel(item.code).toLowerCase() === state.diagnosisContext.trim().toLowerCase()
      ) : undefined;
      const saved = await createDiagnosis({
        consultation: state.activeConsultation.id,
        doctor: state.activeConsultation.doctor,
        condition_code: candidate?.code ?? "MANUAL",
        condition_label: state.diagnosisContext.trim(),
        analysis_reference: state.activeAnalysis?.analysis_reference ?? null,
      });
      setState((s) => ({
        ...s, loading: false, diagnoses: [saved, ...s.diagnoses],
        diagnosisConfirmed: true, step: 1,
      }));
    } catch (err) {
      const accessDenied = err instanceof ApiError && [401, 403].includes(err.status);
      setState((s) => ({
        ...(accessDenied ? initialState : s), loading: false, accessDenied,
        error: err instanceof Error ? err.message : "Failed to confirm diagnosis.",
      }));
    }
  }, [state.activeConsultation, state.diagnosisContext, state.activeAnalysis, state.loading]);

  const reviewPatientContext = useCallback(async (data: PatientContextReview): Promise<boolean> => {
    if (!state.activeConsultation || state.loading || saving.current) return false;
    saving.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const saved = await savePatientContext(state.activeConsultation.id, data);
      setState((s) => ({
        ...s, loading: false, activePatientContext: saved,
        activePatient: s.activePatient ? {
          ...s.activePatient, birthday: saved.date_of_birth, age_years: saved.age_years, dob_status: saved.dob_status,
        } : null,
        patients: s.patients.map((patient) => patient.id === saved.patient ? {
          ...patient, birthday: saved.date_of_birth, age_years: saved.age_years, dob_status: saved.dob_status,
        } : patient),
        patientContexts: [...s.patientContexts.filter((item) => item.patient !== saved.patient), saved],
        approvalStatus: "idle", medicineCorrection: "", proposedDose: "", regimenCorrection: "", correctionReason: "",
      }));
      return true;
    } catch (err) {
      const accessDenied = err instanceof ApiError && [401, 403].includes(err.status);
      setState((s) => ({
        ...(accessDenied ? initialState : s), loading: false, accessDenied,
        error: err instanceof Error ? err.message : "Unable to save patient information.",
      }));
      return false;
    } finally {
      saving.current = false;
    }
  }, [state.activeConsultation, state.loading]);

  const setField = useCallback(
    <K extends keyof PrescriptionState>(key: K, value: PrescriptionState[K]) => {
      setState((s) => ({ ...s, [key]: value }));
    }, []
  );

  return {
    ...state, loadAll, selectPatient, selectConsultation, startConsultation,
    loadDemo, refreshAnalysis,
    confirmDiagnosis, reviewPatientContext, setField,
  };
}

