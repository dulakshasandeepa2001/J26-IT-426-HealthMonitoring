export interface IdentityPolicy { version: string; scope: string; sources: { title: string; url: string }[]; allergen_identities: string[] }

export function HistoryIdentityPolicy({ policy }: { policy?: IdentityPolicy }) {
  if (!policy) return null;
  return <details className="space-y-2 rounded-xl border border-purple-100 p-3 text-xs">
    <summary className="cursor-pointer font-semibold text-purple-700">Inspect patient-history identity policy</summary>
    <p>{policy.scope}</p><p>Identity policy: {policy.version}</p>
    <p>Supported recorded allergens: {policy.allergen_identities.join(", ")}</p>
    {policy.sources.map((source) => <p key={source.url}><a className="text-purple-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}
  </details>;
}
