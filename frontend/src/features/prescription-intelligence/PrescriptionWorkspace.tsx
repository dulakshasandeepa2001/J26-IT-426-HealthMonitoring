"use client";

import {
  ArrowUpDown, BookOpen, Check, ClipboardCheck, FilePenLine, FileText,
  ListChecks, Mic, Pencil, Pill, Send, ShieldCheck, Sparkles, Stethoscope, X,
} from "lucide-react";
import PatientAccess from "./PatientAccess";
import { buttonStyle, controlStyle, PageFrame, Section, Unavailable } from "./PageFrame";

// No structured voice-result, generation or decision service is connected.
// The overview's simulated transcript and sample prescriptions cannot supply them.
const workflowSteps = [
  "Encounter and voice analysis",
  "Confirm diagnosis context",
  "Generate and screen candidates",
  "Clinician review and approval",
  "Publish approved version",
];

export default function PrescriptionWorkspace() {
  return (
    <PageFrame
      title="Prescription Workspace"
      description="Generate a prescription recommendation draft from the encounter-linked voice-analysis result and clinician-confirmed diagnosis, then review, correct and explicitly approve the prescription version."
    >
      <ol aria-label="Prescription workflow" className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        {workflowSteps.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-50 font-bold text-purple-700">{index + 1}</span>
            <span className="pt-0.5 font-semibold">{step}</span>
          </li>
        ))}
      </ol>

      <PatientAccess sampleMode={false} allowSamplePreview={false} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Section title="Structured voice-analysis result" icon={Mic}>
          <Unavailable title="Structured voice-analysis result unavailable">
            The voice-analysis result service is not connected. The structured result must be linked to the selected authorized patient encounter before its diagnosis context can be reviewed.
          </Unavailable>
          <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2">
            <div><dt className="font-semibold text-slate-600">Analysis result reference</dt><dd className="mt-1 text-slate-500">Unavailable</dd></div>
            <div><dt className="font-semibold text-slate-600">Patient / encounter linkage</dt><dd className="mt-1 text-slate-500">Awaiting authorized encounter and structured result</dd></div>
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">The overview&apos;s simulated voice transcript cannot establish an encounter-linked structured analysis result.</p>
        </Section>
        <Section title="Clinician diagnosis confirmation" icon={Stethoscope}>
          <fieldset disabled aria-describedby="diagnosis-confirmation-help" className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="diagnosis-context" className="text-xs font-semibold text-slate-700">Diagnosis context</label>
              <input id="diagnosis-context" readOnly placeholder="Awaiting the encounter-linked structured analysis" className={controlStyle} />
            </div>
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-purple-600" />
              I confirm the diagnosis context for this authorized patient encounter.
            </label>
          </fieldset>
          <p id="diagnosis-confirmation-help" className="mt-4 text-xs leading-relaxed text-slate-500">Review and correct the structured diagnosis context, then confirm it before generation. Confirmation awaits a result linked to the authorized encounter. A changed diagnosis requires renewed confirmation.</p>
          <p className="mt-3 text-[11px] text-slate-500">Initial prescription pilot: influenza and chickenpox.</p>
        </Section>
      </div>

      <Section title="Generate a prescription recommendation draft" icon={Sparkles}>
        <p className="text-sm leading-relaxed text-slate-600">Use the confirmed diagnosis, authorized patient context and reviewed medicine knowledge to generate candidates. Normalize medicines and apply deterministic safety checks before ranking eligible candidates.</p>
        <div id="generation-blockers" className="mt-4">
          <Unavailable title="Prescription generation unavailable">
            Authorized encounter access, the encounter-linked structured result, clinician diagnosis confirmation, reviewed knowledge and the generation / safety / ranking services are unavailable. No prescription draft has been generated.
          </Unavailable>
        </div>
        <button type="button" disabled aria-describedby="generation-blockers" className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
          <Sparkles aria-hidden="true" className="h-4 w-4" />Generate Prescription Draft
        </button>
      </Section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Section title="Generated prescription draft" icon={FileText}>
            <Unavailable title="No generated draft available">
              The system-generated recommendation draft and its version will appear here after generation, ready for clinician review.
            </Unavailable>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">Automatic dose selection is outside scope. The doctor supplies the proposed dose. Request clinician input when reviewed regimen information or required patient context is unavailable.</p>
          </Section>
          <Section title="Missing information and clinician input" icon={ListChecks}>
            <Unavailable title="Required inputs cannot be assessed yet">
              No authorized encounter context, structured analysis or reviewed regimen information has been loaded. No patient-specific missing fields have been inferred.
            </Unavailable>
            <ul className="mt-4 list-disc space-y-2 pl-4 text-xs leading-relaxed text-slate-600">
              <li>Request the clinician-proposed dose and input for unsupported or unavailable regimen information.</li>
              <li>Request context required by applicable rules. Weight is required only when an applicable validation rule needs it.</li>
              <li>Show unresolved requirements and block affected checks and candidate eligibility until resolved.</li>
            </ul>
          </Section>
          <Section title="Clinician review and corrections" icon={FilePenLine}>
            <Unavailable title="Review awaits a generated draft">
              Review the generated medicines, evidence, findings and ranking explanations. Manual entry and editing are clinician corrections to that generated draft.
            </Unavailable>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled aria-describedby="correction-help" className={buttonStyle}><Pencil aria-hidden="true" className="h-3.5 w-3.5" />Edit draft</button>
              <button type="button" disabled aria-describedby="decision-help" className={buttonStyle}><X aria-hidden="true" className="h-3.5 w-3.5" />Reject</button>
              <button type="button" disabled aria-describedby="decision-help" className={buttonStyle}><Check aria-hidden="true" className="h-3.5 w-3.5" />Approve</button>
            </div>
            <p id="correction-help" className="mt-4 text-xs leading-relaxed text-slate-500">Every edit creates a corrected version requiring revalidation and renewed ranking of eligible candidates. Previous validation and approval cannot authorize the edited version.</p>
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer rounded-lg text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600">Correction controls — available after generation</summary>
              <fieldset disabled aria-describedby="correction-help" className="mt-4 space-y-4">
                <div className="space-y-1.5"><label htmlFor="medicine-correction" className="text-xs font-semibold text-slate-700">Medicine correction</label><input id="medicine-correction" placeholder="Awaiting a generated medicine" className={controlStyle} /></div>
                <div className="space-y-1.5"><label htmlFor="proposed-dose" className="text-xs font-semibold text-slate-700">Doctor-proposed dose</label><input id="proposed-dose" placeholder="Clinician enters the amount and unit" className={controlStyle} /></div>
                <div className="space-y-1.5"><label htmlFor="regimen-correction" className="text-xs font-semibold text-slate-700">Regimen corrections</label><textarea id="regimen-correction" rows={2} placeholder="Clinician corrections to route, frequency or duration" className={controlStyle} /></div>
                <div className="space-y-1.5"><label htmlFor="correction-reason" className="text-xs font-semibold text-slate-700">Correction reason</label><textarea id="correction-reason" rows={2} className={controlStyle} /></div>
              </fieldset>
            </details>
            <button type="button" disabled aria-describedby="correction-help" className={buttonStyle + " mt-4"}><ListChecks aria-hidden="true" className="h-4 w-4" />Revalidate edited version</button>
          </Section>
          <Section title="Approved version and publication" icon={ClipboardCheck}>
            <Unavailable title="Approval and publication unavailable">
              Version storage, clinician-decision recording and publication services are not connected. No approved version is available to publish.
            </Unavailable>
            <p id="decision-help" className="mt-4 text-xs leading-relaxed text-slate-500">Approval requires completed validation and resolution of required information for that version. Publish only the version explicitly approved by the clinician for the authorized encounter. Any subsequent edit requires revalidation and new approval.</p>
            <button type="button" disabled aria-describedby="decision-help" className={buttonStyle + " mt-4"}><Send aria-hidden="true" className="h-4 w-4" />Publish Approved Version</button>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Medicine normalization" icon={Pill}>
            <Unavailable title="Normalization unavailable">No reviewed catalogue service is connected. Generated candidates must be linked to standard medicine identifiers for safety and evidence review.</Unavailable>
          </Section>
          <Section title="Deterministic safety-validation findings" icon={ShieldCheck}>
            <Unavailable title="Safety checks have not run">No safety-validation service or reviewed rules are connected. Deterministic checks must precede ranking. Candidates with blocking findings or unresolved required information remain ineligible.</Unavailable>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">Findings, rule references and missing-information states belong to the specific candidate and prescription version. Clinician dose input is needed for applicable regimen checks.</p>
          </Section>
          <Section title="Eligible candidate ranking and explanations" icon={ArrowUpDown}>
            <Unavailable title="No eligible candidate ranking available">Rank candidates eligible after deterministic safety checks. No candidates, ranks, scores or ranking explanations have been returned by a service.</Unavailable>
          </Section>
          <Section title="Evidence and reviewed medicine knowledge" icon={BookOpen}>
            <Unavailable title="Reviewed evidence unavailable">No reviewed knowledge or evidence-reference service is connected. Generated recommendations must expose their evidence references and knowledge review status.</Unavailable>
          </Section>
        </div>
      </div>
    </PageFrame>
  );
}
