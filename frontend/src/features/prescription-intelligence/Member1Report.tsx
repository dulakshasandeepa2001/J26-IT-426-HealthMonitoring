import { BOOLEAN_OBSERVATIONS, conditionLabel, HANDOFF_CONDITIONS, type HandoffCondition, type Member1Details } from "./analysisData";

const pilotCodes = ["influenza", "chickenpox"];
function percentage(value: number) { return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value); }

export function Member1Report({ details }: { details: Member1Details }) {
  const body = details.raw_output.payload;
  const primary = body.primary_diagnosis;
  const notes = body.extracted_clinical_notes;
  const v21 = details.adapter_version === "member1-v2.1.0";
  const supported = v21 ? HANDOFF_CONDITIONS.includes(primary.condition_code.toLowerCase() as HandoffCondition) : pilotCodes.includes(primary.condition_code.toLowerCase());
  const facts = details.reported_assessments;
  return <div className="space-y-4 text-xs leading-relaxed">
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="font-bold text-slate-800">Member 1 voice-analysis details</h3>
      <p className="mt-2 text-slate-600">Audio: {body.audio_metadata.duration_seconds} seconds · {body.audio_metadata.language} · {body.audio_metadata.audio_quality}</p>
      <p className="mt-1 text-slate-500">Producer timestamp: {new Date(details.raw_output.timestamp).toLocaleString(undefined, { timeZone: "Asia/Colombo" })} (Sri Lanka)</p>
      <p className="mt-3 font-semibold text-slate-700">Transcript summary</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{body.transcript_summary}</p>
    </div>
    <div className="rounded-2xl border border-purple-100 p-3">
      <h3 className="font-bold text-slate-800">Producer primary diagnosis — unconfirmed</h3>
      <p className="mt-2 break-words text-slate-700">{primary.condition_label}</p>
      <p className="mt-1 break-words text-slate-500">Reported code: {primary.condition_code}{primary.icd_10_code && ` · Reported ICD-10: ${primary.icd_10_code}`}</p>
      <p className="mt-1 text-slate-500">The diagnostic label, subtype and coding remain producer claims for clinician review.</p>
      {!supported && <p className="mt-2 font-semibold text-amber-800">Primary condition is outside the current pilot. Review the diagnosis manually; no supported diagnosis was prefilled.</p>}
      {supported && !pilotCodes.includes(primary.condition_code.toLowerCase()) && <p className="mt-2 font-semibold text-amber-800">Analysis handoff is supported. Medicine recommendations for this condition are pending catalogue and safety-rule development.</p>}
    </div>
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer font-bold text-slate-700">Extracted symptom details</summary>
      <p className="mt-2 text-slate-500">Extraction scores describe the reported symptom extraction. They are separate from condition scores.</p>
      <ul className="mt-2 space-y-2">{body.extracted_symptoms.map((item, index) => <li key={index} className="rounded-xl bg-slate-50 p-3">
        <p className="break-words font-semibold text-slate-700">{item.symptom} · {v21 && item.present == null ? "Unknown presence" : item.present === false ? "Reported absent" : "Reported present"}</p>
        <p className="mt-1 break-words text-slate-600">{item.duration ?? (item.duration_hours != null ? `${item.duration_hours} hours` : item.duration_days != null ? `${item.duration_days} days` : "Duration not reported")} · Reported symptom severity: {item.severity}</p>
        <p className="mt-1 text-slate-500">Reported extraction score: {percentage(item.confidence)}</p>
      </li>)}</ul>
    </details>
    <div>
      <h3 className="font-bold text-slate-700">Differential diagnoses — unconfirmed</h3>
      <p className="mt-1 text-slate-500">These alternatives are retained for clinician review. They do not replace the reported primary diagnosis.</p>
      {body.differential_diagnoses.length ? <ul className="mt-2 space-y-2">{body.differential_diagnoses.map((item) => <li key={item.condition_code} className="rounded-xl border border-slate-200 p-3">
        <p className="break-words font-semibold text-slate-700">{item.condition_label}</p>
        <p className="mt-1 break-words text-slate-500">{item.condition_code} · Reported condition score: {percentage(item.confidence)}</p>
        <p className="mt-1 text-slate-500">{pilotCodes.includes(item.condition_code.toLowerCase()) ? `${conditionLabel(item.condition_code.toLowerCase())} is within the pilot; clinician review is required.` : "Outside the influenza/chickenpox prescription pilot."}</p>
      </li>)}</ul> : <p className="mt-2 text-slate-500">No differential diagnoses were supplied.</p>}
    </div>
    {facts && <details className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <summary className="cursor-pointer font-bold">Source-reported assessments — unverified</summary>
      <p className="mt-2">Unknown entries have not been assessed. Reported negative findings do not clear safety checks. These fields do not fill the doctor&apos;s verified assessment.</p>
      <dl className="mt-3 space-y-2">{BOOLEAN_OBSERVATIONS.map((name) => <div key={name}><dt className="font-semibold capitalize">{name.replaceAll("_", " ")}</dt><dd>{facts[name] === null ? "Unknown / not reported" : facts[name] ? "Reported yes — unverified" : "Reported no — unverified"}</dd></div>)}
        <div><dt className="font-semibold">Dehydration assessment</dt><dd>{facts.dehydration_assessment} — unverified</dd></div>
        <div><dt className="font-semibold">Oral fluid tolerance</dt><dd>{facts.oral_fluid_tolerance.replaceAll("_", " ")} — unverified</dd></div>
        <div><dt className="font-semibold">Reported onset</dt><dd>{facts.reported_onset_hours === null ? "Unknown" : `${facts.reported_onset_hours} hours`}</dd></div>
        <div><dt className="font-semibold">Reported weight</dt><dd>{facts.reported_weight_kg === null ? "Unknown" : `${facts.reported_weight_kg} kg`}{facts.weight_recorded_at && ` · ${facts.weight_recorded_at}`}</dd></div>
        <div><dt className="font-semibold">Reported ORS product</dt><dd className="break-words">{facts.ors_product_name ?? "Unknown — no formulation or dose inferred"}</dd></div>
      </dl>
    </details>}
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <h3 className="font-bold">Voice-extracted patient information — unverified</h3>
      <p>Compare these reported details with the patient and saved record. Enter verified updates in the patient information form and explicitly review/save them for this visit.</p>
      <p className="break-words"><strong>Chief complaint:</strong> {notes.chief_complaint}</p>
      <div><p className="font-semibold">Patient-reported allergies from voice</p>{notes.patient_reported_allergies.length ? <ul className="mt-1 list-inside list-disc">{notes.patient_reported_allergies.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul> : <p className="mt-1">Not supplied in this output; allergy status remains unverified.</p>}</div>
      <div><p className="font-semibold">Patient-reported current medicines from voice</p>{notes.patient_current_medications.length ? <ul className="mt-1 list-inside list-disc">{notes.patient_current_medications.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul> : <p className="mt-1">Not supplied in this output; current-medicine status remains unverified.</p>}</div>
      <div><p className="font-semibold">Mentioned vital signs — unverified</p>{Object.keys(notes.vital_signs_mentioned).length ? <dl className="mt-1 space-y-1">{Object.entries(notes.vital_signs_mentioned).map(([key, value]) => <div key={key} className="flex flex-wrap gap-2"><dt className="capitalize">{key.replaceAll("_", " ")}:</dt><dd className="break-words">{value}</dd></div>)}</dl> : <p className="mt-1">No vital signs supplied.</p>}</div>
    </div>
    {details.mapping_issues.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><h3 className="font-bold">Input clarification required</h3><ul className="mt-2 list-inside list-disc">{details.mapping_issues.map((issue, index) => <li key={index} className="mt-1">{issue.reason}</li>)}</ul></div>}
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold text-slate-600">Producer treatment categories — unreviewed</summary><p className="mt-2 text-slate-500">These are source suggestions. Treatment selection requires reviewed knowledge, safety checks and a doctor decision.</p><ul className="mt-2 list-inside list-disc text-slate-600">{body.suggested_treatment_categories.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul></details>
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold text-slate-600">View original Component 1 output</summary><pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">{JSON.stringify(details.raw_output, null, 2)}</pre></details>
  </div>;
}
