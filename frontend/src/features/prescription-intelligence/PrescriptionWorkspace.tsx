"use client";

import Link from "next/link";
import {
  AlertTriangle, ArrowUpDown, BookOpen, Check, ClipboardCheck,
  FilePenLine, FileText, ListChecks, Loader2, Mic, Pencil,
  Pill, RefreshCw, Send, ShieldAlert, ShieldCheck, Sparkles, Stethoscope, X,
} from "lucide-react";
import { usePrescription } from "./usePrescription";
import { EncounterSelector } from "./EncounterSelector";
import { PatientContextForm } from "./PatientContextForm";
import { AnalysisResult } from "./AnalysisResult";
import { buttonStyle, controlStyle, PageFrame, Section, Unavailable } from "./PageFrame";

// ─── Workflow steps shown at the top ─────────────────────────────────────────
const workflowSteps = [
  "Encounter and voice analysis",
  "Confirm diagnosis context",
  "Generate and screen candidates",
  "Clinician review and approval",
  "Publish approved version",
];

// ─── Small helpers ────────────────────────────────────────────────────────────
function Badge({ label, variant }: { label: string; variant: "green" | "amber" | "rose" | "slate" }) {
  const colours = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${colours[variant]}`}>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PrescriptionWorkspace() {
  const rx = usePrescription();

  // Derived flags
  const hasConsultation = !!rx.activeConsultation;
  const canConfirm = hasConsultation && rx.diagnosisContext.trim().length > 0 && !rx.diagnosisConfirmed;
  const canGenerate = false; // The generation service is not connected yet.
  const hasDraft = false;
  const canApprove = hasDraft && rx.approvalStatus === "idle";
  const isApproved = rx.approvalStatus === "approved";
  const isRejected = rx.approvalStatus === "rejected";

  return (
    <PageFrame
      title="Prescription Workspace"
      description="Generate a prescription recommendation draft from the encounter-linked voice-analysis result and clinician-confirmed diagnosis, then review, correct and explicitly approve the prescription version."
    >
      {/* ── Workflow progress ── */}
      <ol aria-label="Prescription workflow" className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        {workflowSteps.map((step, index) => {
          const active = index <= rx.step;
          return (
            <li key={step} className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-bold ${
                  active ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-400"
                }`}
              >
                {index + 1}
              </span>
              <span className={`pt-0.5 font-semibold ${active ? "text-slate-900" : "text-slate-400"}`}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      {/* ── Global error banner ── */}
      {rx.error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Backend error</p>
            <p className="mt-0.5">{rx.error}</p>
            {rx.accessDenied && <Link href="/login" className="mt-2 inline-block font-bold underline">Sign in as a doctor</Link>}
          </div>
          <button type="button" onClick={rx.loadAll} className="ml-auto inline-flex items-center gap-1 font-bold hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {rx.loading && (
        <div className="flex items-center gap-2 text-xs text-purple-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading prescription data…
        </div>
      )}

      {/* ── Step 1 · Encounter / consultation selector ── */}
      <Section title="Patient and encounter" icon={Stethoscope}>
        <EncounterSelector key={rx.activePatient?.id ?? "none"} rx={rx} />
      </Section>

      <Section title="Patient allergies and current medicines" icon={ClipboardCheck}>
        {hasConsultation && rx.activePatient ? (
          <PatientContextForm key={`${rx.activeConsultation!.id}:${rx.activePatientContext?.updated_at ?? "new"}`} rx={rx} />
        ) : (
          <Unavailable title="Select a patient and visit first">Choose an assigned patient and saved consultation to record allergies and current medicines.</Unavailable>
        )}
      </Section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {/* ── Step 1 · Voice analysis result ── */}
        <Section title="Structured voice-analysis result" icon={Mic}>
          <AnalysisResult key={rx.activeConsultation?.id ?? "none"} rx={rx} />
        </Section>

        {/* ── Step 2 · Clinician diagnosis confirmation ── */}
        <Section title="Clinician diagnosis confirmation" icon={Stethoscope}>
          <fieldset aria-describedby="diagnosis-confirmation-help" className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="diagnosis-context" className="text-xs font-semibold text-slate-700">
                Diagnosis context
                {rx.diagnosisConfirmed && <Badge label="Confirmed" variant="green" />}
              </label>
              <input
                id="diagnosis-context"
                placeholder={hasConsultation ? "Enter or correct the proposed diagnosis" : "Awaiting encounter selection"}
                className={controlStyle}
                disabled={!hasConsultation || rx.diagnosisConfirmed}
                value={rx.diagnosisContext}
                onChange={(e) => rx.setField("diagnosisContext", e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-purple-600"
                checked={rx.diagnosisConfirmed}
                disabled={!canConfirm}
                onChange={() => {
                  if (canConfirm) rx.confirmDiagnosis();
                }}
              />
              I confirm the diagnosis context for this authorized patient encounter.
            </label>
            {canConfirm && (
              <button
                type="button"
                onClick={rx.confirmDiagnosis}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                disabled={rx.loading}
              >
                {rx.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm Diagnosis
              </button>
            )}
          </fieldset>
          <p id="diagnosis-confirmation-help" className="mt-4 text-xs leading-relaxed text-slate-500">
            Review and correct the structured diagnosis context, then confirm it before generation.
            A changed diagnosis requires renewed confirmation. Initial pilot: influenza and chickenpox.
          </p>
        </Section>
      </div>

      {/* ── Step 3 · Generate prescription draft ── */}
      <Section title="Generate a prescription recommendation draft" icon={Sparkles}>
        <p className="text-sm leading-relaxed text-slate-600">
          Use the confirmed diagnosis, authorized patient context and reviewed medicine knowledge to generate candidates.
          Normalize medicines and apply deterministic safety checks before ranking eligible candidates.
        </p>

        {!canGenerate && (
          <div id="generation-blockers" className="mt-4">
            <Unavailable title="Prescription generation unavailable">
              {!hasConsultation
                ? "Select an active consultation first."
                : "Prescription generation will be connected in a later step."}
            </Unavailable>
          </div>
        )}

        {canGenerate && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-bold">⚠ AI generation service not yet connected</p>
            <p className="mt-1">The diagnosis has been confirmed. Generation and approval become available after the ranking and safety-check engine is connected.</p>
          </div>
        )}

        <button
          type="button"
          disabled={!canGenerate || rx.loading}
          aria-describedby="generation-blockers"
          className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Generate Prescription Draft
        </button>
      </Section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          {/* ── Generated draft ── */}
          <Section title="Generated prescription draft" icon={FileText}>
            {hasDraft ? (
              <div className="space-y-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-500">Draft placeholder — AI engine not yet connected.</p>
                <p>Diagnosis confirmed: <strong>{rx.diagnosisContext}</strong></p>
                {rx.activePatientContext?.allergies && rx.activePatientContext.allergies.length > 0 && (
                  <p className="text-rose-700">
                    <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    Allergy flags: {rx.activePatientContext.allergies.join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <Unavailable title="No generated draft available">
                The system-generated recommendation draft will appear here after generation.
              </Unavailable>
            )}
            <p className="mt-4 text-xs leading-relaxed text-slate-500">Automatic dose selection is outside scope. The doctor supplies the proposed dose.</p>
          </Section>

          {/* ── Missing information ── */}
          <Section title="Missing information and clinician input" icon={ListChecks}>
            {rx.activePatientContext ? (
              <ul className="space-y-1.5 text-xs text-slate-700">
                {rx.activePatient?.age_years == null && (
                  <li className="flex items-center gap-2 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> A valid registered date of birth is needed to calculate age.</li>
                )}
                {rx.activePatientContext.medicine_status === "unknown" && (
                  <li className="flex items-center gap-2 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Current medicines are unknown.</li>
                )}
                {rx.activePatientContext.allergy_status === "unknown" && (
                  <li className="flex items-center gap-2 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Allergy status is unknown.</li>
                )}
                <li className="text-slate-500">Clinical safety and dose checks are not connected yet.</li>
              </ul>
            ) : (
              <Unavailable title="Required inputs cannot be assessed yet">
                No patient context loaded. Select a consultation to infer missing fields.
              </Unavailable>
            )}
          </Section>

          {/* ── Clinician review and corrections ── */}
          <Section title="Clinician review and corrections" icon={FilePenLine}>
            {!hasDraft ? (
              <Unavailable title="Review awaits a generated draft">
                Review the generated medicines, evidence, findings and ranking explanations once a draft is available.
              </Unavailable>
            ) : (
              <>
                {isApproved && (
                  <div className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    <Check className="h-4 w-4" /> This prescription version is approved.
                  </div>
                )}
                {isRejected && (
                  <div className="mb-3 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    <X className="h-4 w-4" /> This draft was rejected. Reason: {rx.rejectionReason || "Not specified."}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!canApprove} onClick={() => rx.setField("approvalStatus", "idle")} className={buttonStyle}><Pencil className="h-3.5 w-3.5" />Edit draft</button>
                  <button type="button" disabled={!canApprove} onClick={rx.rejectPrescription} className={buttonStyle}><X className="h-3.5 w-3.5" />Reject</button>
                  <button type="button" disabled={!canApprove} onClick={rx.approvePrescription} className={buttonStyle + " border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}><Check className="h-3.5 w-3.5" />Approve</button>
                </div>
              </>
            )}

            {hasDraft && !isApproved && (
              <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer rounded-lg text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600">
                  Correction controls
                </summary>
                <fieldset className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="medicine-correction" className="text-xs font-semibold text-slate-700">Medicine correction</label>
                    <input id="medicine-correction" placeholder="Enter corrected medicine name" className={controlStyle} value={rx.medicineCorrection} onChange={(e) => rx.setField("medicineCorrection", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="proposed-dose" className="text-xs font-semibold text-slate-700">Doctor-proposed dose</label>
                    <input id="proposed-dose" placeholder="e.g. 75 mg once daily for 5 days" className={controlStyle} value={rx.proposedDose} onChange={(e) => rx.setField("proposedDose", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="regimen-correction" className="text-xs font-semibold text-slate-700">Regimen corrections</label>
                    <textarea id="regimen-correction" rows={2} placeholder="Clinician corrections to route, frequency or duration" className={controlStyle} value={rx.regimenCorrection} onChange={(e) => rx.setField("regimenCorrection", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="correction-reason" className="text-xs font-semibold text-slate-700">Correction reason</label>
                    <textarea id="correction-reason" rows={2} className={controlStyle} value={rx.correctionReason} onChange={(e) => rx.setField("correctionReason", e.target.value)} />
                  </div>
                  {isRejected && (
                    <div className="space-y-1.5">
                      <label htmlFor="rejection-reason" className="text-xs font-semibold text-slate-700">Rejection reason</label>
                      <textarea id="rejection-reason" rows={2} className={controlStyle} value={rx.rejectionReason} onChange={(e) => rx.setField("rejectionReason", e.target.value)} />
                    </div>
                  )}
                </fieldset>
                <button type="button" className={buttonStyle + " mt-4"}><ListChecks className="h-4 w-4" />Revalidate edited version</button>
              </details>
            )}
          </Section>

          {/* ── Approved version and publication ── */}
          <Section title="Approved version and publication" icon={ClipboardCheck}>
            {isApproved ? (
              <div className="space-y-3 text-xs">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                  <p className="font-bold">Ready to publish</p>
                  <p className="mt-1">Diagnosis: {rx.diagnosisContext}</p>
                  {rx.proposedDose && <p>Proposed dose: {rx.proposedDose}</p>}
                </div>
                <button type="button" className={buttonStyle + " border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}>
                  <Send className="h-4 w-4" />Publish Approved Version
                </button>
              </div>
            ) : (
              <>
                <Unavailable title="Approval and publication unavailable">
                  Approve a generated and reviewed draft first. Unapproved recommendations cannot become medication instructions.
                </Unavailable>
                <button type="button" disabled aria-describedby="decision-help" className={buttonStyle + " mt-4"}>
                  <Send className="h-4 w-4" />Publish Approved Version
                </button>
              </>
            )}
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          {/* ── Medicine normalization ── */}
          <Section title="Medicine normalization" icon={Pill}>
            <p className="text-xs leading-relaxed text-slate-500">Use <strong>Check medicine names</strong> in the current medicines form to match supported pilot names. Exact product aliases have source-linked RxNorm identifiers; an ingredient name alone needs strength and formulation clarification.</p>
            <Link href="/doctor/medicine-knowledge" className="mt-3 inline-block text-xs font-semibold text-purple-700 underline">Browse supported medicines and evidence</Link>
            {rx.activePatientContext?.current_medicines && rx.activePatientContext.current_medicines.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-slate-600">Current medicines on record:</p>
                <ul className="flex flex-wrap gap-2">
                  {rx.activePatientContext.current_medicines.map((med) => (
                    <li key={med} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">{med}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {/* ── Safety validation ── */}
          <Section title="Deterministic safety-validation findings" icon={ShieldCheck}>
            {rx.activePatientContext ? (
              <div className="space-y-2 text-xs">
                {rx.activePatientContext.allergies.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div><p className="font-bold">Allergy check required</p><p className="mt-0.5">Patient has recorded allergies: {rx.activePatientContext.allergies.join(", ")}. All candidates must be screened.</p></div>
                  </div>
                )}
                <p className="text-slate-500">Full deterministic rules (interaction, contraindication, dose-range) will run once the safety engine is connected.</p>
              </div>
            ) : (
              <Unavailable title="Safety checks have not run">
                No patient context loaded. Safety rules cannot be applied without patient allergy and medicine data.
              </Unavailable>
            )}
          </Section>

          {/* ── Candidate ranking ── */}
          <Section title="Eligible candidate ranking and explanations" icon={ArrowUpDown}>
            <Unavailable title="No eligible candidate ranking available">
              Rank candidates eligible after deterministic safety checks. The ranking and XAI explanation engine will be connected in the next phase.
            </Unavailable>
          </Section>

          {/* ── Evidence ── */}
          <Section title="Evidence and reviewed medicine knowledge" icon={BookOpen}>
            <p className="text-xs leading-relaxed text-slate-500">The pilot catalogue includes source references, selected warnings and clinician content reviews. Evidence attached to a generated prescription draft will be available when generation is implemented.</p>
            <Link href="/doctor/medicine-knowledge" className="mt-3 inline-block text-xs font-semibold text-purple-700 underline">Open Medicine Knowledge</Link>
          </Section>
        </div>
      </div>
    </PageFrame>
  );
}
