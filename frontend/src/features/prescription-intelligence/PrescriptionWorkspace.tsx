"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, FileText, FlaskConical, Loader2, Mic, RefreshCw, Stethoscope, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { usePrescription } from "./usePrescription";
import { EncounterSelector } from "./EncounterSelector";
import { PatientContextForm, type PatientHistoryEditorHandle } from "./PatientContextForm";
import { AnalysisResult } from "./AnalysisResult";
import { SixConditionDraftFlow } from "./SixConditionDraftFlow";
import { DoctorPrescriptionPad, usePrescriptionPadState } from "./DoctorPrescriptionPad";
import { SmartMedicineRanker } from "./SmartMedicineRanker";
import { controlStyle, PageFrame, Section, Unavailable } from "./PageFrame";

function Badge({ label, variant }: { label: string; variant: "green" | "amber" | "rose" | "slate" }) {
  const colours = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${colours[variant]}`}>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PrescriptionWorkspace({ requestedConsultation }: { requestedConsultation?: string }) {
  const rx = usePrescription(requestedConsultation);
  const padState = usePrescriptionPadState(rx);
  const [showAiRanker, setShowAiRanker] = useState(false);
  const historyEditor = useRef<PatientHistoryEditorHandle>(null);
  const [clinicalHost, setClinicalHost] = useState<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<"pad" | "screening">("pad");
  const reviewHistory = useCallback(() => historyEditor.current?.open(), []);

  // Derived flags
  const hasConsultation = !!rx.activeConsultation;
  const canConfirm = hasConsultation && rx.diagnosisContext.trim().length > 0 && !rx.diagnosisConfirmed;
  const diagnosis = rx.diagnoses.find((item) => item.consultation === rx.activeConsultation?.id);
  const screeningKey = JSON.stringify([rx.activeConsultation?.id, rx.activePatient?.id, rx.activePatient?.birthday, rx.activeAnalysis?.payload, diagnosis]);

  return (
    <PageFrame
      title="Prescription Workspace"
      description="Use the encounter-linked analysis and clinician-confirmed diagnosis to save a prescription screening draft, with recorded clinical inputs, evidence and version history."
    >
      {rx.error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Backend error</p>
            <p className="mt-0.5">{rx.error}</p>
            {rx.accessDenied && <Link href="/login" className="mt-2 inline-block font-bold underline">Sign in as a doctor</Link>}
          </div>
          <button type="button" onClick={rx.loadAll} className="ml-auto inline-flex items-center gap-1 font-bold hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {rx.loading && (
        <div className="flex items-center gap-2 text-xs text-purple-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading prescription data…
        </div>
      )}

      {/* ── Step 1 · Encounter / consultation selector ── */}
      <Section title="Patient and encounter" icon={Stethoscope}>
        <EncounterSelector key={rx.activePatient?.id ?? "none"} rx={rx} />
      </Section>

      <Section id="patient-medicine-history" title="Patient information" icon={ClipboardCheck} className="scroll-mt-24">
        {hasConsultation && rx.activePatient ? (
          <PatientContextForm key={`${rx.activeConsultation!.id}:${rx.activePatientContext?.updated_at ?? "new"}`} rx={rx} editorRef={historyEditor} />
        ) : (
          <Unavailable title="Select a patient and visit first">Choose an assigned patient and saved consultation to record allergies and current medicines.</Unavailable>
        )}
        <div id="patient-clinical-inputs" ref={setClinicalHost} className={viewMode === "screening" ? "mt-5 scroll-mt-24" : "hidden"} />
      </Section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {/* ── Step 1 · Voice analysis result ── */}
        <Section title="Structured voice-analysis result" icon={Mic}>
          <AnalysisResult key={rx.activeConsultation?.id ?? "none"} rx={rx} />
        </Section>

        {/* ── Step 2 · Clinician diagnosis confirmation ── */}
        <Section title="Clinician diagnosis confirmation" icon={Stethoscope}>
          <fieldset aria-describedby="diagnosis-confirmation-help" className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="diagnosis-context" className="text-xs font-semibold text-slate-700">
                Diagnosis context
                {rx.diagnosisConfirmed && <Badge label="Confirmed" variant="green" />}
              </label>
              <input
                id="diagnosis-context"
                placeholder={hasConsultation ? "Enter or correct the proposed diagnosis" : "Awaiting encounter selection"}
                className={controlStyle}
                disabled={!hasConsultation || rx.diagnosisConfirmed}
                value={rx.diagnosisContext}
                onChange={(e) => rx.setField("diagnosisContext", e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-purple-600"
                checked={rx.diagnosisConfirmed}
                disabled={!canConfirm}
                onChange={() => {
                  if (canConfirm) rx.confirmDiagnosis();
                }}
              />
              I confirm the diagnosis context for this authorized patient encounter.
            </label>
            {canConfirm && (
              <button
                type="button"
                onClick={rx.confirmDiagnosis}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                disabled={rx.loading}
              >
                {rx.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm Diagnosis
              </button>
            )}
          </fieldset>
          <p id="diagnosis-confirmation-help" className="mt-4 text-xs leading-relaxed text-slate-500">
            Review and correct the structured diagnosis context, then confirm it before generation.
            A changed diagnosis requires renewed confirmation. All six handoff conditions have a screening pathway; medicine availability still depends on reviewed coverage and independently verified patient information.
          </p>
        </Section>
      </div>

      {/* ── AI Clinical Medicine Ranking Trigger (Placed directly ABOVE Doctor's Prescription Pad button) ── */}
      <div className="mt-8 rounded-3xl border border-indigo-200/80 bg-gradient-to-r from-purple-50/80 via-indigo-50/50 to-white p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white shadow-md">
              <Sparkles className="h-5 w-5 text-amber-300" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  AI Clinical Medicine Ranking &amp; Recommendation
                </h3>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">
                  Specialized ML Model
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Random Forest Regressor (96.4% Precision) trained on 215,000+ reviews for{" "}
                <span className="font-bold text-purple-900">{padState.activeDiagnosis}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            id="ai-medicine-ranking-toggle-btn"
            onClick={() => setShowAiRanker((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all shadow-md active:scale-95 ${
              showAiRanker
                ? "bg-purple-900 text-white ring-2 ring-purple-400 shadow-purple-200"
                : "bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 text-white hover:from-purple-800 hover:to-indigo-700 shadow-purple-200"
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span>AI Clinical Medicine Ranking</span>
            {showAiRanker ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Ranking items appear ONLY when the button is clicked */}
        {showAiRanker && (
          <div className="mt-4 pt-4 border-t border-indigo-100/80 animate-fadeIn">
            <SmartMedicineRanker
              condition={padState.activeDiagnosis}
              patientId={rx.activePatient?.id}
              patientAge={rx.activePatient?.age_years}
              severity={
                rx.activeAnalysis?.payload
                  ? ((rx.activeAnalysis.payload as Record<string, unknown>)?.severity as Record<string, unknown>)?.assessed_severity as string || "moderate"
                  : "moderate"
              }
              allergies={rx.activePatientContext?.allergies || []}
              redFlags={padState.redFlags}
              disabled={padState.status === "approved"}
              onApplyAll={padState.handleApplyAllRanked}
              onAddOne={padState.handleAddOneRanked}
              currentMedicineNames={padState.medicines.map((m) => m.name)}
            />
          </div>
        )}
      </div>

      {/* ── Prescription Experience Tabs ── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("pad")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
              viewMode === "pad"
                ? "bg-purple-900 text-white ring-2 ring-purple-600/50"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <FileText className="h-4 w-4" /> Doctor&apos;s Prescription Pad (Single Page Rx)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("screening")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
              viewMode === "screening"
                ? "bg-purple-900 text-white ring-2 ring-purple-600/50"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <FlaskConical className="h-4 w-4" /> Algorithmic Screening Engine (Rule Inspector)
          </button>
        </div>

        <span className="text-[11px] font-medium text-slate-400">
          {viewMode === "pad"
            ? "Full clinician control · Non-blocking editable prescription"
            : "Automated knowledge-base checks"}
        </span>
      </div>

      {/* ── View 1: Doctor's Prescription Pad (Rx Slip) ── */}
      {viewMode === "pad" && (
        <DoctorPrescriptionPad rx={rx} padState={padState} />
      )}

      {/* ── View 2: Algorithmic Screening Engine (Rule Inspector) ── */}
      {viewMode === "screening" && (
        <SixConditionDraftFlow key={screeningKey} rx={rx} onReviewHistory={reviewHistory} clinicalHost={clinicalHost} />
      )}

    </PageFrame>
  );
}
