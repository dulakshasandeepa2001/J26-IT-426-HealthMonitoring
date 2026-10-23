"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import {
  FileText,
  ArrowLeft,
  Calendar,
  Building,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Download,
  Upload,
  RefreshCw,
  Search,
  ShieldCheck,
  Activity,
  User,
  Clock,
  Trash2,
  ExternalLink,
  Sparkles,
  FlaskConical,
  X,
  ChevronRight,
  ClipboardCheck,
  Eye,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Image as ImageIcon,
  FileCheck
} from "lucide-react";

interface LabObservation {
  observation_id: number;
  test_original_name: string;
  test_standard_code: string;
  standard_name: string;
  result_value: string;
  numeric_value: number | null;
  unit: string | null;
  reference_range_raw: string | null;
  abnormal_flag: string;
}

interface LabReport {
  report_id: number;
  report_title: string;
  lab_name: string;
  test_date: string;
  report_file?: string | null;
  file_url: string | null;
  file_name?: string | null;
  file_type?: string | null;
  image_quality_status?: string | null;
  overall_confidence?: number;
  ocr_raw_text?: string | null;
  approval_status: string;
  reviewed_by_name: string | null;
  physician_notes: string | null;
  reviewed_at: string | null;
  is_dispatched_to_patient?: boolean;
  lab_feedback?: string | null;
  lab_completed_at?: string | null;
  lab_status?: string | null;
  observations: LabObservation[];
}

