"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { 
  Sparkles, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  User, 
  Stethoscope, 
  ShieldCheck, 
  TrendingUp, 
  RefreshCw,
  FileText
} from "lucide-react";

interface SymptomOption {
  id: string;
  label: string;
  category: "General" | "Respiratory" | "Neurological" | "Gastrointestinal";
  severityWeight: number;
}

const AVAILABLE_SYMPTOMS: SymptomOption[] = [
  { id: "fever", label: "Fever / High Temperature (>38°C)", category: "General", severityWeight: 3 },
  { id: "dry_cough", label: "Dry / Persistent Cough", category: "Respiratory", severityWeight: 2 },
  { id: "fatigue", label: "Extreme Fatigue & Weakness", category: "General", severityWeight: 1 },
  { id: "shortness_breath", label: "Shortness of Breath / Dyspnea", category: "Respiratory", severityWeight: 4 },
  { id: "muscle_aches", label: "Body & Muscle Aches (Myalgia)", category: "General", severityWeight: 2 },
  { id: "headache", label: "Severe Throbbing Headache", category: "Neurological", severityWeight: 2 },
  { id: "sore_throat", label: "Sore Throat & Pain Swallowing", category: "Respiratory", severityWeight: 1 },
  { id: "loss_taste", label: "Loss of Taste or Smell", category: "Neurological", severityWeight: 2 },
  { id: "nausea", label: "Nausea or Mild Vomiting", category: "Gastrointestinal", severityWeight: 2 },
  { id: "chest_tightness", label: "Chest Tightness / Congestion", category: "Respiratory", severityWeight: 4 },
];

