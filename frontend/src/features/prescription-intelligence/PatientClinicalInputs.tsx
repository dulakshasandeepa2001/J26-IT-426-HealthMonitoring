"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { controlStyle, buttonStyle } from "./PageFrame";
import { assessmentSelects, conditionConcerns, conditionSymptoms, symptomNames } from "./clinicalAssessmentFields";
import { missingValue, selectLabel, sourcePresence, writeGuideline, type QuickRequirements } from "./quickReviewData";
import type { ClinicalAssessment, ScreeningInputs } from "./clinicalScreeningApi";
import type { HandoffCondition } from "./analysisData";

export interface ClinicalReviewHandle { open: () => void }

export function PatientClinicalInputs({ metadata, condition, clinical, initial, requirements, doctor, disabled, onEdit, editorRef }: {
  metadata: ScreeningInputs; condition: HandoffCondition; clinical: ClinicalAssessment; initial: ClinicalAssessment;
  requirements: QuickRequirements; doctor: number; disabled: boolean;
  onEdit: (value: ClinicalAssessment) => void;
  editorRef?: Ref<ClinicalReviewHandle>;
}) {
  const [editingAll, setEditingAll] = useState(false);
  const [numberEditors, setNumberEditors] = useState<Set<string>>(() => new Set());
  const keepNumberEditor = (key: string) => setNumberEditors((old) => old.has(key) ? old : new Set([...old, key]));
  const questionPanel = useRef<HTMLDivElement>(null);
  useImperativeHandle(editorRef, () => ({ open() {
    setEditingAll(true);
    requestAnimationFrame(() => {
      questionPanel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      questionPanel.current?.querySelector<HTMLSelectElement>("[data-clinical-field]")?.focus({ preventScroll: true });
    });
  } }), []);
  const [presence, setPresence] = useState(() => sourcePresence(metadata, condition));
  const [rememberGuideline, setRememberGuideline] = useState(initial.influenza_guideline !== "unselected");
  const fields = assessmentSelects.filter((field) => !field.conditions || field.conditions.includes(condition));
  const questions = fields.filter((field) => requirements.fields.has(field.key) && missingValue(clinical[field.key]));
  const concernQuestions = conditionConcerns[condition].filter((name) => requirements.concerns.has(name) && clinical.condition_assessments[name] == null);
  const symptomQuestions = conditionSymptoms[condition].filter((name) => requirements.targets.has(name) && (presence[name] == null || presence[name] === true && clinical.symptom_durations?.[name] == null));
  const numericFields = (["onset_hours", "weight_kg"] as const).filter((key) => (editingAll ? key === "onset_hours" && ["influenza", "chickenpox"].includes(condition)
    || key === "weight_kg" && ["influenza", "chickenpox"].includes(condition) && (metadata.patient_age_years == null || metadata.patient_age_years < 18)
    : requirements.fields.has(key) && (clinical[key] == null || numberEditors.has(key))));
  const unknownCount = questions.length + concernQuestions.length + symptomQuestions.length
    + (["onset_hours", "weight_kg"] as const).filter((key) => requirements.fields.has(key) && clinical[key] == null).length;
  const visibleFields = editingAll ? fields : questions;
  const visibleConcerns = editingAll ? conditionConcerns[condition] : concernQuestions;
  const visibleSymptoms = editingAll ? conditionSymptoms[condition] : conditionSymptoms[condition].filter((name) => symptomQuestions.includes(name) || numberEditors.has("duration:" + name));
  function edit<K extends keyof ClinicalAssessment>(name: K, value: ClinicalAssessment[K]) {
    onEdit({ ...clinical, [name]: value });
    if (name === "influenza_guideline") writeGuideline(doctor, metadata.engine_version, value as ClinicalAssessment["influenza_guideline"], rememberGuideline);
  }
  function symptom(name: string, value: string) {
    const next = value === "unknown" ? null : value === "true";
    setPresence((old) => ({ ...old, [name]: next }));
    const durations = { ...clinical.symptom_durations }; if (next !== true) delete durations[name];
    onEdit({ ...clinical, verified_symptoms: next === true ? [...new Set([...(clinical.verified_symptoms ?? []), name])] : clinical.verified_symptoms?.filter((key) => key !== name), symptom_durations: durations });
  }
  return <fieldset disabled={disabled} className="space-y-4 border-t border-slate-200 pt-5" aria-label="Clinical inputs for this visit">
    <legend className="mb-3 text-sm font-bold">Clinical inputs for this visit</legend>
    <div className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-xs" role="region" aria-label="Patient review summary">
      <h3 className="font-bold">Prepared visit details</h3>
      {condition === "viral_gastroenteritis" && <p className="text-slate-600">The optional exact ORS pathway covers Dioralyte Natural GSL, UK PL 35104/0044, in a limited synthetic adult context. Generic ORS and other sachets are not substitutes. Confirm the actual product and patient assessments separately; missing facts remain Unknown. <a href="https://www.medicines.org.uk/emc/product/2774/smpc" target="_blank" rel="noreferrer" className="font-semibold text-purple-700 underline">Read the exact reference label</a></p>}
      <p>Age from registered DOB: {metadata.patient_age_years ?? "Unavailable"}</p>
      <p className="text-slate-600">Check these proposed analysis findings, correct them below and leave missing facts Unknown. Use Confirm inputs and screen medicines to confirm this visit and request a preview in one action.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.filter((field) => !missingValue(clinical[field.key])).map((field) => <div key={field.key}><dt className="font-semibold">{field.label}</dt><dd>{selectLabel(field, clinical[field.key])}<span className="block text-slate-500">{field.key === "influenza_guideline" ? "Explicit guideline choice; confirm for this visit" : initial[field.key] === clinical[field.key] ? "From consultation analysis; confirm for this visit" : "Entered or corrected for this visit"}</span></dd></div>)}
        {(["onset_hours", "weight_kg"] as const).filter((key) => clinical[key] != null).map((key) => <div key={key}><dt className="font-semibold">{key === "onset_hours" ? "Reported/entered onset (hours)" : "Reported/entered measured weight (kg)"}</dt><dd>{clinical[key]}{key === "weight_kg" && typeof metadata.source_observations.assessments.weight_recorded_at === "string" && <span className="block text-slate-500">Source measurement timestamp: {metadata.source_observations.assessments.weight_recorded_at}</span>}</dd></div>)}
        {conditionConcerns[condition].filter((name) => clinical.condition_assessments[name] != null).map((name) => <div key={name}><dt className="font-semibold">{name.replaceAll("_", " ")}</dt><dd>{clinical.condition_assessments[name] ? "Concern recorded — individual review required" : "Recorded absent — confirm with the patient"}</dd></div>)}
        {conditionSymptoms[condition].filter((name) => presence[name] != null).map((name) => <div key={name}><dt className="font-semibold">{symptomNames[name]}: proposed relief target</dt><dd>{presence[name] === true ? `Consider relief · Duration: ${clinical.symptom_durations?.[name] ?? "Unknown"} hours` : "No reported relief target"}</dd></div>)}
      </dl>
      {metadata.source_observations.red_flags.length > 0 && <p className="rounded-xl bg-rose-50 p-3 text-rose-900">Source red flags: {metadata.source_observations.red_flags.join("; ")}. Confirming this summary cannot clear reported red flags.</p>}
      {metadata.source_observations.severity === "severe" && <p className="text-rose-900">Severe disease is reported; the limited outpatient pathway cannot clear this context.</p>}
      {clinical.reviewed && <p role="status" className="font-semibold text-emerald-800">Visit inputs confirmed for the requested preview. Unknown facts remain unknown.</p>}
    </div>
    <div ref={questionPanel} className="scroll-mt-24 space-y-4 rounded-2xl border border-slate-200 p-4" role="region" aria-label="Questions to clarify">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold">{editingAll ? "Correct clinical details" : `Questions to clarify (${unknownCount})`}</h3><button type="button" className={buttonStyle} onClick={() => { setEditingAll((old) => !old); setNumberEditors(new Set()); }}>{editingAll ? "Show missing questions only" : "Edit all clinical details"}</button></div>
      {!requirements.coverageKnown && <p className="text-xs text-amber-900">Medicine coverage could not be loaded. Use Edit all clinical details if needed; preview will check the current rules on the server.</p>}
      {requirements.coverageKnown && !requirements.activeCandidates && <p className="text-xs text-amber-900">No candidate currently has executable coverage and current reviews for this condition. Preview can explain the exclusions; extra answers cannot resolve missing product/rule coverage.</p>}
      {!editingAll && <p className="text-xs text-slate-600">Questions are limited to missing facts for currently reviewed executable candidates. You may leave a fact Unknown; the backend will withhold any candidate that needs it. These are not additional medicine approvals.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleFields.map((field) => <label key={field.key} className="block space-y-1 text-xs font-semibold">{field.label}<select aria-label={field.label} data-clinical-field={field.key} className={controlStyle} value={String(clinical[field.key] ?? "unknown")} onChange={(event) => edit(field.key, event.target.value as ClinicalAssessment[typeof field.key])}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
        {numericFields.map((key) => <label key={key} className="block space-y-1 text-xs font-semibold">{key === "weight_kg" ? "Measured weight (kg; applicable pediatric rules only)" : condition === "chickenpox" ? "Hours since varicella rash onset" : "Hours since influenza symptom onset"}<input data-clinical-field={key} className={controlStyle} type="number" min={key === "weight_kg" ? "0.1" : "0"} max={key === "weight_kg" ? "350" : "8760"} step="0.1" value={clinical[key] ?? ""} onFocus={() => keepNumberEditor(key)} onChange={(event) => edit(key, event.target.value || null)} /></label>)}
        {visibleConcerns.map((name) => <label key={name} className="block space-y-1 text-xs font-semibold">{name.replaceAll("_", " ")}<select aria-label={name.replaceAll("_", " ")} data-concern={name} className={controlStyle} value={clinical.condition_assessments[name] == null ? "unknown" : String(clinical.condition_assessments[name])} onChange={(event) => edit("condition_assessments", { ...clinical.condition_assessments, [name]: event.target.value === "unknown" ? null : event.target.value === "true" })}><option value="unknown">Unknown / not assessed</option><option value="false">Independently assessed: absent</option><option value="true">Present / requires individual review</option></select></label>)}
      </div>
      {visibleSymptoms.length > 0 && <div className="space-y-3"><h4 className="text-xs font-bold">Review proposed symptom-relief targets</h4>{visibleSymptoms.map((name) => <div key={name} className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-xs font-semibold">{symptomNames[name]}: relief target<select aria-label={`${symptomNames[name]}: relief target`} data-symptom={name} className={controlStyle} value={presence[name] == null ? "unknown" : String(presence[name])} onChange={(event) => symptom(name, event.target.value)}><option value="unknown">Unknown / not confirmed</option><option value="true">Consider symptom relief</option><option value="false">No target for relief</option></select></label>{presence[name] === true && <label className="block space-y-1 text-xs font-semibold">{symptomNames[name]}: verified duration (hours)<input data-duration={name} className={controlStyle} type="number" min="0" max="8760" step="0.1" value={clinical.symptom_durations?.[name] ?? ""} onFocus={() => keepNumberEditor("duration:" + name)} onChange={(event) => edit("symptom_durations", { ...clinical.symptom_durations, [name]: event.target.value || null })} /></label>}</div>)}</div>}
      {condition === "influenza" && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={rememberGuideline} disabled={clinical.influenza_guideline === "unselected"} onChange={(event) => { setRememberGuideline(event.target.checked); writeGuideline(doctor, metadata.engine_version, clinical.influenza_guideline, event.target.checked); }} />Remember my explicit influenza guideline choice for future reviews on this browser. Each visit still requires confirmation.</label>}
    </div>
    {condition === "influenza" && metadata.selected_pair_policy?.available && <div id="selected-pair-review" role="region" aria-label="Selected interaction evidence review" className="scroll-mt-24 space-y-3 rounded-2xl border border-purple-200 bg-purple-50/40 p-4 text-xs">
      <h3 className="font-bold">Selected interaction evidence review</h3>
      <p>Oseltamivir with the confirmed current paracetamol product. {metadata.selected_pair_policy.summary}</p>
      <p>{metadata.selected_pair_policy.scope}</p>
      <a className="font-semibold text-purple-700 underline" href={metadata.selected_pair_policy.source.url} target="_blank" rel="noreferrer">Read TAMIFLU label sections 7.2 and 12.3</a>
      <p className="text-slate-600">Policy: {metadata.selected_pair_policy.version}. This review does not clear allergies, duplicate medicines, other interactions, renal/onset/vaccine checks or the selected guideline. Continuing or stopping current treatment is a separate decision.</p>
      <label className="block space-y-1 font-semibold">Pair-review reason and remaining limitations
        <textarea aria-label="Pair-review reason and remaining limitations" className={controlStyle} rows={2} maxLength={1000}
          value={clinical.selected_pair_review?.note ?? ""} onChange={(event) => edit("selected_pair_review", {
            reviewed: false, expected_binding: metadata.selected_pair_policy!.binding, note: event.target.value })} />
      </label>
      <label className="flex items-start gap-2"><input type="checkbox"
        checked={!!clinical.selected_pair_review?.reviewed && clinical.selected_pair_review.expected_binding === metadata.selected_pair_policy.binding}
        disabled={(clinical.selected_pair_review?.note.trim().length ?? 0) < 10}
        onChange={(event) => edit("selected_pair_review", { reviewed: event.target.checked, expected_binding: metadata.selected_pair_policy!.binding,
          note: clinical.selected_pair_review?.note ?? "" })} />I reviewed the linked evidence and its limited applicability to this exact medicine pair for this visit.</label>
      {(clinical.selected_pair_review?.note.trim().length ?? 0) < 10 && <p className="text-amber-900">Record at least 10 characters describing your actual review before confirming.</p>}
      <p>Use Confirm inputs and screen medicines below to preview. The acknowledged assessment save records this review with the assigned doctor; loading this section does not record a review.</p>
    </div>}
  </fieldset>;
}
