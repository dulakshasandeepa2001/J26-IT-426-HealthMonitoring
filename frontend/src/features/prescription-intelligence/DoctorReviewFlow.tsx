"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, FlaskConical } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Section, buttonStyle, controlStyle } from "./PageFrame";
import { ClinicalRegimen } from "./ClinicalScreeningResult";
import { compatibleSelection } from "./medicineSelection";
import type { ScreeningDraft } from "./clinicalScreeningApi";
import { createMedicineProposal, loadProposals, recordDecision, type MedicineProposal, type DoctorDecision } from "./reviewApi";

export function DoctorReviewFlow({ draft, pendingEdits, onDenied }: { draft: ScreeningDraft; pendingEdits: boolean; onDenied: () => void }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [preparedId, setPreparedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MedicineProposal | null>(null);
  const [ids, setIds] = useState<string[]>([]), [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false), [combined, setCombined] = useState(false);
  const [editing, setEditing] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const decisionFeedback = useRef<HTMLDivElement>(null);
  const [errorStage, setErrorStage] = useState<"ml" | "review">("ml");
  const sequence = useRef(0), lock = useRef(false), retry = useRef<{ body: string; key: string } | null>(null);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  const loadRow = useCallback((row: MedicineProposal | null) => {
    setProposal(row); setIds(row?.decisions[0]?.selected_ids ?? row?.result.default_ids ?? []);
    setPreparedId(row?.decisions.length ? row.id : null);
    setReason(row?.decisions[0]?.reason ?? "");
    setReviewed(false); setCombined(false); setEditing(false); setNotice(""); retry.current = null;
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
      void loadProposals(draft.consultation_id, draft.id).then((rows) => {
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
  const reasonLength = reason.trim().length;
  const decisionRequirements = [
    ...(!usable ? ["Complete current screening and regenerate suggestions before recording a decision."] : []),
    ...(reasonLength < 10 ? [`Enter at least 10 characters for the decision reason (${reasonLength}/10).`] : []),
    ...(!reviewed ? ["Confirm that you reviewed the selected medicines and screening limitations."] : []),
  ];
  const selectionRequirements = [
    ...(!ids.length ? ["Tick a medicine below or use Select all compatible medicines before approval. You can still save an empty selection or reject the proposal."] : []),
    ...(ids.length > 1 && !combined ? ["Confirm the independent interaction review for this combination before saving edits or approving."] : []),
  ];
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
    lock.current = true; const current = ++sequence.current; setBusy(true); setError(""); setNotice(""); setErrorStage("review");
    const data = { action, selected_ids: action === "rejected" ? [] : ids, reason, reviewed: true, combination_reviewed: action === "rejected" ? false : combined };
    const body = JSON.stringify(data);
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try {
      const row = await recordDecision(proposal, { ...data, request_key: retry.current.key });
      if (current !== sequence.current) return;
      loadRow(row);
      if (action === "approved" && row.decisions[0]?.action === "approved") {
        setNotice("Approval saved. Opening the approved prescription…");
        router.push(`/doctor/prescription-slip/${encodeURIComponent(row.decisions[0].id)}`);
      } else {
        setNotice(action === "edited" ? "Medicine selection saved. Review the saved selection and confirm again before approval." : "Proposal rejected. No prescription was generated.");
        requestAnimationFrame(() => decisionFeedback.current?.focus());
      }
    }
    catch (failure) { if (current === sequence.current) fail(failure); }
    finally { lock.current = false; if (current === sequence.current) setBusy(false); }
  }
  function select(identity: string, checked: boolean) {
    setIds((old) => checked ? [...new Set([...old, identity])] : old.filter((id) => id !== identity));
    setReviewed(false); setCombined(false); setNotice(""); retry.current = null;
  }
  return <>
  <Section title="Experimental ML suggestions" icon={FlaskConical}>
    <div className="space-y-4 text-xs" aria-label="Screened ML medicine suggestions">
      <p>Uses saved safety screening version {draft.revision}. Saved Random Forest models inspect provisional purpose applicability and compare selected rule outcomes for this synthetic research consultation. Safety exclusions remain enforced.</p>
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
        {proposal.result.ml.supporting_models && <details><summary className="cursor-pointer font-semibold">Connected Random Forest models</summary><ul className="mt-2 space-y-2">{proposal.result.ml.supporting_models.map((model) => <li key={model.hash} className="break-words"><span className="font-semibold">{model.role}</span><br />{model.version}</li>)}</ul><p className="mt-2 break-words">Inference adapter: {proposal.result.ml.adapter_version}</p><p className="mt-2">Models were trained offline. Unlisted symptoms remain Unknown; these outputs do not establish clinical safety or generate a dose.</p></details>}
        <details><summary className="cursor-pointer font-semibold">Model coverage and limitations</summary><ul className="list-inside list-disc">{proposal.result.ml.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
          <Link className="mt-2 inline-block font-semibold text-purple-700 underline" href={`/doctor/ml-research?consultation=${encodeURIComponent(draft.consultation_id)}`}>Inspect the earlier frozen relevance baseline</Link>
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
            {prediction?.rule_predictions && Object.keys(prediction.rule_predictions).length > 0 && <details className="pt-2"><summary className="cursor-pointer font-semibold">RF predictions and deterministic checks</summary>
              <p className="mt-2">A learned result can be wrong. Deterministic exclusions and unknowns remain authoritative.</p>
              <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Task</th><th className="p-2">Experimental RF</th><th className="p-2">Selected deterministic check</th></tr></thead><tbody>{Object.entries(prediction.rule_predictions).map(([task, value]) => <tr key={task} className="border-t border-slate-100"><td className="p-2 align-top">{task.replaceAll("_", " ")}</td><td className="p-2">{value.predicted?.replaceAll("_", " ") ?? "Abstained"}<span className="block text-slate-500">{value.reason.replaceAll("_", " ")}</span>{value.unseen_features.length > 0 && <span className="block text-amber-900">Unsupported inputs: {value.unseen_features.join(", ")}</span>}</td><td className="p-2">{value.deterministic_reference?.replaceAll("_", " ") ?? "No comparable check; no clearance"}{value.agrees_with_selected_check === false && <strong className="block text-amber-900">Disagreement — deterministic result retained</strong>}</td></tr>)}</tbody></table></div>
              {!!prediction.rule_disagreements_or_abstentions?.length && <p className="mt-2 text-amber-900">Automatic selection withheld because RF checks disagree or abstain. The doctor can independently review candidates made available by deterministic screening.</p>}
            </details>}
            {prediction?.symptom_match_rf && <p className="pt-2 text-slate-500">Supplementary symptom-match RF: {prediction.symptom_match_rf.label === null ? "abstained" : prediction.symptom_match_rf.label === 1 ? "mapped symptom match" : "no mapped symptom match"} · {prediction.symptom_match_rf.reason.replaceAll("_", " ")}. This toy target does not establish clinical relevance.</p>}
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
      <div ref={decisionFeedback} tabIndex={-1} className="space-y-2 outline-none" aria-label="Doctor decision feedback">
        {error && errorStage === "review" && <p role="alert" className="text-rose-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-purple-50 p-3 font-semibold text-purple-900">{notice}</p>}
      </div>
      {!enabled || !proposal || !prepared ? <p>Generate and inspect the ML suggestions above, then choose Prepare doctor-review draft. Only a doctor-approved selection can produce the prescription.</p> : <>
        <p className="font-semibold">Review draft · Screening version {draft.revision} · Medicine proposal version {proposal.revision}</p>
        <p>{final ? "A final doctor decision is recorded for this proposal. The saved selection and decision remain in the history." : "Check the suggested selection and its screened instructions. Edit, approve or reject it; this draft is unapproved until the doctor records approval."}</p>
        {!usable && <p className="text-amber-900">This review draft is unavailable for decisions because its inputs changed or it is historical. Complete the current screening and regenerate suggestions.</p>}
        <p className="font-bold">Medicines for doctor review</p>
        <fieldset disabled={busy || !!final || !usable} className="space-y-3">
          <button type="button" className={buttonStyle} disabled={!available.length} onClick={() => {
            const selection = compatibleSelection(available, ids);
            setIds(selection.ids); setReviewed(false); setCombined(false); retry.current = null;
            setNotice(selection.needsIndividualChoice
              ? "Selected the unambiguous medicines. Choose remaining alternatives individually; medicines sharing an ingredient were not selected together."
              : `Selected ${selection.ids.length} screened medicine${selection.ids.length === 1 ? "" : "s"}. Review the selection and any combination before approval.`);
          }}>Select all compatible medicines</button>
          <p>This selects available medicines with distinct purposes and ingredients. It does not clear interactions. Choose between alternatives individually.</p>
          {editing && <div id="medicine-selection-editor" role="region" aria-label="Edit screened medicine selection" className="space-y-2 rounded-xl border border-purple-200 bg-purple-50 p-3">
            <p className="font-bold">Editing medicine selection — {ids.length} selected</p>
            <p>Use the medicine checkboxes below to include or remove screened candidates.</p>
            {available.length === 1 && <p>Only {available[0].generic_name} passed this screening. You can include or remove it; other medicines remain excluded for the reasons in the screening.</p>}
            <p>Amounts, frequency and duration shown below are the screened regimen. A different dose requires a new reviewed dosing pathway.</p>
          </div>}
          {available.map((candidate) => {
            const prediction = proposal.result.ml.predictions.find((row) => row.medicine_id === candidate.medicine_id);
            return <article key={candidate.scope_id} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <label className="flex items-start gap-2 font-bold"><input type="checkbox" aria-label={`Select ${candidate.generic_name}`} checked={ids.includes(candidate.medicine_id)} onChange={(event) => select(candidate.medicine_id, event.target.checked)} />{candidate.generic_name} · {candidate.product?.strength}</label>
              <p>Purpose: {candidate.clinical_role.replaceAll("_", " ")}. ML: {prediction?.label ?? "abstained"} · {prediction?.reason.replaceAll("_", " ")}</p>
              <ClinicalRegimen regimen={candidate.regimen!} />
            </article>;
          })}
          <p>Choose one alternative per purpose/role. Edit medicines changes the selection; dose changes outside the encoded rules require a new reviewed pathway.</p>
          <button type="button" className={buttonStyle} aria-expanded={editing} aria-controls="medicine-selection-editor" onClick={() => { setEditing((old) => !old); setReviewed(false); setNotice(""); }}>{editing ? "Done choosing medicines" : "Edit medicines"}</button>
          {!editing && !final && <p className="text-slate-600">{ids.length} medicine{ids.length === 1 ? "" : "s"} selected. Tick the medicine checkboxes to change this selection.</p>}
          <label className="block space-y-1">Doctor decision reason<textarea aria-label="Doctor decision reason" aria-describedby="doctor-reason-help" className={controlStyle} rows={2} minLength={10} maxLength={2000} value={reason} onChange={(event) => { setReason(event.target.value); setReviewed(false); setNotice(""); retry.current = null; }} /></label>
          <p id="doctor-reason-help" className={reasonLength < 10 ? "text-amber-900" : "text-slate-600"}>At least 10 characters required. {reasonLength}/2000 characters. Explain your actual decision and any changes.</p>
          {ids.length > 1 && <label className="flex items-start gap-2"><input type="checkbox" checked={combined} onChange={(event) => { setCombined(event.target.checked); setReviewed(false); }} />I independently reviewed the selected combination, including interactions.</label>}
          <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the selected medicines, fixed screened regimens, exclusions and model limitations for this visit.</label>
          {!final && (decisionRequirements.length > 0 || selectionRequirements.length > 0) && <div id="doctor-decision-requirements" role="region" aria-label="Before saving a doctor decision" className="space-y-1 rounded-xl bg-amber-50 p-3 text-amber-900">
            {[...decisionRequirements, ...selectionRequirements].map((message) => <p key={message}>{message}</p>)}
          </div>}
          <div className="flex flex-wrap gap-2" aria-busy={busy}>
            <button type="button" className={buttonStyle} disabled={busy || !usable || !!final || !reviewed || reasonLength < 10 || ids.length > 1 && !combined} onClick={() => decide("edited")}>Save edits</button>
            <button type="button" className={buttonStyle} disabled={busy || !usable || !!final || !reviewed || reasonLength < 10 || !ids.length || ids.length > 1 && !combined} onClick={() => decide("approved")}>Approve selected medicines</button>
            <button type="button" className={buttonStyle} disabled={busy || !usable || !!final || !reviewed || reasonLength < 10} onClick={() => decide("rejected")}>Reject proposal</button>
          </div>
          {busy && errorStage === "review" && <p role="status">Saving the doctor decision. Please wait for confirmation.</p>}
          {!final && <p className="text-slate-600">Approval saves your decision and opens the compact prescription automatically. Print it from the next screen if needed.</p>}
        </fieldset>
        {latest && <p role="status" className="font-semibold">Doctor decision: {latest.action} · Version {latest.revision}</p>}
        {final && <div className="space-y-2 rounded-xl border border-slate-200 p-3"><p>This proposal is {latest?.action}. Create a new medicine proposal to revise the selection; the existing decision is retained.</p><button type="button" className={buttonStyle} disabled={busy || !draft.current_state.is_current || pendingEdits} onClick={generate}>Create new medicine proposal</button></div>}
        {latest?.action === "approved" && usable && <Link className={buttonStyle} href={`/doctor/prescription-slip/${latest.id}`}>Open approved prescription</Link>}
        {proposal.decisions.length > 0 && <details><summary className="cursor-pointer font-semibold">Doctor decision history</summary>{proposal.decisions.map((row) => <p key={row.id}>Version {row.revision}: {row.action} · {row.reason} · {new Date(row.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}</p>)}</details>}
      </>}
    </div>
  </Section>
  </>;
}
