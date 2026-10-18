import PrescriptionWorkspace from "@/features/prescription-intelligence/PrescriptionWorkspace";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { consultation } = await searchParams;
  // An ambiguous/empty handoff must not silently restore a different visit.
  const requestedConsultation = Array.isArray(consultation) ? "" : consultation;
  return <PrescriptionWorkspace key={requestedConsultation ?? "saved-selection"} requestedConsultation={requestedConsultation} />;
}
