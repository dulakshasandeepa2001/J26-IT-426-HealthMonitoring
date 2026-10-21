"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonStyle } from "./PageFrame";
import { loadPrescriptionSlip, type PrescriptionSlip as Slip } from "./reviewApi";

function regimenText(row: Slip["medicines"][number]) {
  const r = row.regimen!;
  if (r.schedule_type === "oral_rehydration_after_stool") return `${r.amount_range?.join("–")} sachets after each loose stool, oral. No fixed daily frequency or course. ${r.instructions ?? ""}`;
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
      <header className="flex items-center gap-2.5 border-b border-slate-300 pb-3">
        <svg role="img" aria-label="MediTrack logo" width="32" height="32" viewBox="0 0 32 32" className="shrink-0">
          <rect x="1" y="1" width="30" height="30" rx="8" fill="#7e22ce" />
          <path d="M8 23V10l8 9 8-9v13" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div><h1 className="text-base font-bold leading-tight">MediTrack</h1><p className="mt-0.5 text-[10px] font-semibold tracking-wide text-slate-600">Prescription</p></div>
      </header>
      <dl><div><dt className="inline font-bold">Name: </dt><dd className="inline">{slip.patient.name}</dd></div><div><dt className="inline font-bold">Age: </dt><dd className="inline">{slip.patient.age_years ?? "Unknown"} years</dd></div><div><dt className="inline font-bold">Date: </dt><dd className="inline">{new Date(slip.approved_at).toLocaleDateString(undefined, { timeZone: "Asia/Colombo" })}</dd></div></dl>
      <ol className="list-inside list-decimal space-y-3">{slip.medicines.map((row) => <li key={row.medicine_id} className="break-inside-avoid"><span className="font-bold">{row.generic_name} · {row.product?.strength} · {row.product?.form}</span><p>{regimenText(row)}</p>{row.regimen?.review_after_days != null && <p>Reassessment limit: {row.regimen.review_after_days} days; this is not a prescribed course.</p>}{row.regimen?.reassessment_limit_hours != null && <p>Reassessment limit: {row.regimen.reassessment_limit_hours} hours.</p>}</li>)}</ol>
      <footer className="space-y-3 border-t border-slate-300 pt-4 break-inside-avoid">
        <div aria-label="Doctor profile stamp" className="meditrack-profile-stamp">
          <div className="meditrack-stamp-impression">
            <p className="text-[8px] font-bold uppercase tracking-[0.18em]">Doctor profile</p>
            <p className="mt-1 break-words text-sm font-bold tracking-wide">{slip.doctor.name}</p>
            {slip.doctor.qualifications && <p className="mt-1 break-words font-semibold">{slip.doctor.qualifications}</p>}
            {slip.doctor.university && <p className="mt-1 break-words">{slip.doctor.university}</p>}
            {slip.doctor.hospital && <p className="mt-1 break-words">{slip.doctor.hospital}</p>}
            <svg aria-hidden="true" className="meditrack-stamp-grain" viewBox="0 0 300 150" preserveAspectRatio="none">
              <defs><pattern id="meditrack-ink-grain" width="37" height="29" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="7" r="0.55" fill="white" /><circle cx="17" cy="2" r="0.35" fill="white" />
                <circle cx="29" cy="19" r="0.65" fill="white" /><circle cx="10" cy="24" r="0.4" fill="white" />
              </pattern></defs>
              <rect width="300" height="150" fill="url(#meditrack-ink-grain)" />
            </svg>
          </div>
          <p className="mt-2 text-[8px] font-semibold uppercase tracking-wider">Unsigned profile stamp</p>
        </div>
        <p className="text-[10px] font-semibold text-slate-600">Prototype — not valid for dispensing</p>
        <p className="break-all text-[9px]">Decision reference: {slip.decision_id}</p>
      </footer>
    </article>}
    <style jsx global>{`
      .meditrack-profile-stamp {
        width: calc(100% - 12px); max-width: 285px; margin: 6px auto 12px;
        color: #6b21a8; text-align: center; transform: rotate(-2deg);
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .meditrack-stamp-impression {
        position: relative; border: 2px solid currentColor; border-radius: 7px;
        outline: 1px solid currentColor; outline-offset: -5px; padding: 12px 14px;
        line-height: 1.35; overflow-wrap: anywhere;
      }
      .meditrack-stamp-grain { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.8; }
      #prescription-slip > header svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
