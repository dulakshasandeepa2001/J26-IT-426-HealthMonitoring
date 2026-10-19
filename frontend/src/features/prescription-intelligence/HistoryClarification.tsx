"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { buttonStyle, controlStyle } from "./PageFrame";
import { fetchHistoryIdentityOptions, type HistoryDetails, type HistoryIdentityOptions, type HistoryIdentityRecord } from "./prescriptionApi";
import { clarificationNeedsNote, clarificationValid, prepareHistoryClarification, recordedAllergen } from "./historyNameSuggestions";

export interface ClarificationDraft { key: string; details: HistoryDetails | null; valid: boolean }

export function HistoryClarification({ visit, historyKey, allergies, medicines, saved, expanded, disabled, onChange, onDenied }: {
  visit: string; historyKey: string; allergies: string[]; medicines: string[]; saved?: HistoryIdentityRecord;
  expanded: boolean; disabled: boolean; onChange: (draft: ClarificationDraft) => void; onDenied: () => void;
}) {
  const [options, setOptions] = useState<HistoryIdentityOptions | null>(null);
  const [details, setDetails] = useState<HistoryDetails | null>(null);
  const [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!expanded || options) return;
    let alive = true;
    onChange({ key: historyKey, details: null, valid: false });
    fetchHistoryIdentityOptions(visit).then((value) => {
      if (!alive) return;
      const prepared = prepareHistoryClarification(allergies, medicines, value, saved);
      setOptions(value); setDetails(prepared); setError("");
      onChange({ key: historyKey, details: prepared, valid: clarificationValid(prepared, value) });
    }).catch((reason: unknown) => {
      if (!alive) return;
      setError(reason instanceof Error ? reason.message : "Medicine and allergy names could not be loaded.");
      if (reason instanceof ApiError && [401, 403].includes(reason.status)) onDenied();
    });
    return () => { alive = false; };
  }, [expanded, options, visit, historyKey, allergies, medicines, saved, onChange, onDenied, retry]);
  function update(next: HistoryDetails) {
    setDetails(next);
    onChange({ key: historyKey, details: next, valid: !!options && clarificationValid(next, options) });
  }
  return <div id="history-name-clarification" hidden={!expanded} role="region" aria-label="Confirm medicine and allergy names" className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50/40 p-4 text-xs">
    <h3 className="font-bold">Confirm medicine and allergy names</h3>
    <p>Keep the original history. Confirm proposed names with the patient, then use Save patient information below. Unresolved names remain unknown; name confirmation does not clear safety checks.</p>
    {error ? <p role="alert" className="text-rose-900">{error} <button type="button" className={buttonStyle} disabled={disabled} onClick={() => setRetry((v) => v + 1)}>Retry name options</button></p>
      : !options || !details ? <p role="status">Loading supported names…</p> : <fieldset disabled={disabled} className="space-y-3">
      {details.allergies.map((row, i) => {
        const known = recordedAllergen(row.recorded_text, options).identity;
        return <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="font-semibold">Recorded allergy: {row.recorded_text}</p>
          <label className="block space-y-1">Allergen for “{row.recorded_text}”<select aria-label={`Allergen for “${row.recorded_text}”`} className={controlStyle} value={row.identity} onChange={(e) => update({ ...details, allergies: details.allergies.map((a, n) => n === i ? { ...a, identity: e.target.value } : a) })}>
            <option value="">Unresolved / not confirmed</option>{options.allergens.filter((name) => !known || name === known).map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label className="block space-y-1">Reported reaction for “{row.recorded_text}”<input aria-label={`Reported reaction for “${row.recorded_text}”`} className={controlStyle} maxLength={300} value={row.reaction} placeholder="Leave unknown reaction blank" onChange={(e) => update({ ...details, allergies: details.allergies.map((a, n) => n === i ? { ...a, reaction: e.target.value } : a) })} /></label>
          {clarificationNeedsNote(row, options) && <label className="block space-y-1">How was “{row.recorded_text}” clarified?<textarea aria-label={`How was “${row.recorded_text}” clarified?`} className={controlStyle} minLength={10} maxLength={500} rows={2} value={row.clarification_note} onChange={(e) => update({ ...details, allergies: details.allergies.map((a, n) => n === i ? { ...a, clarification_note: e.target.value } : a) })} /><span>At least 10 characters describing your confirmation.</span></label>}
        </div>;
      })}
      {details.medicines.map((row, i) => <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="font-semibold">Recorded current medicine: {row.recorded_text}</p>
        <label className="block space-y-1">Exact product for “{row.recorded_text}”<select aria-label={`Exact product for “${row.recorded_text}”`} className={controlStyle} value={row.catalogue_id} onChange={(e) => {
          const product = options.products.find((p) => p.id === e.target.value);
          update({ ...details, medicines: details.medicines.map((a, n) => n === i ? { ...a, catalogue_id: product?.id ?? "", expected_identity_hash: product?.identity_hash ?? "" } : a) });
        }}><option value="">Unresolved / product not confirmed</option>{options.products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.strength} · {p.form} · {p.route}</option>)}</select></label>
        {!row.catalogue_id && <p className="text-amber-900">Confirm the exact product with the patient. If it is unknown or absent from this list, keep it unresolved.</p>}
        <label className="block space-y-1">Reported schedule for “{row.recorded_text}”<input aria-label={`Reported schedule for “${row.recorded_text}”`} className={controlStyle} maxLength={300} value={row.schedule} placeholder="Leave unknown schedule blank" onChange={(e) => update({ ...details, medicines: details.medicines.map((a, n) => n === i ? { ...a, schedule: e.target.value } : a) })} /></label>
        {clarificationNeedsNote(row, options) && <label className="block space-y-1">How was “{row.recorded_text}” clarified?<textarea aria-label={`How was “${row.recorded_text}” clarified?`} className={controlStyle} rows={2} minLength={10} maxLength={500} value={row.clarification_note} onChange={(e) => update({ ...details, medicines: details.medicines.map((a, n) => n === i ? { ...a, clarification_note: e.target.value } : a) })} /><span>At least 10 characters describing how you confirmed the exact product.</span></label>}
      </div>)}
    </fieldset>}
  </div>;
}
