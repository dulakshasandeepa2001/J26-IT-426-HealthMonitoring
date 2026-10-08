import Link from "next/link";
import { FileClock, FileX, FileCheck, History } from "lucide-react";
import { buttonStyle, PageFrame, Section, Unavailable } from "@/features/prescription-intelligence/PageFrame";

export default function PrescriptionRecords() {
  return (
    <PageFrame title="Prescription Records" description="System-generated recommendation drafts, clinician-approved prescriptions and rejected versions with their recorded status and version information.">
      <Unavailable title="Prescription record storage unavailable">No prescription storage or version service is connected. Generation and clinician decisions are unavailable until the required services are connected. Status, version, patient/encounter and doctor-decision details will be shown only when returned by the authorized service.</Unavailable>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Section title="Drafts" icon={FileClock}><Unavailable title="Draft records unavailable">Saved drafts and their version identifiers cannot be loaded yet.</Unavailable></Section>
        <Section title="Approved prescriptions" icon={FileCheck}><Unavailable title="Approved records unavailable">No recorded approvals are available from a connected service.</Unavailable></Section>
        <Section title="Rejected versions" icon={FileX}><Unavailable title="Rejected records unavailable">Rejected versions and their recorded decision reasons cannot be loaded yet.</Unavailable></Section>
      </div>
      <Section title="Existing patient history" icon={History}><p className="mb-4 text-xs leading-relaxed text-slate-500">The overview’s sample prescriptions remain available in Patient Medication History. Those examples have no recorded approval status or version, so they are not classified as approved prescriptions here.</p><Link href="/doctor/patient-medication-history" className={buttonStyle}>Open Patient Medication History</Link></Section>
    </PageFrame>
  );
}