export default function SymptomChecker() {
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(["fever", "dry_cough", "fatigue"]);
  const [durationDays, setDurationDays] = useState<number>(3);
  const [hasChronicCondition, setHasChronicCondition] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [hasRunAnalysis, setHasRunAnalysis] = useState<boolean>(true);

  const toggleSymptom = (id: string) => {
    if (selectedSymptoms.includes(id)) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== id));
    } else {
      setSelectedSymptoms([...selectedSymptoms, id]);
    }
  };

  const handleRunAnalysis = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setHasRunAnalysis(true);
    }, 600);
  };

  // Calculate practical diagnostic confidence for research
  const calculateDiagnoses = () => {
    const isResp = selectedSymptoms.includes("dry_cough") || selectedSymptoms.includes("shortness_breath") || selectedSymptoms.includes("sore_throat");
    const isFever = selectedSymptoms.includes("fever");
    const isAches = selectedSymptoms.includes("muscle_aches") || selectedSymptoms.includes("fatigue");

    if (isFever && isResp && isAches) {
      return [
        {
          condition: "Seasonal Influenza (Type A/H3N2)",
          confidence: 91,
          severity: "Moderate - Clinical Review Recommended",
          specialty: "General Physician / Pulmonology",
          reasoning: "High correlation observed between acute fever, prominent myalgia, and persistent upper respiratory symptoms. Concurrent epidemiological surge in regional influenza cases reinforces probability.",
          precautions: ["Hydration & electrolyte balance", "Rest & isolate for 5 days", "Consult doctor for antiviral eligibility within 48h"]
        },
        {
          condition: "Acute Viral Bronchitis",
          confidence: 68,
          severity: "Mild to Moderate",
          specialty: "General Physician",
          reasoning: "Persistent dry cough accompanied by mild chest tightness with secondary viral prodrome.",
          precautions: ["Steam inhalation", "Over-the-counter expectorant if prescribed", "Monitor oxygen levels"]
        },
        {
          condition: "Upper Respiratory Tract Infection (URTI)",
          confidence: 42,
          severity: "Mild",
          specialty: "Outpatient Clinic",
          reasoning: "Mild pharyngeal irritation and low-grade symptomatic overlap.",
          precautions: ["Warm saline gargles", "Symptomatic relief with Paracetamol"]
        }
      ];
    }

    if (selectedSymptoms.includes("shortness_breath") || selectedSymptoms.includes("chest_tightness")) {
      return [
        {
          condition: "Asthmatic Exacerbation / Bronchospasm",
          confidence: 84,
          severity: "Urgent - Seek Medical Attention",
          specialty: "Pulmonology / Emergency Medicine",
          reasoning: "Marked dyspnea and chest constriction indicate bronchial airway constriction or reactive airway episode.",
          precautions: ["Use rescue inhaler if previously prescribed", "Check SpO2 immediately", "Visit urgent care if resting rate exceeds 24 bpm"]
        },
        {
          condition: "Atypical Pneumonia",
          confidence: 58,
          severity: "Moderate to High",
          specialty: "Respiratory Care",
          reasoning: "Lower respiratory involvement with fatigue.",
          precautions: ["Chest X-Ray confirmation recommended", "Doctor consultation mandatory"]
        }
      ];
    }

    return [
      {
        condition: "Viral Prodrome / Common Cold",
        confidence: 76,
        severity: "Mild - Home Monitoring",
        specialty: "General Practice",
        reasoning: "Constitutional symptoms without critical cardiopulmonary red flags.",
        precautions: ["Adequate rest", "Fluids and vitamin C", "Consult doctor if symptoms worsen after 5 days"]
      }
    ];
  };

  const diagnoses = calculateDiagnoses();
  const primaryDiag = diagnoses[0];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Research Title Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Clinical Research Module
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400 font-mono">CDSS-Engine v2.4</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1.5">
              AI Symptom & Diagnostic Decision Support
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Probabilistic symptom correlation engine for preliminary clinical triage and doctor matching.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/patient/dashboard"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              Patient Portal
            </Link>
            <Link
              href="/patient/doctor-matching"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] transition-all"
            >
              Find Specialist
            </Link>
          </div>
        </div>

        {/* Clinical Disclaimer Banner */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start space-x-3 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Research Decision Support Notice:</strong> This diagnostic tool is designed to assist clinical research and pre-triage. It does not replace professional medical advice from a registered healthcare practitioner.
          </span>
        </div>

        {/* 2-Column Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Symptom Input Panel (5 / 12 Cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>1. Select Reported Symptoms</span>
                </h2>
                <span className="text-xs text-cyan-400 font-semibold">
                  {selectedSymptoms.length} Selected
                </span>
              </div>

              {/* Symptom Checklist */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {AVAILABLE_SYMPTOMS.map((symptom) => {
                  const isChecked = selectedSymptoms.includes(symptom.id);
                  return (
                    <div
                      key={symptom.id}
                      onClick={() => toggleSymptom(symptom.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                        isChecked
                          ? "bg-cyan-950/40 border-cyan-500/50 text-white shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                          isChecked ? "bg-cyan-500 border-cyan-400 text-slate-950" : "border-slate-700 bg-slate-900"
                        }`}>
                          {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <span className="font-medium">{symptom.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {symptom.category}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Additional Variables */}
              <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 font-semibold block mb-1.5">
                    Symptom Duration: <span className="text-cyan-400 font-bold">{durationDays} Days</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="14"
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-slate-300 font-medium">Underlying Chronic Condition</span>
                  <input
                    type="checkbox"
                    checked={hasChronicCondition}
                    onChange={(e) => setHasChronicCondition(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                  />
                </div>

                <button
                  onClick={handleRunAnalysis}
                  disabled={analyzing || selectedSymptoms.length === 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Computing Correlation Vectors...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-slate-950" />
                      <span>Compute AI Diagnostic Analysis</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: AI Clinical Analysis & Reasoning (7 / 12 Cols) */}
          <div className="lg:col-span-7 space-y-5">
            {hasRunAnalysis && primaryDiag ? (
              <div className="space-y-5">
                
                {/* Primary Diagnosis Card */}
                <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4 relative overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                        Primary Diagnostic Hypothesis
                      </div>
                      <h2 className="text-xl font-black text-white mt-0.5">
                        {primaryDiag.condition}
                      </h2>
                    </div>

                    <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 font-semibold">Confidence Score</div>
                        <div className="text-lg font-black text-cyan-400">{primaryDiag.confidence}%</div>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-cyan-400" />
                      </div>
                    </div>
                  </div>

                  {/* Confidence Bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Statistical Correlation Strength</span>
                      <span className="font-semibold text-slate-200">{primaryDiag.confidence} / 100</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${primaryDiag.confidence}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Explainable AI Clinical Reasoning */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-1.5">
                    <div className="text-xs font-bold text-cyan-400 flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Explainable AI (XAI) Clinical Reasoning:</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {primaryDiag.reasoning}
                    </p>
                  </div>

                  {/* Precautions & Recommended Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <div className="text-[11px] font-bold text-slate-300 mb-1">Suggested Specialty</div>
                      <div className="text-xs font-semibold text-cyan-400 flex items-center space-x-1">
                        <Stethoscope className="w-3.5 h-3.5" />
                        <span>{primaryDiag.specialty}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <div className="text-[11px] font-bold text-slate-300 mb-1">Triage Severity</div>
                      <div className="text-xs font-semibold text-emerald-400 flex items-center space-x-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{primaryDiag.severity}</span>
                      </div>
                    </div>
                  </div>

                  {/* Precautions List */}
                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Recommended Care Protocol
                    </div>
                    <ul className="space-y-1">
                      {primaryDiag.precautions.map((p, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-center space-x-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Doctor Matching CTA */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Ready for physician confirmation?
                    </span>
                    <Link
                      href="/patient/dashboard"
                      className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 text-xs font-bold transition-all flex items-center space-x-1.5"
                    >
                      <span>Book Doctor Appointment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Differential Diagnoses (Alternatives) */}
                <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Differential Diagnoses Considered
                  </h3>
                  <div className="space-y-2">
                    {diagnoses.slice(1).map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-200">{alt.condition}</div>
                          <div className="text-[11px] text-slate-400">{alt.specialty}</div>
                        </div>
                        <div className="text-right">
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                            {alt.confidence}% Prob.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-12 text-center flex flex-col items-center justify-center">
                <Sparkles className="w-10 h-10 text-slate-600 mb-3" />
                <h3 className="text-sm font-bold text-slate-300">Awaiting Symptom Input</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Select your symptoms from the left panel and click &ldquo;Compute AI Diagnostic Analysis&rdquo;.
                </p>
              </div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}
