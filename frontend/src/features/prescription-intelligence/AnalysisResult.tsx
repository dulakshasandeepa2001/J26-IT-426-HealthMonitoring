"use client";

import { useState, type FormEvent } from "react";
import { FlaskConical, RefreshCw } from "lucide-react";
import type { usePrescription } from "./usePrescription";
import { conditionLabel, HANDOFF_CONDITIONS, readComponent1Payload, symptomDuration, type DemoScenario } from "./analysisData";
import { buttonStyle, controlStyle, Unavailable } from "./PageFrame";
import { Member1Report } from "./Member1Report";

export function AnalysisResult({ rx }: { rx: ReturnType<typeof usePrescription> }) {
  const [scenario, setScenario] = useState<DemoScenario | "">("");
  const analysis = rx.activeAnalysis;
  const parsed = analysis ? readComponent1Payload(analysis.payload) : null;
  const linked = parsed && parsed.patient_id === rx.activePatient?.id && parsed.consultation_id === rx.activeConsultation?.id
    && (parsed.schema_version === "1.0" || parsed.doctor_id === rx.activeConsultation?.doctor);

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scenario) await rx.loadDemo(scenario);
  }

  return (
    <div className="space-y-4">
      {rx.activeConsultation?.is_demo && !analysis && (
        <form onSubmit={load} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-amber-900"><FlaskConical className="h-4 w-4" aria-hidden="true" />Component 1 demo result</p>
          <p className="text-xs leading-relaxed text-amber-900">Choose one of the supplied JSON examples. This loads synthetic sample data for this demo visit.</p>
          <label htmlFor="demo-scenario" className="block text-xs font-semibold text-slate-700">Demo analysis scenario</label>
          <select id="demo-scenario" className={controlStyle} value={scenario} disabled={rx.loading || rx.diagnosisConfirmed}
            onChange={(event) => setScenario(event.target.value as DemoScenario | "")}>
            <option value="">Select a demo scenario</option>
            <option value="influenza">Influenza</option>
            <option value="chickenpox">Chickenpox</option>
            <option value="member1_influenza">Member 1 — Influenza voice JSON</option>
            {HANDOFF_CONDITIONS.map((code) => <option key={code} value={`member1_v21_${code}`}>Member 1 v2.1 — {conditionLabel(code)}</option>)}
          </select>
          <button type="submit" className={buttonStyle} disabled={rx.loading || rx.diagnosisConfirmed || !scenario}>Load demo analysis</button>
          {rx.diagnosisConfirmed && <p className="text-xs text-amber-900">Diagnosis is already confirmed. Start a new demo visit to load another analysis.</p>}
        </form>
      )}

      {!analysis ? (
        <Unavailable title="Structured voice-analysis result unavailable">
          {rx.activeConsultation ? "Awaiting an encounter-linked Component 1 result. New results appear automatically while this visit is open." : "Select a consultation to load its analysis result."}
        </Unavailable>
      ) : (
        <>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="font-semibold text-slate-600">Analysis reference</dt><dd className="mt-1 break-all">{analysis.analysis_reference}</dd></div>
            <div><dt className="font-semibold text-slate-600">Received at</dt><dd className="mt-1">{new Date(analysis.imported_at).toLocaleString()}</dd></div>
          </dl>
          {parsed && linked ? (
            <>
              <div className={`rounded-2xl border p-3 text-xs ${parsed.is_demo ? "border-amber-200 bg-amber-50 text-amber-900" : "border-purple-200 bg-purple-50 text-purple-900"}`}>
                <p className="font-bold">{parsed.is_demo ? "Synthetic demo data — supplied JSON sample" : "Component 1 result — clinician review required"}</p>
                <p className="mt-1">Model version: {parsed.model_version}</p>
                <p className="mt-1">Handoff schema: {parsed.schema_version}</p>
                <p className="mt-1">{parsed.is_demo ? "The scores are fixed sample values, not measured model performance." : "Reported model scores require clinician interpretation."}</p>
                <p className="mt-1">{rx.diagnosisConfirmed ? "Doctor diagnosis confirmation is saved separately." : "Diagnosis has not been confirmed by the doctor."}</p>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-700">Reported symptoms</h3>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {parsed.symptoms.map((symptom) => <li key={symptom.code} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-2.5">
                    <span className="capitalize">{symptom.code.replaceAll("_", " ")} · {symptom.present === null ? "Unknown" : symptom.present ? "Present" : "Not present"}</span>
                    <span>{symptomDuration(symptom)}</span>
                  </li>)}
                </ul>
                {!parsed.symptoms.length && <p className="mt-2 text-xs text-amber-800">No symptoms could be mapped to the pilot codes. Review the producer details and clarification messages.</p>}
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-700">Condition candidates — unconfirmed</h3>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {parsed.condition_candidates.map((candidate) => <li key={candidate.code} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 p-2.5">
                    <span className="font-semibold">{conditionLabel(candidate.code)}</span>
                    <span>{parsed.is_demo ? "Sample confidence" : "Reported model score"}: {new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(candidate.confidence)}</span>
                  </li>)}
                </ul>
                {!parsed.condition_candidates.length && <p className="mt-2 text-xs text-amber-800">No supported primary condition candidate. Review the reported diagnosis manually.</p>}
              </div>
              <p className="text-xs text-slate-600">Reported severity: <span className="font-semibold capitalize">{parsed.severity.level}</span></p>
              {parsed.severity.red_flags.length > 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <p className="font-bold">Reported red flags</p>
                  <ul className="mt-1 list-inside list-disc">{parsed.severity.red_flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
                </div>
              ) : <p className="text-xs text-slate-500">{parsed.member1?.red_flag_assessment === "not_assessed" ? "Red flags were not assessed in this output. Clinician assessment is required." : parsed.member1 ? "The producer reported an assessed red-flag list with no items. Clinician review is still required." : "No red flags were included in this payload."}</p>}
              {parsed.member1 && <Member1Report details={parsed.member1} />}
            </>
          ) : <p className="text-xs text-amber-800">{parsed ? "The payload IDs do not match this patient and visit." : "Saved analysis uses a legacy format. Its original payload is available below."}</p>}
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">View analysis JSON</summary>
            <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">{JSON.stringify(analysis.payload, null, 2)}</pre>
          </details>
        </>
      )}
      {rx.activeConsultation && !analysis && !rx.diagnosisConfirmed && <button type="button" className={buttonStyle} onClick={rx.refreshAnalysis} disabled={rx.loading}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh analysis result</button>}
    </div>
  );
}