export default function PatientLabReportsPage() {
  const [reports, setReports] = useState<LabReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<LabReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Delete state & modal
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteModalReport, setDeleteModalReport] = useState<LabReport | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadLabName, setUploadLabName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFilePreview, setUploadFilePreview] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Fullscreen image lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [showRawOcr, setShowRawOcr] = useState(false);

  // Active view tab in detail view
  const [detailTab, setDetailTab] = useState<"document" | "biomarkers">("document");

  // User session
  const [userSession, setUserSession] = useState<{ id?: number; username: string; role: string } | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      setUserSession(user);
    }
    fetchReports(user);
  }, []);

  // Generate live file preview when user selects a file for upload
  useEffect(() => {
    if (!uploadFile) {
      setUploadFilePreview(null);
      return;
    }
    if (uploadFile.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(uploadFile);
      setUploadFilePreview(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setUploadFilePreview(null);
    }
  }, [uploadFile]);

  const fetchReports = async (currentUser?: { id?: number; username: string; role: string } | null) => {
    try {
      setLoading(true);
      const user = currentUser !== undefined ? currentUser : userSession;
      
      let endpoint = "/api/lab-reports/?role=patient&include_pending=true";
      if (user?.id) {
        endpoint += `&patient_id=${user.id}`;
      }

      const data = await apiRequest(endpoint);
      let reportsList: LabReport[] = Array.isArray(data) ? data : (data?.reports || data?.results || []);

      // If user-specific query returned 0, fallback to general list so demo/all records are visible
      if (reportsList.length === 0 && user?.id) {
        const generalData = await apiRequest("/api/lab-reports/?include_pending=true");
        const fallbackList: LabReport[] = Array.isArray(generalData) ? generalData : (generalData?.reports || generalData?.results || []);
        if (fallbackList.length > 0) {
          reportsList = fallbackList;
        }
      }

      setReports(reportsList);
      if (reportsList.length > 0) {
        setSelectedReport((prev) => {
          if (!prev) return reportsList[0];
          const matched = reportsList.find((r) => r.report_id === prev.report_id);
          return matched || reportsList[0];
        });
      } else {
        setSelectedReport(null);
      }
    } catch (err: any) {
      console.error("Failed to load reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const getAbsoluteFileUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    return `${baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
  };

  const isPdf = (report: LabReport | null) => {
    if (!report?.file_url) return false;
    const cleanUrl = report.file_url.toLowerCase().split("?")[0];
    return report.file_type === "pdf" || cleanUrl.endsWith(".pdf") || cleanUrl.includes(".pdf");
  };

  const handlePatientUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !uploadLabName.trim()) {
      alert("Please enter report title and lab name.");
      return;
    }

    try {
      setUploadLoading(true);
      const formData = new FormData();
      formData.append("report_title", uploadTitle);
      formData.append("lab_name", uploadLabName);
      if (uploadFile) {
        formData.append("report_file", uploadFile);
      }

      if (userSession?.id) {
        formData.append("patient_id", String(userSession.id));
      }

      const res = await apiRequest("/api/lab-reports/upload/", {
        method: "POST",
        body: formData,
      });

      alert("Lab report uploaded successfully! It is now queued for your physician to review.");
      setShowUploadModal(false);
      setUploadTitle("");
      setUploadLabName("");
      setUploadFile(null);
      setUploadFilePreview(null);
      await fetchReports();
      if (res && res.report_id) {
        setSelectedReport(res);
      }
    } catch (err: any) {
      alert(err.message || "Failed to upload report.");
    } finally {
      setUploadLoading(false);
    }
  };

  const confirmDeleteReport = (report: LabReport, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteModalReport(report);
  };

  const handleDeleteReport = async () => {
    if (!deleteModalReport) return;
    const reportId = deleteModalReport.report_id;
    try {
      setDeletingId(reportId);
      await apiRequest(`/api/lab-reports/${reportId}/`, {
        method: "DELETE",
      });

      setReports((prev) => {
        const updated = prev.filter((r) => r.report_id !== reportId);
        if (selectedReport?.report_id === reportId) {
          setSelectedReport(updated.length > 0 ? updated[0] : null);
        }
        return updated;
      });
      setDeleteModalReport(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete lab report.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredReports = reports.filter(
    (r) =>
      r.report_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.lab_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalReportsCount = reports.length;
  const verifiedCount = reports.filter(
    (r) => r.approval_status === "approved" || r.is_dispatched_to_patient
  ).length;
  const pendingCount = totalReportsCount - verifiedCount;
  const totalObservationsCount = reports.reduce((acc, r) => acc + (r.observations?.length || 0), 0);

  const getStatusBadge = (flag: string) => {
    switch (flag) {
      case "CRITICAL_HIGH":
      case "CRITICAL_LOW":
        return (
          <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-rose-100 text-rose-800 border border-rose-300">
            Critical
          </span>
        );
      case "HIGH":
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            Elevated
          </span>
        );
      case "LOW":
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300">
            Low
          </span>
        );
      case "ABNORMAL":
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-300">
            Positive
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            Normal
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/patient/dashboard"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/25">
            <FlaskConical className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-slate-900">MediTrack</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                Patient Portal
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Verified Clinical Reports & AI Biomarker Insights
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchReports()}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition shadow-xs cursor-pointer"
            title="Refresh Reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-600" : ""}`} />
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 hover:shadow-teal-600/35 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Upload className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Upload Lab Report</span>
            <span className="sm:hidden">Upload</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN DASHBOARD CONTENT */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8 flex-1">
        
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 p-6 sm:p-8 text-white shadow-xl shadow-teal-700/10">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 opacity-10 pointer-events-none">
            <FlaskConical className="w-72 h-72" />
          </div>

          <div className="relative z-10 max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold text-white tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-teal-200" />
              <span>Diagnostic Pathology & Biomarker Radar</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              My Verified Laboratory Reports
            </h1>
            <p className="text-xs sm:text-sm text-teal-100 font-medium leading-relaxed">
              Access your full clinical laboratory records, OCR-extracted observations, standardized reference ranges, and direct physician assessment notes.
            </p>
          </div>
        </div>

        {/* Stat Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Total Reports</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{totalReportsCount}</h3>
              <p className="text-[11px] font-semibold text-teal-600 mt-0.5">Clinical Repository</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Doctor Verified</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">{verifiedCount}</h3>
              <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">Approved & Dispatched</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Under Review</p>
              <h3 className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</h3>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Awaiting Physician Gate</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Biomarkers Mapped</p>
              <h3 className="text-2xl font-black text-indigo-600 mt-1">{totalObservationsCount}</h3>
              <p className="text-[11px] font-semibold text-indigo-600 mt-0.5">LOINC Standardized</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* 3. TWO COLUMN WORKSPACE: LIST & DETAIL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column (5/12): Reports List */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search by test title or hospital laboratory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs font-medium bg-white border border-slate-200/80 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-xs transition"
              />
            </div>

            {/* List Container */}
            <div className="space-y-3">
              {loading ? (
                <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs text-slate-500 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-teal-600" />
                  <span>Loading clinical laboratory records...</span>
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="p-10 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs text-slate-500 text-xs space-y-2">
                  <FlaskConical className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700">No laboratory reports found</p>
                  <p className="text-[11px] text-slate-400">
                    Uploaded scans and reports will appear here once submitted.
                  </p>
                </div>
              ) : (
                filteredReports.map((r) => {
                  const isSelected = selectedReport?.report_id === r.report_id;
                  const isApproved = r.approval_status === "approved" || r.is_dispatched_to_patient;
                  const hasFile = Boolean(r.file_url);
                  const isPdfDoc = isPdf(r);
                  const fileAbsoluteUrl = getAbsoluteFileUrl(r.file_url);

                  return (
                    <div
                      key={r.report_id}
                      onClick={() => setSelectedReport(r)}
                      className={`w-full text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 shadow-xs ${
                        isSelected
                          ? "bg-teal-50/50 border-teal-500 ring-2 ring-teal-500/10 shadow-sm"
                          : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 leading-snug">
                          {r.report_title}
                        </span>
                        <div className="flex items-center gap-2">
                          {isApproved ? (
                            <span className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Verified
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Under Review
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => confirmDeleteReport(r, e)}
                            disabled={deletingId === r.report_id}
                            title="Delete this lab report"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            {deletingId === r.report_id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* File Attachment Status Indicator */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        {hasFile ? (
                          isPdfDoc ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                              <FileText className="w-3 h-3 text-rose-600" />
                              PDF Document Attached
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-bold">
                              <ImageIcon className="w-3 h-3 text-teal-600" />
                              Scanned Image Attached
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                            <ClipboardCheck className="w-3 h-3 text-slate-500" />
                            Digital Lab Telemetry
                          </span>
                        )}

                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-500 font-medium">{r.observations?.length || 0} Biomarkers</span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          {r.lab_name}
                        </span>
                        <span className="flex items-center gap-1.5 font-medium text-slate-400">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {r.test_date}
                        </span>
                      </div>

                      {r.lab_feedback || r.lab_completed_at ? (
                        <div className="text-[11px] text-teal-800 font-semibold border-t border-slate-100 pt-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <FlaskConical className="w-3.5 h-3.5 text-teal-600" />
                            <span>Lab Feedback Ready</span>
                          </span>
                          <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-md font-bold">
                            Completed
                          </span>
                        </div>
                      ) : r.approval_status === "approved" || r.is_dispatched_to_patient ? (
                        <div className="text-[11px] text-blue-800 font-semibold border-t border-slate-100 pt-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                            <span>Queued in Laboratory</span>
                          </span>
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold">
                            Doctor Approved
                          </span>
                        </div>
                      ) : r.reviewed_by_name ? (
                        <div className="text-[11px] text-indigo-700 font-semibold border-t border-slate-100 pt-2 flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Reviewed by Dr. {r.reviewed_by_name}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 font-medium border-t border-slate-100 pt-2 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Awaiting Physician Review</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column (7/12): Selected Report Detail */}
          <div className="lg:col-span-7">
            {selectedReport ? (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
                
                {/* Header Information */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-5 border-b border-slate-100 gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-black text-slate-900 tracking-tight">
                        {selectedReport.report_title}
                      </h2>
                      {selectedReport.approval_status === "approved" || selectedReport.is_dispatched_to_patient ? (
                        <span className="px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Doctor Approved
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Pending Physician Verification
                        </span>
                      )}

                      {selectedReport.lab_feedback || selectedReport.lab_completed_at ? (
                        <span className="px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          Lab Verified & Feedback Ready
                        </span>
                      ) : (selectedReport.approval_status === "approved" || selectedReport.is_dispatched_to_patient) && (
                        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                          <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                          Routed to Lab Queue
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-4">
                      <span>
                        Laboratory: <strong className="text-slate-800">{selectedReport.lab_name}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Date: <strong className="text-slate-800">{selectedReport.test_date}</strong>
                      </span>
                      {selectedReport.overall_confidence && selectedReport.overall_confidence > 0 && (
                        <>
                          <span>&bull;</span>
                          <span className="text-teal-700 font-semibold">
                            Extraction Confidence: {Math.round(selectedReport.overall_confidence * 100)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedReport.file_url && (
                      <a
                        href={getAbsoluteFileUrl(selectedReport.file_url) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        download={selectedReport.file_name || "lab_report"}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition shadow-xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => confirmDeleteReport(selectedReport)}
                      disabled={deletingId === selectedReport.report_id}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {deletingId === selectedReport.report_id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* 2-Column Clinical Review & Laboratory Verification Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Physician Clinical Review & Advice */}
                  {selectedReport.physician_notes ? (
                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-4 h-4 text-indigo-600" />
                          <span>Physician Clinical Advice</span>
                        </div>
                        {selectedReport.reviewed_by_name && (
                          <span className="text-[11px] text-indigo-700 font-semibold">
                            Dr. {selectedReport.reviewed_by_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed font-medium">
                        &ldquo;{selectedReport.physician_notes}&rdquo;
                      </p>
                      {selectedReport.reviewed_at && (
                        <div className="text-[10px] text-slate-500 pt-0.5">
                          Reviewed: {new Date(selectedReport.reviewed_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Physician Review Pending</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Awaiting doctor verification. Once verified, clinical notes and recommendations will appear here.
                      </p>
                    </div>
                  )}

                  {/* Card 2: Laboratory Findings & Technologist Remarks */}
                  {selectedReport.lab_feedback ? (
                    <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-teal-900">
                        <div className="flex items-center gap-1.5">
                          <FlaskConical className="w-4 h-4 text-teal-600" />
                          <span>Laboratory Feedback & Findings</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-extrabold uppercase">
                          Lab Verified
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed font-medium">
                        &ldquo;{selectedReport.lab_feedback}&rdquo;
                      </p>
                      <div className="text-[10px] text-teal-700 font-semibold flex items-center justify-between pt-0.5">
                        <span>{selectedReport.lab_name}</span>
                        {selectedReport.lab_completed_at && (
                          <span>{new Date(selectedReport.lab_completed_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  ) : selectedReport.approval_status === "approved" || selectedReport.is_dispatched_to_patient ? (
                    <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                          <span>Forwarded to Laboratory Queue</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold uppercase">
                          Processing
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-800 leading-relaxed">
                        Your doctor has approved this test. It has been routed directly into the diagnostic laboratory for verification without requiring you to visit. Laboratory technologist feedback will appear here once complete.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <FlaskConical className="w-4 h-4 text-slate-500" />
                        <span>Laboratory Verification</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Following physician approval, this investigation routes directly to the laboratory queue without in-person submission.
                      </p>
                    </div>
                  )}
                </div>

                {/* View Switcher Tabs: Original Document vs Clinical Biomarkers */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setDetailTab("document")}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                      detailTab === "document"
                        ? "bg-teal-600 text-white shadow-sm shadow-teal-600/20"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Uploaded Scanned Document</span>
                    {selectedReport.file_url && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailTab("biomarkers")}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                      detailTab === "biomarkers"
                        ? "bg-teal-600 text-white shadow-sm shadow-teal-600/20"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Clinical Biomarkers ({selectedReport.observations?.length || 0})</span>
                  </button>
                </div>

                {/* 1. DOCUMENT PREVIEW TAB */}
                {detailTab === "document" && (
                  <div className="space-y-4 animate-in fade-in">
                    {selectedReport.file_url ? (
                      isPdf(selectedReport) ? (
                        /* PDF DOCUMENT VIEWER */
                        <div className="border border-slate-200 rounded-3xl overflow-hidden bg-slate-50 p-6 space-y-4">
                          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
                                <FileText className="w-6 h-6" />
                              </div>
                              <div>
                                <h4 className="text-sm font-black text-slate-900">
                                  {selectedReport.file_name || "Diagnostic PDF Report"}
                                </h4>
                                <p className="text-[11px] text-slate-500">Official Clinical Laboratory Document</p>
                              </div>
                            </div>

                            <a
                              href={getAbsoluteFileUrl(selectedReport.file_url) || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open PDF Reader</span>
                            </a>
                          </div>

                          {/* Embedded PDF iframe */}
                          <div className="w-full h-[520px] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-inner">
                            <iframe
                              src={getAbsoluteFileUrl(selectedReport.file_url) || ""}
                              className="w-full h-full border-0"
                              title="Laboratory PDF Preview"
                            />
                          </div>
                        </div>
                      ) : (
                        /* HIGH RESOLUTION IMAGE VIEWER */
                        <div className="border border-slate-200 rounded-3xl overflow-hidden bg-slate-900/5 p-4 sm:p-5 space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                                <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                                Scanned High-Res Lab Sheet
                              </span>
                              {selectedReport.image_quality_status && (
                                <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-mono font-bold border border-slate-200 uppercase">
                                  Quality: {selectedReport.image_quality_status}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setZoomScale(1);
                                  setLightboxOpen(true);
                                }}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold shadow-xs transition cursor-pointer"
                                title="Expand Fullscreen"
                              >
                                <Maximize2 className="w-3.5 h-3.5 text-teal-600" />
                                <span>Fullscreen Zoom</span>
                              </button>

                              <a
                                href={getAbsoluteFileUrl(selectedReport.file_url) || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 transition shadow-xs cursor-pointer"
                                title="Open in new window"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>

                          {/* Image Display Card with Click to Zoom */}
                          <div
                            onClick={() => {
                              setZoomScale(1);
                              setLightboxOpen(true);
                            }}
                            className="relative group rounded-2xl overflow-hidden border border-slate-200/90 bg-white shadow-xs cursor-zoom-in flex items-center justify-center p-2 min-h-[360px] max-h-[580px]"
                          >
                            <img
                              src={getAbsoluteFileUrl(selectedReport.file_url) || ""}
                              alt={selectedReport.report_title}
                              className="max-h-[560px] w-auto max-w-full object-contain rounded-xl transition duration-300 group-hover:scale-[1.01]"
                            />
                            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition flex items-center justify-center pointer-events-none">
                              <span className="opacity-0 group-hover:opacity-100 transition duration-200 px-4 py-2 rounded-xl bg-slate-900/80 backdrop-blur-md text-white text-xs font-bold flex items-center gap-2 shadow-lg">
                                <ZoomIn className="w-4 h-4" />
                                Click to Inspect & Zoom Scan
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      /* NO PHYSICAL FILE ATTACHED (DIRECT TELEMETRY) */
                      <div className="border border-dashed border-slate-300 rounded-3xl p-8 text-center bg-slate-50/70 space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                          <ClipboardCheck className="w-6 h-6 text-teal-600" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">Direct Digital Laboratory Ingestion</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                          This record was ingested directly via clinical database telemetry. Extracted parameters and LOINC codes are available in the Biomarkers tab.
                        </p>
                      </div>
                    )}

                    {/* Raw OCR Text Expandable View */}
                    {selectedReport.ocr_raw_text && (
                      <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowRawOcr(!showRawOcr)}
                          className="w-full flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                            Extracted Machine OCR Transcript
                          </span>
                          <span className="text-[11px] text-teal-600 font-semibold">
                            {showRawOcr ? "Hide Transcript" : "View Transcript"}
                          </span>
                        </button>
                        {showRawOcr && (
                          <pre className="p-3 bg-white border border-slate-200 rounded-xl text-[11px] font-mono text-slate-800 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                            {selectedReport.ocr_raw_text}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. CLINICAL BIOMARKERS TAB */}
                {detailTab === "biomarkers" && (
                  <div className="space-y-5 animate-in fade-in">
                    {/* Physician Assessment Box */}
                    {selectedReport.physician_notes ? (
                      <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                          <Stethoscope className="w-4 h-4 text-indigo-600" />
                          <span>Physician Advice & Clinical Recommendations</span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed font-medium">
                          {selectedReport.physician_notes}
                        </p>
                        {selectedReport.reviewed_by_name && (
                          <div className="text-[11px] text-indigo-600 font-semibold pt-1">
                            &mdash; Dr. {selectedReport.reviewed_by_name} ({selectedReport.reviewed_at ? new Date(selectedReport.reviewed_at).toLocaleDateString() : "Verified"})
                          </div>
                        )}
                      </div>
                    ) : (
                      selectedReport.approval_status !== "approved" && (
                        <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span>Under Physician Review</span>
                          </div>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            This report was processed through OCR and standard biomarker extraction. Your doctor will verify the extracted metrics and dispatch their clinical notes to this portal.
                          </p>
                        </div>
                      )
                    )}

                    {/* Biomarkers Table */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Extracted Clinical Biomarkers
                        </h3>
                        <span className="text-[11px] font-bold text-slate-400">
                          {selectedReport.observations?.length || 0} Parameters
                        </span>
                      </div>

                      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
                        <div className="grid grid-cols-4 px-4 py-3 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Parameter</span>
                          <span>Result</span>
                          <span>Reference Range</span>
                          <span className="text-right">Evaluation</span>
                        </div>

                        {selectedReport.observations && selectedReport.observations.length > 0 ? (
                          selectedReport.observations.map((obs) => (
                            <div
                              key={obs.observation_id}
                              className="grid grid-cols-4 px-4 py-3.5 items-center hover:bg-slate-50/60 transition text-xs"
                            >
                              <div>
                                <div className="font-bold text-slate-900">{obs.test_original_name}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  LOINC: {obs.test_standard_code}
                                </div>
                              </div>

                              <div className="font-black text-slate-900 text-sm">
                                {obs.result_value} <span className="text-xs font-normal text-slate-500">{obs.unit}</span>
                              </div>

                              <div className="text-slate-600 font-mono text-[11px]">
                                {obs.reference_range_raw || "Standard"}
                              </div>

                              <div className="text-right">{getStatusBadge(obs.abnormal_flag)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-slate-400 text-xs">
                            No parsed observations found for this report.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-16 text-center text-slate-400 text-sm space-y-2 shadow-xs">
                <FlaskConical className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-700">No report selected</h4>
                <p className="text-xs text-slate-400">
                  Select a laboratory record from the list on the left to inspect detailed clinical observations and attached scans.
                </p>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* 4. FULLSCREEN IMAGE LIGHTBOX MODAL */}
      {lightboxOpen && selectedReport?.file_url && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 animate-in fade-in">
          {/* Top Control Bar */}
          <div className="flex items-center justify-between pb-3 px-2 border-b border-slate-800 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">{selectedReport.report_title}</h3>
                <p className="text-xs text-slate-400">{selectedReport.lab_name} &bull; {selectedReport.test_date}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.min(prev + 0.25, 3))}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.max(prev - 0.25, 0.5))}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(1)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
              >
                Reset ({Math.round(zoomScale * 100)}%)
              </button>

              <a
                href={getAbsoluteFileUrl(selectedReport.file_url) || "#"}
                target="_blank"
                rel="noreferrer"
                download={selectedReport.file_name || "lab_report"}
                className="p-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition cursor-pointer"
                title="Download Scan"
              >
                <Download className="w-4 h-4" />
              </a>

              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer ml-2"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered Image with Smooth Zoom */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <img
              src={getAbsoluteFileUrl(selectedReport.file_url) || ""}
              alt={selectedReport.report_title}
              style={{ transform: `scale(${zoomScale})` }}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl transition-transform duration-200"
            />
          </div>
        </div>
      )}

      {/* 5. UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 sm:p-7 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <Upload className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Upload Lab Report</h3>
                  <p className="text-[11px] text-slate-500">Scan or PDF document ingestion</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Upload your scanned laboratory test result. Our OCR engine extracts biomarker values, compares them with standard ranges, and routes the document to your physician.
            </p>

            {/* Quick Presets for Demo Testing */}
            <div className="space-y-1.5 p-3 rounded-2xl bg-teal-50/70 border border-teal-200/80">
              <span className="text-[11px] font-extrabold text-teal-900 block">
                Quick Select Clinical Test Condition:
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setUploadTitle("Full Blood Count - Dengue Screening Panel");
                    setUploadLabName("Lanka Hospitals Laboratory");
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-100/60 text-left transition cursor-pointer"
                >
                  🦟 Dengue / Low PLT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadTitle("Full Blood Count - Iron Deficiency Anemia");
                    setUploadLabName("Asiri Central Hospital Lab");
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-100/60 text-left transition cursor-pointer"
                >
                  🩸 Iron Deficiency Anemia
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadTitle("Full Blood Count - Acute Bacterial Infection");
                    setUploadLabName("Durdans Hospital Diagnostic");
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-100/60 text-left transition cursor-pointer"
                >
                  🦠 Bacterial Infection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadTitle("Full Blood Count - Healthy Normal Routine");
                    setUploadLabName("Nawaloka Hospital Lab");
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-100/60 text-left transition cursor-pointer"
                >
                  🩺 Healthy Normal
                </button>
              </div>
            </div>

            <form onSubmit={handlePatientUpload} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Test Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Full Blood Count (FBC)"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Laboratory / Hospital Name</label>
                <input
                  type="text"
                  value={uploadLabName}
                  onChange={(e) => setUploadLabName(e.target.value)}
                  placeholder="e.g. Asiri Labs / Nawaloka / Durdans"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Report Document (Image Scan or PDF)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:font-bold hover:file:bg-teal-100 cursor-pointer"
                />
              </div>

              {/* LIVE FILE PREVIEW IN UPLOAD MODAL */}
              {uploadFile && (
                <div className="p-3.5 rounded-2xl border border-teal-200 bg-teal-50/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-teal-600" />
                      Attached: {uploadFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFile(null);
                        setUploadFilePreview(null);
                      }}
                      className="text-[11px] text-rose-600 font-bold hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>

                  {uploadFilePreview && (
                    <div className="rounded-xl overflow-hidden border border-teal-200 bg-white p-1">
                      <img
                        src={uploadFilePreview}
                        alt="Upload Preview"
                        className="max-h-48 w-full object-contain rounded-lg"
                      />
                    </div>
                  )}

                  {!uploadFilePreview && uploadFile.type === "application/pdf" && (
                    <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-rose-200 text-xs text-rose-700 font-medium">
                      <FileText className="w-5 h-5 text-rose-600" />
                      <span>PDF Document ({Math.round(uploadFile.size / 1024)} KB) ready for upload</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/20 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {uploadLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Extracting OCR...</span>
                    </>
                  ) : (
                    <span>Submit Report</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. DELETE MODAL */}
      {deleteModalReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 sm:p-7 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 pb-2 border-b border-slate-100">
              <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Delete Lab Report</h3>
                <p className="text-[11px] text-slate-500">This action permanently deletes the record</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
              <div><strong>Title:</strong> {deleteModalReport.report_title}</div>
              <div><strong>Lab:</strong> {deleteModalReport.lab_name}</div>
              <div><strong>Date:</strong> {deleteModalReport.test_date}</div>
              <div><strong>Parameters:</strong> {deleteModalReport.observations?.length || 0} observations</div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently remove this laboratory report and its associated diagnostic observations from your history?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalReport(null)}
                disabled={deletingId !== null}
                className="px-4 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReport}
                disabled={deletingId !== null}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {deletingId !== null ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
