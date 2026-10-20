"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonStyle } from "./PageFrame";
import { loadPrescriptionSlip, type PrescriptionSlip as Slip } from "./reviewApi";

function regimenText(row: Slip["medicines"][number]) {
  const r = row.regimen!;
  if (r.schedule_type === "topical_prn") return r.instructions ?? "External use as needed.";
  if (r.schedule_type === "ophthalmic_prn") return `${r.amount_range?.join("–")} ${r.unit}(s), ${r.route}, as needed. ${r.instructions ?? ""}`;
  if (r.schedule_type === "oral_prn") return `${r.amount} ${r.unit}, ${r.route}, as needed. ${r.interval_hours_range ? `Interval ${r.interval_hours_range.join("–")} hours.` : `At least ${r.interval_hours} hours between doses.`} ${r.max_doses_per_day ? `Maximum ${r.max_doses_per_day} doses/day.` : ""} Maximum ${r.max_daily_amount_mg} mg/day. ${r.instructions ?? ""}`;
  return `${r.amount} ${r.unit}, ${r.route}, ${r.doses_per_day} doses/day for ${r.duration_days} days. ${r.instructions ?? ""}`;
}

export default function PrescriptionSlipView({ id }: { id: string }) {
  const [slip, setSlip] = useState<Slip | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  const refresh = useCallback(async (print = false) => {
    const current = ++sequence.current; setBusy(true); setError(""); setSlip(null);
    try {
      const row = await loadPrescriptionSlip(id);
      if (current !== sequence.current) return;
      setSlip(row); setBusy(false);
      if (print) requestAnimationFrame(() => requestAnimationFrame(() => { if (current === sequence.current) window.print(); }));
    } catch (failure) { if (current === sequence.current) { setSlip(null); setError(failure instanceof Error ? failure.message : "Prescription preview unavailable."); } }
    finally { if (current === sequence.current) setBusy(false); }
  }, [id]);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => { invalidate(); clearTimeout(timer); }; }, [refresh, invalidate]);
  return <main className="space-y-5 p-4" aria-label="Approved prescription">
    <div className="flex flex-wrap gap-3 print:hidden"><Link className={buttonStyle} href="/doctor/prescription-workspace">Back to Workspace</Link><button className={buttonStyle} disabled={busy || !slip} onClick={() => refresh(true)}>Print A6 prescription</button><button className={buttonStyle} disabled={busy} onClick={() => refresh()}>Refresh prescription</button></div>
    {busy && <p role="status">Verifying current approval…</p>}
    {error && <p role="alert" className="text-rose-800">{error}</p>}
    {slip && <article id="prescription-slip" className="mx-auto max-w-[105mm] space-y-3 border border-slate-200 bg-white p-5 text-xs leading-relaxed text-slate-950">
      <header className="border-b border-slate-300 pb-2"><h1 className="text-base font-bold">MediTrack · Prescription</h1><p className="font-bold">RESEARCH USE ONLY — NOT FOR DISPENSING</p></header>
      <dl><div><dt className="inline font-bold">Name: </dt><dd className="inline">{slip.patient.name}</dd></div><div><dt className="inline font-bold">Age: </dt><dd className="inline">{slip.patient.age_years ?? "Unknown"} years</dd></div><div><dt className="inline font-bold">Date: </dt><dd className="inline">{new Date(slip.approved_at).toLocaleDateString(undefined, { timeZone: "Asia/Colombo" })}</dd></div></dl>
      <ol className="list-inside list-decimal space-y-3">{slip.medicines.map((row) => <li key={row.medicine_id} className="break-inside-avoid"><span className="font-bold">{row.generic_name} · {row.product?.strength} · {row.product?.form}</span><p>{regimenText(row)}</p>{row.regimen?.review_after_days != null && <p>Reassessment limit: {row.regimen.review_after_days} days; this is not a prescribed course.</p>}{row.regimen?.reassessment_limit_hours != null && <p>Reassessment limit: {row.regimen.reassessment_limit_hours} hours.</p>}</li>)}</ol>
      <footer className="space-y-2 border-t border-slate-300 pt-3 break-inside-avoid">
        <div aria-label="Doctor profile stamp" className="max-w-full space-y-1 rounded-xl border-2 border-double border-slate-500 px-3 py-2 text-center text-slate-700">
          <p className="text-[9px] font-bold uppercase tracking-widest">Doctor approval record</p>
          <p className="break-words font-bold">{slip.doctor.name}</p>
          {slip.doctor.qualifications && <p className="break-words">{slip.doctor.qualifications}</p>}
          {slip.doctor.university ? <p className="break-words">{slip.doctor.university}</p> : <p>University not recorded</p>}
          {slip.doctor.hospital && <p className="break-words">{slip.doctor.hospital}</p>}
          <p className="text-[9px]">Unsigned profile stamp · Research use only</p>
        </div>
        <p>Signature / authorized seal: __________________</p>
        <p className="text-[10px]">Doctor identity details are profile data. Credentials/signature are not verified. Research use only; not valid for dispensing.</p>
        <p className="break-all text-[9px]">Decision reference: {slip.decision_id}</p>
      </footer>
    </article>}
    <style jsx global>{`
      @page { size: A6 portrait; margin: 8mm; }
      @media print {
        body * { visibility: hidden; }
        #prescription-slip, #prescription-slip * { visibility: visible; }
        #prescription-slip { position: absolute; top: 0; left: 0; width: 89mm; max-width: none; border: 0; padding: 0; margin: 0; font-size: 9pt; overflow: visible; }
        #prescription-slip li, #prescription-slip footer { break-inside: avoid; }
      }
    `}</style>
  </main>;
}
