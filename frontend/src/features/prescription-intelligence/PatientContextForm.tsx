"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { usePrescription } from "./usePrescription";
import type { ContextStatus, HistoryDetails, HistoryIdentityRecord } from "./prescriptionApi";
import { buttonStyle, controlStyle } from "./PageFrame";
import { MedicineNameCheck } from "./MedicineNameCheck";
import { HistoryIdentityEditor } from "./HistoryIdentityEditor";

function statusOrUnknown(status: string | undefined): ContextStatus {
  return status === "confirmed" || status === "none" ? status : "unknown";
}

function entries(text: string) {
  return text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

export function PatientContextForm({ rx }: { rx: ReturnType<typeof usePrescription> }) {
  const context = rx.activePatientContext;
  const [allergyStatus, setAllergyStatus] = useState<ContextStatus>(statusOrUnknown(context?.allergy_status));
  const [medicineStatus, setMedicineStatus] = useState<ContextStatus>(statusOrUnknown(context?.medicine_status));
  const [allergyText, setAllergyText] = useState((context?.allergies ?? []).join("\n"));
  const [medicineText, setMedicineText] = useState((context?.current_medicines ?? []).join("\n"));
  const [reviewed, setReviewed] = useState(false);
  const [historyDetails, setHistoryDetails] = useState<HistoryDetails | undefined>();
  const recordedAllergies = useMemo(() => allergyStatus === "confirmed" ? entries(allergyText) : [], [allergyStatus, allergyText]);
  const recordedMedicines = useMemo(() => medicineStatus === "confirmed" ? entries(medicineText) : [], [medicineStatus, medicineText]);
  const savedIdentity = context?.provenance.history_identity as HistoryIdentityRecord | undefined;
  const onDetails = useCallback((details: HistoryDetails) => { setHistoryDetails(details); setReviewed(false); }, []);
  const loadAll = rx.loadAll;
  const onDenied = useCallback(() => { void loadAll(); }, [loadAll]);
  const submitting = useRef(false);
  const reviewedForVisit = context?.provenance.last_reviewed_consultation === rx.activeConsultation?.id;
  const dirty = allergyStatus !== statusOrUnknown(context?.allergy_status)
    || medicineStatus !== statusOrUnknown(context?.medicine_status)
    || allergyText !== (context?.allergies ?? []).join("\n")
    || medicineText !== (context?.current_medicines ?? []).join("\n")
    || historyDetails != null && JSON.stringify(historyDetails) !== JSON.stringify(savedIdentity?.details);
  const missingKnownEntry = (allergyStatus === "confirmed" && entries(allergyText).length === 0)
    || (medicineStatus === "confirmed" && entries(medicineText).length === 0);

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
        ...(historyDetails ? { history_details: historyDetails } : {}),
      });
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">Saved information is prefilled for this patient. Check it with the patient at each visit. Choose Unknown when the information has not been established.</p>
      {context && !reviewedForVisit && <p className="rounded-xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
        Saved patient history loaded. Confirm what is still current and update any changes before saving for this visit.
        {context.provenance.last_reviewed_at && ` Last reviewed: ${new Date(context.provenance.last_reviewed_at).toLocaleString()}.`}
      </p>}
      <fieldset disabled={rx.loading} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="allergy-status" className="text-xs font-semibold text-slate-700">Allergy status</label>
            <select id="allergy-status" className={controlStyle} value={allergyStatus} onChange={(event) => { setAllergyStatus(event.target.value as ContextStatus); setReviewed(false); setHistoryDetails(undefined); }}>
              <option value="unknown">Unknown / not established</option>
              <option value="none">None reported</option>
              <option value="confirmed">Known allergies</option>
            </select>
          </div>
          {allergyStatus === "confirmed" && (
            <div className="space-y-1.5">
              <label htmlFor="allergy-list" className="text-xs font-semibold text-slate-700">Allergies</label>
              <textarea id="allergy-list" className={controlStyle} rows={4} maxLength={10000} required value={allergyText}
                onChange={(event) => { setAllergyText(event.target.value); setReviewed(false); setHistoryDetails(undefined); }} aria-describedby="allergy-help" />
              <p id="allergy-help" className="text-xs text-slate-500">One allergy per line. Include the reaction if known.</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="medicine-status" className="text-xs font-semibold text-slate-700">Current medicine status</label>
            <select id="medicine-status" className={controlStyle} value={medicineStatus} onChange={(event) => { setMedicineStatus(event.target.value as ContextStatus); setReviewed(false); setHistoryDetails(undefined); }}>
              <option value="unknown">Unknown / not established</option>
              <option value="none">None reported</option>
              <option value="confirmed">Known current medicines</option>
            </select>
          </div>
          {medicineStatus === "confirmed" && (
            <div className="space-y-1.5">
              <label htmlFor="current-medicine-list" className="text-xs font-semibold text-slate-700">Current medicines</label>
              <textarea id="current-medicine-list" className={controlStyle} rows={4} maxLength={10000} required value={medicineText}
                onChange={(event) => { setMedicineText(event.target.value); setReviewed(false); setHistoryDetails(undefined); }} aria-describedby="medicine-help" />
              <p id="medicine-help" className="text-xs text-slate-500">One medicine per line. Include the strength and schedule if known.</p>
              <MedicineNameCheck key={medicineText} names={entries(medicineText)} disabled={rx.loading} onAccessDenied={() => { void rx.loadAll(); }} />
            </div>
          )}
        </div>
        <HistoryIdentityEditor visit={rx.activeConsultation!.id} allergies={recordedAllergies} medicines={recordedMedicines}
          saved={savedIdentity} value={historyDetails} onChange={onDetails} onDenied={onDenied} />
        <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={reviewed} className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600" onChange={(event) => setReviewed(event.target.checked)} />
          I reviewed allergies and current medicines with the patient for this visit.
        </label>
        {historyDetails && <p className="text-xs text-slate-600 sm:col-span-2">This confirmation includes the selected identities, reported reactions and schedules above. Unknown details remain unknown.</p>}
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
