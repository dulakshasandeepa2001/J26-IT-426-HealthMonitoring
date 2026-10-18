"use client";
import { HistoryIdentityPolicy } from "./HistoryIdentityPolicy";
import { interfaceText } from "@/lib/productLanguage";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { fetchSafetyProfiles, reviewSafetyProfile, type SafetyProfile } from "./draftApi";
import type { MedicineReviewStatus } from "./medicineApi";
import { buttonStyle, controlStyle } from "./PageFrame";

export function SafetyRuleReview({ medicineId, onAccessDenied, onCurrentChange }: { medicineId: string; onAccessDenied: (message: string) => void; onCurrentChange?: (current: boolean | null) => void }) {
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [checked, setChecked] = useState(false);
  const [decision, setDecision] = useState<MedicineReviewStatus>("reviewed");
  const [saved, setSaved] = useState(false);
  const [changingReview, setChangingReview] = useState(false);
  const alive = useRef(true);
  const locked = useRef(false);
  const load = useCallback(async () => {
    setBusy(true); setError(null); setSaved(false); onCurrentChange?.(null);
    try { const rows = await fetchSafetyProfiles(medicineId); if (alive.current) { setProfile(rows[0] ?? null); onCurrentChange?.(rows[0]?.review_is_current ?? false); setChangingReview(false); } }
    catch (err) { if (!alive.current) return; setProfile(null); const message = err instanceof Error ? err.message : "Rules unavailable."; setError(message); if (err instanceof ApiError && [401, 403].includes(err.status)) onAccessDenied(message); }
    finally { if (alive.current) setBusy(false); }
  }, [medicineId, onAccessDenied, onCurrentChange]);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => { void load(); }, 0); return () => { alive.current = false; clearTimeout(timer); }; }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || locked.current || notes.trim().length < 10 || (decision === "reviewed" && !checked)) return;
    locked.current = true; setBusy(true); setError(null); setSaved(false);
    try { const row = await reviewSafetyProfile(profile, decision, notes.trim(), checked); if (alive.current) { setProfile(row); onCurrentChange?.(row.review_is_current); setSaved(true); setChangingReview(false); setNotes(""); setChecked(false); } }
    catch (err) { if (!alive.current) return; const message = err instanceof Error ? err.message : "Rule review failed."; setError(message); if (err instanceof ApiError && [401, 403].includes(err.status)) onAccessDenied(message); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  return <section id="medicine-safety-rule-review" tabIndex={-1} aria-label="Safety rule review" className="scroll-mt-6 space-y-3 rounded-xl border border-slate-200 p-3 text-xs">
    <h4 className="font-bold text-slate-800">Safety rule review · {profile?.review_is_current ? "Completed for this version" : profile?.review_status === "rejected" ? "Rejected" : profile ? "Pending review" : busy ? "Loading…" : "Unavailable"}</h4>
    <p className="leading-relaxed text-slate-500">{profile?.review_is_current ? "Completed for this version. The stored safety-rule review is reused; no repeat review is required." : "Review the rule scope, numerical policies and linked evidence once for this version. Content and safety-rule decisions are recorded separately."}</p>
    {profile ? <>
      <p className={`font-semibold ${profile.review_is_current ? "text-emerald-800" : "text-amber-900"}`}>Rule status: {profile.review_is_current ? "Reviewed for this version" : profile.review_status === "rejected" ? "Rejected" : "Pending or outdated"}</p>
      <p className="leading-relaxed text-slate-600">{profile.content.scope}</p>
      <HistoryIdentityPolicy policy={profile.history_identity_policy} />
      <p className="text-slate-500">Rule version: {interfaceText(profile.content.version)}{profile.engine_version && ` · Engine: ${interfaceText(profile.engine_version)}`}</p>
      {profile.reviewed_at && !profile.review_is_current && profile.review_status === "pending" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">The previous review is out of date. Rule code, bound medicine content or reviewer authorization changed. Review the current version before screening or automatic regimen suggestions.</p>}
      <details><summary className="cursor-pointer font-semibold text-slate-600">Inspect executable rule parameters</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-[11px]">{JSON.stringify(profile.content.parameters, null, 2)}</pre><p className="mt-2 text-slate-500">Allergy match names: {profile.content.allergy_names.join(", ")}</p></details>
      <ul className="space-y-2">{profile.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-700 underline">{source.title}</a><p className="text-slate-500">{profile.content.source_sections[source.id]?.join("; ")}</p></li>)}</ul>
      {profile.reviewed_at && <p className="whitespace-pre-wrap break-words text-slate-500">Last decision: {profile.reviewer_name} · {new Date(profile.reviewed_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}<br />{profile.review_notes}</p>}
      {profile.review_is_current && <button type="button" className={buttonStyle} onClick={() => setChangingReview((value) => !value)}>{changingReview ? "Cancel safety review change" : "Change safety rule review"}</button>}
      {(!profile.review_is_current || changingReview) && <form onSubmit={save} className="space-y-3">
        <label className="block space-y-1.5"><span className="font-semibold">Safety rule decision</span><select className={controlStyle} value={decision} disabled={busy} onChange={(e) => setDecision(e.target.value as MedicineReviewStatus)}><option value="reviewed">Rules reviewed</option><option value="rejected">Reject rules</option><option value="pending">Return to pending</option></select></label>
        <label className="block space-y-1.5"><span className="font-semibold">Safety rule review notes</span><textarea className={controlStyle} rows={3} minLength={10} maxLength={2000} required value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} aria-describedby="medicine-rule-notes-help" /></label>
        <p id="medicine-rule-notes-help" className={notes.trim().length < 10 ? "text-amber-800" : "text-slate-500"}>At least 10 characters required. {notes.trim().length}/2000 characters.</p>
        <label className="flex items-start gap-2 leading-relaxed"><input type="checkbox" className="mt-0.5 accent-purple-600" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} />I reviewed the executable rules, dose policies and exclusions against the linked evidence.</label>
        <button type="submit" className={buttonStyle} disabled={busy || notes.trim().length < 10 || (decision === "reviewed" && !checked)}>Save safety rule review</button>
      </form>}
    </> : <p className="text-slate-500">{busy ? "Loading safety profile…" : "No executable safety profile is imported for this medicine."}</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {saved && <p role="status" className="text-emerald-700">Safety rule review saved for this version.</p>}
    <button type="button" className={buttonStyle} disabled={busy} onClick={load}>Refresh safety rules</button>
  </section>;
}
