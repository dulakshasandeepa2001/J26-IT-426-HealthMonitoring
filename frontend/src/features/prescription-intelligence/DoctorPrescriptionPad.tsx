"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  FileText, Plus, Trash2, CheckCircle2, XCircle, Printer, AlertTriangle, 
  Sparkles, RefreshCw, ShieldAlert, HeartPulse, Stethoscope, Clock, Calendar
} from "lucide-react";
import type { usePrescription } from "./usePrescription";
import { conditionLabel } from "./analysisData";
import { SmartMedicineRanker, type RankedMedicine } from "./SmartMedicineRanker";

export interface PrescribedMedicine {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  isAiSuggested?: boolean;
}

export interface PrescriptionRecord {
  consultationId: string;
  patientId: number;
  patientName: string;
  patientAge: string;
  doctorName: string;
  hospital: string;
  diagnosis: string;
  date: string;
  medicines: PrescribedMedicine[];
  advice: string;
  redFlags: string[];
  status: "draft" | "approved" | "rejected";
  approvedAt?: string;
}

// Preset clinical standard suggestions mapped to condition
function getConditionSuggestedMedicines(conditionKey: string): PrescribedMedicine[] {
  const norm = (conditionKey || "").toLowerCase();
  
  if (norm.includes("flu") || norm.includes("influenza")) {
    return [
      {
        id: "med-1",
        name: "Paracetamol (Acetaminophen)",
        dosage: "500 mg Tablet",
        frequency: "1 Tablet TDS (3 times daily)",
        duration: "3 - 5 Days",
        instructions: "Take after meals for fever and body aches. Do not exceed 3000 mg in 24 hours.",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Oseltamivir (Tamiflu)",
        dosage: "75 mg Capsule",
        frequency: "1 Capsule BD (Twice daily)",
        duration: "5 Days",
        instructions: "Take with food to minimize GI upset. Complete the full 5-day antiviral course.",
        isAiSuggested: true,
      },
      {
        id: "med-3",
        name: "Oral Rehydration Salts (ORS)",
        dosage: "Standard WHO Formulation Sachet",
        frequency: "1 Sachet dissolved in 1L water",
        duration: "As needed",
        instructions: "Sip throughout the day to maintain adequate hydration.",
        isAiSuggested: true,
      }
    ];
  }

  if (norm.includes("chicken") || norm.includes("varicella")) {
    return [
      {
        id: "med-1",
        name: "Acyclovir",
        dosage: "800 mg Tablet",
        frequency: "1 Tablet 5 times daily (every 4 hrs awake)",
        duration: "7 Days",
        instructions: "Take with plenty of water. Complete full course to reduce lesion duration.",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Calamine + Zinc Oxide Lotion",
        dosage: "Topical Suspension",
        frequency: "Apply 2 - 3 times daily PRN",
        duration: "5 - 7 Days",
        instructions: "Apply gently over itchy vesicular skin lesions. For external use only.",
        isAiSuggested: true,
      },
      {
        id: "med-3",
        name: "Paracetamol",
        dosage: "500 mg Tablet",
        frequency: "1 Tablet every 6 - 8 hours PRN",
        duration: "3 - 5 Days",
        instructions: "Take for fever. STRICTLY AVOID Aspirin and Ibuprofen.",
        isAiSuggested: true,
      }
    ];
  }

  if (norm.includes("measles") || norm.includes("rubeola")) {
    return [
      {
        id: "med-1",
        name: "Vitamin A Capsule",
        dosage: "200,000 IU (Age-adjusted)",
        frequency: "Once daily for 2 days",
        duration: "2 Doses",
        instructions: "WHO protocol to prevent ocular damage, blindness and lower respiratory infection.",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Paracetamol",
        dosage: "500 mg Tablet",
        frequency: "1 Tablet TDS PRN",
        duration: "3 - 5 Days",
        instructions: "For high fever and malaise. Maintain oral fluid intake.",
        isAiSuggested: true,
      }
    ];
  }

  if (norm.includes("mumps") || norm.includes("parotitis")) {
    return [
      {
        id: "med-1",
        name: "Paracetamol",
        dosage: "500 mg Tablet",
        frequency: "1 Tablet TDS PRN",
        duration: "5 Days",
        instructions: "Take for fever and general discomfort.",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Ibuprofen",
        dosage: "200 mg Tablet",
        frequency: "1 Tablet TDS after meals",
        duration: "3 - 5 Days",
        instructions: "Anti-inflammatory for painful parotid salivary gland swelling. Take strictly after food.",
        isAiSuggested: true,
      }
    ];
  }

  if (norm.includes("conjunctivitis") || norm.includes("eye")) {
    return [
      {
        id: "med-1",
        name: "Hypromellose (Artificial Tears)",
        dosage: "0.3% Eye Drops",
        frequency: "1 - 2 Drops into affected eye(s) 3 - 4 times daily",
        duration: "7 Days",
        instructions: "Lubricating drops for comfort. Wash hands before and after applying. Avoid touching dropper tip.",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Cold Compress Therapy",
        dosage: "Sterile Clean Cloth / Compress",
        frequency: "Apply over closed eyelids 3 times daily for 5-10 mins",
        duration: "5 - 7 Days",
        instructions: "Soothes eyelid edema and ocular burning sensation.",
        isAiSuggested: true,
      }
    ];
  }

  if (norm.includes("gastroenteritis") || norm.includes("diarrhoea") || norm.includes("diarrhea")) {
    return [
      {
        id: "med-1",
        name: "Oral Rehydration Salts (ORS Low-Osmolarity)",
        dosage: "1 Sachet in 1 Litre boiled cooled water",
        frequency: "Drink 200 - 300 ml after each loose stool",
        duration: "3 - 5 Days",
        instructions: "Primary treatment to prevent dehydration. Sip slowly.",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Zinc Sulfate",
        dosage: "20 mg Tablet",
        frequency: "1 Tablet daily",
        duration: "10 - 14 Days",
        instructions: "WHO/UNICEF guideline to reduce severity and duration of diarrhea.",
        isAiSuggested: true,
      },
      {
        id: "med-3",
        name: "Paracetamol",
        dosage: "500 mg Tablet",
        frequency: "1 Tablet PRN",
        duration: "As needed",
        instructions: "Take for abdominal cramps or mild fever. Drink fluids.",
        isAiSuggested: true,
      }
    ];
  }

  if (norm.includes("dengue")) {
    return [
      {
        id: "med-1",
        name: "Paracetamol",
        dosage: "500 mg Tablet",
        frequency: "1 Tablet every 6 - 8 hours PRN (Max 3g daily)",
        duration: "3 - 5 Days",
        instructions: "CRITICAL: Strictly avoid Aspirin, Mefenamic acid and NSAIDs (High bleeding risk).",
        isAiSuggested: true,
      },
      {
        id: "med-2",
        name: "Oral Rehydration Electrolyte Solution",
        dosage: "2.5 - 3 Litres Daily",
        frequency: "Continuous intake throughout the day",
        duration: "Active fever phase",
        instructions: "Tender coconut water, rice kanji, fruit juices and ORS. Monitor urine output.",
        isAiSuggested: true,
      }
    ];
  }

  // General fallback
  return [
    {
      id: "med-1",
      name: "Paracetamol",
      dosage: "500 mg Tablet",
      frequency: "1 Tablet TDS PRN",
      duration: "3 Days",
      instructions: "Take after food for fever or pain relief.",
      isAiSuggested: true,
    },
    {
      id: "med-2",
      name: "Oral Hydration / Supportive Care",
      dosage: "Adequate Fluids",
      frequency: "Daily",
      duration: "3 - 5 Days",
      instructions: "Rest and oral hydration.",
      isAiSuggested: true,
    }
  ];
}

