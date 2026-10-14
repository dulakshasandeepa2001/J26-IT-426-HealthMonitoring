"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ClipboardCheck, History, Loader2, Sparkles } from "lucide-react";
import { ApiError } from "@/lib/api";
import { buttonStyle, controlStyle, Section, Unavailable } from "./PageFrame";
import { DraftResult } from "./DraftResult";
import { RegimenDetails } from "./RegimenDetails";
import { readComponent1Payload } from "./analysisData";
import { fetchDrafts, fetchSafetyProfiles, generateDraft, type ClinicalDetails, type DraftRequest, type PrescriptionDraft, type SafetyProfile } from "./draftApi";
import { useRegimenSuggestions } from "./useRegimenSuggestions";
import type { usePrescription } from "./usePrescription";

const emptyClinical: ClinicalDetails = { reviewed: false, onset_hours: null, weight_kg: null, red_flags: "unknown", renal_assessment: "unknown", hepatic_assessment: "unknown", special_population: "unknown", varicella_risk: "unknown", laiv_timing: "unknown", topical_assessment: "unknown", verified_symptoms: [], symptoms_reviewed: false, symptom_durations: {} };
const targets = [{ code: "fever", label: "Fever" }, { code: "body_aches", label: "Body aches" }, { code: "itching", label: "Itching" }];
const selectFields: { key: keyof ClinicalDetails; label: string; options: [string, string][]; condition?: string }[] = [
  { key: "red_flags", label: "Red-flag assessment", options: [["unknown", "Unknown / not assessed"], ["none", "Doctor assessed: none reported"], ["present", "Red flags present"]] },
  { key: "renal_assessment", label: "Renal dosing assessment", options: [["unknown", "Unknown"], ["standard", "Reviewed: standard renal context"], ["requires_adjustment", "Adjusted dosing needs review"]] },
  { key: "hepatic_assessment", label: "Hepatic and alcohol-risk assessment", options: [["unknown", "Unknown"], ["standard", "Reviewed: standard context"], ["requires_review", "Individual review required"]] },
  { key: "special_population", label: "Special population assessment", options: [["unknown", "Unknown"], ["standard", "Reviewed: standard pilot context"], ["requires_review", "Specialist/additional review required"]] },
  { key: "varicella_risk", label: "Varicella indication assessment", condition: "chickenpox", options: [["unknown", "Unknown"], ["risk_group_confirmed", "Applicable risk-group indication confirmed"], ["typical_uncomplicated_child", "Typical uncomplicated varicella in healthy child"]] },
  { key: "topical_assessment", label: "Topical use assessment", condition: "chickenpox", options: [["unknown", "Unknown"], ["standard", "Reviewed: suitable external-use context"], ["requires_review", "Individualized topical review required"]] },
  { key: "laiv_timing", label: "Live intranasal influenza vaccine timing", condition: "influenza", options: [["unknown", "Unknown"], ["no_conflict", "Reviewed: no label timing conflict"], ["requires_review", "Timing needs review"]] },
];
function comparable(value: ClinicalDetails) {
  return JSON.stringify(Object.fromEntries(Object.entries({ ...emptyClinical, ...value, reviewed: true,
    verified_symptoms: [...(value.verified_symptoms ?? [])].sort(),
    symptom_durations: Object.fromEntries(Object.entries(value.symptom_durations ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, hours]) => [key, hours == null ? null : Number(hours)])),
    onset_hours: value.onset_hours == null ? null : Number(value.onset_hours), weight_kg: value.weight_kg == null ? null : Number(value.weight_kg),
  }).sort(([a], [b]) => a.localeCompare(b))));
}

