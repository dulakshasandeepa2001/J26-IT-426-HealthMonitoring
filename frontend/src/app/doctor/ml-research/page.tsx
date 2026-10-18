import { FrozenMLResearch } from "@/features/prescription-intelligence/FrozenMLResearch";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { consultation } = await searchParams;
  const requestedConsultation = Array.isArray(consultation) ? "" : consultation;
  return <FrozenMLResearch key={requestedConsultation ?? "saved-selection"} requestedConsultation={requestedConsultation} />;
}
