import { BookOpen, Library, ShieldCheck } from "lucide-react";
import { PageFrame, Section, Unavailable } from "@/features/prescription-intelligence/PageFrame";

export default function MedicineKnowledge() {
  return (
    <PageFrame title="Medicine Knowledge" description="A reviewed medicine catalogue and evidence references for the initial influenza and chickenpox prescription pilot.">
      <Section title="Initial prescription pilot" icon={BookOpen}>
        <div className="grid gap-4 sm:grid-cols-2">{["Influenza", "Chickenpox"].map((condition) => <div key={condition} className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4"><h3 className="text-sm font-bold text-purple-800">{condition}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">Planned pilot scope. No reviewed medicine entries or evidence references are available.</p><p className="mt-3 text-[11px] font-semibold text-slate-600">Content review status: unavailable</p></div>)}</div>
      </Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Medicine catalogue" icon={Library}><Unavailable title="Catalogue unavailable">A reviewed medicine catalogue has not been connected. Medicine names in historical sample prescriptions do not establish catalogue entries or treatment recommendations.</Unavailable></Section>
        <Section title="Evidence references and review status" icon={ShieldCheck}><Unavailable title="Evidence library unavailable">No evidence references, review decisions or review dates have been supplied. Source, reviewer and review status will be shown when reviewed content is available.</Unavailable></Section>
      </div>
    </PageFrame>
  );
}
