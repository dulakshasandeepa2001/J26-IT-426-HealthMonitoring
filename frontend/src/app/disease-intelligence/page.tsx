"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  Activity,
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  MapPin,
  RefreshCw,
  Sparkles,
  Info,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Eye,
  Lock,
} from "lucide-react";

interface TrendDataPoint {
  week: string;
  observed_cases: number;
  baseline: number;
  threshold: number;
  is_aberration: boolean;
  risk_level: string;
}

interface TrendResponse {
  condition_code: string;
  pilot_condition: boolean;
  evaluation_window_weeks: number;
  latest_week: string;
  latest_observed: number;
  latest_threshold: number;
  current_risk_band: string;
  is_outbreak_warning: boolean;
  model_used: string;
  data_points: TrendDataPoint[];
}

interface DistrictHotspot {
  district: string;
  population: number;
  cases: string | number;
  raw_cases: number;
  is_suppressed: boolean;
  rate_per_100k: number;
  cluster_status: string;
  badge_color: string;
}

export default function DiseaseIntelligencePage() {
  const router = useRouter();
  const [userSession, setUserSession] = useState<{ username: string; role: string } | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string>("influenza");
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [hotspots, setHotspots] = useState<DistrictHotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reseedLoading, setReseedLoading] = useState(false);

  const fetchData = async (condition: string) => {
    try {
      setLoading(true);
      const [trendRes, hotspotRes] = await Promise.all([
        apiRequest(`/api/disease-intelligence/trends/?condition=${condition}&weeks=12`),
        apiRequest(`/api/disease-intelligence/hotspots/?condition=${condition}`),
      ]);
      setTrendData(trendRes);
      setHotspots(hotspotRes.districts || []);
    } catch (err) {
      console.error("Failed to fetch disease intelligence:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("meditrack_user");
    if (!storedUser) {
      router.push("/login");
      return;
    }
    try {
      const parsed = JSON.parse(storedUser);
      setUserSession(parsed);
    } catch (e) {
      localStorage.removeItem("meditrack_user");
      router.push("/login");
      return;
    }

    fetchData(selectedCondition);
  }, [selectedCondition, router]);

  const handleReseed = async () => {
    try {
      setReseedLoading(true);
      await apiRequest("/api/disease-intelligence/seed-demo/", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await fetchData(selectedCondition);
      alert("Successfully seeded realistic 12-week surveillance data for Sri Lanka!");
    } catch (err: any) {
      alert(err.message || "Failed to seed demo data.");
    } finally {
      setReseedLoading(false);
    }
  };

  // Calculate highest count for SVG chart scaling
  const maxChartValue = Math.max(
    ...(trendData?.data_points?.map((p) => Math.max(p.observed_cases, p.threshold)) || [100]),
    10
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={
              userSession?.role === "admin"
                ? "/admin/dashboard"
                : userSession?.role === "patient"
                ? "/patient/dashboard"
                : "/doctor/dashboard"
            }
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                National Surveillance • Component 4
              </span>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                National Disease Intelligence & Outbreak Prediction
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Farrington-Style Aberration Detection • Temporal Trend Forecasting • Privacy-Aware District Hotspots
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReseed}
            disabled={reseedLoading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${reseedLoading ? "animate-spin" : ""}`} />
            Seed / Reset Surveillance Data
          </button>

          <Link
            href="/doctor/lab-review"
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition"
          >
            <Eye className="w-4 h-4" />
            Physician Lab Review
          </Link>
        </div>
      </header>

      {/* Condition Selector & Filter Tabs */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          {[
            { id: "influenza", label: "Influenza (Pilot)", pilot: true },
            { id: "chickenpox", label: "Chickenpox (Pilot)", pilot: true },
            { id: "dengue", label: "Dengue Profile", pilot: false },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCondition(c.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                selectedCondition === c.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {c.label}
              {c.pilot && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono">
                  SO1/SO2
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>PDPA Compliant: De-identified aggregate signals only</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Risk Band */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Current Advisory Band</span>
            <div className="flex items-center justify-between my-2">
              <span
                className={`text-xl font-extrabold px-3 py-1 rounded-xl uppercase tracking-wider ${
                  trendData?.current_risk_band === "OUTBREAK_ALERT" || trendData?.current_risk_band === "HIGH"
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
                    : trendData?.current_risk_band === "MODERATE"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {trendData?.current_risk_band || "LOW"}
              </span>
              <AlertTriangle
                className={`w-6 h-6 ${
                  trendData?.is_outbreak_warning ? "text-rose-400" : "text-emerald-400"
                }`}
              />
            </div>
            <span className="text-[11px] text-slate-500">
              Evaluated week: <strong className="text-slate-300">{trendData?.latest_week}</strong>
            </span>
          </div>

          {/* Card 2: Observed Cases vs Threshold */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Latest Observed / Threshold</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-3xl font-extrabold text-white">
                {trendData?.latest_observed || 0}
              </span>
              <span className="text-xs text-slate-400">
                / {trendData?.latest_threshold || 0} limit
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Farrington upper limit: 1.96 × standard deviation
            </span>
          </div>

          {/* Card 3: Active Hotspot Districts */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">High-Activity Districts</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-3xl font-extrabold text-indigo-400">
                {hotspots.filter((h) => h.cluster_status.includes("HOTSPOT") || h.cluster_status.includes("ELEVATED")).length}
              </span>
              <span className="text-xs text-slate-400">of {hotspots.length} mapped</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Attack rate &gt; 12.0 per 100,000 population
            </span>
          </div>

          {/* Card 4: Model Governance & Version */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Intelligence Algorithm</span>
            <div className="my-2">
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                {trendData?.model_used || "Farrington-v1"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Non-autonomous advisory output</div>
            </div>
            <span className="text-[11px] text-slate-500">Requires human public health sign-off</span>
          </div>
        </div>

        {/* Temporal Trends & Farrington Aberration Chart */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                12-Week Temporal Trend & Aberration Detection
              </h2>
              <p className="text-xs text-slate-400">
                Compares observed weekly cases with seasonal-naive baseline and Farrington statistical threshold curve.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-indigo-500" />
                <span className="text-slate-300">Observed Cases</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-1 bg-amber-400 rounded" />
                <span className="text-slate-300">Farrington Threshold</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-1 bg-emerald-400 rounded" />
                <span className="text-slate-300">Baseline Mean</span>
              </div>
            </div>
          </div>

          {/* SVG Responsive Chart */}
          <div className="h-64 w-full pt-4">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                Loading surveillance trends...
              </div>
            ) : trendData?.data_points && trendData.data_points.length > 0 ? (
              <div className="h-full flex items-end gap-3 pb-6 border-b border-slate-800 relative">
                {trendData.data_points.map((pt, idx) => {
                  const barHeightPercent = Math.min(100, Math.round((pt.observed_cases / maxChartValue) * 100));
                  const threshPercent = Math.min(100, Math.round((pt.threshold / maxChartValue) * 100));
                  const isAberration = pt.is_aberration;

                  return (
                    <div key={pt.week} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Threshold Tick Marker */}
                      <div
                        className="absolute w-full z-10 border-t-2 border-amber-400 border-dashed pointer-events-none"
                        style={{ bottom: `${threshPercent}%` }}
                      />

                      {/* Bar */}
                      <div
                        style={{ height: `${barHeightPercent}%` }}
                        className={`w-full rounded-t-lg transition-all duration-300 relative ${
                          isAberration
                            ? "bg-rose-500 shadow-lg shadow-rose-500/30"
                            : "bg-indigo-600 hover:bg-indigo-500"
                        }`}
                      >
                        {isAberration && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-rose-600 text-white font-bold text-[9px] rounded-full whitespace-nowrap shadow">
                            Alert!
                          </div>
                        )}
                      </div>

                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-8 hidden group-hover:flex flex-col p-2 bg-slate-900 border border-slate-700 rounded-lg text-[10px] whitespace-nowrap z-20 shadow-xl pointer-events-none">
                        <span className="font-bold text-white">{pt.week}</span>
                        <span className="text-indigo-400">Observed: {pt.observed_cases} cases</span>
                        <span className="text-amber-400">Threshold: {pt.threshold}</span>
                        <span className="text-emerald-400">Baseline: {pt.baseline}</span>
                        <span className="text-slate-400">Risk: {pt.risk_level}</span>
                      </div>

                      {/* Week Label */}
                      <span className="text-[10px] text-slate-500 mt-2 font-mono truncate w-full text-center">
                        {pt.week.split("-")[1] || pt.week}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No surveillance points recorded. Click "Seed Surveillance Data" above to generate demo points.
              </div>
            )}
          </div>
        </div>

        {/* Spatial Hotspot Matrix across Sri Lanka */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Sri Lanka District Hotspot Risk & Cluster Analysis
              </h2>
              <p className="text-xs text-slate-400">
                Calculates attack rates per 100,000 population across districts. Small cells (&lt; 3 cases) are suppressed for privacy preservation (NFR1).
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
              Privacy Mode: Small-Cell Suppression Active
            </span>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
            <div className="grid grid-cols-5 px-4 py-3 bg-slate-900 text-xs font-semibold text-slate-400">
              <span>District</span>
              <span>Population</span>
              <span>Reported Cases</span>
              <span>Attack Rate (per 100k)</span>
              <span className="text-right">Cluster Classification</span>
            </div>

            {hotspots.map((h) => (
              <div
                key={h.district}
                className="grid grid-cols-5 px-4 py-3 items-center hover:bg-slate-800/30 transition text-xs"
              >
                <div className="font-bold text-white flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {h.district}
                </div>

                <div className="text-slate-400 font-mono">
                  {h.population.toLocaleString()}
                </div>

                <div className="font-semibold text-slate-200">
                  {h.is_suppressed ? (
                    <span className="text-slate-500 italic flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-600" /> &lt; 3 (Suppressed)
                    </span>
                  ) : (
                    <span>{h.cases} cases</span>
                  )}
                </div>

                <div className="font-mono font-bold text-white">
                  {h.rate_per_100k}
                </div>

                <div className="text-right">
                  <span
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-full uppercase ${
                      h.cluster_status === "CRITICAL_HOTSPOT"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : h.cluster_status === "ELEVATED_CLUSTER"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : h.cluster_status === "MODERATE_ACTIVITY"
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {h.cluster_status.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
