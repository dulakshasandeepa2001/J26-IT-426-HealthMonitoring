import PrescriptionSlipView from "@/features/prescription-intelligence/PrescriptionSlip";

export default async function Page({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  return <PrescriptionSlipView key={decisionId} id={decisionId} />;
}
