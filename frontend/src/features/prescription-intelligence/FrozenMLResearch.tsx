"use client";

import Link from "next/link";
import { FlaskConical, Stethoscope } from "lucide-react";
import { usePrescription } from "./usePrescription";
import { EncounterSelector } from "./EncounterSelector";
import { ExperimentalMLPanel } from "./ExperimentalMLPanel";
import { buttonStyle, PageFrame, Section, Unavailable } from "./PageFrame";

export function FrozenMLResearch({ requestedConsultation }: { requestedConsultation?: string }) {
  const rx = usePrescription(requestedConsultation);
  return <PageFrame title="Experimental ML research" description="Inspect fixed fictional research scenarios separately from the prescription workflow. These predictions do not use the selected patient's history or prepare a prescription.">
    <Link className={buttonStyle} href={rx.activeConsultation ? `/doctor/prescription-workspace?consultation=${encodeURIComponent(rx.activeConsultation.id)}` : "/doctor/prescription-workspace"}>Return to Prescription Workspace</Link>
    {rx.error && <p role="alert" className="text-xs text-rose-800">{rx.error} <button type="button" className="font-semibold underline" onClick={rx.loadAll}>Retry</button></p>}
    <Section title="Research access consultation" icon={Stethoscope}><EncounterSelector key={rx.activePatient?.id ?? "none"} rx={rx} allowManualVisit={false} /></Section>
    <Section title="Experimental ML" icon={FlaskConical}>
      {rx.activeConsultation && !rx.accessDenied ? <ExperimentalMLPanel key={rx.activeConsultation.id} consultationId={rx.activeConsultation.id} isDemo={rx.activeConsultation.is_demo} /> : <Unavailable title="Select a consultation first">Choose an assigned synthetic research consultation to inspect fixed fictional scenarios.</Unavailable>}
    </Section>
  </PageFrame>;
}
