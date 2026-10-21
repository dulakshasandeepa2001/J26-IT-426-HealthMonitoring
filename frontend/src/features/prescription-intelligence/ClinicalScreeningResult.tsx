"use client";

import { useId } from "react";
import { FileText } from "lucide-react";
import { Section } from "./PageFrame";
import { conditionNames } from "./AdditionalMedicineScopes";
import { clinicalInputSummary } from "@/lib/productLanguage";
import type { ScreeningCandidate, ScreeningDraft, ScreeningRegimen, ScreeningResult } from "./clinicalScreeningApi";
import { blocksAvailability, reasonKey, sharedAssessmentReasons } from "./screeningReasonGroups";

export function ClinicalRegimen({ regimen }: { regimen: ScreeningRegimen }) {
  return <div className="space-y-1 rounded-xl bg-purple-50 p-3 text-xs text-purple-900">
    {regimen.schedule_type === "topical_prn" ? <p>External use as needed; no fixed numeric amount or course.</p>
      : regimen.schedule_type === "oral_rehydration_after_stool" ? <><p>{regimen.amount_range?.join("–")} sachets after each loose stool · oral. No fixed daily frequency or course.</p><p>Dissolve each sachet separately in exactly {regimen.reconstitution_water_ml_per_sachet} mL drinking water.</p></>
      : regimen.schedule_type === "ophthalmic_prn" ? <p>{regimen.amount_range?.join("–")} {regimen.unit}(s) in affected eye(s), as needed. No fixed daily schedule or course.</p>
      : regimen.schedule_type === "oral_prn" ? <>
        <p>{regimen.amount} {regimen.unit}, as needed · {regimen.route}</p>
        <p>{regimen.interval_hours_range ? `Label interval: ${regimen.interval_hours_range.join("–")} hours.` : `At least ${regimen.interval_hours} hours between doses.`} {regimen.max_doses_per_day != null && `Maximum ${regimen.max_doses_per_day} doses per 24 hours.`} Maximum {regimen.max_daily_amount_mg} mg per 24 hours. No fixed course.</p>
      </> : <p>{regimen.amount} {regimen.unit}, {regimen.doses_per_day} doses per day for {regimen.duration_days} days · {regimen.route}</p>}
    {regimen.instructions && <p>{regimen.instructions}</p>}
    {regimen.review_after_days != null && <p>Reassessment limit: {regimen.review_after_days} days; this is not a prescribed course length.</p>}
    {regimen.reassessment_limit_hours != null && <p>Reassessment limit: {regimen.reassessment_limit_hours} hours; reassess sooner if symptoms worsen.</p>}
  </div>;
}

