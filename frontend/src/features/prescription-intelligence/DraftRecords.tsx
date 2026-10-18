"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileClock, FileCheck, FileX } from "lucide-react";
import { buttonStyle, controlStyle, PageFrame, Section, Unavailable } from "./PageFrame";
import { DraftResult } from "./DraftResult";
import { fetchDrafts, type PrescriptionDraft } from "./draftApi";
import { fetchScreeningDrafts, type ScreeningDraft } from "./clinicalScreeningApi";
import { ClinicalDraftResult } from "./ClinicalScreeningResult";
import { conditionNames } from "./AdditionalMedicineScopes";

type RecordRow = { kind: "legacy"; draft: PrescriptionDraft } | { kind: "six"; draft: ScreeningDraft };
const recordKey = (row: RecordRow) => `${row.kind}:${row.draft.id}`;
const diagnosisLabel = (row: RecordRow) => row.kind === "six" ? conditionNames[row.draft.result.condition] : row.draft.snapshot.diagnosis.condition_label;

export default function DraftRecords() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(null); setRecords([]);
    try {
      const [legacy, clinical] = await Promise.all([fetchDrafts(), fetchScreeningDrafts()]);
      if (!alive.current || current !== sequence.current) return;
      const rows: RecordRow[] = [...legacy.map((draft) => ({ kind: "legacy" as const, draft })), ...clinical.map((draft) => ({ kind: "six" as const, draft }))];
      rows.sort((a, b) => Date.parse(b.draft.created_at) - Date.parse(a.draft.created_at) || b.draft.revision - a.draft.revision);
      setRecords(rows); setSelected((old) => rows.some((row) => recordKey(row) === old) ? old : rows[0] ? recordKey(rows[0]) : "");
    } catch (err) {
      if (alive.current && current === sequence.current) { setRecords([]); setError(err instanceof Error ? err.message : "Draft records could not be loaded."); }
    } finally { if (alive.current && current === sequence.current) setLoading(false); }
  }, [setSelected]);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => { void load(); }, 0); return () => { alive.current = false; invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  const active = records.find((row) => recordKey(row) === selected);
  return <PageFrame title="Prescription Records" description="Saved prescription screening drafts and immutable version history for your authorized consultations.">
    <Section title="Saved draft records" icon={FileClock}>
      <div className="flex flex-wrap gap-3"><button type="button" className={buttonStyle} disabled={loading} onClick={load}>Refresh draft records</button><Link href="/doctor/prescription-workspace" className={buttonStyle}>Open Prescription Workspace</Link></div>
      {loading && <p role="status" className="mt-4 text-xs text-slate-500">Loading saved drafts…</p>}
      {error && <p role="alert" className="mt-4 text-xs text-rose-700">{error}</p>}
      {!loading && !error && (records.length ? <label className="mt-4 block space-y-2"><span className="text-xs font-semibold text-slate-700">Saved prescription draft</span><select aria-label="Saved prescription draft" className={controlStyle} value={selected} onChange={(e) => setSelected(e.target.value)}>{records.map((row) => <option key={recordKey(row)} value={recordKey(row)}>Patient {row.draft.patient} · {diagnosisLabel(row)} · Version {row.draft.revision} · {new Date(row.draft.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })} · {row.draft.current_state.is_current ? "Current inputs" : "Historical / stale"}</option>)}</select></label> : <div className="mt-4"><Unavailable title="No saved screening drafts">Generate a draft in Prescription Workspace after reviewing the visit inputs and medicine rules.</Unavailable></div>)}
      {active && <p className="mt-3 break-all text-xs text-slate-500">Patient ID: {active.draft.patient} · Consultation: {active.draft.consultation_id}</p>}
    </Section>
    {active && (active.kind === "six" ? <ClinicalDraftResult draft={active.draft} /> : <DraftResult draft={active.draft} edited={false} />)}
    <div className="grid items-start gap-6 sm:grid-cols-2"><Section title="Doctor-approved prescriptions" icon={FileCheck}><p className="text-xs">Saved screening drafts remain separate from doctor decisions.</p><Link className={buttonStyle} href="/doctor/validation-approval-history">Open doctor decision history</Link></Section><Section title="Edited and rejected proposals" icon={FileX}><p className="text-xs">Doctor decisions and reasons are retained in the synthetic workflow history.</p><Link className={buttonStyle} href="/doctor/validation-approval-history">View recorded decisions</Link></Section></div>
  </PageFrame>;
}
