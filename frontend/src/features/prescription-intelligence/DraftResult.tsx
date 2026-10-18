import { FileText, ShieldCheck } from "lucide-react";
import { Section } from "./PageFrame";
import type { CheckStatus, PrescriptionDraft } from "./draftApi";
import { RegimenDetails } from "./RegimenDetails";
import { clinicalInputSummary, interfaceText } from "@/lib/productLanguage";

const labels: Record<CheckStatus, string> = { passed: "Passed selected check", warning: "Doctor review needed", blocked: "Blocked", cannot_validate: "Cannot validate" };
const colors: Record<CheckStatus, string> = { passed: "border-emerald-200 bg-emerald-50 text-emerald-800", warning: "border-amber-200 bg-amber-50 text-amber-900", blocked: "border-rose-200 bg-rose-50 text-rose-800", cannot_validate: "border-slate-300 bg-slate-50 text-slate-700" };

export function DraftResult({ draft, edited }: { draft: PrescriptionDraft; edited: boolean }) {
  return <Section title="Saved prescription screening draft" icon={FileText}>
    <div className="space-y-4 text-xs leading-relaxed">
      <p className="font-bold text-purple-800">Draft version {draft.revision} · {draft.snapshot.diagnosis.condition_label} · {draft.snapshot.is_demo ? "Synthetic research" : "Clinician review draft"}</p>
      <p className="text-slate-500">Saved {new Date(draft.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}. Rules only; candidates are unranked. This version is unapproved and unpublished.</p>
      {!draft.current_state.is_current && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">{draft.current_state.reason}</p>}
      {edited && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">Inputs have unsaved changes. Generate a new version to apply and revalidate them.</p>}
      {draft.result.candidates.map((candidate) => <article key={candidate.medicine_id} aria-label={candidate.generic_name} className="space-y-3 rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{candidate.generic_name}</h3><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${colors[candidate.screening_status]}`}>{labels[candidate.screening_status]}</span></div>
        <p className="text-slate-600">{candidate.strength} · {candidate.form} · {candidate.route} · {candidate.purpose.replaceAll("_", " ")}</p>
        <p className="text-slate-500">Product RxCUI: {candidate.standard_concept.rxcui} · Rule version: {interfaceText(candidate.rule_version)}</p>
        <p className="text-slate-500">{candidate.scope}</p>
        {candidate.proposed_dose ? <div className="space-y-2 text-slate-700"><p className="font-semibold">{candidate.regimen_origin === "rule_suggestion" ? "Clinician-reviewed rule suggestion" : "Clinician proposal"}</p><RegimenDetails dose={candidate.proposed_dose} /></div> : <p className="font-semibold text-slate-700">No reviewed proposed regimen recorded.</p>}
        <ul className="space-y-2">{candidate.checks.map((check, index) => <li key={index} className={`rounded-xl border p-3 ${colors[check.status]}`}>
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="capitalize">{check.category.replaceAll("_", " ")} · {labels[check.status]}</span></p>
          <p className="mt-1">{check.message}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{candidate.sources.filter((source) => check.source_ids.includes(source.id)).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{source.publisher}<span className="sr-only">: {source.title}</span></a>)}</div>
        </li>)}</ul>
        <details><summary className="cursor-pointer font-semibold text-slate-600">Candidate evidence references</summary><ul className="mt-2 space-y-2">{candidate.sources.map((source) => <li key={source.id}><a className="font-semibold text-purple-700 underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p className="text-slate-500">{candidate.source_sections[source.id]?.join("; ")}</p><p className="text-slate-500">Source date: {source.published_date ?? "Not supplied"} · Accessed: {source.accessed_date}</p></li>)}</ul></details>
      </article>)}
      {draft.result.omitted_unreviewed.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-amber-900"><p className="font-bold">Entries omitted from this screening</p><ul className="mt-2 space-y-1">{draft.result.omitted_unreviewed.map((item) => <li key={item.medicine_id}>{item.generic_name}: {item.reason}</li>)}</ul></div>}
      {draft.result.excluded_candidates?.length ? <details><summary className="cursor-pointer font-semibold text-amber-900">Medicines not selected for this patient</summary><ul className="mt-3 space-y-3">{draft.result.excluded_candidates.map((row) => <li key={row.medicine_id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><p className="font-semibold">{row.generic_name ?? row.medicine_id} · {row.status === "not_needed" ? "No verified symptom target" : "Assessment or scope prevents automatic selection"}</p><ul className="mt-2 space-y-1">{row.reasons.map((reason, index) => <li key={index}>{reason.message}</li>)}</ul></li>)}</ul></details> : null}
      {draft.result.candidates.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No automatic medicine selected. Review the recorded exclusions and patient assessment.</p>}
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">{draft.result.limitations}</p>
      <details><summary className="cursor-pointer font-semibold text-slate-600">View saved clinical inputs</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">{JSON.stringify(clinicalInputSummary(draft.snapshot), null, 2)}</pre></details>
    </div>
  </Section>;
}