// Helper to detect if a prescribed medicine conflicts with known patient allergies
function getPrescriptionAllergyWarning(medName: string, patientAllergies: string[]): string | null {
  if (!medName || !patientAllergies || patientAllergies.length === 0) return null;
  const nameLower = medName.toLowerCase();
  
  const synonyms: Record<string, string[]> = {
    paracetamol: ["paracetamol", "acetaminophen", "panadol", "tylenol", "calpol"],
    aspirin: ["aspirin", "acetylsalicylic", "nsaid", "nsaids", "disprin"],
    ibuprofen: ["ibuprofen", "nsaid", "nsaids", "brufen", "advil"],
    nsaid: ["aspirin", "ibuprofen", "diclofenac", "naproxen", "nsaid", "nsaids"],
    penicillin: ["penicillin", "amoxicillin", "ampicillin", "augmentin"],
    sulfa: ["sulfa", "sulfonamide", "bactrim", "cotrimoxazole"],
    oseltamivir: ["oseltamivir", "tamiflu"],
    acyclovir: ["acyclovir", "aciclovir", "zovirax"]
  };

  for (const allergy of patientAllergies) {
    if (!allergy) continue;
    const alLower = String(allergy).toLowerCase();
    const words = alLower.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(w => w.length > 2);
    for (const w of words) {
      if (nameLower.includes(w)) {
        return `Matches patient allergy: "${allergy}"`;
      }
      if (synonyms[w]) {
        for (const syn of synonyms[w]) {
          if (nameLower.includes(syn)) {
            return `Potential cross-reaction with patient allergy: "${allergy}" (${syn})`;
          }
        }
      }
    }
  }
  return null;
}

