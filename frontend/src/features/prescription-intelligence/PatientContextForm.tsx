"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type Ref } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { usePrescription } from "./usePrescription";
import type { ContextStatus, CurrentMedicinePlan, CurrentMedicinePlanRecord, HistoryIdentityRecord } from "./prescriptionApi";
import { HistoryClarification, type ClarificationDraft } from "./HistoryClarification";
import { CurrentMedicinePlans } from "./CurrentMedicinePlans";
import { medicinePlansValid, prepareMedicinePlans } from "./medicinePlanDrafts";
import { buttonStyle, controlStyle } from "./PageFrame";
import { patientHistoryPrefill, historyEntries as entries, type HistoryFields } from "./historyPrefill";

function statusOrUnknown(status: string | undefined): ContextStatus {
  return status === "confirmed" || status === "none" ? status : "unknown";
}

function distinctEntries(text: string) {
  const seen = new Set<string>();
  return entries(text).filter((name) => { const key = name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}

export interface PatientHistoryEditorHandle { open: () => void }

export function PatientContextForm({ rx, editorRef }: { rx: ReturnType<typeof usePrescription>; editorRef?: Ref<PatientHistoryEditorHandle> }) {
  const context = rx.activePatientContext;
  const visit = rx.activeConsultation!, analysis = rx.activeAnalysis;
  const prefill = useMemo(() => patientHistoryPrefill(visit, analysis, context), [visit, analysis, context]);
  const [draft, setDraft] = useState<HistoryFields | null>(null);
  const fields = draft ?? prefill.fields;
  const { allergyStatus, medicineStatus, allergyText, medicineText } = fields;
  const [editingOverride, setEditingOverride] = useState<boolean | null>(null);
  const [clarifyingOverride, setClarifying] = useState<boolean | null>(null);
  const [clarification, setClarification] = useState<ClarificationDraft | null>(null);
  const [clarificationRevision, setClarificationRevision] = useState(0);
  const acceptClarification = useCallback((value: ClarificationDraft) => setClarification(value), []);
  const identityHistory = useMemo(() => ({ allergies: allergyStatus === "confirmed" ? distinctEntries(allergyText) : [],
    medicines: medicineStatus === "confirmed" ? distinctEntries(medicineText) : [] }), [allergyStatus, allergyText, medicineStatus, medicineText]);
  const historyKey = JSON.stringify([visit.id, context?.updated_at, allergyStatus, medicineStatus, identityHistory]);
  const activeClarification = clarification?.key === historyKey ? clarification : null;
  const savedIdentity = context?.provenance.history_identity as HistoryIdentityRecord | undefined;
  const identityChanged = !!activeClarification && (!activeClarification.valid
    || !!activeClarification.details && JSON.stringify(activeClarification.details) !== JSON.stringify(savedIdentity?.details));
  const hasRecordedNames = identityHistory.allergies.length + identityHistory.medicines.length > 0;
  const savedNamesMatch = !!savedIdentity && JSON.stringify(savedIdentity.details.allergies.map((row) => row.recorded_text)) === JSON.stringify(identityHistory.allergies)
    && JSON.stringify(savedIdentity.details.medicines.map((row) => row.recorded_text)) === JSON.stringify(identityHistory.medicines);
  const clarifying = clarifyingOverride ?? (hasRecordedNames && !savedNamesMatch);
  const identityReady = !hasRecordedNames || !!activeClarification?.details;
  const planKey = JSON.stringify([visit.id, context?.updated_at, identityHistory.medicines]);
  const [planDraft, setPlanDraft] = useState<{ key: string; rows: CurrentMedicinePlan[] } | null>(null);
  const savedPlan = context?.provenance.medicine_plan as CurrentMedicinePlanRecord | undefined;
  const initialPlans = useMemo(() => prepareMedicinePlans(identityHistory.medicines, visit.id, savedPlan), [identityHistory.medicines, visit.id, savedPlan]);
  const plans = planDraft?.key === planKey ? planDraft.rows : initialPlans;
  const plansValid = medicinePlansValid(plans);
  const plansChanged = JSON.stringify(plans) !== JSON.stringify(initialPlans);
  const allergyStatusRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(editorRef, () => ({ open() {
    setEditingOverride(true);
    setClarifying(true);
    document.getElementById("patient-medicine-history")?.scrollIntoView({ block: "start", behavior: "smooth" });
    window.requestAnimationFrame(() => allergyStatusRef.current?.focus({ preventScroll: true }));
  } }), []);
  const editing = editingOverride ?? (draft !== null || allergyStatus === "unknown" && medicineStatus === "unknown");
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const inputKey = JSON.stringify([rx.activeConsultation?.id, context?.updated_at, rx.activeAnalysis?.id,
    rx.activeAnalysis?.payload, fields, activeClarification?.details, plans]);
  const reviewed = reviewedKey === inputKey;
  const submitting = useRef(false);
  const reviewedForVisit = prefill.reviewedForVisit;
  const dirty = identityChanged || plansChanged || allergyStatus !== statusOrUnknown(context?.allergy_status)
    || medicineStatus !== statusOrUnknown(context?.medicine_status)
    || allergyText !== (context?.allergies ?? []).join("\n")
    || medicineText !== (context?.current_medicines ?? []).join("\n");
  const missingKnownEntry = (allergyStatus === "confirmed" && entries(allergyText).length === 0)
    || (medicineStatus === "confirmed" && entries(medicineText).length === 0);
  const setField = rx.setField;
  const pending = dirty || !identityReady || !reviewedForVisit, reportedPending = rx.patientHistoryPending;
  useEffect(() => {
    if (reportedPending !== pending) setField("patientHistoryPending", pending);
  }, [pending, reportedPending, setField]);
  function edit(patch: Partial<HistoryFields>) {
    setDraft({ ...fields, ...patch }); setReviewedKey(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewed || !identityReady || !plansValid || missingKnownEntry || activeClarification && !activeClarification.valid || submitting.current || rx.loading) return;
    submitting.current = true;
    try {
      await rx.reviewPatientContext({
        allergy_status: allergyStatus,
        allergies: identityHistory.allergies,
        medicine_status: medicineStatus,
        current_medicines: identityHistory.medicines,
        reviewed: true, expected_updated_at: context?.updated_at ?? null,
        ...(activeClarification?.details ? { history_details: activeClarification.details } : {}),
        medicine_plans: plans,
      });
    } finally {
      submitting.current = false;
    }
  }

  async function handleSaveReportedHistory() {
    if (submitting.current || rx.loading) return;
    submitting.current = true;
    try {
      await rx.reviewPatientContext({
        allergy_status: allergyStatus,
        allergies: identityHistory.allergies,
        medicine_status: medicineStatus,
        current_medicines: identityHistory.medicines,
        reviewed: true,
        expected_updated_at: context?.updated_at ?? null,
        ...(activeClarification?.details ? { history_details: activeClarification.details } : {}),
        medicine_plans: plans,
      });
      setReviewedKey(inputKey);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">History is filled from this visit&apos;s reported analysis and saved patient history. Confirm it with the patient before saving. An empty or missing JSON list stays Unknown unless absence was confirmed.</p>
      {context && !reviewedForVisit && <p className="rounded-xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
        Saved patient history loaded. Confirm what is still current and update any changes before saving for this visit.
        {context.provenance.last_reviewed_at && ` Last reviewed: ${new Date(context.provenance.last_reviewed_at).toLocaleString()}.`}
      </p>}
      {prefill.hasReported && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-xs text-blue-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
                <span>📋</span> Reported History Detected in Consultation JSON
              </p>
              {prefill.reportedAllergies.length > 0 ? (
                <p className="text-blue-900">
                  <strong>Reported Allergies:</strong>{" "}
                  <span className="font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {prefill.reportedAllergies.join(", ")}
                  </span>
                </p>
              ) : (
                <p className="text-slate-500 italic">No specific allergies detected in JSON.</p>
              )}
              {prefill.reportedMedicines.length > 0 ? (
                <p className="text-blue-900">
                  <strong>Reported Current Medicines:</strong>{" "}
                  <span className="font-semibold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200">
                    {prefill.reportedMedicines.join(", ")}
                  </span>
                </p>
              ) : (
                <p className="text-slate-500 italic">No current medicines detected in JSON.</p>
              )}
              {draft && JSON.stringify(fields) !== JSON.stringify(prefill.fields) && (
                <button
                  type="button"
                  className="mt-2 font-semibold underline block text-blue-800"
                  disabled={rx.loading}
                  onClick={() => { setDraft(null); setReviewedKey(null); }}
                >
                  Reset to reported JSON values
                </button>
              )}
            </div>

            {(!reviewedForVisit || dirty) && (
              <button
                type="button"
                onClick={handleSaveReportedHistory}
                disabled={rx.loading || submitting.current}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition"
                title="Save reported allergies and medicines directly to patient profile"
              >
                {rx.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}
                Save to Patient Information
              </button>
            )}
          </div>
          {reviewedForVisit && !dirty && (
            <p className="mt-2 text-emerald-800 font-medium">✓ Saved and reviewed for this visit.</p>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Patient history summary">
        <div className="rounded-xl border border-slate-200 p-3 text-xs"><h3 className="font-semibold text-slate-700">Allergies</h3>
          <p className="mt-1 whitespace-pre-line" data-testid="allergy-summary">{allergyStatus === "confirmed" ? allergyText : allergyStatus === "none" ? "None reported" : "Unknown / not established"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-xs"><h3 className="font-semibold text-slate-700">Current medicines</h3>
          <p className="mt-1 whitespace-pre-line" data-testid="medicine-summary">{medicineStatus === "confirmed" ? medicineText : medicineStatus === "none" ? "None reported" : "Unknown / not established"}</p>
        </div>
      </div>
      <button type="button" className={buttonStyle} aria-expanded={editing} aria-controls="history-edit-fields" disabled={rx.loading} onClick={() => setEditingOverride(!editing)}>{editing ? "Hide history editor" : "Edit allergies and current medicines"}</button>
      <fieldset disabled={rx.loading} className="space-y-4">
      <div id="history-edit-fields" hidden={!editing}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="allergy-status" className="text-xs font-semibold text-slate-700">Allergy status</label>
            <select ref={allergyStatusRef} id="allergy-status" className={controlStyle} value={allergyStatus} onChange={(event) => edit({ allergyStatus: event.target.value as ContextStatus })}>
              <option value="unknown">Unknown / not established</option>
              <option value="none">None reported</option>
              <option value="confirmed">Known allergies</option>
            </select>
          </div>
          {allergyStatus === "confirmed" && (
            <div className="space-y-1.5">
              <label htmlFor="allergy-list" className="text-xs font-semibold text-slate-700">Allergies</label>
              <textarea id="allergy-list" className={controlStyle} rows={4} maxLength={10000} required value={allergyText}
                onChange={(event) => edit({ allergyText: event.target.value })} aria-describedby="allergy-help" />
              <p id="allergy-help" className="text-xs text-slate-500">One allergy per line. Include the reaction if known.</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="medicine-status" className="text-xs font-semibold text-slate-700">Current medicine status</label>
            <select id="medicine-status" className={controlStyle} value={medicineStatus} onChange={(event) => edit({ medicineStatus: event.target.value as ContextStatus })}>
              <option value="unknown">Unknown / not established</option>
              <option value="none">None reported</option>
              <option value="confirmed">Known current medicines</option>
            </select>
          </div>
          {medicineStatus === "confirmed" && (
            <div className="space-y-1.5">
              <label htmlFor="current-medicine-list" className="text-xs font-semibold text-slate-700">Current medicines</label>
              <textarea id="current-medicine-list" className={controlStyle} rows={4} maxLength={10000} required value={medicineText}
                onChange={(event) => edit({ medicineText: event.target.value })} aria-describedby="medicine-help" />
              <p id="medicine-help" className="text-xs text-slate-500">One medicine per line. Include the strength and schedule if known.</p>
            </div>
          )}
        </div>
      </div>
      </div>
        {hasRecordedNames && <>
          <p className="text-xs text-slate-600">Name proposals load automatically and are saved with your explicit history review. Confirm exact products; unsupported or ambiguous names remain unresolved.</p>
          <button type="button" className={buttonStyle} aria-expanded={clarifying} aria-controls="history-name-clarification" onClick={() => setClarifying(!clarifying)}>{clarifying ? "Hide name clarification" : "Clarify medicine and allergy names"}</button>
          <HistoryClarification key={`${historyKey}:${clarificationRevision}`} visit={visit.id} historyKey={historyKey} allergies={identityHistory.allergies} medicines={identityHistory.medicines}
            saved={savedIdentity} expanded={clarifying} disabled={rx.loading} onChange={acceptClarification} onDenied={rx.loadAll} />
          {clarifying && <button type="button" className="text-xs font-semibold text-purple-700 underline" onClick={() => { setClarification(null); setClarifying(false); setClarificationRevision((v) => v + 1); setReviewedKey(null); }}>Cancel name clarification</button>}
          {activeClarification && !activeClarification.valid && <p className="text-xs text-amber-900">Finish loading name options and add the requested clarification notes before saving. An unknown product can stay unresolved.</p>}
          {!identityReady && <p role="status" className="text-xs text-amber-900">Name confirmations are not ready. Open name clarification to retry if loading fails.</p>}
        </>}
        <CurrentMedicinePlans rows={plans} disabled={rx.loading} onChange={(rows) => { setPlanDraft({ key: planKey, rows }); setReviewedKey(null); }} />
        <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={reviewed} className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600" onChange={(event) => setReviewedKey(event.target.checked ? inputKey : null)} />
          I reviewed allergies and current medicines with the patient for this visit.
        </label>
      </fieldset>
      <button type="submit" className={buttonStyle} disabled={rx.loading || !reviewed || !identityReady || !plansValid || missingKnownEntry || !!activeClarification && !activeClarification.valid}>
        {rx.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
        Save patient information
      </button>
      {reviewedForVisit && !dirty ? (
        <p role="status" className="text-xs text-emerald-700">Patient information reviewed and saved for this visit.{context?.provenance.last_reviewed_at && ` ${new Date(context.provenance.last_reviewed_at).toLocaleString()}`}</p>
      ) : (
        <p className="text-xs text-amber-700">{dirty ? "Changes have not been saved. Review and save them for this visit." : "Patient information has not been reviewed for this visit yet."}</p>
      )}
    </form>
  );
}
