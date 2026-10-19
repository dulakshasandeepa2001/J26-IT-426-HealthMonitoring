"use client";
import { interfaceText } from "@/lib/productLanguage";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Library, Loader2, RefreshCw } from "lucide-react";
import { ApiError, getSession } from "@/lib/api";
import { PageFrame, Section, Unavailable, buttonStyle, controlStyle } from "./PageFrame";
import { fetchMedicines, fetchMedicineReviews, fetchConditionKnowledge, reviewMedicine, type ConditionScope, type MedicineEntry, type MedicineReview, type MedicineReviewStatus } from "./medicineApi";
import { MedicineNameCheck } from "./MedicineNameCheck";
import { SafetyRuleReview } from "./SafetyRuleReview";
import { AdditionalMedicineScopes, conditionNames, scopeMedicineName } from "./AdditionalMedicineScopes";
import { MedicineReviewBadge, currentContentStatus, contentReviewLabels as labels } from "./MedicineReviewBadge";

function date(value: string) { return new Date(value).toLocaleString(undefined, { timeZone: "Asia/Colombo" }); }

function EntryDetail({ entry, onSaved, onAccessDenied }: { entry: MedicineEntry; onSaved: (entry: MedicineEntry) => void; onAccessDenied: (message: string) => void }) {
  const [decision, setDecision] = useState<MedicineReviewStatus>("reviewed");
  const [notes, setNotes] = useState("");
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MedicineReview[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [changingReview, setChangingReview] = useState(false);
  const saving = useRef(false);
  const historyLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const content = entry.content;
  const sourceLinks = (ids: string[]) => <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => {
    const source = content.sources.find((item) => item.id === id);
    return source && <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-700 underline">{source.publisher}<span className="sr-only">: {source.title} (opens a new tab)</span></a>;
  })}</div>;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || notes.trim().length < 10 || (decision === "reviewed" && !evidenceChecked)) return;
    saving.current = true; setBusy(true); setError(null);
    try { const saved = await reviewMedicine(entry, decision, notes.trim(), evidenceChecked); if (alive.current) onSaved(saved); }
    catch (err) {
      if (!alive.current) return;
      const message = err instanceof Error ? err.message : "Review could not be saved.";
      setError(message);
      if (err instanceof ApiError && [401, 403].includes(err.status)) onAccessDenied(message);
    } finally { saving.current = false; if (alive.current) setBusy(false); }
  }
  async function loadHistory() {
    if (historyLock.current) return;
    historyLock.current = true; setHistoryBusy(true); setError(null);
    try { const rows = await fetchMedicineReviews(entry.id); if (alive.current) setHistory(rows); }
    catch (err) {
      if (!alive.current) return;
      const message = err instanceof Error ? err.message : "Review history unavailable.";
      setError(message);
      if (err instanceof ApiError && [401, 403].includes(err.status)) onAccessDenied(message);
    } finally { historyLock.current = false; if (alive.current) setHistoryBusy(false); }
  }

  return <article aria-label={`${content.generic_name} medicine knowledge`} className="space-y-4 rounded-2xl border border-purple-200 p-4">
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-base font-bold text-slate-900">{content.generic_name}</h3><MedicineReviewBadge status={currentContentStatus(entry.review_status, entry.review_is_current)} /></div>
      <p className="mt-1">{content.strength} · {content.form} · {content.route}</p>
      <p className="mt-1">Conditions: {content.uses.map((use) => conditionNames[use.condition]).join(" · ")}</p>
      <p className="mt-1">Purpose: {[...new Set(content.uses.map((use) => use.purpose.replaceAll("_", " ")))].join("; ")}</p>
      <p className="mt-2 text-slate-600">Active ingredients: {content.ingredients.map((item) => `${item.name} ${item.strength}`).join("; ")}</p>
      <p className="mt-1 break-words text-slate-500">RxCUI {content.standard_concept.rxcui} · {content.standard_concept.name}</p>
      <p className="mt-2 text-slate-500">This strength describes a catalogue product. It is not a prescribed dose or an age eligibility decision.</p>
    </div>
    {content.uses.map((use) => <div className="space-y-1" key={use.condition}>
      <p className="font-semibold">{conditionNames[use.condition]}</p><p>{use.summary}</p><p className="text-slate-500">{use.scope}</p>
      <p className="text-slate-500">Basis: {use.basis.replaceAll("_", " ")}</p>{sourceLinks(use.source_ids)}
    </div>)}
    <details><summary className="cursor-pointer font-semibold text-purple-700">Selected medicine warnings</summary>
      <p className="mt-2 text-slate-500">These summaries are not a complete safety assessment. Review the full source information.</p>
      <ul className="mt-2 list-disc space-y-2 pl-4">{content.warnings.map((warning, index) => <li key={index}><p className="font-semibold capitalize">{warning.category}</p><p>{warning.summary}</p>{sourceLinks(warning.source_ids)}</li>)}</ul>
    </details>
    <details><summary className="cursor-pointer font-semibold text-purple-700">Condition evidence references</summary><ul className="mt-2 space-y-2">{content.sources.map((source) => <li key={source.id} className="break-words">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-700 underline">{source.title}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" /><span className="sr-only"> (opens a new tab)</span></a>
      <p className="mt-1 text-slate-500">{source.publisher} · Source date: {source.published_date ?? "Not supplied"} · Accessed: {source.accessed_date}</p><p className="mt-1 text-slate-500">Sections: {source.sections.join("; ")}</p>
    </li>)}</ul></details>
    <details><summary className="cursor-pointer font-semibold text-purple-700">Supported name aliases</summary><ul className="mt-2 space-y-1">{content.aliases.map((alias) => <li key={alias.name}>{alias.name} · {alias.level === "ingredient" ? "Ingredient only; product needs clarification" : "Product name"}</li>)}</ul></details>
    <section id="medicine-content-review" tabIndex={-1} aria-label="Content review" className="scroll-mt-6 space-y-3 rounded-xl border border-slate-200 p-3">
      <h4 className="font-bold text-slate-800">Content review · {entry.review_is_current ? "Completed for this version" : entry.review_status === "rejected" ? "Rejected" : "Pending review"}</h4>
      {entry.reviewed_at ? <p className="whitespace-pre-wrap break-words">{entry.reviewer_name} · {date(entry.reviewed_at)}<br />{entry.review_notes}</p> : <p>No clinician has reviewed this version.</p>}
      {entry.review_is_current ? <><p className="text-emerald-800">The saved review is current. No repeat review is required.</p><button type="button" className={buttonStyle} onClick={() => setChangingReview((value) => !value)}>{changingReview ? "Cancel content review change" : "Change content review"}</button></> : entry.reviewed_at && <p className="text-amber-900">The content review is pending or needs correction for this version.</p>}
      {(!entry.review_is_current || changingReview) && <form onSubmit={save} className="space-y-3">
        <p className="text-slate-500">Review applies to this catalogue version. Patient-specific medicine eligibility and prescription approval are separate decisions.</p>
        <label className="block space-y-1"><span>Review decision</span><select className={controlStyle} disabled={busy} value={decision} onChange={(event) => setDecision(event.target.value as MedicineReviewStatus)}><option value="reviewed">Content reviewed</option><option value="rejected">Reject content</option><option value="pending">Return to pending</option></select></label>
        <label className="block space-y-1"><span>Review notes</span><textarea className={controlStyle} rows={3} minLength={10} maxLength={2000} required disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explain what you checked or what needs correction." aria-describedby="medicine-content-notes-help" /></label>
        <p id="medicine-content-notes-help" className="text-slate-500">At least 10 characters required. {notes.trim().length}/2000 characters.</p>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-purple-600" checked={evidenceChecked} disabled={busy} onChange={(event) => setEvidenceChecked(event.target.checked)} />I reviewed the listed evidence, formulation, warnings and pilot scope for this version.</label>
        <button type="submit" className={buttonStyle} disabled={busy || notes.trim().length < 10 || (decision === "reviewed" && !evidenceChecked)}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Save content review</button>
      </form>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
    </section>
    <SafetyRuleReview key={entry.id} medicineId={entry.id} onAccessDenied={onAccessDenied} />
    <div><button type="button" className={buttonStyle} disabled={historyBusy || busy} onClick={loadHistory}>{historyBusy ? "Loading history…" : "Load review history"}</button>{history && <ul className="mt-3 space-y-2">{history.map((review) => <li key={review.id} className="rounded-xl border border-slate-200 p-3"><p className="font-bold">{labels[review.decision]} · {review.reviewer_name}</p><p className="text-slate-500">{date(review.recorded_at)} · Version: {interfaceText(review.catalogue_version)}</p><p className="mt-1 whitespace-pre-wrap break-words">{review.notes}</p></li>)}</ul>}</div>
    <p className="text-slate-500">Knowledge version: {interfaceText(content.catalogue_version)}. A completed review does not approve or publish a prescription. This is not independent clinical validation.</p>
  </article>;
}

