"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { usePrescription } from "./usePrescription";
import type { ContextStatus } from "./prescriptionApi";
import { buttonStyle, controlStyle } from "./PageFrame";
import { patientHistoryPrefill, historyEntries as entries, type HistoryFields } from "./historyPrefill";

function statusOrUnknown(status: string | undefined): ContextStatus {
  return status === "confirmed" || status === "none" ? status : "unknown";
}

export function PatientContextForm({ rx }: { rx: ReturnType<typeof usePrescription> }) {
  const context = rx.activePatientContext;
  const visit = rx.activeConsultation!, analysis = rx.activeAnalysis;
  const prefill = useMemo(() => patientHistoryPrefill(visit, analysis, context), [visit, analysis, context]);
  const [draft, setDraft] = useState<HistoryFields | null>(null);
  const fields = draft ?? prefill.fields;
  const { allergyStatus, medicineStatus, allergyText, medicineText } = fields;
  const [editingOverride, setEditingOverride] = useState<boolean | null>(null);
  const editing = editingOverride ?? (draft !== null || allergyStatus === "unknown" && medicineStatus === "unknown");
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const inputKey = JSON.stringify([rx.activeConsultation?.id, context?.updated_at, rx.activeAnalysis?.id,
    rx.activeAnalysis?.payload, fields]);
  const reviewed = reviewedKey === inputKey;
  const submitting = useRef(false);
  const reviewedForVisit = prefill.reviewedForVisit;
  const dirty = allergyStatus !== statusOrUnknown(context?.allergy_status)
    || medicineStatus !== statusOrUnknown(context?.medicine_status)
    || allergyText !== (context?.allergies ?? []).join("\n")
    || medicineText !== (context?.current_medicines ?? []).join("\n");
  const missingKnownEntry = (allergyStatus === "confirmed" && entries(allergyText).length === 0)
    || (medicineStatus === "confirmed" && entries(medicineText).length === 0);
  const setField = rx.setField;
  const pending = dirty || !reviewedForVisit, reportedPending = rx.patientHistoryPending;
  useEffect(() => {
    if (reportedPending !== pending) setField("patientHistoryPending", pending);
  }, [pending, reportedPending, setField]);
  function edit(patch: Partial<HistoryFields>) {
    setDraft({ ...fields, ...patch }); setReviewedKey(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewed || missingKnownEntry || submitting.current || rx.loading) return;
    submitting.current = true;
    try {
      await rx.reviewPatientContext({
        allergy_status: allergyStatus,
        allergies: allergyStatus === "confirmed" ? entries(allergyText) : [],
        medicine_status: medicineStatus,
        current_medicines: medicineStatus === "confirmed" ? entries(medicineText) : [],
        reviewed: true, expected_updated_at: context?.updated_at ?? null,
      });
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
      {prefill.hasReported && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
        <p className="font-semibold">Reported JSON history — doctor review required</p>
        {prefill.reportedAllergies.length > 0 && <p className="mt-1">Reported allergies: {prefill.reportedAllergies.join(", ")}</p>}
        {prefill.reportedMedicines.length > 0 && <p className="mt-1">Reported medicines: {prefill.reportedMedicines.join(", ")}</p>}
        {draft && JSON.stringify(fields) !== JSON.stringify(prefill.fields) && <button type="button" className="mt-2 font-semibold underline" disabled={rx.loading} onClick={() => { setDraft(null); setReviewedKey(null); }}>Use reported and saved history</button>}
        {reviewedForVisit && <p className="mt-1">Your saved review is retained. Edit the history if these reported details need correction or inclusion.</p>}
      </div>}
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
            <select id="allergy-status" className={controlStyle} value={allergyStatus} onChange={(event) => edit({ allergyStatus: event.target.value as ContextStatus })}>
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
        <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={reviewed} className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600" onChange={(event) => setReviewedKey(event.target.checked ? inputKey : null)} />
          I reviewed allergies and current medicines with the patient for this visit.
        </label>
      </fieldset>
      <button type="submit" className={buttonStyle} disabled={rx.loading || !reviewed || missingKnownEntry}>
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
