"use client";
import { interfaceText } from "@/lib/productLanguage";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, ClipboardPlus, Loader2, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { controlStyle } from "@/features/prescription-intelligence/PageFrame";
import {
  assignConsultation, fetchAssignmentOptions, fetchAssignments,
  type AssignedConsultation, type AssignmentOptions,
} from "./assignmentApi";

export default function ConsultationAssignments({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const [options, setOptions] = useState<AssignmentOptions>({ doctors: [], patients: [] });
  const [assignments, setAssignments] = useState<AssignedConsultation[]>([]);
  const [doctor, setDoctor] = useState("");
  const [patient, setPatient] = useState("");
  const [reason, setReason] = useState("");
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [saved, setSaved] = useState<AssignedConsultation | null>(null);
  const saveInProgress = useRef(false);
  const loadSequence = useRef(0);

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : "Unable to load or save the consultation assignment.");
    if (err instanceof ApiError && [401, 403].includes(err.status)) {
      setAccessDenied(true);
      setOptions({ doctors: [], patients: [] });
      setAssignments([]);
      setSaved(null);
      setDoctor("");
      setPatient("");
      setReason("");
    }
  }, []);

  const loadAssignments = useCallback(() => {
    const sequence = ++loadSequence.current;
    return Promise.all([fetchAssignmentOptions(), fetchAssignments()]).then(([directory, recent]) => {
      if (sequence !== loadSequence.current) return;
      setOptions(directory);
      setAssignments(recent);
      setDoctor((id) => directory.doctors.some((item) => item.id === Number(id)) ? id : "");
      setPatient((id) => directory.patients.some((item) => item.id === Number(id)) ? id : "");
      setAccessDenied(false);
      setError("");
    }).catch((err: unknown) => {
      if (sequence === loadSequence.current) handleError(err);
    }).finally(() => {
      if (sequence === loadSequence.current) setLoading(false);
    });
  }, [handleError]);

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    void loadAssignments();
  }, [loadAssignments]);

  const invalidateLoads = useCallback(() => { ++loadSequence.current; }, []);
  useEffect(() => {
    void loadAssignments();
    return invalidateLoads;
  }, [loadAssignments, invalidateLoads, refreshVersion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctor || !patient || !reason.trim() || saveInProgress.current || loading || accessDenied) return;
    saveInProgress.current = true;
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const visit = await assignConsultation({
        doctor: Number(doctor), patient: Number(patient), reason: reason.trim(), is_demo: isDemo,
      });
      setAssignments((items) => [visit, ...items.filter((item) => item.id !== visit.id)].slice(0, 10));
      setSaved(visit);
      setReason("");
    } catch (err) {
      handleError(err);
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  const busy = loading || saving;
  return (
    <section aria-labelledby="consultation-assignment-title" className="mb-8 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xl shadow-blue-600/5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="consultation-assignment-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <ClipboardPlus className="h-5 w-5 text-blue-600" aria-hidden="true" />Assign patient to doctor
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Assign a registered patient and create the first visit for the doctor to open.</p>
        </div>
        <button type="button" onClick={reload} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh doctors and patients
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div>{error}{accessDenied && <Link href="/login" className="mt-2 block font-bold underline">Sign in with your admin account</Link>}</div>
        </div>
      )}
      {loading && <p role="status" className="mb-4 flex items-center gap-2 text-xs text-blue-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading registered doctors and patients…</p>}
      {!loading && !accessDenied && !error && options.doctors.length === 0 && <p className="mb-4 text-xs text-amber-700">No active approved doctors found. Approve a doctor registration below to assign a visit.</p>}
      {!loading && !accessDenied && !error && options.patients.length === 0 && <p className="mb-4 text-xs text-amber-700">No active registered patients found. Register a patient account, then refresh this list.</p>}

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy || accessDenied} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="assignment-doctor" className="text-xs font-bold text-slate-700">Approved doctor</label>
            <select id="assignment-doctor" className={controlStyle} value={doctor} required onChange={(event) => setDoctor(event.target.value)}>
              <option value="">Select a doctor</option>
              {options.doctors.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.doctorID || "User #" + item.id}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="assignment-patient" className="text-xs font-bold text-slate-700">Registered patient</label>
            <select id="assignment-patient" className={controlStyle} value={patient} required onChange={(event) => setPatient(event.target.value)}>
              <option value="">Select a patient</option>
              {options.patients.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.display_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="assignment-reason" className="text-xs font-bold text-slate-700">Visit reason</label>
            <input id="assignment-reason" className={controlStyle} value={reason} required maxLength={300}
              placeholder="Enter the reason for this visit" onChange={(event) => setReason(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 md:col-span-2">
            <input type="checkbox" checked={isDemo} onChange={(event) => setIsDemo(event.target.checked)} className="h-4 w-4 accent-blue-600" />
            Synthetic research consultation
          </label>
        </fieldset>
        <button type="submit" disabled={busy || accessDenied || !doctor || !patient || !reason.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardPlus className="h-4 w-4" aria-hidden="true" />}
          {saving ? "Saving assignment…" : "Assign and create consultation"}
        </button>
      </form>

      {saved && (
        <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
          <p className="flex items-center gap-2 font-bold"><CheckCircle className="h-4 w-4" aria-hidden="true" />Consultation assigned successfully.</p>
          <p className="mt-2">{saved.patient_name} → {saved.doctor_name}</p>
          <p className="mt-1 break-all">Consultation ID: {saved.id}</p>
          <p className="mt-2">The doctor can now select this patient in Prescription Workspace.</p>
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-bold text-slate-800">Recent consultation assignments</h3>
        {!loading && !accessDenied && assignments.length === 0 && <p className="mt-2 text-xs text-slate-500">No assigned visits yet.</p>}
        <ul className="mt-3 space-y-3">
          {assignments.map((visit) => (
            <li key={visit.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-800">{visit.patient_name} → {visit.doctor_name}</p>
                <span className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{visit.is_demo ? "Synthetic research" : "Consultation"}</span>
              </div>
              <p className="mt-1 break-words">{interfaceText(visit.reason)}</p>
              <p className="mt-1">{new Date(visit.started_at).toLocaleString()}</p>
              <p className="mt-1 break-all text-[11px] text-slate-500">{visit.id}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
