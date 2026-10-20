"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
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
  file_url: string | null;
  approval_status: string;
  reviewed_by_name: string | null;
  physician_notes: string | null;
  reviewed_at: string | null;
  is_dispatched_to_patient?: boolean;
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
  const [uploadTitle, setUploadTitle] = useState("Full Blood Count (FBC)");
  const [uploadLabName, setUploadLabName] = useState("Asiri Health Hospital Lab");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Current logged in patient (from localStorage or first patient)
  const [patientId, setPatientId] = useState<number | null>(null);

  useEffect(() => {
    // Try to get patient from localStorage or fetch patients
    const stored = localStorage.getItem("meditrack_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.id) {
          setPatientId(u.id);
          fetchPatientReports(u.id);
          return;
        }
      } catch (e) {}
    }

    // Fallback: fetch users and pick first patient
    apiRequest("/get-users/").then((data: any) => {
      const usersList = data?.users || (Array.isArray(data) ? data : []);
      const p = usersList.find((u: any) => u.role === "patient") || usersList[0];
      if (p) {
        setPatientId(p.id);
        fetchPatientReports(p.id);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const fetchPatientReports = async (pid: number) => {
    try {
      setLoading(true);
      // Fetch reports including user's pending submissions so they can see upload status
      const data = await apiRequest(`/api/lab-reports/?patient_id=${pid}&role=patient&include_pending=true`);
      setReports(data || []);
      if (data && data.length > 0) {
        setSelectedReport(data[0]);
      }
    } catch (err) {
      console.error("Failed to load patient lab reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePatientUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    let pid = patientId;
    if (!pid) {
      const stored = localStorage.getItem("meditrack_user");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (u.id) pid = u.id;
        } catch (e) {}
      }
    }
    if (!pid) {
      alert("Please sign in or choose your patient profile before submitting.");
      return;
    }
    try {
      setUploadLoading(true);
      const formData = new FormData();
      formData.append("patient_id", String(pid));
      formData.append("lab_name", uploadLabName);
      formData.append("report_title", uploadTitle);
      if (uploadFile) {
        formData.append("report_file", uploadFile);
      }

      const res = await apiRequest("/api/lab-reports/upload/", {
        method: "POST",
        body: formData,
      });

      setShowUploadModal(false);
      setUploadFile(null);
      alert("Report successfully submitted! It has been routed to your doctor for clinical review and verification.");
      await fetchPatientReports(pid);
      if (res) {
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

  const getStatusBadge = (flag: string) => {
    switch (flag) {
      case "CRITICAL_HIGH":
      case "CRITICAL_LOW":
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">Critical</span>;
      case "HIGH":
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Elevated</span>;
      case "LOW":
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Low</span>;
      case "ABNORMAL":
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Positive</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Normal</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/patient/dashboard"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              My Verified Lab Reports
            </h1>
            <p className="text-xs text-slate-400">
              Physician-reviewed clinical test results, standard reference metrics, and doctor advice.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition"
        >
          <Upload className="w-4 h-4" />
          Upload Outside Lab Report
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: List of Reports */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search reports by title or lab..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2.5">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                Loading your reports...
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-xs">
                No physician-approved reports found. Newly uploaded reports will appear here once verified by your doctor.
              </div>
            ) : (
              filteredReports.map((r) => {
                const isSelected = selectedReport?.report_id === r.report_id;
                const isApproved = r.approval_status === "approved" || r.is_dispatched_to_patient;
                return (
                  <div
                    key={r.report_id}
                    onClick={() => setSelectedReport(r)}
                    className={`w-full text-left p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? "bg-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/30"
                        : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{r.report_title}</span>
                      <div className="flex items-center gap-1.5">
                        {isApproved ? (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            Under Doctor Review
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => confirmDeleteReport(r, e)}
                          disabled={deletingId === r.report_id}
                          title="Delete this lab report"
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        >
                          {deletingId === r.report_id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-500" />
                        {r.lab_name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {r.test_date}
                      </span>
                    </div>

                    {r.reviewed_by_name ? (
                      <div className="text-[11px] text-slate-500 border-t border-slate-800/60 pt-1.5 flex items-center gap-1">
                        <Stethoscope className="w-3 h-3 text-indigo-400" />
                        Reviewed by Dr. {r.reviewed_by_name}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-500/80 border-t border-slate-800/60 pt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        Extracted • Queued for clinical verification
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: Detailed Lab Report Card */}
        <div className="md:col-span-2">
          {selectedReport ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
              {/* Report Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{selectedReport.report_title}</h2>
                    {selectedReport.approval_status === "approved" || selectedReport.is_dispatched_to_patient ? (
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Doctor Approved
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        Pending Doctor Verification
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-4">
                    <span>
                      Laboratory: <strong className="text-slate-200">{selectedReport.lab_name}</strong>
                    </span>
                    <span>
                      Test Date: <strong className="text-slate-200">{selectedReport.test_date}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedReport.file_url && (
                    <a
                      href={selectedReport.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition"
                      title="View original uploaded PDF/Scan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Original Document
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => confirmDeleteReport(selectedReport)}
                    disabled={deletingId === selectedReport.report_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition disabled:opacity-50"
                    title="Permanently delete this report"
                  >
                    {deletingId === selectedReport.report_id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Delete Report</span>
                  </button>
                </div>
              </div>

              {/* Physician Advice or Pending Banner */}
              {selectedReport.physician_notes ? (
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/60 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <Stethoscope className="w-4 h-4 text-indigo-400" />
                    Doctor's Advice & Clinical Assessment
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {selectedReport.physician_notes}
                  </p>
                  {selectedReport.reviewed_by_name && (
                    <div className="text-[11px] text-indigo-400/80 pt-1">
                      — Dr. {selectedReport.reviewed_by_name} ({selectedReport.reviewed_at ? new Date(selectedReport.reviewed_at).toLocaleDateString() : "Verified"})
                    </div>
                  )}
                </div>
              ) : selectedReport.approval_status !== "approved" && (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Pending Clinical Verification
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This outside report has been processed by our OCR and terminology system. Your physician will review the extracted observations and sign off before final clinical assessment.
                  </p>
                </div>
              )}

              {/* Observations Breakdown */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Test Results & Metrics Breakdown
                </h3>

                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                  <div className="grid grid-cols-4 px-4 py-2 bg-slate-900 text-[11px] font-semibold text-slate-400">
                    <span>Test Parameter</span>
                    <span>Result</span>
                    <span>Standard Range</span>
                    <span className="text-right">Evaluation</span>
                  </div>

                  {selectedReport.observations && selectedReport.observations.length > 0 ? (
                    selectedReport.observations.map((obs) => (
                      <div
                        key={obs.observation_id}
                        className="grid grid-cols-4 px-4 py-3 items-center hover:bg-slate-800/30 transition text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-200">{obs.test_original_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">LOINC: {obs.test_standard_code}</div>
                        </div>

                        <div className="font-bold text-white">
                          {obs.result_value} <span className="text-xs font-normal text-slate-400">{obs.unit}</span>
                        </div>

                        <div className="text-slate-400 font-mono text-[11px]">
                          {obs.reference_range_raw || "Standard"}
                        </div>

                        <div className="text-right">{getStatusBadge(obs.abnormal_flag)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-xs">
                      No parsed observations for this report.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
              Select a report from the list on the left to view results.
            </div>
          )}
        </div>
      </div>

      {/* Upload Outside Report Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                Upload Outside Lab Report
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Upload your scanned laboratory test result. Our AI system will extract the parameters and queue it for your doctor's official clinical verification.
            </p>

            <form onSubmit={handlePatientUpload} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Test Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Full Blood Count (FBC)"
                  className="w-full text-xs px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Laboratory / Hospital</label>
                <input
                  type="text"
                  value={uploadLabName}
                  onChange={(e) => setUploadLabName(e.target.value)}
                  placeholder="e.g. Asiri Labs / Nawaloka / Durdans"
                  className="w-full text-xs px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Report Image / PDF Document</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-2 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {uploadLoading ? "Uploading & Extracting..." : "Submit to Doctor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 pb-2 border-b border-slate-800">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Lab Report</h3>
                <p className="text-xs text-slate-400">This action will permanently delete the report and its data.</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 text-xs space-y-1.5 text-slate-300">
              <div><strong>Title:</strong> {deleteModalReport.report_title}</div>
              <div><strong>Lab:</strong> {deleteModalReport.lab_name}</div>
              <div><strong>Test Date:</strong> {deleteModalReport.test_date}</div>
              <div><strong>Observations:</strong> {deleteModalReport.observations?.length || 0} extracted parameters</div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to delete this report? This will permanently remove the record, OCR extractions, and attached files from the database.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteModalReport(null)}
                disabled={deletingId !== null}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReport}
                disabled={deletingId !== null}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {deletingId !== null ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
