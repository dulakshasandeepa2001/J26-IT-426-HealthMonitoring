"use client";

import { useEffect, useState, useMemo } from "react";
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
  Globe2,
  Search,
  Filter,
  BarChart3,
  Flame,
  Building2,
  ShieldAlert,
  SlidersHorizontal,
  ChevronRight,
  Stethoscope
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
  province_id: string;
  province_name: string;
  province_si: string;
  population: number;
  cases: string | number;
  raw_cases: number;
  is_suppressed: boolean;
  rate_per_100k: number;
  cluster_status: string;
  badge_color: string;
}

interface ProvinceSummary {
  province_id: string;
  province_name: string;
  province_si: string;
  total_cases: number;
  population: number;
  rate_per_100k: number;
  percentage_of_national: number;
  risk_level: string;
  risk_label_si: string;
  badge_color: string;
  highest_district: string;
  districts: DistrictHotspot[];
}

interface NationalSummary {
  total_national_cases: number;
  high_activity_districts: number;
  total_districts: number;
  high_activity_provinces: number;
  total_provinces: number;
  latest_observed: number;
  latest_threshold: number;
  current_risk_band: string;
  is_outbreak_warning: boolean;
  evaluated_week: string;
  model_used: string;
}

export default function DiseaseIntelligencePage() {
  const router = useRouter();
  const [userSession, setUserSession] = useState<{ username: string; role: string } | null>(null);

  const [selectedCondition, setSelectedCondition] = useState<string>("influenza");
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [hotspots, setHotspots] = useState<DistrictHotspot[]>([]);
  const [provinces, setProvinces] = useState<ProvinceSummary[]>([]);
  const [summary, setSummary] = useState<NationalSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reseedLoading, setReseedLoading] = useState<boolean>(false);

  // Province and District search & filter state
  const [selectedProvinceFilter, setSelectedProvinceFilter] = useState<string>("ALL");
  const [searchDistrictQuery, setSearchDistrictQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"provinces" | "districts" | "trends">("provinces");

  useEffect(() => {
    const raw = localStorage.getItem("meditrack_user");
    if (raw) {
      try {
        setUserSession(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
    }
    loadSurveillanceData(selectedCondition);
  }, [selectedCondition]);

  const loadSurveillanceData = async (condition: string) => {
    try {
      setLoading(true);
      let res;
      try {
        res = await apiRequest(`/api/disease-intelligence/overview/?condition=${condition}`);
      } catch (e) {
        // Fallback to alias if needed
        res = await apiRequest(`/api/lab-reports/intelligence/?condition=${condition}`);
      }

      setTrendData(res.temporal_trends || null);
      setHotspots(res.hotspots || []);
      setProvinces(res.provinces || []);
      setSummary(res.summary || null);
    } catch (err: any) {
      console.error("Failed to load disease intelligence data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReseed = async () => {
    try {
      setReseedLoading(true);
      await apiRequest("/api/disease-intelligence/seed-demo/", {
        method: "POST",
        body: JSON.stringify({ reset: true }),
      });
      await loadSurveillanceData(selectedCondition);
    } catch (err: any) {
      // Fallback
      try {
        await apiRequest("/api/lab-reports/intelligence/seed/", { method: "POST" });
        await loadSurveillanceData(selectedCondition);
      } catch (e2: any) {
        alert(err.message || "Failed to seed surveillance data.");
      }
    } finally {
      setReseedLoading(false);
    }
  };

  // Filtered districts based on province selector and search
  const filteredDistricts = useMemo(() => {
    return hotspots.filter((item) => {
      const matchProv = selectedProvinceFilter === "ALL" || item.province_id === selectedProvinceFilter;
      const matchQuery =
        searchDistrictQuery.trim() === "" ||
        item.district.toLowerCase().includes(searchDistrictQuery.toLowerCase()) ||
        item.province_name.toLowerCase().includes(searchDistrictQuery.toLowerCase()) ||
        item.province_si.includes(searchDistrictQuery);
      return matchProv && matchQuery;
    });
  }, [hotspots, selectedProvinceFilter, searchDistrictQuery]);

  // Find max value in data points for bar chart scaling
  const maxChartValue = Math.max(
    ...(trendData?.data_points?.map((d) => Math.max(d.observed_cases, d.threshold)) || [50]),
    10
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href={
              userSession?.role === "admin"
                ? "/admin/dashboard"
                : userSession?.role === "patient"
                ? "/patient/dashboard"
                : "/doctor/dashboard"
            }
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="h-10 w-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
            <Activity className="w-5 h-5 stroke-[2.5]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-slate-900">MediTrack</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                Epidemic Radar
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              National Disease Intelligence & Regional Spatial Clustering
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReseed}
            disabled={reseedLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition disabled:opacity-50 shadow-xs cursor-pointer"
            title="Seed baseline and outbreak data for 25 districts and 9 provinces"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${reseedLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Provincial Data</span>
            <span className="sm:hidden">Refresh</span>
          </button>

          <Link
            href="/doctor/lab-review"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <Eye className="w-4 h-4" />
            <span>Lab Review</span>
          </Link>
        </div>
      </header>

      {/* 2. MAIN SURVEILLANCE DASHBOARD */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8 flex-1">
        
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 p-6 sm:p-8 text-white shadow-xl shadow-indigo-700/10">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 opacity-10 pointer-events-none">
            <Globe2 className="w-72 h-72" />
          </div>

          <div className="relative z-10 max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold text-white tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>Farrington Aberration Algorithm &middot; Sri Lanka 9 Provinces & 25 Districts</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              National Epidemiological Surveillance
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100 font-medium leading-relaxed">
              Real-time monitoring of communicable diseases across Sri Lankan health provinces and districts (ශ්‍රී ලංකාවේ පළාත් සහ දිස්ත්‍රික්ක අනුව රෝගීන් නිරීක්ෂණය). Evaluates weekly laboratory case counts against seasonal thresholds to detect early outbreak warnings.
            </p>
          </div>
        </div>

        {/* Condition Selector & Privacy Tag */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs">
            {[
              { id: "influenza", label: "Influenza (Pilot)", pilot: true, tag: "Respiratory" },
              { id: "chickenpox", label: "Chickenpox (Pilot)", pilot: true, tag: "Varicella" },
              { id: "dengue", label: "Dengue Profile", pilot: false, tag: "Vector-Borne Priority" },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCondition(c.id);
                  setSelectedProvinceFilter("ALL");
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  selectedCondition === c.id
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <span>{c.label}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono ${
                  selectedCondition === c.id ? "bg-indigo-700 text-indigo-100" : "bg-slate-100 text-slate-500"
                }`}>
                  {c.tag}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-xs">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-semibold">PDPA Compliant: Small cells (&lt; 3 cases) suppressed</span>
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Risk Band */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500">Current Advisory Band</span>
            <div className="flex items-center justify-between my-2">
              <span
                className={`text-base sm:text-lg font-black px-3 py-1 rounded-xl uppercase tracking-wider ${
                  trendData?.current_risk_band === "OUTBREAK_ALERT" || trendData?.current_risk_band === "HIGH"
                    ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                    : trendData?.current_risk_band === "MODERATE"
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                }`}
              >
                {trendData?.current_risk_band || "LOW"}
              </span>
              <AlertTriangle
                className={`w-6 h-6 ${
                  trendData?.is_outbreak_warning ? "text-rose-500" : "text-emerald-500"
                }`}
              />
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Evaluated week: <strong className="text-slate-700">{trendData?.latest_week || "2026-W43"}</strong>
            </span>
          </div>

          {/* Card 2: Observed Cases vs Threshold */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500">Latest Observed / Limit</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-3xl font-black text-slate-900">
                {trendData?.latest_observed || 0}
              </span>
              <span className="text-xs font-bold text-slate-400">
                / {trendData?.latest_threshold || 0} limit
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Farrington upper: Mean + 1.96 &times; SD
            </span>
          </div>

          {/* Card 3: Total National Cases */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500">Total National Cases</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-3xl font-black text-indigo-600">
                {summary?.total_national_cases || hotspots.reduce((acc, h) => acc + h.raw_cases, 0)}
              </span>
              <span className="text-xs font-bold text-slate-400">active verified</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Across Sri Lanka 25 districts
            </span>
          </div>

          {/* Card 4: High-Activity Districts */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500">High-Activity Districts</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-3xl font-black text-amber-600">
                {hotspots.filter((h) => h.cluster_status.includes("HOTSPOT") || h.cluster_status.includes("ELEVATED")).length}
              </span>
              <span className="text-xs font-bold text-slate-400">of {hotspots.length || 25} mapped</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Attack rate &gt; 12.0 per 100,000 pop
            </span>
          </div>

          {/* Card 5: High-Risk Provinces */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500">High-Risk Provinces</span>
            <div className="flex items-baseline gap-2 my-2">
              <span className="text-3xl font-black text-purple-600">
                {provinces.filter((p) => p.risk_level.includes("CRITICAL") || p.risk_level.includes("HIGH")).length}
              </span>
              <span className="text-xs font-bold text-slate-400">of {provinces.length || 9} provinces</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Rate &gt; 12.0 per 100k
            </span>
          </div>
        </div>

        {/* SECTION 1: SRI LANKAN PROVINCIAL BREAKDOWN (පළාත් 9 අනුව වර්ගීකරණය) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-extrabold uppercase tracking-wider mb-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>Regional Geography Surveillance</span>
              </div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Sri Lanka Provincial Distribution (ශ්‍රී ලංකාවේ පළාත් 9 අනුව රෝගීන්)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Aggregated patient incidence categorized by Sri Lanka&apos;s 9 provinces. Click any province card to filter the districts below.
              </p>
            </div>

            {/* Quick Filter Pill */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setSelectedProvinceFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  selectedProvinceFilter === "ALL"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Provinces (සියලු පළාත්)
              </button>
            </div>
          </div>

          {/* 9 Province Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {provinces.map((prov) => {
              const isSelected = selectedProvinceFilter === prov.province_id;
              return (
                <div
                  key={prov.province_id}
                  onClick={() => setSelectedProvinceFilter(isSelected ? "ALL" : prov.province_id)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/40 shadow-md ring-2 ring-indigo-500/20"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 shadow-xs"
                  }`}
                >
                  {/* Top: Name & Risk Badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-black text-sm text-slate-900 group-hover:text-indigo-600 transition flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>{prov.province_name}</span>
                      </h3>
                      <span className="text-xs text-slate-500 font-semibold">{prov.province_si}</span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                        prov.risk_level === "CRITICAL_HOTSPOT"
                          ? "bg-rose-100 text-rose-800 border border-rose-300"
                          : prov.risk_level === "HIGH_RISK"
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : prov.risk_level === "MODERATE_RISK"
                          ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      }`}
                    >
                      {prov.risk_label_si || prov.risk_level.replace("_", " ")}
                    </span>
                  </div>

                  {/* Middle: Numbers & Percentage */}
                  <div className="grid grid-cols-3 gap-2 my-3 p-3 bg-white rounded-xl border border-slate-100 shadow-2xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Cases (රෝගීන්)</span>
                      <span className="text-lg font-black text-slate-900">{prov.total_cases}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Rate / 100k</span>
                      <span className="text-lg font-mono font-black text-indigo-600">{prov.rate_per_100k}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">National %</span>
                      <span className="text-lg font-black text-slate-700">{prov.percentage_of_national}%</span>
                    </div>
                  </div>

                  {/* Progress Bar of National Load */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Highest District: <strong className="text-slate-800">{prov.highest_district}</strong></span>
                      <span>{(prov.population / 1000000).toFixed(1)}M pop</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          prov.risk_level === "CRITICAL_HOTSPOT"
                            ? "bg-rose-500"
                            : prov.risk_level === "HIGH_RISK"
                            ? "bg-amber-500"
                            : prov.risk_level === "MODERATE_RISK"
                            ? "bg-indigo-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, prov.percentage_of_national))}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer hint */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                    <span>{isSelected ? "Showing this province's districts" : "Click to view districts"}</span>
                    <ChevronRight className={`w-3.5 h-3.5 transition ${isSelected ? "rotate-90" : "group-hover:translate-x-1"}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 2: TEMPORAL ABERRATION DETECTION CHART (12-WEEK FARRINGTON) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <span>12-Week Temporal Trend & Aberration Detection (කාලානුරූපී අවදානම් ප්‍රවණතාවය)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Compares observed weekly cases with seasonal-naive baseline and Farrington statistical threshold curve.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-md bg-indigo-600" />
                <span className="text-slate-700">Observed Cases</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-1 bg-amber-500 rounded" />
                <span className="text-slate-700">Farrington Limit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-1 bg-emerald-500 rounded" />
                <span className="text-slate-700">Baseline Mean</span>
              </div>
            </div>
          </div>

          {/* SVG Responsive Chart */}
          <div className="h-64 w-full pt-4">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                <span>Loading surveillance trends...</span>
              </div>
            ) : trendData?.data_points && trendData.data_points.length > 0 ? (
              <div className="h-full flex items-end gap-3 pb-6 border-b border-slate-200 relative">
                {trendData.data_points.map((pt) => {
                  const barHeightPercent = Math.min(100, Math.round((pt.observed_cases / maxChartValue) * 100));
                  const threshPercent = Math.min(100, Math.round((pt.threshold / maxChartValue) * 100));
                  const isAberration = pt.is_aberration;

                  return (
                    <div key={pt.week} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Threshold Tick Marker */}
                      <div
                        className="absolute w-full z-10 border-t-2 border-amber-500 border-dashed pointer-events-none"
                        style={{ bottom: `${threshPercent}%` }}
                      />

                      {/* Bar */}
                      <div
                        style={{ height: `${barHeightPercent}%` }}
                        className={`w-full rounded-t-xl transition-all duration-300 relative ${
                          isAberration
                            ? "bg-rose-500 shadow-md shadow-rose-500/30"
                            : "bg-indigo-600 hover:bg-indigo-500"
                        }`}
                      >
                        {isAberration && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-rose-600 text-white font-black text-[9px] rounded-full whitespace-nowrap shadow-sm">
                            Alert!
                          </div>
                        )}
                      </div>

                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-8 hidden group-hover:flex flex-col p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-[10px] text-white whitespace-nowrap z-20 shadow-xl pointer-events-none space-y-0.5">
                        <span className="font-bold text-white">{pt.week}</span>
                        <span className="text-indigo-300">Observed: {pt.observed_cases} cases</span>
                        <span className="text-amber-300">Threshold: {pt.threshold}</span>
                        <span className="text-emerald-300">Baseline: {pt.baseline}</span>
                        <span className="text-slate-300">Risk: {pt.risk_level}</span>
                      </div>

                      {/* Week Label */}
                      <span className="text-[10px] text-slate-500 mt-2 font-mono truncate w-full text-center font-bold">
                        {pt.week.split("-")[1] || pt.week}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No surveillance points recorded. Click &ldquo;Refresh Provincial Data&rdquo; above to generate demo points.
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: SPATIAL DISTRICT MATRIX ACROSS SRI LANKA */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                <span>Sri Lanka District Hotspot Risk & Cluster Analysis (දිස්ත්‍රික්ක 25 අනුව රෝගීන්)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Calculates attack rates per 100,000 population across districts. Small cells (&lt; 3 cases) are suppressed for privacy preservation (NFR1).
              </p>
            </div>

            {/* Search and Province Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search district / province..."
                  value={searchDistrictQuery}
                  onChange={(e) => setSearchDistrictQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 w-48 sm:w-56"
                />
              </div>

              <select
                value={selectedProvinceFilter}
                onChange={(e) => setSelectedProvinceFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="ALL">All Provinces (සියලු පළාත්)</option>
                {provinces.map((p) => (
                  <option key={p.province_id} value={p.province_id}>
                    {p.province_name} ({p.province_si})
                  </option>
                ))}
              </select>

              {selectedProvinceFilter !== "ALL" && (
                <button
                  onClick={() => setSelectedProvinceFilter("ALL")}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline px-1"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
            <div className="grid grid-cols-6 px-4 py-3 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="col-span-2">District & Province</span>
              <span>Population</span>
              <span>Reported Cases</span>
              <span>Attack Rate (per 100k)</span>
              <span className="text-right">Cluster Classification</span>
            </div>

            {filteredDistricts.length > 0 ? (
              filteredDistricts.map((h) => (
                <div
                  key={h.district}
                  className="grid grid-cols-6 px-4 py-3.5 items-center hover:bg-slate-50/60 transition text-xs border-b border-slate-100 last:border-0"
                >
                  <div className="col-span-2">
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{h.district}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium pl-5.5">
                      {h.province_name} &middot; <span className="font-normal">{h.province_si}</span>
                    </div>
                  </div>

                  <div className="text-slate-500 font-mono font-medium">
                    {h.population.toLocaleString()}
                  </div>

                  <div className="font-semibold text-slate-800">
                    {h.is_suppressed ? (
                      <span className="text-slate-400 italic flex items-center gap-1 font-medium">
                        <Lock className="w-3 h-3 text-slate-400" /> &lt; 3 (Suppressed)
                      </span>
                    ) : (
                      <span className="font-bold text-slate-900">{h.cases} cases</span>
                    )}
                  </div>

                  <div className="font-mono font-black text-slate-900">
                    {h.rate_per_100k}
                  </div>

                  <div className="text-right">
                    <span
                      className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-wider ${
                        h.cluster_status === "CRITICAL_HOTSPOT"
                          ? "bg-rose-100 text-rose-800 border border-rose-300"
                          : h.cluster_status === "ELEVATED_CLUSTER"
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : h.cluster_status === "MODERATE_ACTIVITY"
                          ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      }`}
                    >
                      {h.cluster_status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                No districts match the selected filter. Try selecting &ldquo;All Provinces&rdquo; or clearing search.
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: SURVEILLANCE & INTERVENTION PROTOCOL (ක්‍රියාවලිය පැහැදිලි කිරීම) */}
        <div className="bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 border border-indigo-100/80 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm">
                Epidemiological Surveillance Analysis & Action Protocol (නිරීක්ෂණ විශ්ලේෂණය සහ සෞඛ්‍ය ක්‍රියාමාර්ග)
              </h3>
              <p className="text-xs text-slate-500">
                How laboratory data feeds into automated early warning outbreak detection across Sri Lanka.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">1</span>
                <span>Automatic Case Aggregation</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                When a doctor approves a laboratory report or patient test (e.g. Dengue NS1, Flu PCR, FBC), verified de-identified metadata is automatically routed into provincial surveillance without exposing patient PII.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">2</span>
                <span>Farrington Algorithm Thresholding</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                The Farrington statistical model calculates rolling 4-week baselines and 1.96 standard deviation thresholds. If observed weekly cases exceed this limit, an automated outbreak alert is flagged.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">3</span>
                <span>Targeted MOH / PHI Intervention</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Health officers can drill down into specific provinces (e.g., Western or Southern) and districts with attack rates &gt; 12.0/100k to deploy vector control fogging, larvicide, and hospital triage resources.
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
