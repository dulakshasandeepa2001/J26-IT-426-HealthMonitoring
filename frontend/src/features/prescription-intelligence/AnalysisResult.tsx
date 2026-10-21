"use client";

import { useState, type FormEvent } from "react";
import {
  FlaskConical,
  RefreshCw,
  Sparkles,
  Stethoscope,
  CheckCircle2,
  Check,
  AlertTriangle,
  Clock,
  HeartPulse,
  Activity,
  FileText,
  Copy,
  ChevronDown,
  ChevronUp,
  Loader2,
  Volume2
} from "lucide-react";
import type { usePrescription } from "./usePrescription";
import {
  conditionLabel,
  HANDOFF_CONDITIONS,
  readComponent1Payload,
  symptomDuration,
  type DemoScenario,
  type Member1Details
} from "./analysisData";
import { buttonStyle, controlStyle, Unavailable } from "./PageFrame";
import { Member1Report } from "./Member1Report";
import { clinicalAnalysisDetails, analysisRecordLabel } from "@/lib/productLanguage";

const QUICK_SCENARIOS: { label: string; value: DemoScenario; icon: string }[] = [
  { label: "Voice Demo · Flu A", value: "member1_influenza", icon: "🎙️" },
  { label: "Influenza", value: "influenza", icon: "🤒" },
  { label: "Chickenpox", value: "chickenpox", icon: "🔴" },
  { label: "Conjunctivitis", value: "member1_v21_viral_conjunctivitis", icon: "👁️" },
  { label: "Gastroenteritis", value: "member1_v21_viral_gastroenteritis", icon: "🤢" },
  { label: "Mumps", value: "member1_v21_mumps", icon: "🟣" },
  { label: "Measles", value: "member1_v21_measles", icon: "🔴" }
];

