"use client";
import { HistoryIdentityPolicy } from "./HistoryIdentityPolicy";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Section, buttonStyle, controlStyle } from "./PageFrame";
import { reviewConditionScope, type ConditionScope, type MedicineReviewStatus } from "./medicineApi";
import { MedicineReviewBadge, currentContentStatus } from "./MedicineReviewBadge";

export const conditionNames: Record<string, string> = {
  influenza: "Influenza", chickenpox: "Chickenpox", measles: "Measles", mumps: "Mumps",
  viral_conjunctivitis: "Viral conjunctivitis", viral_gastroenteritis: "Viral gastroenteritis",
};
export const scopeMedicineName = (scope: ConditionScope) => scope.content.product?.generic_name ?? scope.content.display_name ?? "Oral rehydration salts (ORS)";

const reviewSectionId = (scope: ConditionScope, kind: "content" | "safety") => `condition-${scope.id}-${kind}-review`;

function ScopeReviewForm({ scope, kind, onSaved, onAccessDenied }: { scope: ConditionScope; kind: "content" | "safety"; onSaved: (row: ConditionScope) => void; onAccessDenied: (message: string) => void }) {
  const state = kind === "content" ? scope.content_review : scope.safety_review;
  const [changing, setChanging] = useState(false);
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<MedicineReviewStatus>(kind === "safety" && ["unresolved", "reference_incomplete"].includes(scope.content.identity_status) ? "pending" : "reviewed");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const blocked = kind === "safety" && ["unresolved", "reference_incomplete"].includes(scope.content.identity_status);
  const name = kind === "content" ? "Content review" : "Safety rule review";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current || notes.trim().length < 10 || decision === "reviewed" && (!checked || blocked)) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const row = await reviewConditionScope(scope, kind, decision, notes.trim(), checked);
      if (alive.current) onSaved(row);
    } catch (failure) {
      if (!alive.current) return;
      const message = failure instanceof Error ? failure.message : "Review save failed.";
      setError(message);
      if (failure instanceof ApiError && [401, 403].includes(failure.status)) onAccessDenied(message);
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  return <section id={reviewSectionId(scope, kind)} tabIndex={-1} aria-label={`${name} for ${conditionNames[scope.condition]}`} className="scroll-mt-6 space-y-3 rounded-xl border border-slate-200 p-3">
    <h4 className="font-bold text-slate-800">{name} · {state.is_current ? "Completed for this version" : state.status === "rejected" ? "Rejected" : "Pending review"}</h4>
    {state.reviewed_at && <p className="whitespace-pre-wrap break-words">{state.reviewer_name} · {new Date(state.reviewed_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}<br />{state.notes}</p>}
    {state.is_current ? <><p className="text-emerald-800">The saved review is current. No repeat review is required.</p><button type="button" className={buttonStyle} onClick={() => setChanging((value) => !value)}>{changing ? "Cancel review change" : `Change ${name.toLowerCase()}`}</button></> : state.reason && <p className="text-amber-900">{state.reason}</p>}
    {blocked && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">Exact product identity or executable rule coverage is incomplete. Safety acceptance is unavailable. You can record a pending or rejected decision; the block remains. {scope.content.unresolved_product?.gap}</p>}
    {(!state.is_current || changing) && <form onSubmit={save} className="space-y-3">
      <label className="block space-y-1">{name} decision<select className={controlStyle} value={blocked && decision === "reviewed" ? "pending" : decision} disabled={busy} onChange={(event) => setDecision(event.target.value as MedicineReviewStatus)}>
        {!blocked && <option value="reviewed">Reviewed for this condition scope</option>}<option value="pending">Pending</option><option value="rejected">Rejected</option>
      </select></label>
      <label className="block space-y-1">{name} notes<textarea className={controlStyle} rows={3} minLength={10} maxLength={2000} required value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></label>
      <p className="text-slate-500">At least 10 characters required. {notes.trim().length}/2000 characters.</p>
      {!blocked && <label className="flex items-start gap-2"><input type="checkbox" checked={checked} disabled={busy} className="mt-0.5 accent-purple-600" onChange={(event) => setChecked(event.target.checked)} />I inspected the listed evidence and {kind === "safety" ? "research rule scope, parameters and implementation" : "medicine identity, warnings and condition mapping"} for this version.</label>}
      <button type="submit" className={buttonStyle} disabled={busy || notes.trim().length < 10 || (decision === "reviewed" && (!checked || blocked))}>Save {name.toLowerCase()}</button>
    </form>}
    {error && <p role="alert" className="text-rose-800">{error}</p>}
  </section>;
}

export function AdditionalMedicineScopes({ scopes, onSaved, onAccessDenied, children }: { scopes: ConditionScope[]; onSaved: (scope: ConditionScope) => void; onAccessDenied: (message: string) => void; children?: ReactNode }) {
  return <Section title="Additional condition knowledge" icon={ShieldCheck}>
    <div className="space-y-5 text-xs leading-relaxed">
      <p className="text-slate-600">Each condition scope has its own content and research-rule review. Current reviews are reused for their recorded version. Patient-specific assessment is still required before considering a candidate.</p>
      {children}
      {scopes.map((scope) => <article aria-label={`${conditionNames[scope.condition]} medicine scope`} key={scope.id} className="space-y-4 rounded-2xl border border-purple-200 p-4">
        <div><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-base font-bold text-slate-900">{conditionNames[scope.condition]} · {scopeMedicineName(scope)}</h3><MedicineReviewBadge status={currentContentStatus(scope.content_review.status, scope.content_review.is_current)} /></div><p className="mt-1">{scope.content.product ? `${scope.content.product.strength} · ${scope.content.product.form} · ${scope.content.product.route}` : "Exact product identity unresolved"}</p><p className="mt-1">Purpose: {scope.content.purpose.replaceAll("_", " ")}</p></div>
        {scope.content.product ? <>
          <p className="break-words text-slate-500">{scope.content.product.standard_concept ? `RxCUI ${scope.content.product.standard_concept.rxcui} · ${scope.content.product.standard_concept.name}` : `${scope.content.product.reference_product_identifier ?? "Reference label"} · No verified RxNorm concept; none invented`}</p>
          {scope.content.product.uses.map((use) => <div className="space-y-1" key={use.condition}><p>{use.summary}</p><p className="text-slate-500">{use.scope}</p></div>)}
          <details><summary className="cursor-pointer font-semibold text-purple-700">Selected medicine warnings</summary><ul className="mt-2 list-disc space-y-2 pl-4">{scope.content.product.warnings.map((warning, i) => <li key={i}>{warning.summary}</li>)}</ul></details>
          <details><summary className="cursor-pointer font-semibold text-purple-700">Condition evidence references</summary><ul className="mt-2 space-y-2">{scope.content.product.sources.map((source) => <li key={source.id} className="break-words"><a className="font-semibold text-purple-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a><p>{source.publisher} · Accessed {source.accessed_date} · {source.sections.join("; ")}</p></li>)}</ul></details>
        </> : <><p className="text-amber-900">{scope.content.unresolved_product?.gap}</p><ul className="space-y-2">{scope.content.unresolved_product?.source_urls.map((url, index) => <li key={url}><a className="break-words text-purple-700 underline" href={url} target="_blank" rel="noreferrer">{scope.content.unresolved_product?.source_ids[index]}</a></li>)}</ul></>}
        <div className="space-y-2"><h4 className="font-bold">Research safety rules</h4><p>{scope.rules.policy.scope}</p><p>Required condition assessments: {scope.rules.policy.concern_fields.join(", ") || "See the rule profile"}.</p><details><summary className="cursor-pointer font-semibold text-purple-700">Inspect condition rule parameters</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3">{JSON.stringify({ policy: scope.rules.policy, reference_profile: scope.rules.reference_profile }, null, 2)}</pre></details><details><summary className="cursor-pointer font-semibold text-purple-700">Inspect bound research implementation</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3">{scope.rules.implementation_source}</pre></details></div>
        <HistoryIdentityPolicy policy={scope.rules.history_identity_policy} />
        <ScopeReviewForm key={`content:${scope.id}:${scope.updated_at}`} scope={scope} kind="content" onSaved={onSaved} onAccessDenied={onAccessDenied} />
        <ScopeReviewForm key={`safety:${scope.id}:${scope.updated_at}`} scope={scope} kind="safety" onSaved={onSaved} onAccessDenied={onAccessDenied} />
        <p className="text-slate-500">Knowledge version: {scope.content.knowledge_version}. A completed review does not approve or publish a prescription. This is not independent clinical validation.</p>
      </article>)}
    </div>
  </Section>;
}
