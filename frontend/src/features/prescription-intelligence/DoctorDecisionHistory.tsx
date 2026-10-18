"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { PageFrame, Section, buttonStyle } from "./PageFrame";
import type { DoctorDecision } from "./reviewApi";

type Row = DoctorDecision & { patient: { id: number; name: string }; condition: string; proposal_revision: number;
  current_state: { is_current: boolean; reason: string | null }; can_open_slip: boolean };

export default function DoctorDecisionHistory() {
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(true);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current; setRows([]); setBusy(true); setError("");
    try { const data: Row[] = await apiRequest("/api/prescription/doctor-decisions/"); if (current === sequence.current) setRows(data); }
    catch (failure) { if (current === sequence.current) { setRows([]); setError(failure instanceof Error ? failure.message : "Decision history unavailable."); } }
    finally { if (current === sequence.current) setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => { invalidate(); clearTimeout(timer); }; }, [load, invalidate]);
  return <PageFrame title="Doctor Decision History" description="Recorded edits, approvals and rejections for the synthetic research workflow. No patient publication.">
    <Section title="Recorded doctor decisions" icon={ClipboardCheck}>
      <button type="button" className={buttonStyle} disabled={busy} onClick={load}>Refresh doctor decisions</button>
      {busy && <p role="status">Loading decisions…</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-800">{error}</p>}
      {!busy && !error && !rows.length && <p className="mt-3 text-xs">No doctor decisions have been recorded.</p>}
      <div className="mt-4 space-y-3">{rows.map((row) => <article key={row.id} className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
        <p className="font-bold">{row.patient.name} · {row.condition.replaceAll("_", " ")} · {row.action}</p>
        <p>Proposal {row.proposal_revision}, decision {row.revision} · {new Date(row.created_at).toLocaleString(undefined, { timeZone: "Asia/Colombo" })}</p>
        <p>{row.reason}</p>{!row.current_state.is_current && <p className="text-amber-900">Historical: {row.current_state.reason}</p>}
        {row.can_open_slip && <Link href={`/doctor/prescription-slip/${row.id}`} className={buttonStyle}>Open approved prescription</Link>}
      </article>)}</div>
    </Section>
  </PageFrame>;
}