export function AnalysisResult({ rx }: { rx: ReturnType<typeof usePrescription> }) {
  const [scenario, setScenario] = useState<DemoScenario | "">("");
  const [showScenarioPicker, setShowScenarioPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const analysis = rx.activeAnalysis;
  const parsed = analysis ? readComponent1Payload(analysis.payload) : null;
  const linked =
    parsed &&
    Number(parsed.patient_id) === Number(rx.activePatient?.id) &&
    String(parsed.consultation_id) === String(rx.activeConsultation?.id) &&
    (parsed.schema_version === "1.0" || Number(parsed.doctor_id) === Number(rx.activeConsultation?.doctor));

  // Also check if payload has member1 directly
  const rawMember1 = (analysis?.payload?.member1 as Member1Details | undefined) || parsed?.member1;

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scenario) {
      await rx.loadDemo(scenario);
      setShowScenarioPicker(false);
    }
  }

  async function loadDirect(scen: DemoScenario) {
    setScenario(scen);
    await rx.loadDemo(scen);
    setShowScenarioPicker(false);
  }

  async function handleCopyJson() {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(clinicalAnalysisDetails(analysis.payload), null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  // Top candidate for non-member1 payloads
  const topCandidate = parsed?.condition_candidates?.length
    ? parsed.condition_candidates.reduce((best, curr) => (curr.confidence > best.confidence ? curr : best))
    : null;

  const isApplied = topCandidate
    ? rx.diagnosisContext.trim().toLowerCase() === conditionLabel(topCandidate.code).trim().toLowerCase() ||
      rx.diagnosisContext.trim().toLowerCase() === topCandidate.code.trim().toLowerCase()
    : false;

  return (
    <div className="space-y-4">
      {/* ── Demo Scenario Switcher Banner (when active) ── */}
      {rx.activeConsultation?.is_demo && analysis && !rx.diagnosisConfirmed && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3.5 py-2 text-xs text-indigo-900">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-indigo-600" />
            <span className="font-semibold">Interactive Demo Mode</span>
          </div>
          <button
            type="button"
            onClick={() => setShowScenarioPicker((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50"
          >
            <RefreshCw className="h-3 w-3" />
            {showScenarioPicker ? "Hide Scenarios" : "Switch Scenario"}
          </button>
        </div>
      )}

      {/* ── Scenario Selection Form ── */}
      {rx.activeConsultation?.is_demo && (!analysis || showScenarioPicker) && (
        <form
          onSubmit={load}
          className="space-y-3.5 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-white p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-bold text-indigo-950">
              <FlaskConical className="h-4 w-4 text-purple-600" aria-hidden="true" />
              Load Clinical Voice &amp; Diagnosis Scenario
            </p>
            <span className="rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
              Interactive Testbench
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Pick a simulated voice encounter to test AI transcription, entity extraction, safety filtering, and ranking.
          </p>

          {/* Quick Scenario Pills */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-slate-700">Quick-load condition:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SCENARIOS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={rx.loading || rx.diagnosisConfirmed}
                  onClick={() => loadDirect(item.value)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all ${
                    scenario === item.value
                      ? "border-purple-600 bg-purple-600 text-white shadow-2xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <label htmlFor="demo-scenario" className="block text-xs font-semibold text-slate-700">
              All available scenarios
            </label>
            <select
              id="demo-scenario"
              className={controlStyle}
              value={scenario}
              disabled={rx.loading || rx.diagnosisConfirmed}
              onChange={(event) => setScenario(event.target.value as DemoScenario | "")}
            >
              <option value="">Select an analysis scenario</option>
              <option value="influenza">Influenza</option>
              <option value="chickenpox">Chickenpox</option>
              <option value="member1_influenza">Influenza — voice analysis</option>
              {HANDOFF_CONDITIONS.map((code) => (
                <option key={code} value={`member1_v21_${code}`}>
                  Clinical analysis — {conditionLabel(code)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={`${buttonStyle} bg-purple-600 text-white hover:bg-purple-700 hover:text-white`}
              disabled={rx.loading || rx.diagnosisConfirmed || !scenario}
            >
              {rx.loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading scenario...
                </>
              ) : (
                <>
                  <FlaskConical className="h-3.5 w-3.5" />
                  Load analysis
                </>
              )}
            </button>
          </div>

          {rx.diagnosisConfirmed && (
            <p className="text-xs font-semibold text-amber-800">
              Diagnosis is already confirmed. Start a new research visit to load another analysis.
            </p>
          )}
        </form>
      )}

      {/* ── Empty State ── */}
      {!analysis ? (
        <Unavailable title="Structured voice-analysis result unavailable">
          {rx.activeConsultation
            ? "Awaiting the consultation analysis. New results appear automatically while this visit is open."
            : "Select a consultation to load its analysis result."}
        </Unavailable>
      ) : rawMember1 ? (
        /* ── Rich Voice Analysis UI (Member 1 format) ── */
        <Member1Report
          details={rawMember1}
          onUseDiagnosis={(diag) => rx.setField("diagnosisContext", diag)}
          diagnosisConfirmed={rx.diagnosisConfirmed}
          currentDiagnosis={rx.diagnosisContext}
          referenceLabel={analysisRecordLabel(analysis.analysis_reference, analysis.id)}
          importedAt={analysis.imported_at}
        />
      ) : parsed && linked ? (
        /* ── Legacy / Standard Schema 1.0 UI ── */
        <div className="space-y-4 text-xs leading-relaxed">
          {/* Header Bar */}
          <div className="overflow-hidden rounded-2xl border border-indigo-800/40 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 text-white shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-7 items-end gap-1 rounded-lg bg-white/10 px-2 py-1">
                  <span className="h-3 w-1 animate-pulse rounded-full bg-teal-400" />
                  <span className="h-5 w-1 animate-pulse rounded-full bg-teal-300" />
                  <span className="h-2 w-1 animate-pulse rounded-full bg-cyan-400" />
                  <span className="h-6 w-1 animate-pulse rounded-full bg-teal-200" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Consultation Analysis Payload</h3>
                  <p className="text-[11px] text-slate-300">Format Schema {parsed.schema_version} · ML Handoff</p>
                </div>
              </div>
              <span className="rounded-full border border-teal-400/30 bg-teal-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-teal-300">
                Processed · Clinician Review Required
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">
              <span>
                Ref:{" "}
                <strong className="font-mono text-slate-200">
                  {analysisRecordLabel(analysis.analysis_reference, analysis.id)}
                </strong>
              </span>
              <span>
                Received: <strong className="text-slate-200">{new Date(analysis.imported_at).toLocaleString()}</strong>
              </span>
            </div>
          </div>

          {/* Primary Condition Candidate */}
          {topCandidate && (
            <div className="relative overflow-hidden rounded-2xl border-2 border-indigo-200 bg-white p-4 shadow-xs">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-purple-600 to-teal-400" />
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold text-purple-800">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Primary Candidate Condition
                </span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold capitalize">
                  {parsed.severity.level} Severity
                </span>
              </div>
              <h3 className="mt-2 text-base font-extrabold text-slate-900">{conditionLabel(topCandidate.code)}</h3>

              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-600">Model Confidence</span>
                  <span className="font-extrabold text-emerald-600">
                    {new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(
                      topCandidate.confidence
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{ width: `${Math.round(topCandidate.confidence * 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="text-[11px] text-slate-500">
                  {rx.diagnosisConfirmed ? "Confirmed by Doctor in Step 2" : "Doctor confirmation required"}
                </span>
                {!rx.diagnosisConfirmed && (
                  <button
                    type="button"
                    onClick={() => rx.setField("diagnosisContext", conditionLabel(topCandidate.code))}
                    className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-purple-700"
                  >
                    {isApplied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Pre-filled in Step 2
                      </>
                    ) : (
                      <>
                        <Stethoscope className="h-3.5 w-3.5" />
                        Use as Diagnosis
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Reported Symptoms */}
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 font-bold text-slate-800">
              <HeartPulse className="h-3.5 w-3.5 text-purple-600" />
              Reported Symptoms ({parsed.symptoms.length})
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {parsed.symptoms.map((symptom) => (
                <div key={symptom.code} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 capitalize">{symptom.code.replaceAll("_", " ")}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        symptom.present
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {symptom.present === null ? "Unknown" : symptom.present ? "Present" : "Absent"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{symptomDuration(symptom)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Red flags */}
          {parsed.severity.red_flags.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4" />
                Reported Red Flags
              </p>
              <ul className="mt-1.5 list-inside list-disc">
                {parsed.severity.red_flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-emerald-900">
              <p className="font-semibold">🛡️ No red flags flagged in payload.</p>
            </div>
          )}

          {/* Technical JSON details */}
          <details className="group rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                View Clinical Analysis Details
              </span>
              <span className="text-[11px] text-purple-600 group-open:hidden">View JSON</span>
            </summary>
            <div className="mt-2 space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  {copied ? "Copied!" : "Copy JSON"}
                </button>
              </div>
              <pre className="max-h-60 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
                {JSON.stringify(clinicalAnalysisDetails(analysis.payload), null, 2)}
              </pre>
            </div>
          </details>
        </div>
      ) : (
        /* ── Fallback for raw / non-standard JSON payload ── */
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-800">Consultation Analysis Payload</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              {analysisRecordLabel(analysis.analysis_reference, analysis.id)}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Received at {new Date(analysis.imported_at).toLocaleString()}. Structured details are shown below.
          </p>
          <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
            {JSON.stringify(clinicalAnalysisDetails(analysis.payload), null, 2)}
          </pre>
        </div>
      )}

      {rx.activeConsultation && !analysis && !rx.diagnosisConfirmed && (
        <button type="button" className={buttonStyle} onClick={rx.refreshAnalysis} disabled={rx.loading}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh analysis result
        </button>
      )}
    </div>
  );
}
