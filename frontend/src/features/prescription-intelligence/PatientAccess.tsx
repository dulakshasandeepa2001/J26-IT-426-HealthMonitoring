"use client";

import { useId } from "react";
import { FlaskConical, LockKeyhole, UserRound } from "lucide-react";
import { useDoctor } from "@/features/doctor-dashboard/DoctorContext";
import { buttonStyle, controlStyle, Section, Unavailable } from "./PageFrame";

export default function PatientAccess({ sampleMode, onSampleModeChange, onSamplePatientChange, allowSamplePreview = true }: { sampleMode: boolean; onSampleModeChange?: (enabled: boolean) => void; onSamplePatientChange?: () => void; allowSamplePreview?: boolean }) {
  const { queue, currentPatient, selectSamplePatient } = useDoctor();
  const id = useId();
  return (
    <Section title="Patient and encounter" icon={UserRound}>
      <Unavailable title="Authorized patient access unavailable">
        The service that verifies a doctor’s access to patients and encounters is not connected. Clinical patient selection and medication records remain unavailable.
      </Unavailable>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor={`${id}-patient`} className="text-xs font-semibold text-slate-700">Authorized patient</label><select id={`${id}-patient`} disabled className={controlStyle}><option>Patient access service unavailable</option></select></div>
        <div className="space-y-1.5"><label htmlFor={`${id}-encounter`} className="text-xs font-semibold text-slate-700">Authorized encounter</label><select id={`${id}-encounter`} disabled className={controlStyle}><option>Encounter access service unavailable</option></select></div>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500"><LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Clinical access must be verified by the server before patient data can be loaded.</p>
      {allowSamplePreview && <div className="mt-5 border-t border-slate-100 pt-4">
        <button type="button" disabled={!onSampleModeChange} aria-expanded={sampleMode} aria-controls={`${id}-sample`} onClick={() => onSampleModeChange?.(!sampleMode)} className={buttonStyle}><FlaskConical aria-hidden="true" className="h-4 w-4 text-purple-600" />{sampleMode ? "Close sample preview" : "Preview with existing sample patients"}</button>
        {sampleMode && (
          <div id={`${id}-sample`} className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs leading-relaxed text-amber-900"><strong>Sample data only.</strong> Reuses the overview’s illustrative patient data. This preview provides no access to clinical records and has no authorized encounter.</p>
            <div className="space-y-1.5"><label htmlFor={`${id}-sample-patient`} className="text-xs font-semibold text-amber-900">Sample patient from overview</label><select id={`${id}-sample-patient`} value={currentPatient?.id ?? ""} onChange={(event) => { selectSamplePatient(event.target.value); onSamplePatientChange?.(); }} className={controlStyle}>{queue.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.id}</option>)}</select></div>
          </div>
        )}
      </div>}
    </Section>
  );
}
