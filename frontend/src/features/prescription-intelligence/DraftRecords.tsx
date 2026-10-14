"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileClock, FileCheck, FileX } from "lucide-react";
import { buttonStyle, controlStyle, PageFrame, Section, Unavailable } from "./PageFrame";
import { DraftResult } from "./DraftResult";
import { fetchDrafts, type PrescriptionDraft } from "./draftApi";

export default function DraftRecords() {
  const [records, setRecords] = useState<PrescriptionDraft[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const rows = await fetchDrafts();
      if (!alive.current) return;
      setRecords(rows); setSelected((old) => rows.some((row) => row.id === old) ? old : rows[0]?.id ?? "");
    } catch (err) {
      if (alive.current) { setRecords([]); setError(err instanceof Error ? err.message : "Draft records could not be loaded."); }
    } finally { if (alive.current) setLoading(false); }
  }, [setSelected]);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => { void load(); }, 0); return () => { alive.current = false; clearTimeout(timer); }; }, [load]);
  const active = records.find((row) => row.id === selected);
  return <PageFrame title="Prescription Records" description="Saved prescription screening drafts and immutable version history for your authorized consultations.">
    <Section title="Saved draft records" icon={FileClock}>
      <div className="flex flex-wrap gap-3"><button type="button" className={buttonStyle} disabled={loading} onClick={load}>Refresh draft records</button><Link href="/doctor/prescription-workspace" className={buttonStyle}>Open Prescription Workspace</Link></div>
      {loading && <p role="status" className="mt-4 text-xs text-slate-500">Loading saved drafts…</p>}
      {error && <p role="alert" className="mt-4 text-xs text-rose-700">{error}</p>}
      {!loading && !error && (records.length ? <label className="mt-4 block space-y-2"><span className="text-xs font-semibold text-slate-700">Saved prescription draft</span><select className={controlStyle} value={selected} onChange={(e) => setSelected(e.target.value)}>{records.map((row) => <option key={row.id} value={row.id}>Patient {row.patient} · {row.snapshot.diagnosis.condition_label} · Version {row.revision} · {new Date(row.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })} · {row.current_state.is_current ? "Current inputs" : "Historical / stale"}</option>)}</select></label> : <div className="mt-4"><Unavailable title="No saved screening drafts">Generate a draft in Prescription Workspace after reviewing the visit inputs and medicine rules.</Unavailable></div>)}
      {active && <p className="mt-3 break-all text-xs text-slate-500">Patient ID: {active.patient} · Consultation: {active.consultation_id}</p>}
    </Section>
    {active && <DraftResult draft={active} edited={false} />}
    <div className="grid items-start gap-6 sm:grid-cols-2"><Section title="Approved prescriptions" icon={FileCheck}><Unavailable title="Approval workflow unavailable">Screening drafts have no prescription approval or publication decision.</Unavailable></Section><Section title="Rejected prescription versions" icon={FileX}><Unavailable title="Prescription decision workflow unavailable">Blocked screening checks are recorded in the draft; they are not a clinician rejection decision.</Unavailable></Section></div>
  </PageFrame>;
}