function Candidate({ candidate, shared = new Map() }: { candidate: ScreeningCandidate; shared?: Map<string, string> }) {
  const available = candidate.status === "candidate_for_clinician_review" && candidate.regimen;
  const uniqueChecks = [...new Map(candidate.checks.map((check) => [reasonKey(check), check])).values()];
  return <article aria-label={candidate.generic_name} className="space-y-3 rounded-2xl border border-slate-200 p-4 text-xs leading-relaxed">
    <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold text-slate-900">{candidate.generic_name}</h4><span className={available ? "font-semibold text-purple-800" : "font-semibold text-amber-900"}>{available ? "Candidate for clinician review" : "Unavailable for this assessment"}</span></div>
    <p>Purpose: {candidate.purpose.replaceAll("_", " ")} · {candidate.clinical_role.replaceAll("_", " ")}</p>
    {candidate.product && <p className="text-slate-600">{candidate.product.strength} · {candidate.product.form} · {candidate.product.route}</p>}
    {available && <ClinicalRegimen regimen={candidate.regimen!} />}
    <ul className="space-y-2">{uniqueChecks.filter((check) => check.status !== "passed").map((check, index) => <li key={index} className={`rounded-xl border p-3 ${check.status === "blocked" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><p className="font-semibold">{check.category.replaceAll("_", " ")} · {check.status.replaceAll("_", " ")}{check.status === "warning" && blocksAvailability(check) ? " · prevents candidate availability" : ""}</p>{shared.has(reasonKey(check)) ? <a className="underline" href={"#" + shared.get(reasonKey(check))}>Shared assessment reason above; this medicine remains blocked by it.</a> : <p>{check.message}</p>}</li>)}</ul>
    {candidate.review_trace && <details><summary className="cursor-pointer font-semibold">Catalogue and rule review versions used</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(candidate.review_trace, null, 2)}</pre></details>}
    <details><summary className="cursor-pointer font-semibold text-purple-700">Evidence and all screening checks</summary>
      <ul className="mt-2 space-y-2">{candidate.checks.map((check, index) => <li key={index}>{check.category.replaceAll("_", " ")}: {check.status.replaceAll("_", " ")} — {check.message}{check.trace && <details className="mt-1"><summary className="cursor-pointer underline">Inputs and backend rule</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(check.trace, null, 2)}</pre></details>}</li>)}</ul>
      <ul className="mt-3 space-y-2">{candidate.sources.map((source, index) => { const url = typeof source === "string" ? source : source.url; return /^https:\/\//.test(url) ? <li key={index}><a href={url} target="_blank" rel="noreferrer" className="break-words text-purple-700 underline">{typeof source === "string" ? "Source reference" : source.title}</a></li> : null; })}</ul>
    </details>
  </article>;
}

export function ClinicalScreeningResult({ result }: { result: ScreeningResult }) {
  const prefix = useId();
  const shared = sharedAssessmentReasons(result), sharedLinks = new Map(shared.map((row, index) => [row.key, `${prefix}-shared-${index}`]));
  const available = result.candidates.filter((row) => row.status === "candidate_for_clinician_review" && row.regimen);
  const excluded = result.candidates.filter((row) => !available.includes(row));
  return <div className="space-y-4" role="region" aria-label="Six-condition screening result">
    <p className="text-sm font-bold">{conditionNames[result.condition]} · Candidate screening</p>
    <p className="text-xs text-slate-600">Screening assessment for clinician review. Candidates are unranked; this is not an approved prescription.</p>
    {result.input_trace && <details className="rounded-xl border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-bold">Assessment inputs used</summary>
      <div className="mt-2 space-y-2"><p>Selected influenza guideline: {result.input_trace.clinical.influenza_guideline}. Antiviral onset: {result.input_trace.clinical.onset_hours ?? "Unknown"} hours.</p>
        <p>Verified symptom durations (hours): {JSON.stringify(result.input_trace.clinical.symptom_durations)}. These are separate from antiviral onset.</p>
        <p>{result.input_trace.regimen_workflow}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(result.input_trace, null, 2)}</pre></div>
    </details>}
    {shared.length > 0 && <div role="region" aria-label="Shared assessment reasons" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs"><h3 className="font-bold">Shared assessment reasons</h3><p>Identical shared checks are grouped here. Each medicine still lists its own blocks; all original checks and evidence remain available below.</p>{shared.map((group, index) => <div id={sharedLinks.get(group.key)} key={group.key} className="scroll-mt-24 space-y-1 border-t border-amber-200 pt-2"><p className="font-semibold">{index + 1}. {group.check.category.replaceAll("_", " ")} · {group.check.status.replaceAll("_", " ")}</p><p>{group.check.message}</p><p>Affected medicines: {group.candidates.join(", ")}</p></div>)}</div>}
    <div role="region" aria-label="Medicine candidates for this patient" className="space-y-3">
      <h3 className="text-sm font-bold">Medicine candidates for this patient</h3>
      {!available.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No medicine candidate is available. Review the exclusions below. You can save the assessment and its reasons.</p>}
      {result.purpose_groups.map((group) => <div key={group.purpose + ":" + group.clinical_role} className="space-y-3 rounded-2xl border border-purple-200 p-3">
        <p className="text-xs font-bold">{group.clinical_role.replaceAll("_", " ")}</p>
        {group.selection === "clinician_choice_required" && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Alternatives for the same purpose: clinician choice is still required. These candidates are not a combined treatment plan.</p>}
        {available.filter((row) => group.candidate_ids.includes(row.medicine_id)).map((row) => <Candidate key={row.scope_id} candidate={row} shared={sharedLinks} />)}
      </div>)}
    </div>
    {excluded.length > 0 && <details open className="space-y-3"><summary className="cursor-pointer text-sm font-bold text-amber-900">Medicines not available for this patient ({excluded.length})</summary>{excluded.map((row) => <Candidate key={row.scope_id} candidate={row} shared={sharedLinks} />)}</details>}
    {result.selected_pair_policy && <p className="text-xs text-slate-600">Selected interaction policy: {result.selected_pair_policy.version} · {result.selected_pair_policy.applied ? "explicit visit review applied" : "visit review required"}. {result.selected_pair_policy.scope}</p>}
    <p className="text-xs text-slate-500">Engine: {result.engine_version}. Deterministic rules; ML is not used for this assessment. Clinical validation: not validated.</p>
  </div>;
}

export function ClinicalDraftResult({ draft, edited = false, compact = false }: { draft: ScreeningDraft; edited?: boolean; compact?: boolean }) {
  const screeningDetails = <>
    <ClinicalScreeningResult result={draft.result} />
    <p className="text-xs text-slate-500">{draft.result.limitations}</p>
    <details><summary className="cursor-pointer text-xs font-semibold">Saved clinical inputs</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(clinicalInputSummary(draft.snapshot), null, 2)}</pre></details>
  </>;
  return <Section title="Saved safety screening assessment" icon={FileText}>
    <div className="space-y-4">
      <p className="text-sm font-bold">{conditionNames[draft.result.condition]} · Assessment version {draft.revision}</p>
      <p className="text-xs text-slate-600">Patient #{draft.patient} · Age from registered DOB: {draft.snapshot.patient.age_years ?? "Unavailable"}. Saved {new Date(draft.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}.</p>
      <p className="break-all text-xs text-slate-500">Consultation: {draft.consultation_id}</p>
      {!draft.current_state.is_current && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{draft.current_state.reason}</p>}
      {edited && <p role="status" className="text-xs text-amber-900">Inputs have changed. Preview and save a new version to record the current assessment.</p>}
      {compact ? <details><summary className="cursor-pointer text-xs font-semibold">View saved screening details</summary><div className="mt-3 space-y-4">{screeningDetails}</div></details> : screeningDetails}
    </div>
  </Section>;
}