export function usePrescriptionPadState(rx: ReturnType<typeof usePrescription>) {
  const visit = rx.activeConsultation;
  const patient = rx.activePatient;
  const analysis = rx.activeAnalysis;

  // Storage key for persistence
  const storageKey = visit ? `meditrack_rx_pad_${visit.id}` : null;

  // Active diagnosis context
  const activeDiagnosis = useMemo(() => {
    if (rx.diagnosisContext.trim()) return rx.diagnosisContext.trim();
    if (rx.diagnoses[0]?.condition_label) return rx.diagnoses[0].condition_label;
    const raw = analysis?.payload as Record<string, unknown> | undefined;
    const member1 = raw?.member1 as Record<string, unknown> | undefined;
    const body = (member1?.raw_output as Record<string, unknown> | undefined)?.payload as Record<string, unknown> | undefined;
    const diag = body?.primary_diagnosis as Record<string, unknown> | undefined;
    if (typeof diag?.condition_label === "string") return diag.condition_label;
    if (typeof diag?.condition_code === "string") return conditionLabel(diag.condition_code);
    return "Clinical Consultation";
  }, [rx.diagnosisContext, rx.diagnoses, analysis]);

  // Extract red flags if present in analysis
  const redFlags = useMemo(() => {
    const raw = analysis?.payload as Record<string, unknown> | undefined;
    const sev = raw?.severity as Record<string, unknown> | undefined;
    if (Array.isArray(sev?.red_flags)) return (sev.red_flags as string[]).filter(Boolean);
    return [];
  }, [analysis]);

  // Doctor session details
  const [doctorInfo, setDoctorInfo] = useState({
    name: "Dr. Clinician, MBBS",
    qualifications: "Consultant Physician · MBBS (Colombo), MD",
    hospital: "MediTrack General Hospital",
    regNo: "SLMC / 48291"
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("meditrack_user");
      if (stored) {
        const u = JSON.parse(stored);
        setDoctorInfo({
          name: u.display_name || u.username ? `Dr. ${u.display_name || u.username}` : "Dr. Clinician, MBBS",
          qualifications: u.degrees || "Consultant Physician · MBBS, MD",
          hospital: u.working_hospital || "MediTrack Healthcare Centre",
          regNo: u.license_id || "SLMC / 48291"
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Prescription state
  const [medicines, setMedicines] = useState<PrescribedMedicine[]>([]);
  const [advice, setAdvice] = useState<string>("Adequate rest, drink 2-3L fluids daily. Return for urgent evaluation if warning signs appear.");
  const [status, setStatus] = useState<"draft" | "approved" | "rejected">("draft");
  const [approvedAt, setApprovedAt] = useState<string | null>(null);

  // Initialize or load from local storage
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: PrescriptionRecord = JSON.parse(saved);
        setMedicines(parsed.medicines || []);
        setAdvice(parsed.advice || "");
        setStatus(parsed.status || "draft");
        setApprovedAt(parsed.approvedAt || null);
        return;
      }
    } catch {
      // ignore
    }

    // Default suggestions from condition
    const suggestions = getConditionSuggestedMedicines(activeDiagnosis);
    setMedicines(suggestions);
    setStatus("draft");
    setApprovedAt(null);
  }, [storageKey, activeDiagnosis]);

  // Save changes to storage
  const persist = useCallback((
    newMedicines: PrescribedMedicine[], 
    newAdvice: string, 
    newStatus: "draft" | "approved" | "rejected",
    approvedTime?: string | null
  ) => {
    if (!storageKey || !visit || !patient) return;
    const record: PrescriptionRecord = {
      consultationId: visit.id,
      patientId: patient.id,
      patientName: patient.display_name || `Patient #${patient.id}`,
      patientAge: patient.age_years != null ? `${patient.age_years} Years` : "Adult",
      doctorName: doctorInfo.name,
      hospital: doctorInfo.hospital,
      diagnosis: activeDiagnosis,
      date: new Date().toLocaleDateString(undefined, { dateStyle: "medium" }),
      medicines: newMedicines,
      advice: newAdvice,
      redFlags,
      status: newStatus,
      approvedAt: approvedTime ?? undefined
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch {
      // ignore
    }
  }, [storageKey, visit, patient, doctorInfo, activeDiagnosis, redFlags]);

  // Edit medicine field
  const updateMedicine = (id: string, field: keyof PrescribedMedicine, val: string) => {
    if (status === "approved") return;
    const updated = medicines.map((m) => m.id === id ? { ...m, [field]: val } : m);
    setMedicines(updated);
    persist(updated, advice, status);
  };

  // Add new blank medicine
  const addMedicine = () => {
    if (status === "approved") return;
    const newMed: PrescribedMedicine = {
      id: "med-" + Date.now(),
      name: "",
      dosage: "",
      frequency: "TDS (3 times daily)",
      duration: "5 Days",
      instructions: "Take after meals with water.",
      isAiSuggested: false
    };
    const updated = [...medicines, newMed];
    setMedicines(updated);
    persist(updated, advice, status);
  };

  // Remove medicine
  const removeMedicine = (id: string) => {
    if (status === "approved") return;
    const updated = medicines.filter((m) => m.id !== id);
    setMedicines(updated);
    persist(updated, advice, status);
  };

  // Apply all AI ranked medicines
  const handleApplyAllRanked = (rankedMeds: RankedMedicine[]) => {
    if (status === "approved") return;
    const newPrescribed: PrescribedMedicine[] = rankedMeds.map((m, idx) => ({
      id: "med-" + Date.now() + "-" + idx,
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      isAiSuggested: true
    }));
    setMedicines(newPrescribed);
    persist(newPrescribed, advice, status);
  };

  // Add one AI ranked medicine
  const handleAddOneRanked = (med: RankedMedicine) => {
    if (status === "approved") return;
    const newMed: PrescribedMedicine = {
      id: "med-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      duration: med.duration,
      instructions: med.instructions,
      isAiSuggested: true
    };
    const updated = [...medicines, newMed];
    setMedicines(updated);
    persist(updated, advice, status);
  };

  // Approve action
  const handleApprove = () => {
    const now = new Date().toISOString();
    setStatus("approved");
    setApprovedAt(now);
    persist(medicines, advice, "approved", now);
  };

  // Reject / Edit again action
  const handleRejectOrUnlock = () => {
    setStatus("draft");
    setApprovedAt(null);
    persist(medicines, advice, "draft", null);
  };

  return {
    visit,
    patient,
    analysis,
    activeDiagnosis,
    redFlags,
    doctorInfo,
    setDoctorInfo,
    medicines,
    setMedicines,
    advice,
    setAdvice,
    status,
    setStatus,
    approvedAt,
    setApprovedAt,
    persist,
    updateMedicine,
    addMedicine,
    removeMedicine,
    handleApplyAllRanked,
    handleAddOneRanked,
    handleApprove,
    handleRejectOrUnlock
  };
}

export function DoctorPrescriptionPad({ 
  rx, 
  padState: externalPadState 
}: { 
  rx: ReturnType<typeof usePrescription>; 
  padState?: ReturnType<typeof usePrescriptionPadState>;
}) {
  const internalPadState = usePrescriptionPadState(rx);
  const pad = externalPadState || internalPadState;

  const {
    visit,
    patient,
    activeDiagnosis,
    redFlags,
    doctorInfo,
    medicines,
    setMedicines,
    advice,
    setAdvice,
    status,
    approvedAt,
    persist,
    updateMedicine,
    addMedicine,
    removeMedicine,
    handleApprove,
    handleRejectOrUnlock
  } = pad;

  // Print prescription
  const handlePrint = () => {
    window.print();
  };

  if (!visit || !patient) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
        <Stethoscope className="mx-auto mb-2 h-6 w-6 text-slate-400" />
        Select an assigned patient and consultation above to open the Doctor&apos;s Prescription Pad.
      </div>
    );
  }

  return (
    <div className="relative mt-8 space-y-6">
      {/* ── Top Bar with Actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 p-4 text-white shadow-lg print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
            <FileText className="h-5 w-5 text-purple-200" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              Clinical Prescription Pad (Rx)
              {status === "approved" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> Approved & Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                  <Clock className="h-3 w-3" /> Clinician Draft
                </span>
              )}
            </h2>
            <p className="text-[11px] text-purple-200">
              Interactive prescription sheet generated from voice-analysis. Freely add, edit or remove medications before approving.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {status === "approved" ? (
            <>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-purple-900 shadow transition hover:bg-purple-50 active:scale-95"
              >
                <Printer className="h-3.5 w-3.5" /> Print Prescription
              </button>
              <button
                type="button"
                onClick={handleRejectOrUnlock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Edit / Revise
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={medicines.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-emerald-600 disabled:opacity-50 active:scale-95"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve Prescription
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Reset medications to AI default suggestions?")) {
                    const fresh = getConditionSuggestedMedicines(activeDiagnosis);
                    setMedicines(fresh);
                    persist(fresh, advice, "draft");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-purple-200 hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset AI
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Realistic Prescription Sheet (Printed / Visual) ── */}
      <div 
        id="doctor-prescription-sheet" 
        className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-xl print:border-none print:shadow-none print:p-0 print:m-0"
      >
        {/* Prescription Letterhead Header */}
        <div className="flex flex-col justify-between border-b-2 border-purple-900/20 pb-6 sm:flex-row sm:items-start gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-700 text-white font-extrabold text-sm shadow">
                M
              </span>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                MediTrack Healthcare
              </h1>
            </div>
            <p className="text-xs font-bold text-purple-900">{doctorInfo.name}</p>
            <p className="text-[11px] text-slate-500">{doctorInfo.qualifications}</p>
            <p className="text-[11px] text-slate-500">{doctorInfo.hospital}</p>
            <p className="text-[10px] font-semibold text-slate-400">Reg No: {doctorInfo.regNo}</p>
          </div>

          <div className="sm:text-right space-y-1 text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1 font-semibold text-purple-900 border border-purple-100">
              <Calendar className="h-3.5 w-3.5 text-purple-600" />
              <span>Date: {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</span>
            </div>
            <p className="text-[10px] text-slate-400">Encounter ID: {visit.id.substring(0, 18)}…</p>
            {status === "approved" && (
              <p className="text-[10px] font-bold text-emerald-700">Official Clinical Approval Confirmed</p>
            )}
          </div>
        </div>

        {/* Patient Information Banner */}
        <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient Name</span>
              <span className="text-sm font-bold text-slate-800">{patient.display_name || `Patient #${patient.id}`}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Age / Gender</span>
              <span className="font-semibold text-slate-800">{patient.age_years != null ? `${patient.age_years} Yrs` : "Adult"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Clinical Diagnosis</span>
              <span className="font-bold text-purple-900">{activeDiagnosis}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Allergy Status</span>
              <span className="font-medium text-slate-700">
                {rx.activePatientContext?.allergy_status === "confirmed" && rx.activePatientContext.allergies.length > 0
                  ? `Known: ${rx.activePatientContext.allergies.join(", ")}`
                  : "No Known Drug Allergies"}
              </span>
            </div>
          </div>
        </div>

        {/* Clinical Advisory / Red Flag Notice (Non-blocking warning) */}
        {redFlags.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-4 text-xs text-amber-900 print:border-amber-400">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">Clinical Advisory & Precautionary Notes (From Voice Analysis):</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900">
                {redFlags.map((flag, idx) => (
                  <li key={idx} className="font-medium">{flag}</li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-800 italic">
                * Note: Doctor review applied. Prescription is authorized under direct clinical supervision.
              </p>
            </div>
          </div>
        )}

        {/* ── Rx Prescription Body ── */}
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-3xl font-serif font-black text-purple-900 tracking-tight">℞</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Prescribed Medications
            </span>
          </div>

          {/* Medicines List */}
          <div className="space-y-4">
            {medicines.map((med, index) => (
              <div 
                key={med.id} 
                className="group relative rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-purple-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-800">
                      {index + 1}
                    </span>
                    {status === "approved" ? (
                      <span className="text-sm font-bold text-slate-900">{med.name}</span>
                    ) : (
                      <input
                        type="text"
                        value={med.name}
                        placeholder="Medicine name (e.g. Paracetamol)"
                        onChange={(e) => updateMedicine(med.id, "name", e.target.value)}
                        className="text-sm font-bold text-slate-900 placeholder-slate-400 border-b border-transparent focus:border-purple-500 focus:outline-none w-64 sm:w-80"
                      />
                    )}
                    {med.isAiSuggested && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700 border border-purple-100 print:hidden">
                        <Sparkles className="h-2.5 w-2.5" /> AI Suggested
                      </span>
                    )}
                  </div>

                  {status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => removeMedicine(med.id)}
                      title="Remove medicine"
                      className="text-slate-300 transition hover:text-rose-600 print:hidden"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Inline Allergy Conflict Warning if clinician adds or types a medication matching allergies */}
                {(() => {
                  const warn = getPrescriptionAllergyWarning(med.name, rx.activePatientContext?.allergies || []);
                  if (!warn) return null;
                  return (
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-800 print:hidden animate-fadeIn">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-600" />
                      <span><strong>Safety Warning:</strong> {warn}. Please evaluate clinical tolerance or select an alternative.</span>
                    </div>
                  );
                })()}

                {/* Details Grid */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400">Dosage / Strength</label>
                    {status === "approved" ? (
                      <span className="font-medium text-slate-700">{med.dosage}</span>
                    ) : (
                      <input
                        type="text"
                        value={med.dosage}
                        placeholder="e.g. 500 mg Tablet"
                        onChange={(e) => updateMedicine(med.id, "dosage", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-slate-700 focus:border-purple-500 focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400">Frequency / Regimen</label>
                    {status === "approved" ? (
                      <span className="font-medium text-slate-700">{med.frequency}</span>
                    ) : (
                      <input
                        type="text"
                        value={med.frequency}
                        placeholder="e.g. 1 Tablet TDS"
                        onChange={(e) => updateMedicine(med.id, "frequency", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-slate-700 focus:border-purple-500 focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400">Duration</label>
                    {status === "approved" ? (
                      <span className="font-medium text-slate-700">{med.duration}</span>
                    ) : (
                      <input
                        type="text"
                        value={med.duration}
                        placeholder="e.g. 5 Days"
                        onChange={(e) => updateMedicine(med.id, "duration", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-slate-700 focus:border-purple-500 focus:outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* Instructions */}
                <div className="mt-2.5">
                  <label className="block text-[10px] font-semibold text-slate-400">Special Instructions / Directions</label>
                  {status === "approved" ? (
                    <p className="text-xs text-slate-600 italic">{med.instructions || "As directed."}</p>
                  ) : (
                    <input
                      type="text"
                      value={med.instructions}
                      placeholder="e.g. Take after food with plenty of water."
                      onChange={(e) => updateMedicine(med.id, "instructions", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-slate-700 focus:border-purple-500 focus:outline-none"
                    />
                  )}
                </div>
              </div>
            ))}

            {medicines.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                No medications prescribed yet. Click &quot;Add Medicine&quot; below to add items.
              </div>
            )}
          </div>

          {/* Add Medicine Button */}
          {status !== "approved" && (
            <div className="print:hidden">
              <button
                type="button"
                onClick={addMedicine}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 px-4 py-2 text-xs font-bold text-purple-800 transition hover:bg-purple-100 hover:border-purple-400 active:scale-95"
              >
                <Plus className="h-4 w-4" /> Add Another Medication
              </button>
            </div>
          )}

          {/* Clinician Advice & Care Notes */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">General Patient Advice & Follow-up Instructions:</label>
            {status === "approved" ? (
              <p className="text-xs text-slate-800 leading-relaxed">{advice}</p>
            ) : (
              <textarea
                value={advice}
                rows={2}
                onChange={(e) => {
                  setAdvice(e.target.value);
                  persist(medicines, e.target.value, status);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-purple-500 focus:outline-none"
                placeholder="Enter patient lifestyle, hydration and follow-up advice..."
              />
            )}
          </div>
        </div>

        {/* ── Prescription Footer with Doctor Signature Stamp ── */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between border-t-2 border-slate-200 pt-6 gap-6">
          <div className="text-[10px] text-slate-400 space-y-0.5">
            <p>Generated via MediTrack Clinical Decision Support &amp; Voice Intelligence</p>
            <p>Authorized Doctor Prescription · Valid for outpatient dispensing</p>
            {approvedAt && <p className="font-semibold text-emerald-700">Digitally Verified: {new Date(approvedAt).toLocaleString()}</p>}
          </div>

          {/* Doctor Official Stamp / Signature Area */}
          <div className="text-center sm:text-right">
            <div className="inline-block rounded-xl border-2 border-purple-800/80 p-3 text-purple-900 bg-purple-50/30 -rotate-1 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-purple-800">Verified &amp; Prescribed</p>
              <p className="mt-1 font-serif text-sm font-bold">{doctorInfo.name}</p>
              <p className="text-[10px] font-medium text-slate-600">{doctorInfo.qualifications}</p>
              <p className="text-[9px] font-semibold text-purple-700">{doctorInfo.regNo}</p>
            </div>
            <p className="mt-1 text-[9px] text-slate-400">Doctor Signature &amp; Stamp</p>
          </div>
        </div>
      </div>

      {/* ── Print Specific Styles ── */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #doctor-prescription-sheet, #doctor-prescription-sheet * {
            visibility: visible !important;
          }
          #doctor-prescription-sheet {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            border: none !important;
            box-shadow: none !important;
          }
          header, nav, aside, button, .print\\:hidden {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
        }
      `}</style>
    </div>
  );
}
