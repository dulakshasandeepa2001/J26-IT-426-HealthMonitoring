"use client";

import { buttonStyle } from "./PageFrame";
import type { ClinicalAssessment, ScreeningInputs, ScreeningResult } from "./clinicalScreeningApi";

export function ScreeningNextActions({ result, clinical, observations, onHistory, onClinical }: {
  result: ScreeningResult; clinical: ClinicalAssessment; observations: ScreeningInputs["source_observations"];
  onHistory?: () => void; onClinical: () => void;
}) {
  const excluded = result.candidates.filter((row) => row.status === "unavailable");
  const blockedBy = (categories: string[]) => excluded.filter((row) => row.checks.some((check) => categories.includes(check.category) && ["blocked", "cannot_validate"].includes(check.status)));
  const history = blockedBy(["allergy", "duplicate_ingredient", "interaction"]);
  const productGaps = blockedBy(["product_rule_coverage", "product_identity", "handler"]);
  const reviews = blockedBy(["knowledge_review", "base_product_review"]).filter((row) => !productGaps.includes(row));
  const clinicalBlocked = excluded.some((row) => row.checks.some((check) => ["blocked", "cannot_validate"].includes(check.status)
    && !["allergy", "duplicate_ingredient", "interaction", "knowledge_review", "base_product_review", "product_rule_coverage", "product_identity", "handler", "implementation_binding"].includes(check.category)));
  if (!excluded.length) return null;
  return <div role="region" aria-label="Screening next actions" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-xs">
    <h3 className="text-sm font-bold">What needs attention</h3>
    <p>A medicine becomes available only after all of its blocking checks are resolved. The actions below do not approve medicines or clear unknown facts.</p>
    {history.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="font-bold">Clarify patient history</h4>
      <p>Affected medicines: {history.map((row) => row.generic_name).join(", ")}. Confirm allergy names and exact current products while retaining the recorded history.</p>
      <a href="#patient-medicine-history" className={buttonStyle} onClick={(e) => { if (onHistory) { e.preventDefault(); onHistory(); } }}>Clarify patient history</a>
      <p>A confirmed current product can still block duplicate ingredients or need a separate interaction review. Name confirmation does not make a medicine safe.</p>
    </div>}
    {clinicalBlocked && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="font-bold">Review the clinical assessment</h4>
      <p>Care setting: {clinical.care_setting}. Assessed severity: {clinical.condition_severity}. Reported analysis severity: {observations.severity}.</p>
      {(observations.severity === "severe" || clinical.condition_severity === "severe" || clinical.care_setting === "hospital") && <p className="font-semibold text-rose-900">This context is outside the encoded mild/moderate outpatient pathway. Do not change severe or hospital findings just to obtain candidates.</p>}
      {observations.severity === "severe" && <p className="text-rose-900">The analysis reports severe disease. Changing the assessment dropdown cannot remove this reported-source block; the finding needs clinical clarification.</p>}
      <button type="button" className={buttonStyle} onClick={onClinical}>Review clinical details</button>
      <p>Correct actual errors and complete facts you assessed. Leave unassessed facts Unknown. Guideline selection is an explicit doctor decision.</p>
    </div>}
    {reviews.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="font-bold">Complete current medicine reviews</h4>
      <p>Review the current content and safety rules in a separate tab. Return here and use Refresh medicine reviews, then preview again. Your clinical entries are retained.</p>
      <div className="flex flex-wrap gap-2">{reviews.map((row) => <a key={row.scope_id} className={buttonStyle} href={`/doctor/medicine-knowledge?medicine=${encodeURIComponent(row.medicine_id)}`} target="_blank" rel="noreferrer">Review {row.generic_name}<span className="sr-only"> (opens a new tab)</span></a>)}</div>
    </div>}
    {productGaps.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="font-bold">Product or rule coverage is incomplete</h4>
      <p>{productGaps.map((row) => row.generic_name).join(", ")} remain unavailable until exact products and executable rules are implemented. Additional patient answers or content reviews alone cannot enable these medicines.</p>
    </div>}
  </div>;
}
