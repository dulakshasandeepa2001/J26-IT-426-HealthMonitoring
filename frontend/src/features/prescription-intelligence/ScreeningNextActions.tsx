"use client";

import { buttonStyle } from "./PageFrame";
import type { ClinicalAssessment, ScreeningInputs, ScreeningResult } from "./clinicalScreeningApi";
import { blocksAvailability, historyActionGroups } from "./screeningReasonGroups";

export function ScreeningNextActions({ result, clinical, observations, onHistory, onClinical }: {
  result: ScreeningResult; clinical: ClinicalAssessment; observations: ScreeningInputs["source_observations"];
  onHistory?: () => void; onClinical: () => void;
}) {
  const excluded = result.candidates.filter((row) => row.status === "unavailable");
  const blockedBy = (categories: string[]) => excluded.filter((row) => row.checks.some((check) => categories.includes(check.category) && blocksAvailability(check)));
  const history = blockedBy(["allergy", "duplicate_ingredient", "interaction"]);
  const historyGroups = historyActionGroups(result);
  const productGaps = blockedBy(["product_rule_coverage", "product_identity", "handler"]);
  const reviews = blockedBy(["knowledge_review", "base_product_review"]).filter((row) => !productGaps.includes(row));
  const whoAgainst = clinical.influenza_guideline === "WHO_2024" && excluded.some((row) => row.checks.some((check) => check.category === "guideline" && check.status === "blocked"));
  const clinicalBlocked = excluded.some((row) => row.checks.some((check) => blocksAvailability(check)
    && !(whoAgainst && check.category === "guideline" && check.status === "blocked")
    && !["allergy", "duplicate_ingredient", "interaction", "knowledge_review", "base_product_review", "product_rule_coverage", "product_identity", "handler", "implementation_binding"].includes(check.category)));
  if (!excluded.length) return null;
  return <div role="region" aria-label="Screening next actions" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-xs">
    <h3 className="text-sm font-bold">What needs attention</h3>
    <p>A medicine becomes available only after all of its blocking checks are resolved. The actions below do not approve medicines or clear unknown facts.</p>
    {whoAgainst && <p className="rounded-xl bg-white p-3 text-amber-900">The selected WHO 2024 non-severe pathway recommends against oseltamivir. This is a guideline exclusion, not a missing answer or an instruction to switch to CDC.</p>}
    {history.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="font-bold">Patient history and existing treatment</h4>
      {historyGroups.unresolved.length > 0 && <p>Names or history status need confirmation: {historyGroups.unresolved.join(", ")}. Open the prepared name confirmations and save the reviewed patient information. Unknown products may stay unresolved.</p>}
      {historyGroups.allergy.length > 0 && <p className="font-semibold text-rose-900">Recorded allergy exclusion: {historyGroups.allergy.join(", ")}. Name confirmation does not remove this exclusion.</p>}
      {historyGroups.duplicate.length > 0 && <p>Existing treatment duplicates a candidate ingredient: {historyGroups.duplicate.join(", ")}. Record a proposed continue/change/stop action for separate review rather than adding a duplicate. A proposal does not remove active history or authorize a replacement.</p>}
      {historyGroups.interaction.length > 0 && <p>Current-medicine interaction assessment still prevents availability: {historyGroups.interaction.join(", ")}. This is separate from name confirmation. Review any offered selected-pair evidence below; unsupported pairs and specific cautions remain unavailable.</p>}
      {result.selected_pair_policy && !result.selected_pair_policy.applied && <a className={buttonStyle} href="#selected-pair-review">Review selected interaction evidence in Patient information</a>}
      <a href="#patient-medicine-history" className={buttonStyle} onClick={(e) => { if (onHistory) { e.preventDefault(); onHistory(); } }}>Clarify patient history</a>
      <a href="#patient-medicine-history" className="block font-semibold underline" onClick={(e) => { if (onHistory) { e.preventDefault(); onHistory(); } }}>Review allergies and current medicines</a>
      <p>Keep the original history. Proposed actions are saved as visit-specific notes only; they do not clear safety checks.</p>
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
