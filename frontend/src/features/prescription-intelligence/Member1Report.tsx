"use client";

import { useState } from "react";
import {
  Mic,
  Sparkles,
  Stethoscope,
  CheckCircle2,
  Check,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Pill,
  HeartPulse,
  Activity,
  Thermometer,
  Clock,
  Copy,
  FileText,
  Volume2,
  Info
} from "lucide-react";
import {
  BOOLEAN_OBSERVATIONS,
  conditionLabel,
  HANDOFF_CONDITIONS,
  type HandoffCondition,
  type Member1Details
} from "./analysisData";

const pilotCodes = ["influenza", "chickenpox"];

function percentage(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export interface Member1ReportProps {
  details: Member1Details;
  onUseDiagnosis?: (diagnosis: string) => void;
  diagnosisConfirmed?: boolean;
  currentDiagnosis?: string;
  referenceLabel?: string;
  importedAt?: string;
}

export function Member1Report({
  details,
  onUseDiagnosis,
  diagnosisConfirmed = false,
  currentDiagnosis = "",
  referenceLabel,
  importedAt,
}: Member1ReportProps) {
  const [copied, setCopied] = useState(false);
  const body = details.raw_output.payload;
  const primary = body.primary_diagnosis;
  const notes = body.extracted_clinical_notes;
  const v21 = details.adapter_version === "member1-v2.1.0";
  const supported = v21
    ? HANDOFF_CONDITIONS.includes(primary.condition_code.toLowerCase() as HandoffCondition)
    : pilotCodes.includes(primary.condition_code.toLowerCase());
  const facts = details.reported_assessments;
  const obsoleteWarning =
    "Analysis handoff is supported; medicine rules and the trained prescription model for this condition are not enabled.";
  const issues = details.mapping_issues.filter(
    (issue) => !(v21 && issue.field === "payload.primary_diagnosis.condition_code" && issue.reason === obsoleteWarning)
  );

  const isApplied =
    currentDiagnosis.trim().toLowerCase() === primary.condition_label.trim().toLowerCase() ||
    currentDiagnosis.trim().toLowerCase() === primary.condition_code.trim().toLowerCase();

  const confidencePct = Math.round((primary.confidence || 0) * 100);

  const durationSec = body.audio_metadata?.duration_seconds || 0;
  const durationLabel =
    durationSec > 0
      ? durationSec >= 60
        ? `${durationSec}s (${Math.floor(durationSec / 60)}m ${durationSec % 60}s)`
        : `${durationSec}s audio`
      : "Audio stream";

  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(body, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4 text-xs leading-relaxed">
      {/* ── 1. Audio Processing & Model Status Bar ── */}
      <div className="overflow-hidden rounded-2xl border border-indigo-800/40 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Animated Equalizer Waveform */}
            <div className="flex h-7 items-end gap-1 rounded-lg bg-white/10 px-2 py-1 backdrop-blur-xs">
              <span className="h-3 w-1 animate-pulse rounded-full bg-teal-400" />
              <span className="h-5 w-1 animate-pulse rounded-full bg-teal-300" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-1 animate-pulse rounded-full bg-cyan-400" style={{ animationDelay: "300ms" }} />
              <span className="h-6 w-1 animate-pulse rounded-full bg-teal-200" style={{ animationDelay: "75ms" }} />
              <span className="h-4 w-1 animate-pulse rounded-full bg-emerald-400" style={{ animationDelay: "225ms" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white sm:text-sm">Consultation Voice Stream</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/30 bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  NLP Extracted
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Whisper Speech-to-Text · {details.adapter_version || "Clinical Voice NLP v2.1"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-slate-200">
              <Clock className="h-3 w-3 text-teal-400" />
              {durationLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-slate-200">
              <Volume2 className="h-3 w-3 text-cyan-400" />
              {body.audio_metadata?.audio_quality || "Clear"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-slate-200">
              🌐 {body.audio_metadata?.language || "en-US"}
            </span>
          </div>
        </div>

        {/* Reference & Timestamp strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
          <span>
            Ref: <strong className="font-mono text-slate-200">{referenceLabel || "VOICE-AI-RECORD"}</strong>
          </span>
          <span>
            Recorded:{" "}
            <strong className="text-slate-200">
              {new Date(details.raw_output.timestamp).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}
            </strong>{" "}
            (SL Time)
          </span>
        </div>
      </div>

      {/* ── 2. Chief Complaint & Transcript Speech Quote ── */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 p-4 shadow-xs">
        {notes?.chief_complaint && (
          <div className="mb-2.5 flex items-start gap-2 rounded-xl border border-indigo-200/80 bg-indigo-100/60 px-3 py-2 text-indigo-950">
            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
            <div>
              <span className="font-bold text-indigo-900">Chief Complaint: </span>
              <span className="font-medium text-indigo-950">{notes.chief_complaint}</span>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5">
          <Mic className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Transcript Summary</p>
            <p className="mt-1 text-xs italic leading-relaxed text-slate-700">
              &ldquo;{body.transcript_summary}&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. Primary Suggested Diagnosis Hero Card ── */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-indigo-200 bg-white p-4.5 shadow-xs">
        <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-purple-600 via-indigo-600 to-teal-400" />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-purple-800">
            <Sparkles className="h-4 w-4 text-purple-600" />
            Suggested Primary Diagnosis
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {primary.icd_10_code && (
              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
                ICD-10: {primary.icd_10_code}
              </span>
            )}
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                primary.severity_level?.toLowerCase() === "severe"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : primary.severity_level?.toLowerCase() === "moderate"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {primary.severity_level || "Clinical"} Severity
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <h3 className="text-base font-extrabold tracking-tight text-slate-900">{primary.condition_label}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Diagnostic Code: <strong className="font-mono text-slate-700">{primary.condition_code}</strong>
          </p>
        </div>

        {/* Confidence Meter */}
        <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">AI Diagnostic Confidence</span>
            <span className="text-sm font-extrabold text-emerald-600">{percentage(primary.confidence)}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(5, confidencePct))}%` }}
            />
          </div>
        </div>

        {/* Doctor Pre-Fill Action Button */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="text-[11px] text-slate-500">
            {diagnosisConfirmed ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Confirmed by Doctor in Step 2
              </span>
            ) : isApplied ? (
              <span className="inline-flex items-center gap-1 font-semibold text-purple-700">
                <Check className="h-3.5 w-3.5 text-purple-600" />
                Pre-filled in Diagnosis Confirmation
              </span>
            ) : (
              "Clinician confirmation required before prescribing."
            )}
          </div>

          {onUseDiagnosis && !diagnosisConfirmed && (
            <button
              type="button"
              onClick={() => onUseDiagnosis(primary.condition_label)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                isApplied
                  ? "border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                  : "bg-purple-600 text-white shadow-xs hover:bg-purple-700"
              }`}
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

        {!supported && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
            Primary condition is outside the pilot set. Clinician must review and select safe therapies manually.
          </p>
        )}
      </div>

      {/* ── 4. Voice-Extracted Patient Record (Allergies, Meds, Vitals) ── */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-amber-950 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h4 className="text-xs font-bold text-amber-950">Voice-Extracted Clinical History</h4>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            Safety Ingestion
          </span>
        </div>
        <p className="mt-1 text-[11px] text-amber-900">
          Compare extracted allergies and current medicines with patient records. These items are auto-populated in
          Patient Information above.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* Allergies Card */}
          <div className="rounded-xl border border-rose-200 bg-white/90 p-3 shadow-2xs">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Patient-Reported Allergies
            </p>
            {notes?.patient_reported_allergies?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {notes.patient_reported_allergies.map((allergy, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    {allergy}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">None detected in voice stream</p>
            )}
          </div>

          {/* Current Medicines Card */}
          <div className="rounded-xl border border-indigo-200 bg-white/90 p-3 shadow-2xs">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-800">
              <Pill className="h-3.5 w-3.5 text-indigo-600" />
              Current Medications
            </p>
            {notes?.patient_current_medications?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {notes.patient_current_medications.map((med, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    {med}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">None detected in voice stream</p>
            )}
          </div>
        </div>

        {/* Mentioned Vitals */}
        {notes?.vital_signs_mentioned && Object.keys(notes.vital_signs_mentioned).length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/80 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <Activity className="h-3.5 w-3.5 text-purple-600" />
              Mentioned Vital Signs
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(notes.vital_signs_mentioned).map(([key, val]) => (
                <div
                  key={key}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                >
                  <Thermometer className="h-3 w-3 text-amber-600" />
                  <span className="font-semibold text-slate-600 capitalize">{key.replaceAll("_", " ")}:</span>
                  <span className="font-bold text-slate-900">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span>Synced with Patient Information above · Click &ldquo;Save to Patient Information&rdquo; to persist.</span>
        </div>
      </div>

      {/* ── 5. Extracted Symptoms & Clinical Timeline ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <HeartPulse className="h-3.5 w-3.5 text-purple-600" />
            Extracted Clinical Symptoms ({body.extracted_symptoms?.length || 0})
          </h4>
          <span className="text-[11px] text-slate-500">NLP Entity Extraction</span>
        </div>

        {body.extracted_symptoms && body.extracted_symptoms.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {body.extracted_symptoms.map((item, index) => {
              const isPresent = item.present ?? true;
              return (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition-colors hover:border-indigo-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-900">{item.symptom}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isPresent
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isPresent ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {isPresent ? "Present" : "Absent"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {item.duration && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {item.duration}
                      </span>
                    )}
                    {item.severity && item.severity !== "unknown" && (
                      <span
                        className={`rounded-md px-2 py-0.5 font-semibold capitalize ${
                          item.severity.toLowerCase() === "severe"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : item.severity.toLowerCase() === "moderate"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-sky-50 text-sky-700 border border-sky-200"
                        }`}
                      >
                        {item.severity}
                      </span>
                    )}
                    <span className="text-slate-400">Score: {percentage(item.confidence)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No symptoms extracted from voice stream.</p>
        )}
      </div>

      {/* ── 6. Differential Diagnoses Ranking ── */}
      {body.differential_diagnoses && body.differential_diagnoses.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Stethoscope className="h-3.5 w-3.5 text-indigo-600" />
              Differential Diagnoses ({body.differential_diagnoses.length})
            </h4>
            <span className="text-[11px] text-slate-500">Unconfirmed Alternatives</span>
          </div>

          <div className="space-y-2">
            {body.differential_diagnoses.map((item) => {
              const diffPct = Math.round(item.confidence * 100);
              return (
                <div
                  key={item.condition_code}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800">{item.condition_label}</p>
                      <p className="font-mono text-[11px] text-slate-500">{item.condition_code}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-700">{percentage(item.confidence)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, Math.max(5, diffPct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 7. Source-Reported Assessments & Physiological Findings ── */}
      {facts && (
        <details className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
          <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-purple-600" />
              Physiological Findings & Assessments (Voice Stream)
            </span>
            <span className="text-[11px] text-purple-600 group-open:hidden">View details</span>
          </summary>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-semibold text-slate-500">Dehydration Assessment</p>
              <p className="mt-0.5 text-xs font-bold text-slate-800 capitalize">
                {facts.dehydration_assessment || "Unknown"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-semibold text-slate-500">Oral Fluid Tolerance</p>
              <p className="mt-0.5 text-xs font-bold text-slate-800 capitalize">
                {facts.oral_fluid_tolerance?.replaceAll("_", " ") || "Unknown"}
              </p>
            </div>
            {facts.reported_onset_hours != null && (
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] font-semibold text-slate-500">Reported Onset</p>
                <p className="mt-0.5 text-xs font-bold text-slate-800">{facts.reported_onset_hours} hours</p>
              </div>
            )}
            {facts.reported_weight_kg != null && (
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] font-semibold text-slate-500">Reported Weight</p>
                <p className="mt-0.5 text-xs font-bold text-slate-800">{facts.reported_weight_kg} kg</p>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
            {BOOLEAN_OBSERVATIONS.filter((name) => facts[name] !== null).map((name) => (
              <div key={name} className="flex justify-between">
                <span className="capitalize">{name.replaceAll("_", " ")}:</span>
                <span className="font-semibold text-slate-800">
                  {facts[name] ? "Reported Present" : "Reported Absent"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── 8. Red Flags & Safety Warnings ── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-950">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-bold text-emerald-900">Safety & Red Flags Status</span>
        </div>
        <p className="mt-1 text-[11px] text-emerald-800">
          No acute red flags flagged by the voice model. Complete clinical assessment remains the doctor&apos;s
          responsibility.
        </p>
      </div>

      {/* ── 9. Suggested Treatment Categories ── */}
      {body.suggested_treatment_categories && body.suggested_treatment_categories.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-700">AI Treatment Category Guidance</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {body.suggested_treatment_categories.map((cat, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
              >
                <Pill className="h-3 w-3 text-purple-600" />
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── 10. Technical Raw Payload & Details ── */}
      <details className="group rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-800">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Structured Voice-Analysis Payload (Technical Audit)
          </span>
          <span className="text-[11px] text-purple-600 group-open:hidden">View JSON</span>
        </summary>
        <div className="mt-2.5 space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-slate-500" />
                  Copy JSON
                </>
              )}
            </button>
          </div>
          <pre className="max-h-60 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
            {JSON.stringify(body, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
