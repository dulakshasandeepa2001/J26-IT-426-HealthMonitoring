"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, FlaskConical } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Section, buttonStyle, controlStyle } from "./PageFrame";
import { ClinicalRegimen } from "./ClinicalScreeningResult";
import type { ScreeningDraft } from "./clinicalScreeningApi";
import { createMedicineProposal, loadProposals, recordDecision, type MedicineProposal, type DoctorDecision } from "./reviewApi";

export function DoctorReviewFlow({ draft, pendingEdits, onDenied }: { draft: ScreeningDraft; pendingEdits: boolean; onDenied: () => void }) {
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [preparedId, setPreparedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MedicineProposal | null>(null);
  const [ids, setIds] = useState<string[]>([]), [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false), [combined, setCombined] = useState(false);
  const [editing, setEditing] = useState(false), [error, setError] = useState("");
  const [errorStage, setErrorStage] = useState<"ml" | "review">("ml");
  const sequence = useRef(0), lock = useRef(false), retry = useRef<{ body: string; key: string } | null>(null);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  const loadRow = useCallback((row: MedicineProposal | null) => {
    setProposal(row); setIds(row?.decisions[0]?.selected_ids ?? row?.result.default_ids ?? []);
    setPreparedId(row?.decisions.length ? row.id : null);
    setReason(""); setReviewed(false); setCombined(false); setEditing(false); retry.current = null;
  }, []);
  const fail = useCallback((failure: unknown) => {
    setError(failure instanceof Error ? failure.message : "Doctor review failed.");
    if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { loadRow(null); setEnabled(false); if (failure.status === 401) onDenied(); }
    if (failure instanceof ApiError && failure.status === 409) { loadRow(null); }
  }, [loadRow, onDenied]);
  useEffect(() => {
    if (!enabled) return;
    const current = ++sequence.current;
    const timer = setTimeout(() => {
      setBusy(true); setError(""); setErrorStage("ml");
      void loadProposals(draft.consultation_id).then((rows) => {
        if (current === sequence.current) loadRow(rows.find((row) => row.draft_id === draft.id) ?? null);
      }).catch((failure: unknown) => { if (current === sequence.current) fail(failure); })
        .finally(() => { if (current === sequence.current) setBusy(false); });
    }, 0);
    return () => { invalidate(); clearTimeout(timer); };
  }, [enabled, draft.consultation_id, draft.id, fail, invalidate, loadRow]);
  if (!draft.snapshot.is_demo) return <>
    <Section title="Experimental ML suggestions" icon={FlaskConical}><p className="text-xs text-amber-900">This experimental medicine workflow is available for explicitly enabled synthetic research consultations. ML suggestions are unavailable for this visit.</p></Section>
    <Section title="Doctor-review prescription draft" icon={ClipboardCheck}><p className="text-xs text-slate-500">No experimental medicine proposal is available for this visit.</p></Section>
  </>;
  const latest = proposal?.decisions[0];
  const final = latest?.action === "approved" || latest?.action === "rejected";
  const usable = proposal?.current_state.is_current && draft.current_state.is_current && !pendingEdits;
  const prepared = !!proposal && preparedId === proposal.id;
  const available = proposal?.result.candidates.filter((row) => row.status === "candidate_for_clinician_review" && row.regimen) ?? [];
  async function generate() {
    if (lock.current || !enabled || !draft.current_state.is_current || pendingEdits) return;
    lock.current = true; const current = ++sequence.current; setBusy(true); setError(""); setErrorStage("ml");
    const body = "proposal:" + draft.id;
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try { const row = await createMedicineProposal(draft.consultation_id, draft.id, retry.current.key); if (current === sequence.current) loadRow(row); }
    catch (failure) { if (current === sequence.current) fail(failure); }
    finally { lock.current = false; if (current === sequence.current) setBusy(false); }
  }
  async function decide(action: DoctorDecision["action"]) {
    if (!proposal || !prepared || lock.current || !usable || final || !reviewed || reason.trim().length < 10) return;
    lock.current = true; const current = ++sequence.current; setBusy(true); setError(""); setErrorStage("review");
    const data = { action, selected_ids: action === "rejected" ? [] : ids, reason, reviewed: true, combination_reviewed: action === "rejected" ? false : combined };
    const body = JSON.stringify(data);
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try { const row = await recordDecision(proposal, { ...data, request_key: retry.current.key }); if (current === sequence.current) loadRow(row); }
    catch (failure) { if (current === sequence.current) fail(failure); }
    finally { lock.current = false; if (current === sequence.current) setBusy(false); }
  }
  function select(identity: string, checked: boolean) {
    setIds((old) => checked ? [...old, identity] : old.filter((id) => id !== identity));
    setReviewed(false); setCombined(false); retry.current = null;
  }
  return <>
  <Section title="Experimental ML suggestions" icon={FlaskConical}>
    <div className="space-y-4 text-xs" aria-label="Screened ML medicine suggestions">
      <p>Uses saved safety screening version {draft.revision}. The saved model suggests provisional medicine relevance for this synthetic research consultation. Safety exclusions remain enforced.</p>
      <p>Compare medicines within their treatment purpose. These outputs do not establish a clinically best medicine or a calibrated medical confidence score.</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => { setEnabled(event.target.checked); loadRow(null); setError(""); }} />Enable Experimental ML medicine suggestions</label>
      {pendingEdits && <p className="text-amber-900">Save a new screening draft to include your changed clinical inputs before reviewing medicines.</p>}
      {!draft.current_state.is_current && <p className="text-amber-900">This screening assessment is historical. Complete screening with the current inputs before requesting new suggestions.</p>}
      {enabled && <button type="button" className={buttonStyle} disabled={busy || !draft.current_state.is_current || pendingEdits} onClick={generate}>Generate ML suggestions</button>}
      {busy && <p role="status">Loading medicine workflow…</p>}
      {error && errorStage === "ml" && <p role="alert" className="text-rose-800">{error}</p>}
      {enabled && proposal && <>
        <p className="font-semibold">Experimental ML · {proposal.result.ml.algorithm} · {proposal.result.ml.model_version}</p>
        <p>Labels: {proposal.result.ml.label_method} · Clinical review: {proposal.result.ml.clinical_review_status}. No medical confidence score.</p>
        <details><summary className="cursor-pointer font-semibold">Model coverage and limitations</summary><ul className="list-inside list-disc">{proposal.result.ml.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
          <Link className="mt-2 inline-block font-semibold text-purple-700 underline" href={`/doctor/ml-research?consultation=${encodeURIComponent(draft.consultation_id)}`}>Inspect the separate frozen research experiment</Link>
        </details>
        {!proposal.current_state.is_current && <p className="text-amber-900">Historical proposal: {proposal.current_state.reason}</p>}
        <div className="space-y-3" aria-label="Medicine relevance suggestions">{proposal.result.candidates.map((candidate) => {
          const prediction = proposal.result.ml.predictions.find((row) => row.medicine_id === candidate.medicine_id);
          const eligible = candidate.status === "candidate_for_clinician_review" && !!candidate.regimen;
          return <article key={candidate.scope_id} className="space-y-1 rounded-xl border border-slate-200 p-3">
            <h3 className="font-bold">{candidate.generic_name}</h3>
            <p>Purpose: {candidate.purpose.replaceAll("_", " ")} · {candidate.clinical_role.replaceAll("_", " ")}</p>
            <p className="font-semibold">{!eligible ? "Withheld by safety screening" : prediction?.suggested ? "ML suggests relevance" : prediction?.status === "predicted" ? `Provisional relevance: ${prediction.label}` : "ML has no supported prediction"}</p>
            <p>{prediction?.reason.replaceAll("_", " ") ?? "No prediction is available for this candidate."}</p>
          </article>;
        })}</div>
        {!proposal.result.default_ids.length && <p>No medicine was automatically selected for the review draft. If screened candidates are available, the doctor can inspect them and record an independent selection.</p>}
        {!available.length && <p className="text-amber-900">Safety screening has made no medicine available. Review the exclusions and patient inputs before preparing a prescription draft.</p>}
        <button type="button" className={buttonStyle} disabled={busy || !usable || !available.length || prepared} onClick={() => { setPreparedId(proposal.id); setReviewed(false); }}>Prepare doctor-review draft</button>
      </>}
    </div>
  </Section>
  <Section title="Doctor-review prescription draft" icon={ClipboardCheck}>
    <div className="space-y-4 text-xs" aria-label="Doctor medicine review">
      {error && errorStage === "review" && <p role="alert" className="text-rose-800">{error}</p>}
      {!enabled || !proposal || !prepared ? <p>Generate and inspect the ML suggestions above, then choose Prepare doctor-review draft. Only a doctor-approved selection can produce the prescription.</p> : <>
        <p className="font-semibold">Review draft · Screening version {draft.revision} · Medicine proposal version {proposal.revision}</p>
        <p>Check the suggested selection and its screened instructions. Edit, approve or reject it; this draft is unapproved until the doctor records approval.</p>
        {!usable && <p className="text-amber-900">This review draft is unavailable for decisions because its inputs changed or it is historical. Complete the current screening and regenerate suggestions.</p>}
        <p className="font-bold">Medicines for doctor review</p>
        <fieldset disabled={busy || !!final || !usable} className="space-y-3">
          {available.map((candidate) => {
            const prediction = proposal.result.ml.predictions.find((row) => row.medicine_id === candidate.medicine_id);
            return <article key={candidate.scope_id} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <label className="flex items-start gap-2 font-bold"><input type="checkbox" aria-label={`Select ${candidate.generic_name}`} checked={ids.includes(candidate.medicine_id)} disabled={!editing} onChange={(event) => select(candidate.medicine_id, event.target.checked)} />{candidate.generic_name} · {candidate.product?.strength}</label>
              <p>Purpose: {candidate.clinical_role.replaceAll("_", " ")}. ML: {prediction?.label ?? "abstained"} · {prediction?.reason.replaceAll("_", " ")}</p>
              <ClinicalRegimen regimen={candidate.regimen!} />
            </article>;
          })}
          <p>Choose one alternative per purpose/role. Edit medicines changes the selection; dose changes outside the encoded rules require a new reviewed pathway.</p>
          <button type="button" className={buttonStyle} onClick={() => { setEditing((old) => !old); setReviewed(false); }}>Edit medicines</button>
          <label className="block space-y-1">Doctor decision reason<textarea aria-label="Doctor decision reason" className={controlStyle} rows={2} minLength={10} maxLength={2000} value={reason} onChange={(event) => { setReason(event.target.value); setReviewed(false); retry.current = null; }} /></label>
          {ids.length > 1 && <label className="flex items-start gap-2"><input type="checkbox" checked={combined} onChange={(event) => { setCombined(event.target.checked); setReviewed(false); }} />I independently reviewed the selected combination, including interactions.</label>}
          <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the selected medicines, fixed screened regimens, exclusions and model limitations for this visit.</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonStyle} disabled={!reviewed || reason.trim().length < 10 || ids.length > 1 && !combined} onClick={() => decide("edited")}>Save edits</button>
            <button type="button" className={buttonStyle} disabled={!reviewed || reason.trim().length < 10 || !ids.length || ids.length > 1 && !combined} onClick={() => decide("approved")}>Approve selected medicines</button>
            <button type="button" className={buttonStyle} disabled={!reviewed || reason.trim().length < 10} onClick={() => decide("rejected")}>Reject proposal</button>
          </div>
        </fieldset>
        {latest && <p role="status" className="font-semibold">Doctor decision: {latest.action} · Version {latest.revision}</p>}
        {latest?.action === "approved" && usable && <Link className={buttonStyle} href={`/doctor/prescription-slip/${latest.id}`}>Open approved prescription</Link>}
        {proposal.decisions.length > 0 && <details><summary className="cursor-pointer font-semibold">Doctor decision history</summary>{proposal.decisions.map((row) => <p key={row.id}>Version {row.revision}: {row.action} · {row.reason} · {new Date(row.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}</p>)}</details>}
      </>}
    </div>
  </Section>
  </>;
}
