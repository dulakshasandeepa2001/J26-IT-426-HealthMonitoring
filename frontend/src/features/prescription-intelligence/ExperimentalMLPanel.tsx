"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { buttonStyle, controlStyle, Unavailable } from "./PageFrame";
import { getResearchOptions, predictResearchFixture, type ResearchOptions, type ResearchPrediction } from "./experimentalMLApi";

const words = (value: string | null) => value === null ? "Unknown condition" : value.replaceAll("_", " ");

export function ExperimentalMLPanel({ consultationId, isDemo }: { consultationId: string; isDemo: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [options, setOptions] = useState<ResearchOptions | null>(null);
  const [result, setResult] = useState<ResearchPrediction | null>(null);
  const [scenario, setScenario] = useState("");
  const [candidate, setCandidate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);

  function cancel() {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setResult(null); setBusy(false); setError("");
  }

  async function request(loadOptions: boolean) {
    if (controller.current) return;
    const current = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setResult(null); setError("");
    try {
      if (loadOptions) {
        const value = await getResearchOptions(consultationId, abort.signal);
        if (current === sequence.current) { setOptions(value); setScenario(""); setCandidate(""); }
      } else if (options) {
        const value = await predictResearchFixture(options, scenario, candidate, abort.signal);
        if (current === sequence.current) setResult(value);
      }
    } catch (failure) {
      if (current !== sequence.current || abort.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Experimental ML request failed.");
      if (loadOptions || failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
        setOptions(null); setEnabled(false); setScenario(""); setCandidate("");
      }
    } finally {
      if (current === sequence.current) { controller.current = null; setBusy(false); }
    }
  }

  if (!isDemo) return <Unavailable title="Synthetic research consultations only">Select an assigned synthetic research consultation to inspect the frozen research experiment.</Unavailable>;

  return <div className="space-y-4 text-xs leading-relaxed text-slate-600">
    <p>Inspect a frozen fictional patient–medicine pair. The selected encounter supplies access only; its patient data is never used for this prediction. Outputs cannot generate, approve or publish a prescription.</p>
    <label className="flex items-start gap-2 font-semibold text-slate-800">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-purple-600" checked={enabled} onChange={(event) => {
        cancel(); setOptions(null); setScenario(""); setCandidate("");
        setEnabled(event.target.checked);
        if (event.target.checked) void request(true);
      }} />
      Enable synthetic research analysis
    </label>
    {busy && <p role="status">Loading frozen experiment…</p>}
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</p>}
    {enabled && options && <>
      <dl className="grid min-w-0 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
        <div className="min-w-0"><dt className="font-bold">Model version</dt><dd className="break-words">{options.experiment_version}</dd></div>
        <div><dt className="font-bold">Saved learner</dt><dd>{options.algorithm} · {options.fit_unique_inputs} unique training inputs</dd></div>
        <div className="min-w-0"><dt className="font-bold">Provisional labels</dt><dd className="break-words">{options.label_provenance.label_method} · {options.label_provenance.source}<br />{options.label_provenance.criteria_version}</dd></div>
        <div><dt className="font-bold">Clinical review</dt><dd>not_reviewed · No independent clinical validation</dd></div>
      </dl>
      <p>Held-out agreement with provisional rule labels: {options.test_agreement.all_mapped_unique.correct}/{options.test_agreement.all_mapped_unique.inputs} overall; {options.test_agreement.novel_mapped_unique.correct}/{options.test_agreement.novel_mapped_unique.inputs} on inputs absent from training ({(options.test_agreement.novel_mapped_unique.agreement_with_provisional_labels * 100).toFixed(1)}%). This measures rule imitation, not clinical accuracy.</p>
      <details><summary className="cursor-pointer font-semibold text-purple-700">Coverage and limitations</summary><ul className="mt-2 list-disc space-y-1 pl-5">{options.coverage_limits.map((limit) => <li key={limit}>{limit}</li>)}</ul></details>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="min-w-0 space-y-1 font-semibold">Frozen fictional scenario
          <select aria-label="Frozen fictional scenario" className={controlStyle} value={scenario} onChange={(event) => { cancel(); setScenario(event.target.value); }}>
            <option value="">Choose a research fixture</option>
            {options.scenarios.map((item) => <option key={item.scenario_id} value={item.scenario_id}>{words(item.condition)} · {words(item.template_family)} · {item.scenario_id}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1 font-semibold">Research medicine candidate
          <select aria-label="Research medicine candidate" className={controlStyle} value={candidate} onChange={(event) => { cancel(); setCandidate(event.target.value); }}>
            <option value="">Choose a candidate and purpose</option>
            {options.candidates.map((item) => <option key={item.candidate_id} value={item.candidate_id}>{item.display_name} · {words(item.purpose)}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className={buttonStyle} disabled={busy || !scenario || !candidate} onClick={() => void request(false)}>Predict synthetic relevance</button>
    </>}
    {enabled && result && <div aria-label="Experimental ML result" className="space-y-3 rounded-2xl border border-purple-200 p-4">
      <p className="font-bold text-slate-900">Provisional relevance: {result.provisional_prediction.label ? words(result.provisional_prediction.label) : "Abstained"}</p>
      <p className="break-words">Fixture: {result.scenario_id} · {words(result.fixture.condition)}<br />Candidate: {result.candidate_id} · {words(result.candidate_purpose)} · {words(result.clinical_role)}</p>
      <p>Learned reason: {words(result.provisional_prediction.reason)}. Frozen rule reference: {words(result.reference_label.value)} (rule_derived, not_reviewed). A disagreement is an experimental error, not a corrected clinical decision.</p>
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
        <p className="font-bold">Deterministic research findings: {words(result.deterministic_safety.aggregate_status)}</p>
        <p>Frozen simulation only. Clinical review gates have not been evaluated. Prescription eligible: false · Approved: false · Published: false.</p>
        <ul className="space-y-1">{result.deterministic_safety.findings.map((finding, index) => <li key={index} className="break-words">{words(finding.category)} · {words(finding.status)} — {words(finding.reason_code)}</li>)}</ul>
      </div>
      <details><summary className="cursor-pointer font-semibold text-purple-700">Model inputs and learned explanation</summary><pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3">{JSON.stringify({ model_features: result.model_features, learned_evidence: result.provisional_prediction.evidence, unseen_features: result.provisional_prediction.unseen_features }, null, 2)}</pre><p>Leaf counts are training support, not medical confidence. Null remains unknown.</p></details>
      <details><summary className="cursor-pointer font-semibold text-purple-700">Fictional patient context and sources</summary><pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3">{JSON.stringify(result.fixture, null, 2)}</pre><ul className="mt-2 space-y-1">{result.evidence_references.map((source) => <li key={source.id}><a className="break-words text-purple-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.title || source.id}</a></li>)}</ul></details>
    </div>}
  </div>;
}
