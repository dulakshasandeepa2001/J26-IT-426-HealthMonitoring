"use client";
import { interfaceText } from "@/lib/productLanguage";

import { useState, type FormEvent } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import type { usePrescription } from "./usePrescription";
import { buttonStyle, controlStyle, Unavailable } from "./PageFrame";
import { visitDetails } from "./visitDetails";
import { consultationReference } from "./consultationReference";

type Prescription = ReturnType<typeof usePrescription>;
function ManualVisitForm({ rx, onStatus }: { rx: Prescription; onStatus: (message: string) => void }) {
  const [reason, setReason] = useState("");
  async function startVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStatus("");
    if (await rx.startConsultation(reason)) {
      onStatus("New visit saved. The registered patient ID stays the same.");
    }
  }
  return (
    <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">Start a visit manually</summary>
      <form onSubmit={startVisit} className="mt-3 space-y-3">
        <p className="text-xs font-bold text-slate-700">Start a new visit for this patient</p>
        <div className="space-y-1.5">
          <label htmlFor="visit-reason" className="text-xs font-semibold text-slate-700">Reason for visit</label>
          <input id="visit-reason" className={controlStyle} value={reason} maxLength={300} required disabled={rx.loading}
            placeholder="Enter the reason for this visit" onChange={(event) => setReason(event.target.value)} />
        </div>
        <button type="submit" className={buttonStyle} disabled={rx.loading || !reason.trim()}>
          {rx.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Start new consultation
        </button>
        <p className="text-xs text-slate-500">Use this when a visit has not already been created. A linked consultation opens automatically. Previous visit reasons and diagnoses are not copied.</p>
      </form>
    </details>
  );
}

export function EncounterSelector({ rx }: { rx: Prescription }) {
  const [savedMessage, setSavedMessage] = useState("");
  const visits = rx.consultations.filter((item) => item.patient === rx.activePatient?.id);
  const details = rx.activeConsultation ? visitDetails(rx.activeConsultation, rx.activeAnalysis) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="patient-select" className="text-xs font-semibold text-slate-700">Assigned registered patient</label>
        <select id="patient-select" className={controlStyle} value={rx.activePatient?.id ?? ""}
          disabled={rx.loading || rx.accessDenied || rx.patients.length === 0}
          onChange={(event) => rx.selectPatient(Number(event.target.value))}>
          <option value="">Select a patient</option>
          {rx.patients.map((patient) => (
            <option key={patient.id} value={patient.id}>#{patient.id} · {patient.display_name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500">Patients assigned to your doctor account appear here.</p>
      </div>

      {!rx.loading && !rx.error && rx.patients.length === 0 && (
        <Unavailable title="No patients assigned yet">
          Ask an administrator to assign a registered patient and create a consultation.
        </Unavailable>
      )}

      {rx.activePatient && (
        <>
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
            <p className="font-bold">{rx.activePatient.display_name} · Patient #{rx.activePatient.id}</p>
            <p className="mt-1">Registered username: {rx.activePatient.username}</p>
            <p className="mt-1">Registered DOB: {rx.activePatient.birthday ?? "Not recorded"}</p>
            <p className="mt-1">Age: {rx.activePatient.age_years != null ? `${rx.activePatient.age_years} years` : "Unavailable"}</p>
            {rx.activePatient.age_years == null && <p className="mt-1 text-amber-800">{rx.activePatient.dob_status === "future" ? "The registered DOB is in the future. Correct the registration record." : "A valid registered DOB is needed to calculate age."}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="consultation-select" className="text-xs font-semibold text-slate-700">Active encounter / consultation</label>
            <select id="consultation-select" className={controlStyle} value={rx.activeConsultation?.id ?? ""}
              onChange={(event) => rx.selectConsultation(event.target.value)} disabled={rx.loading}>
              <option value="">Select a saved visit</option>
              {visits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {new Date(visit.started_at).toLocaleString()} · {interfaceText(visit.reason)}{visit.is_demo ? " · Synthetic research" : ""}
                </option>
              ))}
            </select>
          </div>

          {rx.activeConsultation && (
            <dl className="grid gap-2 rounded-2xl border border-slate-200 p-3 text-xs sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-600">Consultation ID</dt><dd className="mt-1 break-all font-mono font-semibold tracking-wide text-purple-700" data-testid="consultation-reference">{consultationReference(rx.activeConsultation.id)}</dd>
                <details className="mt-2 text-slate-500"><summary className="cursor-pointer">Technical record ID</summary><p className="mt-1 break-all" data-testid="consultation-id">{rx.activeConsultation.id}</p></details>
              </div>
              <div><dt className="font-semibold text-slate-600">Visit status</dt><dd className="mt-1">{rx.activeConsultation.is_demo ? "Synthetic research consultation" : "Saved encounter"}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-600">Recorded visit reason</dt><dd className="mt-1" data-testid="current-visit-reason">{details?.reason ? interfaceText(details.reason) : "Not recorded"}</dd></div>
              {details?.complaint && <div className="sm:col-span-2"><dt className="font-semibold text-slate-600">Reported chief complaint — confirm for this visit</dt><dd className="mt-1" data-testid="current-visit-complaint">{details.complaint}</dd></div>}
            </dl>
          )}

          <ManualVisitForm key={rx.activeConsultation?.id ?? "no-visit"} rx={rx} onStatus={setSavedMessage} />
          {savedMessage && <p role="status" className="flex gap-2 text-xs text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />{savedMessage}</p>}

        </>
      )}
    </div>
  );
}
