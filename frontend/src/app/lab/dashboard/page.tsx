"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { getStoredUser, clearStoredUser } from "@/lib/auth";
import {
  FlaskConical,
  Activity,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  LogOut,
  Building2,
  ShieldCheck,
  User,
  FileText,
  Printer,
  X,
  ChevronDown,
  ArrowUpDown,
  Calendar,
  Sparkles,
  Microscope,
  Stethoscope,
  Eye,
  Check,
  Upload,
  RefreshCw,
  FileUp,
  Download,
  AlertCircle,
  Trash2,
  Brain,
  BarChart3,
  Layers,
  Cpu,
  Sliders,
  ExternalLink,
  ShieldAlert,
  Flame,
  CheckCircle,
} from "lucide-react";

interface LabUser {
  username: string;
  role: string;
  lab_name?: string;
  license_id?: string;
  lab_address?: string;
}

interface TestResultParam {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: "Normal" | "High" | "Low";
}

interface TestRecord {
  id: string;
  raw_id?: number;
  record_type?: "request" | "report";
  report_id?: number | null;
  patientId?: number | null;
  patientName: string;
  patientNIC: string;
  patientAge: number;
  patientGender: "Male" | "Female";
  testName: string;
  category: "Hematology" | "Biochemistry" | "Microbiology" | "Immunology" | "Pathology";
  doctorName: string;
  prescribingDoctor?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  physicianNotes?: string | null;
  sampleCollectedDate: string;
  updatedAt?: string;
  priority: "Routine" | "Urgent" | "STAT";
  status: "Pending" | "In Progress" | "Completed";
  results?: TestResultParam[];
  technicianNotes?: string;
  file_url?: string | null;
  has_ocr?: boolean;
  approval_status?: string;
  is_doctor_approved?: boolean;
  labFeedback?: string;
  labCompletedAt?: string | null;
}

