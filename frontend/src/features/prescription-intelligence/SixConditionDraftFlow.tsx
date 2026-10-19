"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, FlaskConical, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { buttonStyle, controlStyle, Section } from "./PageFrame";
import type { usePrescription } from "./usePrescription";
import { conditionNames } from "./AdditionalMedicineScopes";
import { emptyAssessment } from "./clinicalAssessmentFields";
import { QuickClinicalReview, type ClinicalReviewHandle } from "./QuickClinicalReview";
import { ScreeningNextActions } from "./ScreeningNextActions";
import { prefillReported, quickRequirements, readGuideline } from "./quickReviewData";
import { fetchSafetyProfiles, type SafetyProfile } from "./draftApi";
import { fetchConditionKnowledge, type ConditionScope } from "./medicineApi";
import { fetchScreeningDrafts, fetchScreeningInputs, previewScreening, saveScreeningDraft, screeningCondition,
  type ClinicalAssessment, type ScreeningDraft, type ScreeningInputs, type ScreeningPreview, type ScreeningRequest } from "./clinicalScreeningApi";
import { ClinicalDraftResult, ClinicalScreeningResult } from "./ClinicalScreeningResult";
import { DoctorReviewFlow } from "./DoctorReviewFlow";

export function SixConditionDraftFlow({ rx, onReviewHistory }: { rx: ReturnType<typeof usePrescription>; onReviewHistory?: () => void }) {
  const visit = rx.activeConsultation, context = rx.activePatientContext;
  const diagnosis = rx.diagnoses.find((row) => row.consultation === visit?.id);
  const condition = diagnosis ? screeningCondition(diagnosis.condition_code, diagnosis.condition_label) : null;
  const historyReviewed = !rx.patientHistoryPending && !!visit && context?.provenance.last_reviewed_consultation === visit.id && context.provenance.last_reviewed_by === visit.doctor;
  const ready = !!visit && !!diagnosis && !!condition && historyReviewed && !rx.loading && !rx.accessDenied;
  const visitId = visit?.id, doctorId = visit?.doctor;
  const [metadata, setMetadata] = useState<ScreeningInputs | null>(null);
  const [clinical, setClinical] = useState<ClinicalAssessment>(emptyAssessment);
  const [pendingDecisionEdits, setPendingDecisionEdits] = useState(false);
  const [initial, setInitial] = useState<ClinicalAssessment>(emptyAssessment);
  const [coverage, setCoverage] = useState<{ profiles: SafetyProfile[]; scopes: ConditionScope[] } | null>(null);
  const [plan, setPlan] = useState<{ response: ScreeningPreview; request: ScreeningRequest } | null>(null);
  const [records, setRecords] = useState<ScreeningDraft[]>([]), [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false), [previewing, setPreviewing] = useState(false), [saving, setSaving] = useState(false);
  const [slowPreview, setSlowPreview] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false), [dirty, setDirty] = useState(true);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true), sequence = useRef(0), locked = useRef(false);
  const previewRequest = useRef<AbortController | null>(null);
  const previewFeedback = useRef<HTMLDivElement>(null);
  const clinicalEditor = useRef<ClinicalReviewHandle>(null);
  const retry = useRef<{ key: string; hash: string } | null>(null);
  const reloadWorkspace = rx.loadAll;
  const invalidate = useCallback(() => { ++sequence.current; previewRequest.current?.abort(); previewRequest.current = null; }, []);
  const clearPlan = useCallback(() => { invalidate(); setPlan(null); setAcknowledged(false); setPreviewing(false); setSlowPreview(false); retry.current = null; }, [invalidate, setPlan, setAcknowledged, setPreviewing]);
  const failure = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : "Screening could not be completed.");
    if (reason instanceof ApiError && [401, 403].includes(reason.status)) {
      clearPlan(); setMetadata(null); setRecords([]); setClinical(emptyAssessment()); void reloadWorkspace();
    }
  }, [clearPlan, reloadWorkspace, setError, setMetadata, setRecords, setClinical]);
  const load = useCallback(async () => {
    if (!ready || !visitId || !condition || doctorId == null) return;
    clearPlan(); const current = sequence.current;
    setLoading(true); setError(null); setPreviewFailed(false); setMessage(null); setMetadata(null); setRecords([]); setCoverage(null);
    try {
      const knowledge = Promise.all([fetchSafetyProfiles(), fetchConditionKnowledge()]).then(([profiles, scopes]) => ({ profiles, scopes })).catch((reason: unknown) => {
        if (reason instanceof ApiError && [401, 403].includes(reason.status)) throw reason;
        return null;
      });
      const [inputs, rows, loadedCoverage] = await Promise.all([fetchScreeningInputs(visitId), fetchScreeningDrafts(visitId), knowledge]);
      if (!alive.current || current !== sequence.current) return;
      const reported = prefillReported(inputs, condition, readGuideline(doctorId, inputs.engine_version));
      setMetadata(inputs); setClinical(reported); setInitial(reported); setCoverage(loadedCoverage); setPendingDecisionEdits(false);
      setRecords(rows); setSelected(rows[0]?.id ?? ""); setDirty(true);
    } catch (reason) { if (alive.current && current === sequence.current) failure(reason); }
    finally { if (alive.current && current === sequence.current) setLoading(false); }
  }, [ready, visitId, condition, doctorId, clearPlan, failure, setLoading, setError, setMessage, setMetadata, setRecords, setClinical, setInitial, setCoverage, setSelected, setDirty]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { alive.current = false; invalidate(); clearTimeout(timer); };
  }, [load, invalidate]);

  function editClinical(value: ClinicalAssessment) {
    setPendingDecisionEdits(true);
    clearPlan(); setMessage(null); setError(null); setDirty(true);
    setClinical({ ...value, reviewed: false, symptoms_reviewed: false });
  }
  function confirmReview(checked: boolean) {
    clearPlan(); setMessage(null); setError(null);
    setClinical((old) => ({ ...old, reviewed: checked, symptoms_reviewed: checked }));
  }
  const bindingCurrent = !!metadata && !!context && metadata.expected_context_updated_at != null
    && Date.parse(metadata.expected_context_updated_at) === Date.parse(context.updated_at)
    && metadata.confirmed_diagnoses.some((row) => row.id === diagnosis?.id);
  const canPreview = ready && bindingCurrent && clinical.reviewed && (!(clinical.verified_symptoms?.length) || clinical.symptoms_reviewed) && !loading && !saving && !previewing;
  const canSave = ready && bindingCurrent && !!plan && acknowledged && !loading && !saving && !previewing;
  async function refreshReviews() {
    if (!ready || loading || saving || previewing) return;
    clearPlan(); const current = sequence.current;
    setLoading(true); setError(null); setPreviewFailed(false); setMessage(null);
    try {
      const [profiles, scopes] = await Promise.all([fetchSafetyProfiles(), fetchConditionKnowledge()]);
      if (!alive.current || current !== sequence.current) return;
      setCoverage({ profiles, scopes });
      setMessage("Medicine review status refreshed. Your clinical entries are retained. Preview again to screen the current rules.");
    } catch (reason) { if (alive.current && current === sequence.current) failure(reason); }
    finally { if (alive.current && current === sequence.current) setLoading(false); }
  }
  const previewRequirement = !visit ? "Select a patient and saved visit first."
    : !diagnosis ? "Confirm this visit diagnosis first."
    : !condition ? "This diagnosis has no supported screening pathway."
    : !historyReviewed ? "Review and save allergies and current medicines for this visit first."
    : rx.accessDenied ? "Access to this visit is unavailable."
    : loading || rx.loading ? "Loading current screening inputs."
    : !bindingCurrent ? "Refresh screening inputs and review the current patient history and diagnosis."
    : !clinical.reviewed || (!!clinical.verified_symptoms?.length && !clinical.symptoms_reviewed) ? "Confirm the clinical summary above, or check the visit-review checkbox after your corrections."
    : saving ? "Wait for the screening assessment to finish saving." : null;
  useEffect(() => {
    if (!error && !plan) return;
    const frame = requestAnimationFrame(() => {
      previewFeedback.current?.focus({ preventScroll: true });
      previewFeedback.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [error, plan]);
  async function preview() {
    if (!canPreview || !metadata || !diagnosis || !context || !visit) return;
    clearPlan(); const current = sequence.current; setPreviewing(true); setError(null); setPreviewFailed(false); setMessage(null);
    const request: ScreeningRequest = { diagnosis_id: diagnosis.id, expected_context_updated_at: context.updated_at,
      expected_analysis_hash: metadata.expected_analysis_hash, clinical: structuredClone(clinical) };
    const controller = new AbortController(); previewRequest.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 75_000);
    const slow = setTimeout(() => { if (alive.current && current === sequence.current) setSlowPreview(true); }, 15_000);
    try {
      const response = await previewScreening(visit.id, request, controller.signal);
      if (!alive.current || current !== sequence.current) return;
      if (response.result.condition !== condition) throw new Error("Preview diagnosis changed. Refresh the consultation.");
      setPlan({ response, request });
    } catch (reason) {
      if (alive.current && current === sequence.current) {
        setPreviewFailed(true);
        failure(timedOut ? new Error("Screening took too long to respond. Your clinical entries are still here. Try Preview medicine candidates again; no screening result was confirmed.") : reason);
      }
    } finally {
      clearTimeout(timeout);
      clearTimeout(slow);
      if (previewRequest.current === controller) previewRequest.current = null;
      if (alive.current && current === sequence.current) setPreviewing(false);
    }
  }
  async function save() {
    if (!canSave || !plan || !visit || locked.current) return;
    locked.current = true; setSaving(true); setError(null); setPreviewFailed(false); setMessage(null);
    const current = sequence.current;
    if (!retry.current || retry.current.hash !== plan.response.plan_hash) retry.current = { key: crypto.randomUUID(), hash: plan.response.plan_hash };
    try {
      const row = await saveScreeningDraft(visit.id, { ...plan.request, request_key: retry.current.key,
        expected_plan_hash: plan.response.plan_hash, expected_latest_revision: plan.response.expected_latest_revision });
      if (!alive.current || current !== sequence.current) return;
      setRecords((old) => [row, ...old.filter((item) => item.id !== row.id).map((item) => ({ ...item, current_state: { is_current: false, reason: "A newer immutable version exists." } }))]);
      setSelected(row.id); setDirty(false); setPendingDecisionEdits(false); setMessage(`Screening assessment version ${row.revision} saved. Continue to ML suggestions below. This is not a doctor approval.`);
      clearPlan(); setClinical((old) => ({ ...old, reviewed: false }));
    } catch (reason) {
      if (!alive.current || current !== sequence.current) return;
      failure(reason);
      if (reason instanceof ApiError && reason.status === 409) { clearPlan(); setClinical((old) => ({ ...old, reviewed: false })); }
    } finally { locked.current = false; if (alive.current) setSaving(false); }
  }
  const active = records.find((row) => row.id === selected);
  const usablePlan = ready && bindingCurrent ? plan : null;
  const availableCount = usablePlan?.response.result.candidates.filter((row) => row.status === "candidate_for_clinician_review" && row.regimen).length ?? 0;
  return <div className="space-y-6">
    <Section title="Patient safety screening" icon={ShieldCheck}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600">Verify this visit and screen medicine candidates first. Save the reviewed assessment to continue to Experimental ML suggestions, then prepare a doctor-review prescription draft.</p>
        <div className="flex flex-wrap gap-3"><button type="button" className={buttonStyle} disabled={!ready || loading || saving} onClick={load}>Refresh screening inputs and drafts</button>
          <button type="button" className={buttonStyle} disabled={!ready || loading || saving || previewing} onClick={refreshReviews}>Refresh medicine reviews</button></div>
        <ul className="space-y-1 text-xs text-amber-900">
          {!visit && <li>Select a patient and saved visit first.</li>}
          {visit && !diagnosis && <li>Confirm this visit diagnosis first.</li>}
          {diagnosis && !condition && <li>This diagnosis has no supported six-condition screening pathway.</li>}
          {visit && !historyReviewed && <li>Review/save allergies and current medicines for this visit first.</li>}
          {metadata && !bindingCurrent && <li>Patient history or diagnosis changed. <button type="button" className="font-bold underline" onClick={reloadWorkspace}>Refresh Workspace</button> and verify this visit again.</li>}
        </ul>
        {message && <p role="status" className="text-xs text-emerald-800">{message}</p>}
        {loading && <p role="status" className="text-xs">Loading current screening inputs and draft history…</p>}
        {ready && metadata && condition && <>
          <p className="text-xs font-semibold">{conditionNames[condition]} · Age from registered DOB: {metadata.patient_age_years ?? "Unavailable"}</p>
          <details className="rounded-xl border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-bold">Reported consultation observations — unverified</summary>
            <p className="mt-2">These observations do not clear safety checks. Independently assess the patient below.</p>
            <p>Reported severity: {metadata.source_observations.severity}. Red flags: {metadata.source_observations.red_flags.join(", ") || "No reported flags; independent assessment still required"}.</p>
            <ul className="mt-2 space-y-1">{metadata.source_observations.symptoms.map((row, index) => <li key={index}>{row.code.replaceAll("_", " ")}: {row.present === true ? "reported present" : row.present === false ? "reported absent" : "unknown"}{row.duration_hours != null ? ` · ${row.duration_hours} hours reported` : row.duration_days != null ? ` · ${row.duration_days} days reported` : " · duration unknown"}</li>)}</ul>
            <ul className="mt-2 space-y-1">{Object.entries(metadata.source_observations.assessments).map(([name, value]) => <li key={name} className="break-words">{name.replaceAll("_", " ")}: {value === true ? "reported concern" : value === false ? "reported absent" : value == null ? "unknown" : String(value)}</li>)}</ul>
          </details>
          <QuickClinicalReview key={metadata.expected_analysis_hash + ":" + metadata.expected_context_updated_at} metadata={metadata} condition={condition} clinical={clinical} initial={initial}
            requirements={quickRequirements(condition, coverage?.profiles ?? [], coverage?.scopes ?? [], metadata.patient_age_years, coverage != null)}
            patient={rx.activePatient} history={context} doctor={visit!.doctor} disabled={loading || saving || !bindingCurrent}
            onEdit={editClinical} onConfirm={confirmReview} onReviewHistory={onReviewHistory} editorRef={clinicalEditor} />
        </>}
        <div className="space-y-2">
          <button type="button" className={buttonStyle} disabled={!canPreview} onClick={preview} aria-controls="medicine-preview-feedback" aria-describedby={previewRequirement ? "medicine-preview-requirement" : undefined}>{previewing ? "Screening candidates…" : "Preview medicine candidates"}</button>
          {previewRequirement && !previewing && <p id="medicine-preview-requirement" className="text-xs text-amber-900">{previewRequirement}</p>}
        </div>
        <div id="medicine-preview-feedback" ref={previewFeedback} role="group" aria-label="Medicine preview feedback" tabIndex={-1} className="scroll-mt-24 space-y-4" aria-busy={previewing}>
        {previewing && <p role="status" className="text-xs text-slate-600">{slowPreview ? "Screening is still running against the cloud database. Your clinical entries are retained; wait for the result." : "Screening the current patient inputs. Waiting for the database response…"}</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-900">{error} {previewFailed && canPreview
          ? <button type="button" className="font-bold underline" onClick={preview}>Try preview again</button>
          : <button type="button" className="font-bold underline" onClick={load} disabled={!ready || loading || saving}>Refresh screening</button>}</p>}
        {usablePlan && <>
          <p role="status" className="rounded-xl bg-purple-50 p-3 text-sm font-semibold text-purple-900">Screening complete: {availableCount} medicine {availableCount === 1 ? "candidate" : "candidates"} available for doctor review; {usablePlan.response.result.candidates.length - availableCount} unavailable. Review the details below.</p>
          <ScreeningNextActions result={usablePlan.response.result} clinical={usablePlan.request.clinical} observations={metadata!.source_observations}
            onHistory={onReviewHistory} onClinical={() => clinicalEditor.current?.open()} />
          <ClinicalScreeningResult result={usablePlan.response.result} />
          {usablePlan.response.result.candidates.some((row) => row.checks.some((check) => ["allergy", "duplicate_ingredient", "interaction"].includes(check.category) && ["cannot_validate", "blocked", "warning"].includes(check.status))) &&
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p>History checks need attention. Review the recorded allergies and current medicines; unresolved identities remain unavailable for screening.</p>
              <a href="#patient-medicine-history" className="font-bold underline" onClick={(event) => { if (onReviewHistory) { event.preventDefault(); onReviewHistory(); } }}>Review allergies and current medicines</a>
              <p>A recognized current medicine can still block duplicate treatment or need an independent interaction review. This prototype has no continuation/replacement or comprehensive interaction-clearance workflow.</p>
            </div>}
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={saving} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I reviewed this screening, exclusions and unresolved alternatives. Save this assessment to continue.</label>
        </>}
        </div>
        <button type="button" className={buttonStyle + " border-purple-200 bg-purple-50 text-purple-700"} disabled={!canSave} onClick={save}>{saving ? "Saving assessment…" : usablePlan && !availableCount ? "Save screening assessment" : "Continue to ML suggestions"}</button>
      </div>
    </Section>
    {ready && records.length > 0 && <label className="block space-y-2 text-xs font-semibold">Saved screening version<select aria-label="Saved screening version" className={controlStyle} value={selected} onChange={(event) => setSelected(event.target.value)}>{records.map((row) => <option key={row.id} value={row.id}>Version {row.revision} · {row.current_state.is_current ? "Current inputs" : "Historical / stale"}</option>)}</select></label>}
    {ready && active && <ClinicalDraftResult draft={active} edited={dirty} compact />}
    {ready && active && !loading ? <DoctorReviewFlow key={active.id} draft={active} pendingEdits={pendingDecisionEdits} onDenied={reloadWorkspace} /> : <>
      <Section title="Experimental ML suggestions" icon={FlaskConical}><p className="text-xs text-slate-500">Complete and save the patient safety screening assessment above to request medicine relevance suggestions.</p></Section>
      <Section title="Doctor-review prescription draft" icon={ClipboardCheck}><p className="text-xs text-slate-500">Review ML suggestions first, then prepare the medicines for the doctor to edit, approve or reject.</p></Section>
    </>}
  </div>;
}
