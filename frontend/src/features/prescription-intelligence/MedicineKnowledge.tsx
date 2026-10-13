"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Library, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError, getSession } from "@/lib/api";
import { PageFrame, Section, Unavailable, buttonStyle, controlStyle } from "./PageFrame";
import { fetchMedicines, fetchMedicineReviews, reviewMedicine, type MedicineEntry, type MedicineReview, type MedicineReviewStatus } from "./medicineApi";
import { MedicineNameCheck } from "./MedicineNameCheck";

const labels: Record<MedicineReviewStatus, string> = { pending: "Pending review", reviewed: "Content reviewed", rejected: "Rejected" };
function Status({ status }: { status: MedicineReviewStatus }) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold ${status === "reviewed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{labels[status]}</span>;
}
function date(value: string) { return new Date(value).toLocaleString(undefined, { timeZone: "Asia/Colombo" }); }

function EntryDetail({ entry, onSaved, onAccessDenied }: { entry: MedicineEntry; onSaved: (entry: MedicineEntry) => void; onAccessDenied: (message: string) => void }) {
  const [decision, setDecision] = useState<MedicineReviewStatus>("reviewed");
  const [notes, setNotes] = useState("");
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MedicineReview[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
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

  return <Section title="Evidence and content review" icon={ShieldCheck}><div className="space-y-5 text-xs leading-relaxed">
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-lg font-extrabold text-slate-900">{content.generic_name}</h3><Status status={entry.review_status} /></div>
      <p className="mt-1 text-slate-600">{content.strength} · {content.form} · {content.route}</p>
      <p className="mt-2 text-slate-600">Active ingredients: {content.ingredients.map((item) => `${item.name} ${item.strength}`).join("; ")}</p>
      <p className="mt-1 break-words text-slate-500">RxNorm product: {content.standard_concept.name} · RxCUI {content.standard_concept.rxcui}</p>
      <p className="mt-2 text-slate-500">This strength describes a catalogue product. It is not a prescribed dose or an age eligibility decision.</p>
    </div>
    <div><h4 className="font-bold text-slate-800">Pilot uses and limits</h4><div className="mt-2 space-y-3">{content.uses.map((use) => <div key={use.condition} className="rounded-xl bg-slate-50 p-3">
      <p className="font-bold capitalize">{use.condition} · {use.purpose.replaceAll("_", " ")}</p><p className="mt-1">{use.summary}</p><p className="mt-1 text-slate-600">{use.scope}</p>
      <p className="mt-1 text-[11px] text-slate-500">Basis: {use.basis.replaceAll("_", " ")}</p>{sourceLinks(use.source_ids)}
    </div>)}</div></div>
    <div><h4 className="font-bold text-slate-800">Selected warnings and restrictions</h4><p className="mt-1 text-slate-500">These summaries are not a complete safety assessment. Review the full source information.</p>
      <div className="mt-2 space-y-2">{content.warnings.map((warning, index) => <div key={index} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3"><p className="font-semibold capitalize">{warning.category}</p><p className="mt-1">{warning.summary}</p>{sourceLinks(warning.source_ids)}</div>)}</div>
    </div>
    <div><h4 className="font-bold text-slate-800">Evidence references</h4><ul className="mt-2 space-y-3">{content.sources.map((source) => <li key={source.id} className="break-words rounded-xl border border-slate-200 p-3">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-bold text-purple-700 underline">{source.title}<ExternalLink aria-hidden="true" className="ml-1 inline h-3 w-3" /><span className="sr-only"> (opens a new tab)</span></a>
      <p className="mt-1 text-slate-500">{source.publisher} · Source date: {source.published_date ?? "Not supplied"} · Accessed: {source.accessed_date}</p><p className="mt-1 text-slate-500">Sections: {source.sections.join(", ")}</p>
    </li>)}</ul></div>
    <details><summary className="cursor-pointer font-semibold text-slate-600">Supported name aliases</summary><ul className="mt-2 space-y-1">{content.aliases.map((alias) => <li key={alias.name}>{alias.name} · {alias.level === "ingredient" ? "Ingredient only; product needs clarification" : "Product name"}</li>)}</ul></details>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="font-bold">Last content review</p>
      {entry.reviewed_at ? <><p className="mt-1">{entry.reviewer_name} · {date(entry.reviewed_at)}</p><p className="mt-1 whitespace-pre-wrap break-words">{entry.review_notes}</p>{!entry.review_is_current && entry.review_status === "pending" && <p className="mt-1 text-amber-800">A current clinician review is required.</p>}</> : <p className="mt-1">No clinician has reviewed this version.</p>}
      <p className="mt-2 text-slate-500">Catalogue version: {content.catalogue_version}</p>
    </div>
    <form onSubmit={save} className="space-y-3 border-t border-slate-100 pt-4"><h4 className="font-bold text-slate-800">Record a content review</h4><p className="text-slate-500">Review applies to this catalogue version. Patient-specific medicine eligibility and prescription approval are separate decisions.</p>
      <label className="block space-y-1.5"><span className="font-semibold">Review decision</span><select className={controlStyle} disabled={busy} value={decision} onChange={(event) => setDecision(event.target.value as MedicineReviewStatus)}><option value="reviewed">Content reviewed</option><option value="rejected">Reject content</option><option value="pending">Return to pending</option></select></label>
      <label className="block space-y-1.5"><span className="font-semibold">Review notes</span><textarea className={controlStyle} rows={3} minLength={10} maxLength={2000} required disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explain what you checked or what needs correction." /></label>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600" checked={evidenceChecked} disabled={busy} onChange={(event) => setEvidenceChecked(event.target.checked)} />I reviewed the listed evidence, formulation, warnings and pilot scope for this version.</label>
      <button type="submit" className={buttonStyle} disabled={busy || notes.trim().length < 10 || (decision === "reviewed" && !evidenceChecked)}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Save content review</button>
    </form>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <div><button type="button" className={buttonStyle} disabled={historyBusy || busy} onClick={loadHistory}>{historyBusy ? "Loading history…" : "Load review history"}</button>{history && <ul className="mt-3 space-y-2">{history.map((review) => <li key={review.id} className="rounded-xl border border-slate-200 p-3"><p className="font-bold">{labels[review.decision]} · {review.reviewer_name}</p><p className="text-slate-500">{date(review.recorded_at)} · Version: {review.catalogue_version}</p><p className="mt-1 whitespace-pre-wrap break-words">{review.notes}</p></li>)}</ul>}</div>
  </div></Section>;
}

export default function MedicineKnowledge() {
  const [entries, setEntries] = useState<MedicineEntry[]>([]);
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
  const deny = useCallback((message: string) => { sequence.current++; setEntries([]); setSelected(""); setNames(""); setSavedMessage(null); setDenied(true); setLoading(false); setError(message); }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null); setSavedMessage(null);
    try {
      const session = await getSession();
      if (request !== sequence.current) return;
      if (session.user) localStorage.setItem("meditrack_user", JSON.stringify(session.user));
      else localStorage.removeItem("meditrack_user");
      window.dispatchEvent(new Event("storage"));
      if (!session.user || session.user.role !== "doctor") throw new ApiError("Sign in with an approved doctor account to open medicine knowledge.", 403);
      const rows = await fetchMedicines();
      if (request !== sequence.current) return;
      setEntries(rows); setDenied(false); setLoading(false);
    } catch (err) {
      if (request !== sequence.current) return;
      const message = err instanceof Error ? err.message : "Medicine catalogue unavailable.";
      if (err instanceof ApiError && [401, 403].includes(err.status)) deny(message);
      else { setEntries([]); setLoading(false); setError(message); }
    }
  }, [deny]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  const filtered = entries.filter((entry) => (condition === "all" || entry.content.uses.some((use) => use.condition === condition)) && (status === "all" || entry.review_status === status)
    && [entry.content.generic_name, entry.content.strength, ...entry.content.aliases.map((alias) => alias.name), ...entry.content.ingredients.map((item) => item.name)].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const active = filtered.find((entry) => entry.id === selected) ?? filtered[0];
  function saved(entry: MedicineEntry) { setEntries((rows) => rows.map((row) => row.id === entry.id ? entry : row)); setSavedMessage("Content review saved. Prescription generation remains a later step."); }

  return <PageFrame title="Medicine Knowledge" description="Evidence-backed medicine catalogue for the influenza and chickenpox pilot. Review content before using it in a future prescription draft.">
    <div className="flex flex-wrap items-center gap-3"><button type="button" className={buttonStyle} onClick={load} disabled={loading}><RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh catalogue</button><Link href="/doctor/prescription-workspace" className="text-xs font-semibold text-purple-700 underline">Prescription Workspace</Link></div>
    {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>{error}</p>{denied && <Link href="/login" className="mt-2 inline-block font-bold underline">Sign in</Link>}</div>}
    {savedMessage && <p role="status" className="text-xs text-emerald-800">{savedMessage}</p>}
    {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading medicine catalogue…</p> : !denied && !error && <>
      <Section title="Pilot catalogue" icon={BookOpen}><div className="grid gap-3 sm:grid-cols-3">{[["Catalogue entries", entries.length], ["Content reviewed", entries.filter((entry) => entry.review_is_current).length], ["Needs review or correction", entries.filter((entry) => !entry.review_is_current).length]].map(([label, count]) => <div key={label} className="rounded-2xl bg-purple-50 p-4"><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-2xl font-extrabold text-purple-800">{count}</p></div>)}</div><p className="mt-3 text-xs leading-relaxed text-slate-500">Entries start pending. Content review records a clinician decision; it does not prescribe a medicine or establish patient safety. No model training or candidate generation runs here.</p></Section>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="min-w-0 space-y-6"><Section title="Medicine catalogue" icon={Library}>
        <div className="space-y-3"><label className="block space-y-1.5"><span className="text-xs font-semibold">Search medicines</span><input type="search" className={controlStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Generic name, ingredient or supported alias" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-semibold">Condition filter</span><select className={controlStyle} value={condition} onChange={(event) => setCondition(event.target.value)}><option value="all">All pilot conditions</option><option value="influenza">Influenza</option><option value="chickenpox">Chickenpox</option></select></label><label className="block space-y-1.5"><span className="text-xs font-semibold">Review status filter</span><select className={controlStyle} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          {!entries.length ? <Unavailable title="Catalogue is empty">No pilot entries have been imported yet.</Unavailable> : !filtered.length ? <p role="status" className="text-xs text-slate-500">No medicines match these filters.</p> : <ul className="space-y-2">{filtered.map((entry) => <li key={entry.id}><button type="button" aria-pressed={active?.id === entry.id} onClick={() => { setSelected(entry.id); setSavedMessage(null); }} className={`w-full space-y-2 rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${active?.id === entry.id ? "border-purple-300 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className="block text-sm font-bold">{entry.content.generic_name}</span><span className="block text-xs text-slate-600">{entry.content.strength} · {entry.content.form} · {entry.content.route}</span><Status status={entry.review_status} /></button></li>)}</ul>}
        </div>
      </Section><Section title="Check a medicine name" icon={BookOpen}><label className="mb-3 block space-y-1.5"><span className="text-xs font-semibold">Medicine names to check</span><textarea className={controlStyle} rows={3} maxLength={10000} value={names} onChange={(event) => setNames(event.target.value)} placeholder="One medicine per line" /></label><MedicineNameCheck key={names} names={names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)} onAccessDenied={deny} /></Section></div>
        <div className="min-w-0">{active ? <EntryDetail key={active.id + active.updated_at} entry={active} onSaved={saved} onAccessDenied={deny} /> : <Unavailable title="No entry selected">Select a matching catalogue entry to view evidence and record a review.</Unavailable>}</div>
      </div>
    </>}
  </PageFrame>;
}