export function DraftFlow({ rx }: { rx: ReturnType<typeof usePrescription> }) {
  const visit = rx.activeConsultation, context = rx.activePatientContext;
  const diagnosis = rx.diagnoses.find((item) => item.consultation === visit?.id);
  const condition = diagnosis ? (diagnosis.condition_code.toLowerCase() === "manual" ? diagnosis.condition_label.toLowerCase() : diagnosis.condition_code.toLowerCase()) : "";
  const [profiles, setProfiles] = useState<SafetyProfile[]>([]), [drafts, setDrafts] = useState<PrescriptionDraft[]>([]);
  const [selected, setSelected] = useState(""), [clinical, setClinical] = useState<ClinicalDetails>(emptyClinical);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [savedMessage, setSavedMessage] = useState<string | null>(null);
  const alive = useRef(true), locked = useRef(false), initialized = useRef(false), symptomsEdited = useRef(false);
  const request = useRef<{ key: string; body: string } | null>(null), sequence = useRef(0);
  const reloadWorkspace = rx.loadAll, visitId = visit?.id;
  const analysis = rx.activeAnalysis ? readComponent1Payload(rx.activeAnalysis.payload) : null;
  const sourceSymptoms = JSON.stringify((analysis?.symptoms ?? []).filter((row) => row.present && targets.some((target) => target.code === row.code)).map((row) => ({ code: row.code, hours: row.duration_days == null ? null : String(row.duration_days * 24) })));
  useEffect(() => {
    const timer = setTimeout(() => {
      if (symptomsEdited.current) return;
      const rows: { code: string; hours: string | null }[] = JSON.parse(sourceSymptoms);
      setClinical((old) => ({ ...old, verified_symptoms: rows.map((row) => row.code), symptom_durations: Object.fromEntries(rows.map((row) => [row.code, row.hours])), symptoms_reviewed: false, reviewed: false }));
    }, 0);
    return () => clearTimeout(timer);
  }, [sourceSymptoms]);
  const load = useCallback(async () => {
    if (!visitId) return;
    const current = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const [rules, records] = await Promise.all([fetchSafetyProfiles(), fetchDrafts(visitId)]);
      if (!alive.current || current !== sequence.current) return;
      setProfiles(rules); setDrafts(records); setSelected((old) => records.some((item) => item.id === old) ? old : records[0]?.id ?? "");
      if (!initialized.current && records[0]) {
        setClinical((old) => ({ ...old, ...records[0].snapshot.clinical, reviewed: false }));
        symptomsEdited.current = Array.isArray(records[0].snapshot.clinical.verified_symptoms);
      }
      initialized.current = true;
    } catch (err) {
      if (!alive.current || current !== sequence.current) return;
      setError(err instanceof Error ? err.message : "Screening data could not be loaded.");
      if (err instanceof ApiError && [401, 403].includes(err.status)) { setDrafts([]); setProfiles([]); setClinical(emptyClinical); void reloadWorkspace(); }
    } finally { if (alive.current && current === sequence.current) setLoading(false); }
  }, [visitId, reloadWorkspace, setLoading, setError, setProfiles, setDrafts, setSelected, setClinical]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => { void load(); }, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate, context?.updated_at, diagnosis?.id]);
  const readyContext = context?.provenance.last_reviewed_consultation === visitId && context?.provenance.last_reviewed_by === visit?.doctor;
  const eligible = profiles.filter((profile) => profile.conditions.includes(condition) && profile.review_is_current && profile.catalogue_review_current);
  const received = useCallback(() => { setClinical((old) => ({ ...old, reviewed: false })); }, [setClinical]);
  const denied = useCallback((message: string) => { setError(message); setDrafts([]); setProfiles([]); setClinical(emptyClinical); void reloadWorkspace(); }, [reloadWorkspace, setError, setDrafts, setProfiles, setClinical]);
  const suggestionInput = readyContext && diagnosis && context && eligible.length && !loading && ["influenza", "chickenpox"].includes(condition) ? JSON.stringify({ diagnosis_id: diagnosis.id, expected_context_updated_at: context.updated_at, clinical: { ...clinical, reviewed: false } }) : null;
  const knowledgeVersion = JSON.stringify({ birthday: rx.activePatient?.birthday, profiles: eligible.map((profile) => [profile.medicine, profile.content_hash, profile.medicine_content_hash, profile.updated_at]) });
  const regimens = useRegimenSuggestions(visitId, suggestionInput, knowledgeVersion, received, denied);
  const selectedMedicines = regimens.data?.suggestions.filter((row) => row.status === "suggested" && row.dose) ?? [];
  const excludedMedicines = regimens.data?.suggestions.filter((row) => row.status !== "suggested") ?? [];
  const latest = drafts[0], active = drafts.find((row) => row.id === selected) ?? latest;
  const edited = !!active && (comparable(clinical) !== comparable(active.snapshot.clinical) || active.result.selection_mode !== "automatic");
  const canGenerate = !!visit && !!diagnosis && readyContext && eligible.length > 0 && clinical.reviewed && !loading && !busy && !regimens.loading && !!regimens.data && !regimens.error;
  function change(key: keyof ClinicalDetails, value: ClinicalDetails[keyof ClinicalDetails]) { setClinical((old) => ({ ...old, [key]: value, reviewed: key === "reviewed" ? Boolean(value) : false })); setSavedMessage(null); }
  function symptomChange(code: string, checked: boolean) {
    symptomsEdited.current = true;
    setClinical((old) => ({ ...old, verified_symptoms: checked ? [...(old.verified_symptoms ?? []).filter((item) => item !== code), code] : (old.verified_symptoms ?? []).filter((item) => item !== code), symptoms_reviewed: false, reviewed: false }));
    setSavedMessage(null);
  }
  function durationChange(code: string, value: string) {
    symptomsEdited.current = true;
    setClinical((old) => ({ ...old, symptom_durations: { ...old.symptom_durations, [code]: value || null }, symptoms_reviewed: false, reviewed: false }));
    setSavedMessage(null);
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate || !visit || !diagnosis || !context || locked.current) return;
    locked.current = true; setBusy(true); setError(null); setSavedMessage(null);
    const input = { diagnosis_id: diagnosis.id, expected_context_updated_at: context.updated_at, expected_latest_revision: latest?.revision ?? 0, clinical, selection_mode: "automatic" as const, expected_plan_hash: regimens.data!.plan_hash, proposals: [] };
    const body = JSON.stringify(input);
    if (!request.current || request.current.body !== body) request.current = { key: crypto.randomUUID(), body };
    const data: DraftRequest = { ...input, request_key: request.current.key };
    try {
      const saved = await generateDraft(visit.id, data);
      if (!alive.current) return;
      setDrafts((rows) => [saved, ...rows.filter((row) => row.id !== saved.id).map((row) => ({ ...row, current_state: { is_current: false, reason: "A newer draft version exists." } }))]);
      setSelected(saved.id); setSavedMessage(`Screening draft version ${saved.revision} saved. It is unapproved.`); setClinical((old) => ({ ...old, reviewed: false })); request.current = null;
    } catch (err) {
      if (!alive.current) return;
      const message = err instanceof Error ? err.message : "Draft could not be saved.";
      setError(message);
      if (err instanceof ApiError && [401, 403].includes(err.status)) denied(message);
      else if (err instanceof ApiError && err.status === 409) { setClinical((old) => ({ ...old, reviewed: false })); request.current = null; regimens.refresh(); }
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  if (!visit) return <Section title="Generate a prescription recommendation draft" icon={Sparkles}><Unavailable title="Select a patient and visit">Confirm the diagnosis and review patient information before screening.</Unavailable><button type="button" disabled className={buttonStyle + " mt-4"}>Generate Prescription Draft</button></Section>;
  return <div className="space-y-6">
    <Section title="Generate a prescription recommendation draft" icon={Sparkles}>
      <p className="text-sm leading-relaxed text-slate-600">Medicines and regimens are selected automatically from reviewed rules, the confirmed diagnosis and verified patient information. Review the selected plan and exclusions before saving.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={buttonStyle} disabled={busy || loading} onClick={load}>Refresh drafts and rules</button><Link href="/doctor/medicine-knowledge" className="self-center text-xs font-semibold text-purple-700 underline">Review medicine knowledge and safety rules</Link></div>
      {!diagnosis && <p className="mt-3 text-xs text-amber-800">Confirm this visit diagnosis first.</p>}
      {diagnosis && !["influenza", "chickenpox"].includes(condition) && <p className="mt-3 text-xs text-amber-800">This confirmed diagnosis is outside the current prescription pilot.</p>}
      {!readyContext && <p className="mt-3 text-xs text-amber-800">Review/save allergies and current medicines for this visit first.</p>}
      {!loading && !eligible.length && <p className="mt-3 text-xs text-amber-800">No relevant medicine has both current catalogue and executable-rule reviews.</p>}
      {loading && <p role="status" className="mt-3 text-xs text-slate-500">Loading screening knowledge and draft history…</p>}
      <form onSubmit={generate} className="mt-5 space-y-5">
        <fieldset disabled={busy || loading} className="space-y-4">
          <legend className="text-sm font-bold text-slate-800">Doctor-verified clinical inputs for this screening</legend>
          <p className="text-xs leading-relaxed text-slate-500">Assess pregnancy/breastfeeding, immunocompromise and complicated disease in the special-population field. Keep Unknown when information is not established.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{selectFields.filter((field) => !field.condition || field.condition === condition).map((field) => <label key={field.key} className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{field.label}</span><select className={controlStyle} value={String(clinical[field.key] ?? "unknown")} onChange={(e) => change(field.key, e.target.value)}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{condition === "chickenpox" ? "Hours since varicella rash onset" : "Hours since influenza symptom onset"}</span><input type="number" min="0" max="8760" step="0.1" className={controlStyle} value={clinical.onset_hours ?? ""} onChange={(e) => change("onset_hours", e.target.value || null)} /></label>
            {(rx.activePatient?.age_years == null || rx.activePatient.age_years < 18) && <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Measured weight (kg; applicable pediatric rules only)</span><input type="number" min="0.1" max="350" step="0.1" className={controlStyle} value={clinical.weight_kg ?? ""} onChange={(e) => change("weight_kg", e.target.value || null)} /></label>}
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4"><h3 className="text-xs font-bold text-slate-800">Symptom targets for medicine selection</h3><p className="text-xs text-slate-500">Reported symptoms and durations are prefilled from the analysis. Verify or correct them with the patient; absent targets do not select symptom-relief medicines.</p>
            <div className="space-y-3">{targets.map((target) => <div key={target.code} className="space-y-2"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={(clinical.verified_symptoms ?? []).includes(target.code)} onChange={(e) => symptomChange(target.code, e.target.checked)} />{target.label} requires symptom relief</label>{(clinical.verified_symptoms ?? []).includes(target.code) && <label className="block space-y-1.5"><span className="text-xs font-semibold">{target.label}: verified duration (hours)</span><input type="number" min="0" max="8760" step="0.1" className={controlStyle} value={clinical.symptom_durations?.[target.code] ?? ""} onChange={(e) => durationChange(target.code, e.target.value)} /></label>}</div>)}</div>
            <label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" checked={clinical.symptoms_reviewed ?? false} onChange={(e) => { symptomsEdited.current = true; change("symptoms_reviewed", e.target.checked); }} />I verified these symptom targets and durations for this visit.</label>
          </div>
          {eligible.length > 0 && <div className="space-y-2"><button type="button" className={buttonStyle} disabled={busy || loading || regimens.loading || !suggestionInput} onClick={regimens.refresh}>Refresh dose suggestions</button>{regimens.loading && <p role="status" className="text-xs text-slate-500">Updating automatic medicine selection…</p>}{regimens.error && <p role="alert" className="text-xs text-rose-700">Automatic medicine selection unavailable: {regimens.error}</p>}</div>}
          <div role="region" aria-label="Automatically selected medicines" className="space-y-4"><h3 className="text-sm font-bold text-slate-800">Medicines selected for this patient</h3>
            {selectedMedicines.map((row) => <article key={row.medicine_id} aria-label={row.generic_name ?? row.medicine_id} className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-xs text-purple-900"><h4 className="text-sm font-bold">{row.generic_name ?? profiles.find((profile) => profile.medicine === row.medicine_id)?.generic_name}</h4><p>Automatic rule suggestion · Clinician review required</p><RegimenDetails dose={row.dose!} /><p>Rule version: {row.rule_version}</p><div className="flex flex-wrap gap-3">{row.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{source.publisher}<span className="sr-only">: {source.title}</span></a>)}</div></article>)}
            {regimens.data && !selectedMedicines.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No automatic medicine selected. Review the exclusions and patient assessment below.</p>}
          </div>
          {excludedMedicines.length > 0 && <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><summary className="cursor-pointer font-bold">Medicines not selected for this patient</summary><ul className="mt-3 space-y-4">{excludedMedicines.map((row) => <li key={row.medicine_id}><p className="font-semibold">{row.generic_name ?? row.medicine_id} · {row.status === "not_needed" ? "No verified symptom target" : "Assessment or scope prevents selection"}</p><ul className="mt-2 list-disc space-y-1 pl-4">{row.reasons.map((reason, index) => <li key={index}>{reason.message}</li>)}</ul></li>)}</ul></details>}
          {regimens.data?.omitted_unreviewed?.length ? <p className="text-xs text-amber-800">Some relevant medicines still need current catalogue and rule reviews. They are recorded as omitted in the saved draft.</p> : null}
          <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-700"><input type="checkbox" disabled={regimens.loading || !regimens.data || !!regimens.error} checked={clinical.reviewed} onChange={(e) => change("reviewed", e.target.checked)} />I reviewed these clinical inputs and proposed doses for this visit.</label>
        </fieldset>
        <button type="submit" disabled={!canGenerate} className={buttonStyle + " border-purple-200 bg-purple-50 text-purple-700"}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Generate Prescription Draft</button>
      </form>
      {error && <p role="alert" className="mt-4 text-xs text-rose-700">{error}</p>}{savedMessage && <p role="status" className="mt-4 text-xs text-emerald-700">{savedMessage}</p>}
    </Section>
    {active && <DraftResult draft={active} edited={edited} />}
    <Section title="Draft versions" icon={History}>{drafts.length ? <label className="block space-y-2"><span className="text-xs font-semibold">Saved screening version</span><select className={controlStyle} value={active?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>{drafts.map((draft) => <option key={draft.id} value={draft.id}>Version {draft.revision} · {new Date(draft.created_at).toLocaleString()} · {draft.current_state.is_current ? "Current inputs" : "Historical / stale"}</option>)}</select></label> : <Unavailable title="No saved screening draft">Generate a draft to persist the selected medicines and exclusion findings.</Unavailable>}</Section>
    <Section title="Approval and publication" icon={ClipboardCheck}><Unavailable title="Draft approval and publication remain unavailable">The automatic plan remains an unapproved draft until a separate clinician decision workflow is implemented.</Unavailable><button type="button" disabled className={buttonStyle + " mt-3"}>Publish Approved Version</button></Section>
  </div>;
}