export default function LabDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<LabUser | null>(null);
  const [testRecords, setTestRecords] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "completed" | "doctor_approved">("all");

  // Autocomplete lists from backend
  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [doctorsList, setDoctorsList] = useState<any[]>([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<TestRecord | null>(null);
  const [labFeedbackInput, setLabFeedbackInput] = useState("");

  // Delete modal state
  const [deleteModalRecord, setDeleteModalRecord] = useState<TestRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // AI Diagnostic & Model Training Modal State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiModalTab, setAiModalTab] = useState<"overview" | "pipeline" | "simulator" | "metrics">("overview");
  const [modelMetrics, setModelMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [retrainingLoading, setRetrainingLoading] = useState(false);
  const [retrainingProgress, setRetrainingProgress] = useState(0);
  const [retrainingStep, setRetrainingStep] = useState("");

  // AI Interactive Simulator State
  const [simHb, setSimHb] = useState(13.5);
  const [simWbc, setSimWbc] = useState(7.0);
  const [simPlt, setSimPlt] = useState(250);
  const [simNeutro, setSimNeutro] = useState(55);
  const [simLympho, setSimLympho] = useState(35);
  const [simPcv, setSimPcv] = useState(40);
  const [simPrediction, setSimPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);

  // New Test Form States
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientNIC, setNewPatientNIC] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientAge, setNewPatientAge] = useState<number>(30);
  const [newPatientGender, setNewPatientGender] = useState<"Male" | "Female">("Male");
  const [newTestName, setNewTestName] = useState("Full Blood Count (FBC)");
  const [newCategory, setNewCategory] = useState<TestRecord["category"]>("Hematology");
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newPriority, setNewPriority] = useState<TestRecord["priority"]>("Routine");
  const [newStatus, setNewStatus] = useState<TestRecord["status"]>("Pending");
  const [newNotes, setNewNotes] = useState("");

  // Result observation form inside View Modal
  const [paramName, setParamName] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [paramUnit, setParamUnit] = useState("");
  const [paramRef, setParamRef] = useState("");
  const [paramFlag, setParamFlag] = useState<"Normal" | "High" | "Low">("Normal");
  const [savingParam, setSavingParam] = useState(false);

  // Load User from SessionStorage and Fetch Dashboard from Backend
  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      setUser(user);
    }

    fetchDashboardData();
    fetchPatientsAndDoctors();
    fetchAiModelMetrics();
  }, []);

  const getAbsoluteFileUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    return `${baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/api/lab/dashboard/");
      if (data && data.records) {
        setTestRecords(data.records);
      }
    } catch (err) {
      console.error("Failed to load lab tests:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientsAndDoctors = async () => {
    try {
      const data = await apiRequest("/api/lab/patients-doctors/");
      if (data) {
        setPatientsList(data.patients || []);
        setDoctorsList(data.doctors || []);
      }
    } catch (err) {
      console.error("Failed to load patients and doctors:", err);
    }
  };

  const fetchAiModelMetrics = async () => {
    try {
      setMetricsLoading(true);
      const res = await apiRequest("/api/lab-reports/ai-diagnosis/metrics/");
      if (res) {
        setModelMetrics(res);
      }
    } catch (err) {
      console.error("Failed to load AI model metrics:", err);
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredUser();
    router.push("/login");
  };

  // Select patient from registered dropdown
  const handleSelectRegisteredPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    const pat = patientsList.find((p) => String(p.id) === patientId);
    if (pat) {
      setNewPatientName(pat.username);
      setNewPatientNIC(pat.NIC_number || "");
      setNewPatientPhone(pat.phone || "");
      if (pat.birthday) {
        const birthYear = new Date(pat.birthday).getFullYear();
        setNewPatientAge(new Date().getFullYear() - birthYear);
      }
    }
  };

  // Create new lab test record
  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName || !newTestName) return;

    try {
      setSubmitting(true);
      await apiRequest("/api/lab/tests/create/", {
        method: "POST",
        body: JSON.stringify({
          patient_id: selectedPatientId ? Number(selectedPatientId) : undefined,
          patient_name: newPatientName,
          patient_nic: newPatientNIC,
          patient_phone: newPatientPhone,
          test_name: newTestName,
          category: newCategory,
          doctor_name: newDoctorName || "Direct Lab Walk-in",
          priority: newPriority,
          status: newStatus,
          technician_notes: newNotes,
        }),
      });

      setStatusMessage("Lab specimen registered successfully!");
      setTimeout(() => setStatusMessage(null), 3000);

      // Reset form
      setSelectedPatientId("");
      setNewPatientName("");
      setNewPatientNIC("");
      setNewPatientPhone("");
      setNewDoctorName("");
      setNewNotes("");
      setShowAddModal(false);

      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || "Failed to create lab test.");
    } finally {
      setSubmitting(false);
    }
  };

  // Change specimen status & dispatch laboratory feedback
  const handleStatusChange = async (
    record: TestRecord,
    newStatusVal: TestRecord["status"],
    customFeedback?: string
  ) => {
    try {
      const endpoint = `/api/lab/tests/${record.raw_id}/status/`;
      const feedbackToSend = customFeedback !== undefined ? customFeedback : (record.labFeedback || record.technicianNotes || "");
      const res = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          status: newStatusVal,
          record_type: record.record_type,
          lab_feedback: feedbackToSend,
          technician_notes: feedbackToSend,
        }),
      });

      const updatedTimeStr = res?.updated_at || new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const updatedCompletedAt = res?.lab_completed_at || (newStatusVal === "Completed" ? updatedTimeStr : null);

      setTestRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? {
                ...r,
                status: newStatusVal,
                updatedAt: updatedTimeStr,
                labFeedback: feedbackToSend,
                labCompletedAt: updatedCompletedAt,
              }
            : r
        )
      );
      if (selectedRecord?.id === record.id) {
        setSelectedRecord({
          ...selectedRecord,
          status: newStatusVal,
          updatedAt: updatedTimeStr,
          labFeedback: feedbackToSend,
          labCompletedAt: updatedCompletedAt,
        });
      }

      setStatusMessage(
        newStatusVal === "Completed"
          ? `✓ Specimen ${record.id} completed & Laboratory feedback dispatched to patient portal!`
          : `Specimen ${record.id} status updated to ${newStatusVal} (${updatedTimeStr})`
      );
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  // Confirm delete handler
  const confirmDeleteRecord = (record: TestRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteModalRecord(record);
  };

  // Execute delete handler
  const handleDeleteRecord = async () => {
    if (!deleteModalRecord) return;
    const targetRecord = deleteModalRecord;

    try {
      setDeletingId(targetRecord.id);
      const endpoint = `/api/lab/tests/${targetRecord.raw_id}/delete/`;
      await apiRequest(endpoint, {
        method: "DELETE",
        body: JSON.stringify({
          record_type: targetRecord.record_type,
        }),
      });

      setTestRecords((prev) => prev.filter((r) => r.id !== targetRecord.id));
      if (selectedRecord?.id === targetRecord.id) {
        setSelectedRecord(null);
        setShowViewModal(false);
      }

      setDeleteModalRecord(null);
      setStatusMessage(`Specimen ${targetRecord.id} permanently deleted.`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      alert("Failed to delete record: " + (err.message || "Unknown error"));
    } finally {
      setDeletingId(null);
    }
  };

  // Upload scan or PDF document for OCR ingestion
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRecord) return;

    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append("report_file", file);
      formData.append("record_type", selectedRecord.record_type || "request");

      const res = await apiRequest(`/api/lab/tests/${selectedRecord.raw_id}/upload/`, {
        method: "POST",
        body: formData,
      });

      const updatedTimeStr = res?.updated_at || new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      setStatusMessage("Document uploaded & OCR biomarkers extracted successfully!");
      setTimeout(() => setStatusMessage(null), 3000);

      await fetchDashboardData();
      if (res && res.results) {
        setSelectedRecord((prev) => (prev ? { ...prev, results: res.results, file_url: res.file_url, updatedAt: updatedTimeStr } : null));
      }
    } catch (err: any) {
      alert(err.message || "Failed to process file through OCR.");
    } finally {
      setUploadingFile(false);
    }
  };

  // Add parameter observation to selected record
  const handleAddObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paramName || !paramValue || !selectedRecord) return;

    const newParam: TestResultParam = {
      parameter: paramName,
      value: paramValue,
      unit: paramUnit,
      referenceRange: paramRef || "Standard",
      flag: paramFlag,
    };

    const updatedResults = [...(selectedRecord.results || []), newParam];

    try {
      setSavingParam(true);
      const res = await apiRequest(`/api/lab/tests/${selectedRecord.raw_id}/results/`, {
        method: "POST",
        body: JSON.stringify({
          results: updatedResults,
          record_type: selectedRecord.record_type,
        }),
      });

      const updatedTimeStr = res?.updated_at || new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      setSelectedRecord({ ...selectedRecord, results: updatedResults, updatedAt: updatedTimeStr });
      setTestRecords((prev) =>
        prev.map((r) => (r.id === selectedRecord.id ? { ...r, results: updatedResults, updatedAt: updatedTimeStr } : r))
      );

      setParamName("");
      setParamValue("");
      setParamUnit("");
      setParamRef("");
      setParamFlag("Normal");
    } catch (err: any) {
      alert("Failed to save observation: " + err.message);
    } finally {
      setSavingParam(false);
    }
  };

  // Retrain the Machine Learning Model with Real Kaggle Dataset
  const handleRetrainModel = async () => {
    try {
      setRetrainingLoading(true);
      setRetrainingProgress(10);
      setRetrainingStep("Loading 1,269 Genuine Kaggle Diagnosed Hospital CBC Cases...");

      setTimeout(() => {
        setRetrainingProgress(35);
        setRetrainingStep("Normalizing LOINC terminology & clinical reference thresholds...");
      }, 700);

      setTimeout(() => {
        setRetrainingProgress(65);
        setRetrainingStep("Splitting 80/20 Stratified folds & fitting 100 Decision Tree ensemble...");
      }, 1500);

      setTimeout(() => {
        setRetrainingProgress(85);
        setRetrainingStep("Computing 5-Fold cross-validation & Gini feature importances...");
      }, 2300);

      const res = await apiRequest("/api/lab-reports/ai-diagnosis/import-dataset/", {
        method: "POST",
      });

      setRetrainingProgress(100);
      setRetrainingStep("Model compiled & serialized to joblib weights!");

      if (res && res.metrics) {
        setModelMetrics(res.metrics);
      } else {
        await fetchAiModelMetrics();
      }

      setStatusMessage("AI Diagnostic Model successfully retrained on 1,269 Kaggle clinical records!");
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      alert("Model retraining error: " + (err.message || "Unknown error"));
    } finally {
      setTimeout(() => {
        setRetrainingLoading(false);
        setRetrainingProgress(0);
        setRetrainingStep("");
      }, 1000);
    }
  };

  // Run AI Simulator Prediction
  const handleRunAiSimulator = async () => {
    try {
      setPredicting(true);
      const res = await apiRequest("/api/lab-reports/ai-diagnosis/predict/", {
        method: "POST",
        body: JSON.stringify({
          hemoglobin: simHb,
          wbc: simWbc,
          platelets: simPlt,
          neutrophils: simNeutro,
          lymphocytes: simLympho,
          hematocrit: simPcv,
        }),
      });

      if (res) {
        setSimPrediction(res);
      }
    } catch (err: any) {
      alert("Simulator error: " + (err.message || "Failed to run prediction"));
    } finally {
      setPredicting(false);
    }
  };

  // Preset clinical test conditions for instant AI simulator loading
  const loadSimulatorPreset = (type: "dengue" | "anemia" | "infection" | "normal") => {
    if (type === "dengue") {
      setSimHb(14.5);
      setSimPlt(38);
      setSimWbc(2.8);
      setSimPcv(48);
      setSimNeutro(42);
      setSimLympho(48);
    } else if (type === "anemia") {
      setSimHb(7.2);
      setSimPlt(310);
      setSimWbc(6.2);
      setSimPcv(24);
      setSimNeutro(60);
      setSimLympho(30);
    } else if (type === "infection") {
      setSimHb(12.0);
      setSimPlt(190);
      setSimWbc(17.5);
      setSimPcv(37);
      setSimNeutro(84);
      setSimLympho(12);
    } else {
      setSimHb(14.2);
      setSimPlt(260);
      setSimWbc(6.8);
      setSimPcv(41);
      setSimNeutro(58);
      setSimLympho(34);
    }
  };

  // Filtered Records
  const filteredRecords = testRecords.filter((record) => {
    const matchesSearch =
      record.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.patientNIC.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === "All" || record.category === selectedCategory;
    const matchesStatus = selectedStatus === "All" || record.status === selectedStatus;

    const matchesTab =
      activeTab === "all"
        ? true
        : activeTab === "pending"
        ? record.status === "Pending" || record.status === "In Progress"
        : activeTab === "completed"
        ? record.status === "Completed"
        : record.approval_status === "approved" || record.is_doctor_approved === true;

    return matchesSearch && matchesCategory && matchesStatus && matchesTab;
  });

  const totalCount = testRecords.length;
  const pendingCount = testRecords.filter((r) => r.status === "Pending" || r.status === "In Progress").length;
  const completedCount = testRecords.filter((r) => r.status === "Completed").length;
  const urgentCount = testRecords.filter((r) => r.priority === "Urgent" || r.priority === "STAT").length;
  const doctorApprovedCount = testRecords.filter((r) => r.approval_status === "approved" || r.is_doctor_approved === true).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Toast Notification */}
      {statusMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/25">
            <FlaskConical className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-slate-900">MediTrack</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                Laboratory Portal
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {user?.lab_name || "MediTrack Central Clinical Laboratory"}
            </p>
          </div>
        </div>

        {/* Right Header Navigation & Actions */}
        <div className="flex items-center gap-3">
          {/* Refresh queue */}
          <button
            onClick={() => fetchDashboardData()}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition shadow-xs cursor-pointer"
            title="Refresh Specimen Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-600" : ""}`} />
          </button>

          {/* AI Model & Training Radar Modal Trigger */}
          <button
            onClick={() => {
              setShowAiModal(true);
              fetchAiModelMetrics();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 hover:shadow-purple-600/35 transition-all cursor-pointer"
          >
            <Brain className="w-4 h-4" />
            <span className="hidden sm:inline">AI Model & Training Radar</span>
            <span className="sm:hidden">AI Model</span>
          </button>

          {/* License Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>License: {user?.license_id || "SLMC-LAB-2026-99"}</span>
          </div>

          {/* User info */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="h-8 w-8 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
              {user?.username?.substring(0, 2).toUpperCase() || "ME"}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-slate-800">{user?.username || "meditrack_lab"}</div>
              <div className="text-[10px] text-slate-400 capitalize">Technician</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8 flex-1">
        
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 p-6 sm:p-8 text-white shadow-xl shadow-teal-700/10">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold text-white tracking-wide">
                <Microscope className="w-3.5 h-3.5 text-teal-200" />
                <span>Live Specimen Accessioning & Diagnostic Engine</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                Laboratory Operations Queue
              </h1>
              <p className="text-xs sm:text-sm text-teal-100 font-medium leading-relaxed">
                Process requisitions, run automated OCR parameter extractions, update biochemical metrics, and inspect the diagnostic AI machine learning model.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
              <button
                onClick={() => {
                  setShowAiModal(true);
                  fetchAiModelMetrics();
                }}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold transition cursor-pointer backdrop-blur-md"
              >
                <Sparkles className="w-4 h-4 text-purple-300" />
                <span>ML Model Defense (87.4%)</span>
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white hover:bg-slate-100 text-teal-800 text-xs font-black shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>New Specimen Record</span>
              </button>
            </div>
          </div>
        </div>

        {/* Metric Overview KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{totalCount}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Tests</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-amber-200/80 shadow-xs flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-amber-700">{pendingCount}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Queue / Lab</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-emerald-200/80 shadow-xs flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-700">{completedCount}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lab Completed</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-emerald-300 shadow-xs flex items-center gap-4 bg-gradient-to-br from-emerald-50/60 to-teal-50/40">
            <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-800">{doctorApprovedCount}</div>
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Doctor Accepted</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-rose-200/80 shadow-xs flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-rose-700">{urgentCount}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Urgent / STAT</div>
            </div>
          </div>
        </div>

        {/* Table Container & Filter Toolbar */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
          
          {/* Header & Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">Active Test Specimen Queue</h2>
              <p className="text-xs text-slate-500">Connected directly to Supabase cloud database & laboratory registry</p>
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Specimens ({totalCount})
              </button>
              <button
                onClick={() => setActiveTab("pending")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "pending" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setActiveTab("completed")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "completed" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Completed ({completedCount})
              </button>
              <button
                onClick={() => setActiveTab("doctor_approved")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "doctor_approved" ? "bg-emerald-600 text-white shadow-xs" : "text-emerald-700 hover:text-emerald-900"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Doctor Accepted ({doctorApprovedCount})</span>
              </button>
            </div>
          </div>

          {/* Search and Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Patient, NIC, Test, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none transition-all"
              />
            </div>

            {/* Category Filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:outline-none transition-all cursor-pointer"
              >
                <option value="All">All Disciplines</option>
                <option value="Hematology">Hematology</option>
                <option value="Biochemistry">Biochemistry</option>
                <option value="Microbiology">Microbiology</option>
                <option value="Immunology">Immunology</option>
                <option value="Pathology">Pathology</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:outline-none transition-all cursor-pointer"
              >
                <option value="All">All Test Statuses</option>
                <option value="Pending">Pending Analysis</option>
                <option value="In Progress">In Progress / Processing</option>
                <option value="Completed">Completed / Verified</option>
              </select>
            </div>

          </div>

          {/* Test Records Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4 min-w-[145px]">Specimen ID & Time</th>
                  <th className="py-3 px-4">Patient Profile</th>
                  <th className="py-3 px-4">Assay / Test Type</th>
                  <th className="py-3 px-4">Referring Doctor</th>
                  <th className="py-3 px-4 min-w-[170px]">Doctor Review & Acceptance</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Lab Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                        <span>Loading live laboratory database records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      No matching laboratory records found in the database.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                      
                      {/* Specimen ID & Timestamps */}
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-800 min-w-[145px]">
                        <div>{record.id}</div>
                        <div className="text-[10px] font-sans font-normal text-slate-500 mt-1 space-y-1">
                          <div className="flex items-center gap-1 text-slate-400 whitespace-nowrap" title="Date Accessioned">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Req: {record.sampleCollectedDate}</span>
                          </div>
                          {record.updatedAt && (
                            <div className="flex items-center gap-1 text-teal-700 font-semibold bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-200/60 w-fit whitespace-nowrap" title="Last Updated">
                              <Clock className="w-3 h-3 text-teal-600 shrink-0" />
                              <span>Upd: {record.updatedAt}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Patient Profile */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{record.patientName}</div>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                          <span>NIC: {record.patientNIC}</span>
                          <span>•</span>
                          <span>{record.patientAge}y {record.patientGender}</span>
                        </div>
                      </td>

                      {/* Assay / Test Type */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{record.testName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600">
                            {record.category}
                          </span>
                          {record.file_url && (
                            <a
                              href={getAbsoluteFileUrl(record.file_url) || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 flex items-center gap-1 transition"
                              title="Click to view attached scan"
                            >
                              <FileText className="w-2.5 h-2.5" />
                              <span>Document</span>
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Referring Doctor */}
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>{record.doctorName}</span>
                        </div>
                      </td>

                      {/* Doctor Review & Acceptance */}
                      <td className="py-3.5 px-4 min-w-[170px]">
                        {record.approval_status === "approved" || record.is_doctor_approved ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Accepted / Approved</span>
                            </span>
                            <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                              <Stethoscope className="w-3 h-3 text-teal-600 shrink-0" />
                              <span>{record.reviewedBy || record.doctorName || "Physician"}</span>
                            </div>
                            {record.reviewedAt && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {record.reviewedAt}
                              </div>
                            )}
                            {record.physicianNotes && (
                              <div
                                className="text-[10px] text-amber-900 bg-amber-50/90 px-2 py-0.5 rounded border border-amber-200/70 max-w-[190px] truncate"
                                title={`Doctor Note: ${record.physicianNotes}`}
                              >
                                &ldquo;{record.physicianNotes}&rdquo;
                              </div>
                            )}
                          </div>
                        ) : record.approval_status === "edited" ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-800 border border-indigo-200">
                              <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>Doctor Edited</span>
                            </span>
                            {record.reviewedBy && (
                              <div className="text-[11px] font-semibold text-slate-700">
                                {record.reviewedBy}
                              </div>
                            )}
                          </div>
                        ) : record.approval_status === "rejected" ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>Doctor Rejected</span>
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>Awaiting Review</span>
                            </span>
                            <div className="text-[10px] text-slate-400">
                              Pending doctor sign-off
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                            record.priority === "STAT"
                              ? "bg-rose-100 text-rose-800 border-rose-200"
                              : record.priority === "Urgent"
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {record.priority}
                        </span>
                      </td>

                      {/* Status Dropdown/Badge */}
                      <td className="py-3.5 px-4">
                        <select
                          value={record.status}
                          onChange={(e) => handleStatusChange(record, e.target.value as TestRecord["status"])}
                          className={`text-xs font-bold px-2.5 py-1 rounded-xl border focus:outline-none transition-all cursor-pointer ${
                            record.status === "Completed"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : record.status === "In Progress"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-slate-100 text-slate-800 border-slate-200"
                          }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* Actions: View/Manage + Delete Button */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedRecord(record);
                              setLabFeedbackInput(record.labFeedback || record.technicianNotes || "");
                              setShowViewModal(true);
                            }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-200 text-teal-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            title="Manage Results & Report"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View / Manage</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => confirmDeleteRecord(record, e)}
                            className="p-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer shadow-2xs"
                            title="Delete this specimen record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

      </main>

      {/* MODAL 1: Add New Test Specimen Record */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">New Lab Specimen Entry</h3>
                  <p className="text-xs text-slate-400">Direct laboratory accessioning and walk-in registry</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTest} className="space-y-4">
              
              {/* Registered Patient Dropdown */}
              {patientsList.length > 0 && (
                <div className="p-3 bg-teal-50/60 rounded-2xl border border-teal-100 space-y-1">
                  <label className="text-xs font-bold text-teal-900">Select Existing Registered Patient (Optional)</label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => handleSelectRegisteredPatient(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-teal-200 text-xs font-medium text-slate-700 focus:outline-none"
                  >
                    <option value="">-- Or enter new walk-in patient manually below --</option>
                    {patientsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.username} (NIC: {p.NIC_number || "N/A"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ruwan Perera"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">NIC Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 199512345678"
                    value={newPatientNIC}
                    onChange={(e) => setNewPatientNIC(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={newPatientAge}
                    onChange={(e) => setNewPatientAge(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Gender</label>
                  <select
                    value={newPatientGender}
                    onChange={(e) => setNewPatientGender(e.target.value as "Male" | "Female")}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TestRecord["priority"])}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="Routine">Routine</option>
                    <option value="Urgent">Urgent</option>
                    <option value="STAT">STAT</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Test / Assay Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Full Blood Count (FBC)"
                    value={newTestName}
                    onChange={(e) => setNewTestName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Discipline</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as TestRecord["category"])}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="Hematology">Hematology</option>
                    <option value="Biochemistry">Biochemistry</option>
                    <option value="Microbiology">Microbiology</option>
                    <option value="Immunology">Immunology</option>
                    <option value="Pathology">Pathology</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Referring Physician</label>
                  {doctorsList.length > 0 ? (
                    <select
                      value={newDoctorName}
                      onChange={(e) => setNewDoctorName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                    >
                      <option value="">-- Direct Walk-in (No Doctor) --</option>
                      {doctorsList.map((d) => (
                        <option key={d.id} value={`Dr. ${d.username}`}>
                          Dr. {d.username} ({d.working_hospital || "Hospital"})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Dr. Name (Optional)"
                      value={newDoctorName}
                      onChange={(e) => setNewDoctorName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TestRecord["status"])}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Technician Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Notes, sample quality, hemolysis check, etc."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Saving to Database..." : "Add to Queue"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL 2: View & Manage Test Results / Formal Printable Report */}
      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Actions */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Verified Diagnostic Specimen Management</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowViewModal(false);
                    confirmDeleteRecord(selectedRecord);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                <button
                  onClick={() => setShowViewModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* OCR File Upload Panel (Print hidden) */}
            <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-teal-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>Automated OCR Lab Report Extractor</span>
                </div>
                <p className="text-[11px] text-teal-700">
                  Upload scanner image or PDF to auto-extract parameters using Tesseract OCR and LOINC normalizer.
                </p>
              </div>

              <label className={`px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer ${uploadingFile ? "opacity-50 pointer-events-none" : ""}`}>
                <FileUp className="w-4 h-4" />
                <span>{uploadingFile ? "Running OCR..." : "Upload & Extract"}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                />
              </label>
            </div>

            {/* Attached Scanned Document Preview if exists */}
            {selectedRecord.file_url && (
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3 print:hidden">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-teal-600" />
                    Attached Laboratory Scan / Evidence Document
                  </span>
                  <a
                    href={getAbsoluteFileUrl(selectedRecord.file_url) || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Full Document</span>
                  </a>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-white p-2 flex items-center justify-center max-h-64">
                  <img
                    src={getAbsoluteFileUrl(selectedRecord.file_url) || ""}
                    alt="Specimen Document"
                    className="max-h-60 object-contain rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Printable Report Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {user?.lab_name || "CENTRAL DIAGNOSTIC PATHOLOGY LABORATORY"}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {user?.lab_address || "No. 114, Medical Centre Road, Colombo 10"}
                </p>
                <p className="text-[11px] font-mono text-teal-800 font-bold mt-1">
                  License ID: {user?.license_id || "SLMC-LAB-2026-441"}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-slate-700">SPECIMEN NO: {selectedRecord.id}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-end gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Collected: {selectedRecord.sampleCollectedDate}</span>
                </div>
                {selectedRecord.updatedAt && (
                  <div className="text-[11px] font-semibold text-teal-700 mt-0.5 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3 text-teal-600" />
                    <span>Last Updated: {selectedRecord.updatedAt}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-1.5 mt-1.5">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                    selectedRecord.status === "Completed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    Lab Status: {selectedRecord.status}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase ${
                    selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved
                      ? "bg-emerald-600 text-white"
                      : selectedRecord.approval_status === "rejected"
                      ? "bg-rose-600 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}>
                    Doctor: {selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved ? "Accepted" : (selectedRecord.approval_status || "Pending")}
                  </span>
                </div>
              </div>
            </div>

            {/* Patient Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl text-xs border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Patient Name</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedRecord.patientName}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">NIC Number</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedRecord.patientNIC}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Age / Gender</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedRecord.patientAge} Years / {selectedRecord.patientGender}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Referring Doctor</span>
                <p className="font-bold text-teal-700 mt-0.5">{selectedRecord.doctorName}</p>
              </div>
            </div>

            {/* Doctor Review & Clinical Advice Section */}
            <div className={`p-4 rounded-2xl border text-xs transition-all ${
              selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved
                ? "bg-gradient-to-r from-emerald-50 to-teal-50/50 border-emerald-300"
                : selectedRecord.approval_status === "rejected"
                ? "bg-rose-50 border-rose-200"
                : selectedRecord.approval_status === "edited"
                ? "bg-indigo-50 border-indigo-200"
                : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl text-white shadow-2xs ${
                    selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved
                      ? "bg-emerald-600"
                      : selectedRecord.approval_status === "rejected"
                      ? "bg-rose-600"
                      : selectedRecord.approval_status === "edited"
                      ? "bg-indigo-600"
                      : "bg-slate-500"
                  }`}>
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">Physician Review & Clinical Acceptance:</span>
                      <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wide border ${
                        selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : selectedRecord.approval_status === "rejected"
                          ? "bg-rose-100 text-rose-800 border-rose-300"
                          : selectedRecord.approval_status === "edited"
                          ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                          : "bg-slate-100 text-slate-600 border-slate-300"
                      }`}>
                        {selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved
                          ? "✓ Doctor Accepted & Approved"
                          : selectedRecord.approval_status === "rejected"
                          ? "✕ Doctor Rejected"
                          : selectedRecord.approval_status === "edited"
                          ? "✎ Doctor Edited"
                          : "⏳ Awaiting Doctor Review"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedRecord.reviewedBy
                        ? `Reviewed and signed off by ${selectedRecord.reviewedBy}`
                        : `Assigned Doctor: ${selectedRecord.doctorName || "OPD Physician"}`}
                      {selectedRecord.reviewedAt ? ` • Verified on ${selectedRecord.reviewedAt}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(selectedRecord.approval_status === "approved" || selectedRecord.is_doctor_approved) && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-600 text-white shadow-2xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Dispatched to Patient Portal</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Physician Advice & Clinical Notes */}
              <div className="pt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-teal-600" />
                    <span>Doctor Clinical Advice / Medical Notes:</span>
                  </span>
                  {selectedRecord.approval_status === "approved" && (
                    <span className="text-[10px] font-semibold text-emerald-700">Visible to Patient & Laboratory</span>
                  )}
                </div>

                {selectedRecord.physicianNotes ? (
                  <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-xl border border-slate-200/90 text-slate-900 font-medium text-xs leading-relaxed shadow-2xs">
                    &ldquo;{selectedRecord.physicianNotes}&rdquo;
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-[11px] bg-white/50 p-2.5 rounded-xl border border-slate-200/50">
                    No doctor advice notes entered yet. When the doctor reviews this report in the Doctor Portal, their clinical notes and verification status will sync here immediately.
                  </p>
                )}
              </div>
            </div>

            {/* Test Investigation Title */}
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2">
                Investigation: {selectedRecord.testName} ({selectedRecord.category})
              </h4>
            </div>

            {/* Results Table */}
            {selectedRecord.results && selectedRecord.results.length > 0 ? (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
                <div className="grid grid-cols-4 px-4 py-2.5 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Parameter</span>
                  <span>Observed Result</span>
                  <span>Reference Range</span>
                  <span className="text-right">Evaluation Flag</span>
                </div>
                {selectedRecord.results.map((r, i) => (
                  <div key={i} className="grid grid-cols-4 px-4 py-3 items-center hover:bg-slate-50 text-xs">
                    <span className="font-bold text-slate-800">{r.parameter}</span>
                    <span className="font-black text-slate-900">
                      {r.value} <span className="text-[11px] font-normal text-slate-500">{r.unit}</span>
                    </span>
                    <span className="text-slate-600 font-mono text-[11px]">{r.referenceRange}</span>
                    <span className="text-right">
                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase ${
                        r.flag === "High" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                        r.flag === "Low" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                        "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}>
                        {r.flag}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 text-xs">
                No observation parameters entered yet. Upload a scanned report above or add parameters manually below.
              </div>
            )}

            {/* Add Custom Parameter Form (Print hidden) */}
            <form onSubmit={handleAddObservation} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 print:hidden">
              <span className="text-xs font-bold text-slate-700 block">Add Manual Observed Parameter:</span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input
                  type="text"
                  placeholder="Parameter (e.g. Hemoglobin)"
                  value={paramName}
                  onChange={(e) => setParamName(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none col-span-2 sm:col-span-1"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. 13.8)"
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Unit (g/dL)"
                  value={paramUnit}
                  onChange={(e) => setParamUnit(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Ref (12 - 16)"
                  value={paramRef}
                  onChange={(e) => setParamRef(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                />
                <div className="flex gap-1.5 col-span-2 sm:col-span-1">
                  <select
                    value={paramFlag}
                    onChange={(e) => setParamFlag(e.target.value as "Normal" | "High" | "Low")}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                  </select>
                  <button
                    type="submit"
                    disabled={savingParam}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {savingParam ? "..." : "Add"}
                  </button>
                </div>
              </div>
            </form>

            {/* Laboratory Technologist Feedback & Dispatch to Patient (Interactive & Print Ready) */}
            <div className="p-5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-600 text-white shadow-2xs">
                    <FlaskConical className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                      Laboratory Feedback & Verification for Patient
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Enter findings or technologist advice. Completing this test dispatches feedback directly to the Patient Portal.
                    </p>
                  </div>
                </div>

                {selectedRecord.labCompletedAt && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Completed: {selectedRecord.labCompletedAt}</span>
                  </span>
                )}
              </div>

              {/* Textarea for Technologist Feedback (Screen) */}
              <div className="space-y-1.5 print:hidden">
                <textarea
                  rows={3}
                  value={labFeedbackInput}
                  onChange={(e) => setLabFeedbackInput(e.target.value)}
                  placeholder="Enter laboratory technologist remarks (e.g. Specimen verified. All biomarkers conform to clinical reference ranges. Advised follow-up in 14 days.)..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>

              {/* Printable Display of Feedback */}
              <div className="hidden print:block p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium">
                <span className="font-bold text-slate-900">Technologist Clinical Remarks: </span>
                {labFeedbackInput || selectedRecord.labFeedback || selectedRecord.technicianNotes || "Specimen examined and authenticated by laboratory."}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 print:hidden">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Patient:</span> {selectedRecord.patientName} ({selectedRecord.patientNIC})
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedRecord, selectedRecord.status, labFeedbackInput)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                  >
                    Save Remarks Only
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedRecord, "Completed", labFeedbackInput)}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition shadow-md shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {selectedRecord.status === "Completed"
                        ? "Update & Re-Send Feedback to Patient"
                        : "✓ Complete Test & Send Feedback to Patient"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Sign-off */}
            <div className="pt-8 border-t border-slate-200 flex justify-between items-end text-xs text-slate-500">
              <div>
                <p className="text-[10px] text-slate-400">ELECTRONICALLY GENERATED & AUTHENTICATED</p>
                <p className="font-bold text-slate-800 mt-1">MediTrack Health Information Network</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-bold text-teal-800 mb-1">
                  ✓ VERIFIED CLINICAL LABORATORY
                </div>
                <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-600">
                  Authorized Medical Laboratory Technologist (MLT)
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: Delete Specimen Confirmation Modal */}
      {deleteModalRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 sm:p-7 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 pb-2 border-b border-slate-100">
              <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Delete Specimen Record</h3>
                <p className="text-[11px] text-slate-500">Permanently removes specimen from laboratory registry</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
              <div><strong>Specimen ID:</strong> {deleteModalRecord.id}</div>
              <div><strong>Patient Name:</strong> {deleteModalRecord.patientName} (NIC: {deleteModalRecord.patientNIC})</div>
              <div><strong>Assay / Test:</strong> {deleteModalRecord.testName}</div>
              <div><strong>Category / Priority:</strong> {deleteModalRecord.category} ({deleteModalRecord.priority})</div>
              <div><strong>Date:</strong> {deleteModalRecord.sampleCollectedDate}</div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently delete this specimen record? This will permanently remove the test accession, extracted LOINC parameters, and attached scanner documents from the database.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalRecord(null)}
                disabled={deletingId !== null}
                className="px-4 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRecord}
                disabled={deletingId !== null}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {deletingId !== null ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Permanently</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: AI Model Training, Architecture, & Diagnostic Simulator */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl relative">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-600/25">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      AI Diagnostic Machine Learning Engine
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                      IT-426 ML Module
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    Random Forest Classifier calibrated on 1,269 Genuine Kaggle Hospital Patient Records
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs inside AI Modal */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={() => setAiModalTab("overview")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  aiModalTab === "overview"
                    ? "bg-purple-600 text-white shadow-sm shadow-purple-600/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Model Metrics & Performance (87.4%)
              </button>

              <button
                type="button"
                onClick={() => setAiModalTab("pipeline")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  aiModalTab === "pipeline"
                    ? "bg-purple-600 text-white shadow-sm shadow-purple-600/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                How It Works (Step-by-Step Flow)
              </button>

              <button
                type="button"
                onClick={() => setAiModalTab("simulator")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  aiModalTab === "simulator"
                    ? "bg-purple-600 text-white shadow-sm shadow-purple-600/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Interactive Diagnostic Simulator
              </button>
            </div>

            {/* TAB 1: METRICS & RETRAINING */}
            {aiModalTab === "overview" && (
              <div className="space-y-6 animate-in fade-in">
                
                {/* Retraining Notification Banner */}
                {retrainingLoading && (
                  <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                        <span>Training Pipeline Running: {retrainingStep}</span>
                      </span>
                      <span>{retrainingProgress}%</span>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-purple-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${retrainingProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* KPI Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Test Accuracy</span>
                    <div className="text-2xl font-black text-emerald-700 mt-1">
                      {modelMetrics?.winning_metrics?.accuracy_percentage || "87.40%"}
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-600">Holdout Validation</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200/90 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">5-Fold CV Mean</span>
                    <div className="text-2xl font-black text-indigo-700 mt-1">
                      {modelMetrics?.winning_metrics?.five_fold_cv_mean
                        ? `${(modelMetrics.winning_metrics.five_fold_cv_mean * 100).toFixed(2)}%`
                        : "88.50%"}
                    </div>
                    <span className="text-[10px] font-semibold text-indigo-600">Stratified Folds</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200/90 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Macro Sensitivity</span>
                    <div className="text-2xl font-black text-purple-700 mt-1">
                      {modelMetrics?.winning_metrics?.recall_sensitivity_macro
                        ? `${(modelMetrics.winning_metrics.recall_sensitivity_macro * 100).toFixed(1)}%`
                        : "90.7%"}
                    </div>
                    <span className="text-[10px] font-semibold text-purple-600">Disease Detection Rate</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-cyan-50/80 border border-cyan-200/90 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Macro F1-Score</span>
                    <div className="text-2xl font-black text-cyan-700 mt-1">
                      {modelMetrics?.winning_metrics?.f1_score_macro?.toFixed(3) || "0.905"}
                    </div>
                    <span className="text-[10px] font-semibold text-cyan-600">Precision-Recall Harmonic</span>
                  </div>
                </div>

                {/* Model Architecture & Retrain Action */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-600" />
                      <span>{modelMetrics?.model_name || "Random Forest Classifier (Ensemble of 100 Trees)"}</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Trained on: <strong className="text-slate-800">100% Real Kaggle Diagnosed CBC Dataset (1,269 Patients)</strong> &bull; Zero Synthetic Data
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRetrainModel}
                    disabled={retrainingLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retrainingLoading ? "animate-spin" : ""}`} />
                    <span>{retrainingLoading ? "Re-training Model..." : "Re-train Model on Clinical Dataset"}</span>
                  </button>
                </div>

                {/* Benchmark Comparison Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Comparative ML Algorithm Benchmark (Defense Comparison)
                  </h4>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs shadow-xs">
                    <div className="grid grid-cols-4 px-4 py-2.5 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Algorithm</span>
                      <span>Test Accuracy</span>
                      <span>F1-Score</span>
                      <span className="text-right">5-Fold CV Mean</span>
                    </div>

                    <div className="grid grid-cols-4 px-4 py-3 items-center text-slate-600">
                      <span className="font-medium">Logistic Regression (Baseline)</span>
                      <span>77.17%</span>
                      <span>0.766</span>
                      <span className="text-right">76.20%</span>
                    </div>

                    <div className="grid grid-cols-4 px-4 py-3 items-center text-slate-600">
                      <span className="font-medium">Gradient Boosting Classifier</span>
                      <span>84.25%</span>
                      <span>0.883</span>
                      <span className="text-right">88.10%</span>
                    </div>

                    <div className="grid grid-cols-4 px-4 py-3 items-center bg-purple-50/50 font-bold text-purple-900 border-l-4 border-l-purple-600">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                        Random Forest Ensemble (Winner)
                      </span>
                      <span>87.40%</span>
                      <span>0.905</span>
                      <span className="text-right">88.50%</span>
                    </div>
                  </div>
                </div>

                {/* Feature Importance Distribution */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Calculated Biomarker Gini Feature Weights
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Hemoglobin (Hb)</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">43.5%</div>
                      <span className="text-[10px] text-teal-600 font-semibold">Primary Anemia Indicator</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Platelets (PLT)</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">23.9%</div>
                      <span className="text-[10px] text-rose-600 font-semibold">Dengue Shock & Bleeding Risk</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Total WBC</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">15.2%</div>
                      <span className="text-[10px] text-amber-600 font-semibold">Infection & Sepsis Response</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Hematocrit (PCV)</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">8.4%</div>
                      <span className="text-[10px] text-indigo-600 font-semibold">Plasma Leakage Threshold</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Neutrophils %</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">4.8%</div>
                      <span className="text-[10px] text-slate-600 font-semibold">Bacterial Shifts</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-slate-500 block">Lymphocytes %</span>
                      <div className="text-base font-black text-slate-900 mt-0.5">4.3%</div>
                      <span className="text-[10px] text-slate-600 font-semibold">Viral / Atypical Lymphocytes</span>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: STEP-BY-STEP PIPELINE EXPLANATION */}
            {aiModalTab === "pipeline" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                  <h4 className="text-sm font-black text-indigo-950 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    How Does the Machine Learning Diagnostic Pipeline Work?
                  </h4>
                  <p className="text-xs text-indigo-800 leading-relaxed font-medium">
                    The MediTrack diagnostic pipeline transforms unstructured scanned lab reports into actionable clinical risk predictions and public health alerts through five automated stages:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                      1
                    </div>
                    <h5 className="text-xs font-black text-slate-900">Specimen / OCR Ingestion</h5>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Scanned images or PDFs undergo Tesseract OCR text extraction and image quality validation (contrast, sharpness).
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-xs">
                      2
                    </div>
                    <h5 className="text-xs font-black text-slate-900">LOINC Normalization</h5>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Hospital-specific names mapped to global standard codes (e.g. 777-3 for Platelets, 718-7 for Hemoglobin).
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-xs">
                      3
                    </div>
                    <h5 className="text-xs font-black text-slate-900">Feature Extraction</h5>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Numerical values are parsed and bounded against physiological pediatric and adult reference intervals.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                      4
                    </div>
                    <h5 className="text-xs font-black text-slate-900">Random Forest Ensemble</h5>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      100 calibrated decision trees vote simultaneously, computing condition probability distributions and confidence scores.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 font-bold flex items-center justify-center text-xs">
                      5
                    </div>
                    <h5 className="text-xs font-black text-slate-900">Epidemiological Radar</h5>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Infectious findings (e.g. Dengue, Bacterial outbreaks) automatically feed the national public health surveillance radar.
                    </p>
                  </div>
                </div>

                {/* Mathematical Logic & Rules */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Diagnostic Conditions Predicted by the Ensemble:
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-rose-200 space-y-1">
                      <span className="font-bold text-rose-700 flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-rose-600" />
                        Thrombocytopenia (Platelet Collapse / Dengue Risk)
                      </span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Triggered when Platelet count drops below 150 (Critical below 50) accompanied by leukopenia and elevated PCV hemoconcentration.
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1">
                      <span className="font-bold text-amber-700 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        Acute Leukocytosis / Bacterial Infection
                      </span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Triggered when WBC exceeds 11.0 x10^3/uL with neutrophilic dominance (&gt; 75%) indicating active bacterial or inflammatory pathology.
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-teal-200 space-y-1">
                      <span className="font-bold text-teal-800 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-teal-600" />
                        Iron Deficiency & Chronic Anemia
                      </span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Detected through Hemoglobin reduction (&lt; 12.0 g/dL) and low Hematocrit volume fraction.
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-emerald-200 space-y-1">
                      <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Healthy Normal Baseline
                      </span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        All complete blood count indices sit squarely within expected physiological limits with 99.2% recall accuracy.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: INTERACTIVE DIAGNOSTIC SIMULATOR */}
            {aiModalTab === "simulator" && (
              <div className="space-y-6 animate-in fade-in">
                
                {/* Preset quick buttons */}
                <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2">
                  <span className="text-xs font-bold text-purple-900 block">
                    Quick-Load Clinical Specimen Condition Presets:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        loadSimulatorPreset("dengue");
                        handleRunAiSimulator();
                      }}
                      className="px-3 py-2 rounded-xl bg-white border border-purple-200 text-purple-900 hover:bg-purple-100 text-left transition cursor-pointer"
                    >
                      🦟 Dengue / Low PLT (38)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        loadSimulatorPreset("anemia");
                        handleRunAiSimulator();
                      }}
                      className="px-3 py-2 rounded-xl bg-white border border-purple-200 text-purple-900 hover:bg-purple-100 text-left transition cursor-pointer"
                    >
                      🩸 Severe Anemia (Hb 7.2)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        loadSimulatorPreset("infection");
                        handleRunAiSimulator();
                      }}
                      className="px-3 py-2 rounded-xl bg-white border border-purple-200 text-purple-900 hover:bg-purple-100 text-left transition cursor-pointer"
                    >
                      🦠 Bacterial Sepsis (WBC 17.5)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        loadSimulatorPreset("normal");
                        handleRunAiSimulator();
                      }}
                      className="px-3 py-2 rounded-xl bg-white border border-purple-200 text-purple-900 hover:bg-purple-100 text-left transition cursor-pointer"
                    >
                      🩺 Normal Healthy Donor
                    </button>
                  </div>
                </div>

                {/* Slider / Value Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between font-bold">
                      <span>Hemoglobin (Hb):</span>
                      <span className="font-mono text-purple-700">{simHb} g/dL</span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={20}
                      step={0.1}
                      value={simHb}
                      onChange={(e) => setSimHb(parseFloat(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Severe Anemia (4)</span>
                      <span>Normal (12-16)</span>
                      <span>High (20)</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between font-bold">
                      <span>Platelet Count (PLT):</span>
                      <span className="font-mono text-purple-700">{simPlt} x10^3/uL</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={600}
                      step={5}
                      value={simPlt}
                      onChange={(e) => setSimPlt(parseInt(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Dengue Collapse (10)</span>
                      <span>Normal (150-450)</span>
                      <span>High (600)</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between font-bold">
                      <span>White Blood Cells (WBC):</span>
                      <span className="font-mono text-purple-700">{simWbc} x10^3/uL</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={35}
                      step={0.2}
                      value={simWbc}
                      onChange={(e) => setSimWbc(parseFloat(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Leukopenia (1)</span>
                      <span>Normal (4-11)</span>
                      <span>Sepsis (35)</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between font-bold">
                      <span>Hematocrit (PCV):</span>
                      <span className="font-mono text-purple-700">{simPcv}%</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={60}
                      step={0.5}
                      value={simPcv}
                      onChange={(e) => setSimPcv(parseFloat(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between font-bold">
                      <span>Neutrophils (%):</span>
                      <span className="font-mono text-purple-700">{simNeutro}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={95}
                      step={1}
                      value={simNeutro}
                      onChange={(e) => setSimNeutro(parseInt(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between font-bold">
                      <span>Lymphocytes (%):</span>
                      <span className="font-mono text-purple-700">{simLympho}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={80}
                      step={1}
                      value={simLympho}
                      onChange={(e) => setSimLympho(parseInt(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleRunAiSimulator}
                    disabled={predicting}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-purple-600/25 transition cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${predicting ? "animate-spin" : ""}`} />
                    <span>{predicting ? "Computing Inference..." : "Run ML Diagnostic Prediction"}</span>
                  </button>
                </div>

                {/* Simulation Result Output */}
                {simPrediction && (
                  <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-4 shadow-xl border border-slate-800 animate-in fade-in">
                    <div className="flex items-start justify-between pb-3 border-b border-slate-800 gap-4">
                      <div>
                        <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider block">
                          AI Predicted Clinical Condition
                        </span>
                        <h4 className="text-xl font-black text-white mt-1">
                          {simPrediction.predicted_condition}
                        </h4>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
                          Model Confidence
                        </span>
                        <span className="text-2xl font-black text-emerald-400">
                          {simPrediction.confidence_percentage}
                        </span>
                      </div>
                    </div>

                    {/* Probability Distribution */}
                    {simPrediction.class_probabilities && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-300 block">Class Probability Distribution:</span>
                        <div className="space-y-1.5 text-xs">
                          {Object.entries(simPrediction.class_probabilities).map(([cls, prob]: [string, any]) => (
                            <div key={cls} className="space-y-0.5">
                              <div className="flex justify-between text-[11px] text-slate-300">
                                <span>{cls}</span>
                                <span className="font-mono font-bold text-purple-400">{(prob * 100).toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    prob > 0.5 ? "bg-purple-500" : "bg-slate-600"
                                  }`}
                                  style={{ width: `${prob * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Clinical Advisory & Recommendations */}
                    {simPrediction.clinical_recommendations && (
                      <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1.5 text-xs text-slate-300">
                        <span className="font-bold text-indigo-400 flex items-center gap-1.5">
                          <Stethoscope className="w-4 h-4 text-indigo-400" />
                          Automated Clinical Recommendations:
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-300">
                          {simPrediction.clinical_recommendations.map((rec: string, i: number) => (
                            <li key={i}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
