"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { 
  Radio, 
  TrendingUp, 
  AlertTriangle, 
  MapPin, 
  Calendar, 
  ShieldAlert, 
  Activity, 
  BarChart3, 
  Users, 
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from "lucide-react";

interface OutbreakMetric {
  disease: string;
  activeCases: number;
  weeklyChange: number;
  riskLevel: "Critical" | "High" | "Moderate" | "Controlled";
  topDistrict: string;
  contagionIndex: string;
}

const OUTBREAK_METRICS: OutbreakMetric[] = [
  { disease: "Seasonal Influenza (H3N2/Flu A)", activeCases: 1420, weeklyChange: 18.4, riskLevel: "High", topDistrict: "Colombo & Gampaha", contagionIndex: "R0: 1.6" },
  { disease: "Dengue Fever (Serotype 2)", activeCases: 890, weeklyChange: 12.1, riskLevel: "High", topDistrict: "Western Province", contagionIndex: "R0: 1.4" },
  { disease: "Viral Bronchitis / URTI", activeCases: 2150, weeklyChange: -4.2, riskLevel: "Moderate", topDistrict: "Island-wide", contagionIndex: "R0: 1.1" },
  { disease: "Acute Gastroenteritis", activeCases: 410, weeklyChange: -15.8, riskLevel: "Controlled", topDistrict: "Southern Region", contagionIndex: "R0: 0.8" },
];

const WEEKLY_TREND_DATA = [
  { day: "Oct 1", influenza: 42, dengue: 28, bronchitis: 65 },
  { day: "Oct 3", influenza: 48, dengue: 31, bronchitis: 60 },
  { day: "Oct 5", influenza: 58, dengue: 35, bronchitis: 58 },
  { day: "Oct 7", influenza: 72, dengue: 44, bronchitis: 54 },
  { day: "Oct 9", influenza: 95, dengue: 52, bronchitis: 51 },
  { day: "Oct 11", influenza: 112, dengue: 60, bronchitis: 49 },
  { day: "Oct 14", influenza: 128, dengue: 68, bronchitis: 46 },
];

const REGIONAL_DISTRIBUTION = [
  { region: "Western Province (Colombo/Gampaha/Kalutara)", cases: 2140, pct: 45, alert: "High Surge" },
  { region: "Central Province (Kandy/Matale)", cases: 980, pct: 21, alert: "Moderate" },
  { region: "Southern Province (Galle/Matara)", cases: 720, pct: 15, alert: "Moderate" },
  { region: "North Western Province (Kurunegala)", cases: 540, pct: 11, alert: "Stable" },
  { region: "Other Provinces", cases: 380, pct: 8, alert: "Low" },
];

export default function OutbreakRadar() {
  const [selectedDisease, setSelectedDisease] = useState<string>("Seasonal Influenza (H3N2/Flu A)");

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "Critical":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "High":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "Moderate":
        return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
      default:
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Research Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1">
                <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Epidemiological Research & Surveillance</span>
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400 font-mono">Outbreak Radar v1.8</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1.5">
              Disease Trend & Regional Outbreak Surveillance
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Real-time regional contagion modeling, infection velocity, and early warning hospital surveillance.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/doctor/dashboard"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              Doctor Clinical Portal
            </Link>
          </div>
        </div>

        {/* 4 Disease Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {OUTBREAK_METRICS.map((item, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedDisease(item.disease)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedDisease === item.disease
                  ? "bg-slate-900 border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                  : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${getRiskBadge(item.riskLevel)}`}>
                  {item.riskLevel} Risk
                </span>
                <span className="text-[10px] font-mono text-slate-500">{item.contagionIndex}</span>
              </div>

              <h3 className="text-sm font-bold text-white leading-snug line-clamp-1 mb-2">
                {item.disease}
              </h3>

              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-white">
                  {item.activeCases.toLocaleString()}
                </div>
                <div className={`text-xs font-bold flex items-center ${
                  item.weeklyChange > 0 ? "text-rose-400" : "text-emerald-400"
                }`}>
                  {item.weeklyChange > 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                  )}
                  {Math.abs(item.weeklyChange)}%
                </div>
              </div>

              <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center space-x-1">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  <span>{item.topDistrict}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 2-Column Analytics Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left: 14-Day Epidemiological Trend Chart (7 / 12 Cols) */}
          <div className="lg:col-span-7 bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  <span>14-Day Surveillance Curve: {selectedDisease}</span>
                </h3>
                <p className="text-xs text-slate-400">Aggregated daily hospital admission reports</p>
              </div>
              <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                Surge Detected
              </span>
            </div>

            {/* Custom Bar Graph Visualization */}
            <div className="pt-4 pb-2">
              <div className="h-56 flex items-end justify-between gap-3 px-2 border-b border-slate-800 pb-2">
                {WEEKLY_TREND_DATA.map((d, i) => {
                  const maxCases = 140;
                  const heightPct = Math.min(100, Math.round((d.influenza / maxCases) * 100));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="text-[10px] font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.influenza}
                      </div>
                      <div className="w-full bg-slate-950 rounded-t-lg h-44 flex items-end p-0.5">
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-blue-500 group-hover:from-cyan-400 group-hover:to-blue-400 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                          style={{ height: `${heightPct}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Epidemiological Summary Note */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-cyan-400 flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>Clinical Triage Recommendation:</span>
              </div>
              <p className="leading-relaxed">
                Hospital OPD triage units are advised to cross-examine patients presenting with acute myalgia and respiratory distress for Influenza A. Outbreak index in Western Province exceeds baseline threshold by <strong>18.4%</strong>.
              </p>
            </div>
          </div>

          {/* Right: Regional Case Distribution & Alert Board (5 / 12 Cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <span>Regional Hotspot Distribution</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">Total: 4,760</span>
              </div>

              {/* Regional Progress Bars */}
              <div className="space-y-3.5">
                {REGIONAL_DISTRIBUTION.map((reg, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-200">{reg.region}</span>
                      <span className="font-bold text-cyan-400">{reg.cases} ({reg.pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          reg.pct > 30 ? "bg-rose-500" : reg.pct > 15 ? "bg-amber-500" : "bg-cyan-500"
                        }`}
                        style={{ width: `${reg.pct}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Clinical Protocol Actions */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Surveillance Actions
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button 
                    onClick={() => alert("Exported surveillance CSV data report for MOH research analysis.")}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 font-semibold text-center cursor-pointer"
                  >
                    Export CSV Report
                  </button>
                  <button 
                    onClick={() => alert("Alert broadcast dispatched to all linked hospital OPD units.")}
                    className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 font-semibold text-center cursor-pointer"
                  >
                    Broadcast Alert
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
