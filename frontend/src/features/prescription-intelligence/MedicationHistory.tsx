"use client";

import { useState } from "react";
import { AlertCircle, Pill } from "lucide-react";
import { useDoctor } from "@/features/doctor-dashboard/DoctorContext";
import PrescriptionHistory from "@/features/doctor-dashboard/PrescriptionHistory";
import PatientAccess from "./PatientAccess";
import { PageFrame, Section, Unavailable } from "./PageFrame";

export default function MedicationHistory() {
  const [sampleMode, setSampleMode] = useState(false);
  const { currentPatient } = useDoctor();
  return (
    <PageFrame title="Patient Medication History" description="Allergies, current medicines and previous prescriptions for patients whose access has been authorized.">
      <PatientAccess sampleMode={sampleMode} onSampleModeChange={setSampleMode} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Section title="Allergies" icon={AlertCircle}>
            {sampleMode && currentPatient ? <div><p className="mb-3 text-xs font-semibold text-amber-800">Sample allergies for {currentPatient.name}. Not clinically verified.</p><ul className="flex flex-wrap gap-2">{currentPatient.allergies.map((allergy) => <li key={allergy} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{allergy}</li>)}</ul></div> : <Unavailable title="Allergy records unavailable">Select an authorized patient once the access and history services are connected.</Unavailable>}
          </Section>
          <Section title="Current medicines" icon={Pill}><Unavailable title="Current medication list unavailable">The existing overview contains historical sample prescriptions, not a reconciled current medication list. Current medicines cannot be inferred from those prescriptions.</Unavailable></Section>
        </div>
        {sampleMode ? <PrescriptionHistory /> : <Section title="Previous prescriptions" icon={Pill}><Unavailable title="Prescription history unavailable">Clinical prescriptions can be loaded only after server verification of patient access. Use the sample preview to view the existing overview’s illustrative history.</Unavailable></Section>}
      </div>
    </PageFrame>
  );
}
