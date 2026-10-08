import { ClipboardCheck, FileClock, ListChecks, ScrollText } from "lucide-react";
import { PageFrame, Section, Unavailable } from "@/features/prescription-intelligence/PageFrame";

export default function ValidationApprovalHistory() {
  return (
    <PageFrame title="Validation and Approval History" description="Recorded validation findings, supporting evidence, prescription versions and doctor decisions for authorized prescriptions.">
      <Unavailable title="Validation and approval history unavailable">No validation or prescription audit service is connected. Generation, corrections, validation, explicit clinician decisions and publication must refer to the recorded prescription version and authorized encounter.</Unavailable>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Section title="Validation findings and evidence" icon={ListChecks}><Unavailable title="No findings available">Validation findings and their evidence references cannot be loaded yet. No safety result is implied.</Unavailable></Section>
        <Section title="Prescription versions" icon={FileClock}><Unavailable title="No version history available">Recorded version identifiers and changes require prescription version storage.</Unavailable></Section>
        <Section title="Recorded doctor decisions" icon={ClipboardCheck}><Unavailable title="No decisions available">Review, rejection and approval decisions, their reasons and timestamps require the doctor-decision service.</Unavailable></Section>
        <Section title="Available audit information" icon={ScrollText}><Unavailable title="Audit information unavailable">There is no connected audit feed. Actor, patient/encounter, prescription version and event time will be displayed only when supplied by the authorized audit service.</Unavailable></Section>
      </div>
    </PageFrame>
  );
}