export default function MedicineKnowledge() {
  const [entries, setEntries] = useState<MedicineEntry[]>([]);
  const [scopes, setScopes] = useState<ConditionScope[]>([]);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState("");
  const [names, setNames] = useState("");
  const sequence = useRef(0);
  const deny = useCallback((message: string) => { sequence.current++; setEntries([]); setScopes([]); setScopeError(null); setSelected(""); setNames(""); setSavedMessage(null); setDenied(true); setLoading(false); setError(message); }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null); setScopeError(null); setSavedMessage(null);
    try {
      const session = await getSession();
      if (request !== sequence.current) return;
      if (session.user) localStorage.setItem("meditrack_user", JSON.stringify(session.user));
      else localStorage.removeItem("meditrack_user");
      window.dispatchEvent(new Event("storage"));
      if (!session.user || session.user.role !== "doctor") throw new ApiError("Sign in with an approved doctor account to open medicine knowledge.", 403);
      const [catalogue, additions] = await Promise.allSettled([fetchMedicines(), fetchConditionKnowledge()]);
      if (request !== sequence.current) return;
      if (catalogue.status === "rejected") throw catalogue.reason;
      if (additions.status === "rejected" && additions.reason instanceof ApiError && [401, 403].includes(additions.reason.status)) throw additions.reason;
      setEntries(catalogue.value);
      setSelected((previous) => previous || new URLSearchParams(window.location.search).get("medicine") || "");
      setScopes(additions.status === "fulfilled" ? additions.value : []);
      if (additions.status === "rejected") setScopeError("Additional condition knowledge could not be loaded. Refresh the catalogue after its setup is available.");
      setDenied(false); setLoading(false);
    } catch (err) {
      if (request !== sequence.current) return;
      const message = err instanceof Error ? err.message : "Medicine catalogue unavailable.";
      if (err instanceof ApiError && [401, 403].includes(err.status)) deny(message);
      else { setEntries([]); setScopes([]); setLoading(false); setError(message); }
    }
  }, [deny]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  type CatalogueItem = { id: string; name: string; description: string; terms: string; base?: MedicineEntry; scopes: ConditionScope[]; conditions: string[] };
  const items = new Map<string, CatalogueItem>();
  for (const entry of entries) items.set(entry.id, { id: entry.id, name: entry.content.generic_name,
    description: `${entry.content.strength} · ${entry.content.form} · ${entry.content.route}`, base: entry, scopes: [],
    conditions: entry.content.uses.map((use) => use.condition),
    terms: [entry.content.generic_name, entry.content.strength, ...entry.content.aliases.map((alias) => alias.name), ...entry.content.ingredients.map((item) => item.name)].join(" ") });
  for (const scope of scopes) {
    const product = scope.content.product;
    const item = items.get(scope.medicine_id) ?? { id: scope.medicine_id, name: scopeMedicineName(scope),
      description: product ? `${product.strength} · ${product.form} · ${product.route}` : "Exact product identity unresolved", scopes: [], conditions: [],
      terms: [scopeMedicineName(scope), scope.medicine_id, ...(product?.aliases.map((alias) => alias.name) ?? [])].join(" ") };
    item.scopes.push(scope); item.conditions.push(scope.condition); items.set(item.id, item);
  }
  const contentReviewedCount = [...items.values()].filter((item) => item.base?.review_is_current || item.scopes.some((scope) => scope.content_review.is_current)).length;
  const relevantScopes = (item: CatalogueItem) => item.scopes.filter((scope) => condition === "all" || scope.condition === condition);
  const relevantBase = (item: CatalogueItem) => item.base && (condition === "all" || item.base.content.uses.some((use) => use.condition === condition)) ? item.base : undefined;
  function itemContentStatus(item: CatalogueItem): MedicineReviewStatus {
    const base = relevantBase(item);
    const statuses = [
      ...(base ? [currentContentStatus(base.review_status, base.review_is_current)] : []),
      ...relevantScopes(item).map((scope) => currentContentStatus(scope.content_review.status, scope.content_review.is_current)),
    ];
    if (statuses.includes("reviewed")) return "reviewed";
    return statuses.length > 0 && statuses.every((value) => value === "rejected") ? "rejected" : "pending";
  }
  const filtered = [...items.values()].filter((item) => (condition === "all" || item.conditions.includes(condition))
    && (status === "all" || relevantBase(item)?.review_status === status || relevantScopes(item).some((scope) => scope.content_review.status === status))
    && item.terms.toLowerCase().includes(search.trim().toLowerCase()));
  const active = filtered.find((item) => item.id === selected) ?? filtered[0];
  const activeBase = active && relevantBase(active);
  function saved(entry: MedicineEntry) { setEntries((rows) => rows.map((row) => row.id === entry.id ? entry : row)); setSavedMessage("Content review saved."); }
  function scopeSaved(scope: ConditionScope) { setScopes((rows) => rows.map((row) => row.id === scope.id ? scope : row)); setSavedMessage(`Review saved for ${conditionNames[scope.condition]}. Current reviews are reused.`); }

  return <PageFrame title="Medicine Knowledge" description="Medicine identities, evidence and review status across six conditions. Current content and safety-rule reviews are reused for their recorded version and scope.">
    <div className="flex flex-wrap items-center gap-3"><button type="button" className={buttonStyle} onClick={load} disabled={loading}><RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh catalogue</button></div>
    {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>{error}</p>{denied && <Link href="/login" className="mt-2 inline-block font-bold underline">Sign in</Link>}</div>}
    {savedMessage && <p role="status" className="text-xs text-emerald-800">{savedMessage}</p>}
    {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading medicine catalogue…</p> : !denied && !error && <>
      <Section title="Catalogue coverage" icon={BookOpen}><div className="grid gap-3 sm:grid-cols-3">{[["Catalogue identities", items.size], ["Content reviewed", scopeError ? "Unavailable" : contentReviewedCount], ["Additional condition scopes", scopes.length]].map(([label, count]) => <div key={label} className="rounded-2xl bg-purple-50 p-4"><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-2xl font-extrabold text-purple-800">{count}</p></div>)}</div><p className="mt-3 text-xs leading-relaxed text-slate-500">Each medicine/reference is counted once when at least one recorded scope has a current content review. Other condition scopes may still be pending. Safety-rule reviews are tracked separately; a content review does not approve a prescription.</p>{scopeError && <p role="alert" className="mt-3 text-xs text-amber-900">{scopeError}</p>}</Section>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="min-w-0 space-y-6"><Section title="Medicine catalogue" icon={Library}>
        <div className="space-y-3"><label className="block space-y-1.5"><span className="text-xs font-semibold">Search medicines</span><input type="search" className={controlStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Generic name, ingredient or supported alias" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-semibold">Condition filter</span><select aria-label="Condition filter" className={controlStyle} value={condition} onChange={(event) => setCondition(event.target.value)}><option value="all">All six conditions</option>{Object.entries(conditionNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><label className="block space-y-1.5"><span className="text-xs font-semibold">Review status filter</span><select aria-label="Review status filter" className={controlStyle} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          {!items.size ? <Unavailable title="Catalogue is empty">No medicine knowledge has been imported yet.</Unavailable> : !filtered.length ? <p role="status" className="text-xs text-slate-500">No medicines match these filters.</p> : <ul className="space-y-2">{filtered.map((item) => <li key={item.id}><button type="button" aria-pressed={active?.id === item.id} onClick={() => { setSelected(item.id); setSavedMessage(null); }} className={`w-full space-y-2 rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${active?.id === item.id ? "border-purple-300 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className="block text-sm font-bold">{item.name}</span><span className="block text-xs text-slate-600">{item.description}</span><span className="block text-xs text-slate-500">{[...new Set(item.conditions)].map((code) => conditionNames[code] ?? code).join(" · ")}</span><MedicineReviewBadge status={itemContentStatus(item)} />{relevantScopes(item).map((scope) => <span key={scope.id} className="block text-xs text-slate-600">{conditionNames[scope.condition]}: content {scope.content_review.is_current ? "completed" : scope.content_review.status} · rules {scope.safety_review.is_current ? "completed" : scope.safety_review.status}</span>)}</button></li>)}</ul>}
        </div>
      </Section><Section title="Check a medicine name" icon={BookOpen}><p className="mb-3 text-xs leading-relaxed text-slate-500">Name checking uses the live influenza/chickenpox catalogue. Additional condition products are available above for scope and evidence review.</p><label className="mb-3 block space-y-1.5"><span className="text-xs font-semibold">Medicine names to check</span><textarea className={controlStyle} rows={3} maxLength={10000} value={names} onChange={(event) => setNames(event.target.value)} placeholder="One medicine per line" /></label><MedicineNameCheck key={names} names={names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)} onAccessDenied={deny} /></Section></div>
        <div className="min-w-0 space-y-6">{active && <AdditionalMedicineScopes key={active.id} scopes={relevantScopes(active)} onSaved={scopeSaved} onAccessDenied={deny}>{activeBase && <EntryDetail key={activeBase.id + activeBase.updated_at} entry={activeBase} onSaved={saved} onAccessDenied={deny} />}</AdditionalMedicineScopes>}{!active && <Unavailable title="No entry selected">Select a matching catalogue entry to view evidence and review status.</Unavailable>}</div>
      </div>
    </>}
  </PageFrame>;
}
