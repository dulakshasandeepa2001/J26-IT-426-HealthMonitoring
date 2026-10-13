"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonStyle } from "./PageFrame";
import { checkMedicineNames, type MedicineNameResult } from "./medicineApi";
import { ApiError } from "@/lib/api";

export function MedicineNameCheck({ names, disabled = false, onAccessDenied }: {
  names: string[]; disabled?: boolean; onAccessDenied?: (message: string) => void;
}) {
  const [results, setResults] = useState<MedicineNameResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const sequence = useRef(0);
  const namesKey = JSON.stringify(names);
  const [checkedKey, setCheckedKey] = useState("");
  useEffect(() => () => { sequence.current++; }, []);

  async function check() {
    if (locked.current || disabled || !names.length) return;
    locked.current = true;
    const request = ++sequence.current;
    setBusy(true); setError(null); setResults([]); setCheckedKey("");
    try {
      const response = await checkMedicineNames(names);
      if (request !== sequence.current) return;
      setResults(response.results); setCheckedKey(namesKey);
    } catch (err) {
      if (request !== sequence.current) return;
      const message = err instanceof Error ? err.message : "Medicine name check failed.";
      setError(message);
      if (err instanceof ApiError && [401, 403].includes(err.status)) onAccessDenied?.(message);
    } finally {
      locked.current = false;
      if (request === sequence.current) setBusy(false);
    }
  }

  return <div className="space-y-3">
    <button type="button" className={buttonStyle} disabled={disabled || busy || !names.length || names.length > 50} onClick={check}>
      {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Check medicine names
    </button>
    <p className="text-xs leading-relaxed text-slate-500">Checks exact names in the pilot catalogue. Include the product strength and form; extra schedule text needs clarification. Identity matching does not assess allergies, interactions or dose safety.</p>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {checkedKey === namesKey && <div aria-live="polite" className="space-y-2">{results.map((result, index) => <div key={index} className={`rounded-xl border p-3 text-xs ${result.requires_clarification ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
      <p className="break-words font-bold">{result.input}</p>
      <p className="mt-1 font-semibold">{result.requires_clarification ? "Clarification required" : "Exact product name recognized"}</p>
      <p className="mt-1 leading-relaxed">{result.reason}</p>
      {result.matches.map((match) => <p key={match.entry_id} className="mt-1 break-words">{match.generic_name} · {match.review_status === "reviewed" ? "Content reviewed" : "Content needs review"}{match.standard_concept && ` · Product RxCUI ${match.standard_concept.rxcui}`}</p>)}
    </div>)}</div>}
  </div>;
}
