"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { controlStyle } from "./PageFrame";
import { fetchHistoryIdentityOptions, type HistoryDetails, type HistoryIdentityOptions, type HistoryIdentityRecord } from "./prescriptionApi";

export function HistoryIdentityEditor({ visit, allergies, medicines, saved, value, onChange, onDenied }: {
  visit: string; allergies: string[]; medicines: string[]; saved?: HistoryIdentityRecord;
  value: HistoryDetails | undefined; onChange: (details: HistoryDetails) => void; onDenied: () => void;
}) {
  const [choices, setChoices] = useState<HistoryIdentityOptions | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!allergies.length && !medicines.length) return;
    let active = true;
    fetchHistoryIdentityOptions(visit).then((options) => {
      if (!active) return;
      setChoices(options);
      const norm = (text: string) => text.toLowerCase().trim().replace(/\s+/g, " ");
      onChange({
        allergies: allergies.map((text) => {
          const previous = saved?.details.allergies.find((row) => row.recorded_text === text);
          if (previous) return previous;
          const parts = text.match(/^([^()]+)\s*\(([^()]+)\)$/);
          const proposed = norm(parts?.[1] ?? text);
          return { recorded_text: text, identity: options.allergens.includes(proposed) ? proposed : "", reaction: parts?.[2]?.trim() ?? "", reaction_date: null, clarification_note: "" };
        }),
        medicines: medicines.map((text) => {
          const previous = saved?.details.medicines.find((row) => row.recorded_text === text);
          if (previous) {
            const current = options.products.find((product) => product.id === previous.catalogue_id);
            return previous.catalogue_id && (!current || current.identity_hash !== previous.expected_identity_hash)
              ? { ...previous, catalogue_id: "", expected_identity_hash: "" } : previous;
          }
          // Do not strip strengths/schedules or infer a product from a substring.
          const exact = options.products.filter((product) => product.aliases.some((alias) => norm(alias) === norm(text)));
          const product = exact.length === 1 ? exact[0] : null;
          return { recorded_text: text, catalogue_id: product?.id ?? "", expected_identity_hash: product?.identity_hash ?? "", schedule: "", clarification_note: "" };
        }),
      });
    }).catch((reason: unknown) => {
      if (!active) return;
      setError("Identity choices could not be loaded. Recorded history is retained; unresolved facts cannot clear screening checks.");
      if (reason instanceof ApiError && [401, 403].includes(reason.status)) onDenied();
    });
    return () => { active = false; };
  }, [visit, allergies, medicines, saved, onChange, onDenied]);
  if (!allergies.length && !medicines.length) return null;
  return <div className="space-y-3 rounded-xl border border-purple-100 p-3 text-xs sm:col-span-2" aria-label="Resolve recorded history identities">
    <h3 className="font-bold">Confirm recorded identities</h3>
    <p>Keep the original history. Confirm the allergen or exact current product separately from reaction and schedule. Unresolved items stay unresolved; identity matching does not establish safety.</p>
    {error && <p role="alert" className="text-amber-900">{error}</p>}
    {!choices && !error && <p>Loading identity choices…</p>}
    {choices && value && <>
      {value.allergies.map((row, index) => <div key={index} className="space-y-2 rounded-lg bg-purple-50 p-3">
        <p className="font-semibold">Recorded allergy: {row.recorded_text}</p>
        <label className="block">Allergen identity<select aria-label={`Allergen identity ${index + 1}`} className={controlStyle} value={row.identity} onChange={(event) => onChange({ ...value, allergies: value.allergies.map((item, i) => i === index ? { ...item, identity: event.target.value } : item) })}>
          <option value="">Unresolved / not established</option>{choices.allergens.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label className="block">Reported reaction (leave blank if unknown)<input aria-label={`Allergy reaction ${index + 1}`} className={controlStyle} maxLength={300} value={row.reaction} onChange={(event) => onChange({ ...value, allergies: value.allergies.map((item, i) => i === index ? { ...item, reaction: event.target.value } : item) })} /></label>
        <label className="block">Reaction date (optional)<input aria-label={`Allergy reaction date ${index + 1}`} type="date" className={controlStyle} value={row.reaction_date ?? ""} onChange={(event) => onChange({ ...value, allergies: value.allergies.map((item, i) => i === index ? { ...item, reaction_date: event.target.value || null } : item) })} /></label>
        <label className="block">Clarification note for a corrected/unrecognized name<input aria-label={`Allergy clarification ${index + 1}`} className={controlStyle} maxLength={500} value={row.clarification_note} onChange={(event) => onChange({ ...value, allergies: value.allergies.map((item, i) => i === index ? { ...item, clarification_note: event.target.value } : item) })} /></label>
        {!row.identity && <p className="text-amber-900">This recorded allergy will remain unresolved. Do not remove a real allergy to enable a candidate.</p>}
      </div>)}
      {value.medicines.map((row, index) => <div key={index} className="space-y-2 rounded-lg bg-purple-50 p-3">
        <p className="font-semibold">Recorded current medicine: {row.recorded_text}</p>
        <label className="block">Confirmed exact product<select aria-label={`Current medicine identity ${index + 1}`} className={controlStyle} value={row.catalogue_id} onChange={(event) => {
          const product = choices.products.find((item) => item.id === event.target.value);
          onChange({ ...value, medicines: value.medicines.map((item, i) => i === index ? { ...item, catalogue_id: product?.id ?? "", expected_identity_hash: product?.identity_hash ?? "" } : item) });
        }}><option value="">Unresolved / product not in this catalogue</option>{choices.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.strength} · {product.form} · {product.route}</option>)}</select></label>
        <label className="block">Reported schedule (leave blank if unknown)<input aria-label={`Current medicine schedule ${index + 1}`} className={controlStyle} maxLength={300} value={row.schedule} onChange={(event) => onChange({ ...value, medicines: value.medicines.map((item, i) => i === index ? { ...item, schedule: event.target.value } : item) })} /></label>
        <label className="block">How was the product clarified? (10 characters minimum for a non-exact name)<input aria-label={`Current medicine clarification ${index + 1}`} className={controlStyle} maxLength={500} value={row.clarification_note} onChange={(event) => onChange({ ...value, medicines: value.medicines.map((item, i) => i === index ? { ...item, clarification_note: event.target.value } : item) })} /></label>
        <p className="text-amber-900">{!row.catalogue_id ? "This current medicine remains unresolved; do not select a different product just to pass screening." : "A recognized current ingredient can still exclude a duplicate candidate. Continuation/replacement is not automatic."}</p>
      </div>)}
    </>}
  </div>;
}
