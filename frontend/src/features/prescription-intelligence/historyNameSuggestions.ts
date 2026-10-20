import type { HistoryDetails, HistoryIdentityOptions, HistoryIdentityRecord } from "./prescriptionApi";

export const historyNameKey = (name: string) => name.toLowerCase().trim().replace(/\s+/g, " ");

// Display-only suggestions. A name/strength match cannot establish formulation,
// route, brand or excipients and must never populate catalogue_id automatically.
export function possibleRecordedProducts(text: string, options: HistoryIdentityOptions) {
  const raw = historyNameKey(text);
  const tokens = new Set(raw.match(/[a-z]+/g) ?? []);
  const masses = (value: string) => [...value.matchAll(/(\d+(?:\.\d+)?)\s*(mcg|mg|g)\b/g)].map((match) => `${Number(match[1])}${match[2]}`);
  const reportedMasses = masses(raw);
  return options.products.filter((product) => {
    const names = product.name.toLowerCase().split(/[^a-z]+/).filter((name) => name.length > 3);
    return names.some((name) => tokens.has(name)) && reportedMasses.length > 0
      && masses(product.strength.toLowerCase()).some((mass) => reportedMasses.includes(mass));
  });
}

export function recordedAllergen(text: string, options: HistoryIdentityOptions) {
  const parts = text.trim().match(/^([^()]+)\s*\(([^()]+)\)$/);
  const name = historyNameKey(parts ? parts[1] : text);
  return { identity: options.allergens.includes(name) ? name : "", reaction: parts ? parts[2].trim() : "" };
}

export function prepareHistoryClarification(allergies: string[], medicines: string[], options: HistoryIdentityOptions, saved?: HistoryIdentityRecord): HistoryDetails {
  const previous = saved?.version === options.version && saved.reviewed_by && saved.reviewed_at ? saved.details : undefined;
  return {
    allergies: allergies.map((text) => {
      const matches = previous?.allergies.filter((row) => row.recorded_text === text) ?? [];
      const old = matches.length === 1 ? matches[0] : null;
      const proposed = recordedAllergen(text, options);
      return { recorded_text: text, identity: old ? options.allergens.includes(old.identity) ? old.identity : "" : proposed.identity,
        reaction: old?.reaction ?? proposed.reaction, reaction_date: old?.reaction_date ?? null, clarification_note: old?.clarification_note ?? "" };
    }),
    medicines: medicines.map((text) => {
      const recorded = previous?.medicines.filter((row) => row.recorded_text === text) ?? [];
      const old = recorded.length === 1 ? recorded[0] : null;
      const matches = options.products.filter((p) => p.aliases.some((alias) => historyNameKey(alias) === historyNameKey(text)));
      // Strength/schedule prose is not an exact product alias. Never guess a
      // formulation from a partial name such as "Paracetamol 500mg SOS".
      const product = old ? options.products.find((p) => p.id === old.catalogue_id && p.identity_hash === old.expected_identity_hash)
        : matches.length === 1 ? matches[0] : null;
      return { recorded_text: text, catalogue_id: product?.id ?? "", expected_identity_hash: product?.identity_hash ?? "",
        schedule: old?.schedule ?? "", clarification_note: old?.clarification_note ?? "" };
    }),
  };
}

export function clarificationNeedsNote(row: HistoryDetails["allergies"][number] | HistoryDetails["medicines"][number], options: HistoryIdentityOptions) {
  if ("identity" in row) return !!row.identity && recordedAllergen(row.recorded_text, options).identity !== row.identity;
  const product = options.products.find((p) => p.id === row.catalogue_id);
  return !!product && !product.aliases.some((alias) => historyNameKey(alias) === historyNameKey(row.recorded_text));
}

export function clarificationValid(details: HistoryDetails, options: HistoryIdentityOptions) {
  return [...details.allergies, ...details.medicines].every((row) => !clarificationNeedsNote(row, options) || row.clarification_note.trim().length >= 10);
}
