"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Check
} from "lucide-react";

interface LabUser {
  username: string;
  role: string;
  lab_name?: string;
  license_id?: string;
  lab_address?: string;
}

interface TestRecord {
  id: string;
  patientName: string;
  patientNIC: string;
  patientAge: number;
  patientGender: "Male" | "Female";
  testName: string;
  category: "Hematology" | "Biochemistry" | "Microbiology" | "Immunology" | "Pathology";
  doctorName: string;
  sampleCollectedDate: string;
  priority: "Routine" | "Urgent" | "STAT";
  status: "Pending" | "In Progress" | "Completed";
  results?: {
    parameter: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag: "Normal" | "High" | "Low";
  }[];
  technicianNotes?: string;
}

const INITIAL_TEST_RECORDS: TestRecord[] = [
  {
    id: "LAB-2026-081",
    patientName: "Kamal Perera",
    patientNIC: "198814502952",
    patientAge: 36,
    patientGender: "Male",
    testName: "Full Blood Count (FBC)",
    category: "Hematology",
    doctorName: "Dr. Nishantha Silva",
    sampleCollectedDate: "2026-10-04 08:30 AM",
    priority: "Urgent",
    status: "Completed",
    results: [
      { parameter: "Hemoglobin", value: "14.2", unit: "g/dL", referenceRange: "13.5 - 17.5", flag: "Normal" },
      { parameter: "WBC Count", value: "11.8", unit: "10^3/µL", referenceRange: "4.5 - 11.0", flag: "High" },
      { parameter: "Platelet Count", value: "245", unit: "10^3/µL", referenceRange: "150 - 450", flag: "Normal" },
      { parameter: "RBC Count", value: "4.9", unit: "10^6/µL", referenceRange: "4.3 - 5.9", flag: "Normal" },
    ],
    technicianNotes: "Slightly elevated leukocytosis. Clinical correlation suggested."
  },
  {
    id: "LAB-2026-082",
    patientName: "Nimali Jayawardena",
    patientNIC: "199570300491",
    patientAge: 29,
    patientGender: "Female",
    testName: "Fasting Blood Glucose (FBS)",
    category: "Biochemistry",
    doctorName: "Dr. Priyantha Gamage",
    sampleCollectedDate: "2026-10-04 09:15 AM",
    priority: "Routine",
    status: "Completed",
    results: [
      { parameter: "Fasting Plasma Glucose", value: "98", unit: "mg/dL", referenceRange: "70 - 100", flag: "Normal" },
      { parameter: "HbA1c", value: "5.4", unit: "%", referenceRange: "< 5.7", flag: "Normal" }
    ],
    technicianNotes: "Glycemic parameters within normal fasting reference range."
  },
  {
    id: "LAB-2026-083",
    patientName: "Sunil Shantha",
    patientNIC: "198225102380",
    patientAge: 42,
    patientGender: "Male",
    testName: "Lipid Profile",
    category: "Biochemistry",
    doctorName: "Dr. Dinesh Dewasurendra",
    sampleCollectedDate: "2026-10-04 10:00 AM",
    priority: "Routine",
    status: "In Progress",
    results: [],
    technicianNotes: "Serum centrifuged. Analyzer queue slot 4."
  },
  {
    id: "LAB-2026-084",
    patientName: "Dilrukshi Gunasekara",
    patientNIC: "198872102147",
    patientAge: 38,
    patientGender: "Female",
    testName: "Serum Creatinine & Blood Urea",
    category: "Biochemistry",
    doctorName: "Dr. Nishantha Silva",
    sampleCollectedDate: "2026-10-04 11:20 AM",
    priority: "STAT",
    status: "Pending",
    results: [],
    technicianNotes: "Awaiting biochemistry analyzer calibration."
  },
  {
    id: "LAB-2026-085",
    patientName: "Suchirani Rasaduni",
    patientNIC: "987101245V",
    patientAge: 28,
    patientGender: "Female",
    testName: "Urine Full Report (UFR)",
    category: "Pathology",
    doctorName: "Dr. Asela Rathnayake",
    sampleCollectedDate: "2026-10-04 11:45 AM",
    priority: "Routine",
    status: "Pending",
    results: [],
    technicianNotes: "Sample accessioned and refrigerated."
  }
];

export default function LabDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<LabUser | null>(null);
  const [testRecords, setTestRecords] = useState<TestRecord[]>(INITIAL_TEST_RECORDS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "completed">("all");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<TestRecord | null>(null);

  // New Test Form States
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientNIC, setNewPatientNIC] = useState("");
  const [newPatientAge, setNewPatientAge] = useState<number>(30);
  const [newPatientGender, setNewPatientGender] = useState<"Male" | "Female">("Male");
  const [newTestName, setNewTestName] = useState("Full Blood Count (FBC)");
  const [newCategory, setNewCategory] = useState<TestRecord["category"]>("Hematology");
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newPriority, setNewPriority] = useState<TestRecord["priority"]>("Routine");
  const [newStatus, setNewStatus] = useState<TestRecord["status"]>("Pending");
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("meditrack_user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
      } catch {
        // If parsing fails
      }
    }

    // Load persisted lab records if any
    const savedRecords = localStorage.getItem("meditrack_lab_records");
    if (savedRecords) {
      try {
        setTestRecords(JSON.parse(savedRecords));
      } catch {
        // Fallback to initial
      }
    }
  }, []);

  const saveRecordsToStorage = (updated: TestRecord[]) => {
    setTestRecords(updated);
    localStorage.setItem("meditrack_lab_records", JSON.stringify(updated));
  };

  const handleLogout = () => {
    localStorage.removeItem("meditrack_user");
    router.push("/login");
  };

  const handleCreateTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName || !newPatientNIC || !newTestName) return;

    const newId = `LAB-2026-${String(testRecords.length + 81).padStart(3, "0")}`;
    const nowStr = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    const newRecord: TestRecord = {
      id: newId,
      patientName: newPatientName,
      patientNIC: newPatientNIC,
      patientAge: Number(newPatientAge) || 25,
      patientGender: newPatientGender,
      testName: newTestName,
      category: newCategory,
      doctorName: newDoctorName || "Direct Lab Walk-in",
      sampleCollectedDate: nowStr,
      priority: newPriority,
      status: newStatus,
      results: newStatus === "Completed" ? [
        { parameter: "Diagnostic Index", value: "Verified Normal", unit: "IU/L", referenceRange: "Standard", flag: "Normal" }
      ] : [],
      technicianNotes: newNotes || "Sample accessioned by laboratory."
    };

    const updated = [newRecord, ...testRecords];
    saveRecordsToStorage(updated);

    // Reset Form
    setNewPatientName("");
    setNewPatientNIC("");
    setNewDoctorName("");
    setNewNotes("");
    setShowAddModal(false);
  };

  const handleStatusChange = (id: string, nextStatus: TestRecord["status"]) => {
    const updated = testRecords.map((rec) => {
      if (rec.id === id) {
        return {
          ...rec,
          status: nextStatus,
          results: (nextStatus === "Completed" && (!rec.results || rec.results.length === 0)) ? [
            { parameter: "Routine Assay", value: "Normal Limits", unit: "Index", referenceRange: "Normal", flag: "Normal" as const }
          ] : rec.results
        };
      }
      return rec;
    });
    saveRecordsToStorage(updated);
  };

  // Stats Calculations
  const totalCount = testRecords.length;
  const pendingCount = testRecords.filter((r) => r.status === "Pending" || r.status === "In Progress").length;
  const completedCount = testRecords.filter((r) => r.status === "Completed").length;
  const urgentCount = testRecords.filter((r) => r.priority === "Urgent" || r.priority === "STAT").length;

  // Filtered List
  const filteredRecords = testRecords.filter((record) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "pending" && (record.status === "Pending" || record.status === "In Progress")) ||
      (activeTab === "completed" && record.status === "Completed");

    const matchesCategory = selectedCategory === "All" || record.category === selectedCategory;
    const matchesStatus = selectedStatus === "All" || record.status === selectedStatus;

    const matchesSearch =
      record.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.patientNIC.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesCategory && matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-teal-600 selection:text-white pb-16">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo & Portal Identity */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/25">
              <FlaskConical className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-slate-900">MediTrack</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
                  Laboratory Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {user?.lab_name || "Diagnostic Pathology & Clinical Services"}
              </p>
            </div>
          </div>

          {/* Right Header: Lab Info & Logout */}
          <div className="flex items-center gap-3">
            {user?.license_id && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>License: {user.license_id}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="h-9 w-9 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold text-xs">
                {user?.username ? user.username.slice(0, 2).toUpperCase() : "LB"}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-slate-800">{user?.username || "Lab Staff"}</div>
                <div className="text-[10px] text-slate-500 font-medium">Technician</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-8 space-y-8">
        
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 p-6 sm:p-8 text-white shadow-xl shadow-teal-700/10">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 opacity-10 pointer-events-none">
            <Microscope className="w-72 h-72" />
          </div>

          <div className="relative z-10 max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold text-white tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-teal-200" />
              <span>Integrated Health Clinical Diagnostic Suite</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {user?.lab_name ? `${user.lab_name}` : "Clinical Laboratory Management"}
            </h1>
            <p className="text-xs sm:text-sm text-teal-100 font-medium leading-relaxed">
              Manage incoming specimen queues, enter biochemical metrics, issue verified diagnostic reports, and coordinate directly with clinical physicians.
            </p>

            {user?.lab_address && (
              <div className="pt-2 flex items-center gap-2 text-xs text-teal-100 font-semibold opacity-90">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>{user.lab_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Overview Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Total Specimens</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{totalCount}</h3>
              <p className="text-[11px] font-semibold text-teal-600 mt-0.5">Active Register</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
              <ClipboardList className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">In Analysis / Pending</p>
              <h3 className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</h3>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Awaiting verification</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Completed Reports</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">{completedCount}</h3>
              <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">Dispatched to doctors</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Urgent / STAT Priority</p>
              <h3 className="text-2xl font-black text-rose-600 mt-1">{urgentCount}</h3>
              <p className="text-[11px] font-semibold text-rose-600 mt-0.5">Immediate attention</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* Main Section: Test Queue & Filter Operations */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          
          {/* Action Header & Tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Diagnostic Test Queue</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Inspect, update diagnostic assays, and issue validated reports
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Tab Pills */}
              <div className="flex items-center p-1 bg-slate-100 rounded-2xl text-xs font-bold text-slate-600">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === "all" ? "bg-white text-teal-700 shadow-xs" : "hover:text-slate-900"
                  }`}
                >
                  All ({totalCount})
                </button>
                <button
                  onClick={() => setActiveTab("pending")}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === "pending" ? "bg-white text-teal-700 shadow-xs" : "hover:text-slate-900"
                  }`}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  onClick={() => setActiveTab("completed")}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === "completed" ? "bg-white text-teal-700 shadow-xs" : "hover:text-slate-900"
                  }`}
                >
                  Completed ({completedCount})
                </button>
              </div>

              {/* Add New Test Record Button */}
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md shadow-teal-600/20 transition-all hover:-translate-y-0.5 cursor-pointer ml-auto sm:ml-0"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>New Specimen</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Search Input */}
            <div className="relative sm:col-span-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient, NIC, or test..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none transition-all"
              />
            </div>

            {/* Category Filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:outline-none transition-all"
              >
                <option value="All">All Disciplines / Categories</option>
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
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:outline-none transition-all"
              >
                <option value="All">All Test Statuses</option>
                <option value="Pending">Pending Analysis</option>
                <option value="In Progress">In Progress / Centrifuging</option>
                <option value="Completed">Completed / Verified</option>
              </select>
            </div>

          </div>

          {/* Test Records Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Specimen ID</th>
                  <th className="py-3 px-4">Patient Profile</th>
                  <th className="py-3 px-4">Assay / Test Type</th>
                  <th className="py-3 px-4">Referring Doctor</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                      No matching laboratory records found.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                      
                      {/* Specimen ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-800">
                        {record.id}
                        <div className="text-[10px] font-sans font-normal text-slate-400">
                          {record.sampleCollectedDate.split(" ")[0]}
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
                        <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600">
                          {record.category}
                        </span>
                      </td>

                      {/* Referring Doctor */}
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>{record.doctorName}</span>
                        </div>
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
                          onChange={(e) => handleStatusChange(record.id, e.target.value as TestRecord["status"])}
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

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedRecord(record);
                              setShowViewModal(true);
                            }}
                            className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                            title="View Formal Report"
                          >
                            <Eye className="w-4 h-4" />
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

      {/* MODAL 1: Add New Specimen / Test Record */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Register New Diagnostic Specimen</h3>
                  <p className="text-xs text-slate-500 font-medium">Accession patient sample to testing queue</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTest} className="space-y-4 pt-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sunil Perera"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Patient NIC Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 199012345678"
                    value={newPatientNIC}
                    onChange={(e) => setNewPatientNIC(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Age</label>
                  <input
                    type="number"
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

                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold text-slate-700">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TestRecord["priority"])}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="Routine">Routine</option>
                    <option value="Urgent">Urgent</option>
                    <option value="STAT">STAT / Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Test / Assay Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Full Blood Count"
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
                  <input
                    type="text"
                    placeholder="Dr. Name (Optional)"
                    value={newDoctorName}
                    onChange={(e) => setNewDoctorName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none"
                  />
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
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 cursor-pointer"
                >
                  Add to Queue
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL 2: View Printable Clinical Lab Report */}
      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Actions */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Verified Diagnostic Report View</span>
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
                  onClick={() => setShowViewModal(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

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
                <div className="text-xs font-mono font-bold text-slate-700">REPORT NO: {selectedRecord.id}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{selectedRecord.sampleCollectedDate}</div>
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

            {/* Test Investigation Title */}
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2">
                Investigation: {selectedRecord.testName} ({selectedRecord.category})
              </h4>
            </div>

            {/* Results Table */}
            {selectedRecord.results && selectedRecord.results.length > 0 ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-400">
                    <th className="py-2">Test Parameter</th>
                    <th className="py-2">Observed Value</th>
                    <th className="py-2">Unit</th>
                    <th className="py-2">Biological Reference Range</th>
                    <th className="py-2 text-right">Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {selectedRecord.results.map((res, idx) => (
                    <tr key={idx} className="py-2">
                      <td className="py-2 font-bold text-slate-800">{res.parameter}</td>
                      <td className="py-2 font-bold text-slate-900">{res.value}</td>
                      <td className="py-2 text-slate-500">{res.unit}</td>
                      <td className="py-2 text-slate-500">{res.referenceRange}</td>
                      <td className="py-2 text-right">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                          res.flag === "Normal"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}>
                          {res.flag}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center bg-slate-50 rounded-2xl text-xs text-slate-500 font-medium">
                Analysis in progress. Quantitative biochemical metrics will be displayed once the analyzer run completes.
              </div>
            )}

            {/* Remarks Section */}
            {selectedRecord.technicianNotes && (
              <div className="p-3.5 bg-slate-50 rounded-xl text-xs border border-slate-100">
                <span className="font-bold text-slate-700">Technician Remarks: </span>
                <span className="text-slate-600">{selectedRecord.technicianNotes}</span>
              </div>
            )}

            {/* Footer Sign-off */}
            <div className="pt-8 border-t border-slate-200 flex justify-between items-end text-xs text-slate-500">
              <div>
                <p className="text-[10px] text-slate-400">ELECTRONICALLY GENERATED & AUTHENTICATED</p>
                <p className="font-bold text-slate-800 mt-1">MediTrack Health Information Network</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-bold text-teal-800 mb-1">
                  ✓ VERIFIED CLINICAL BIOCHEMIST
                </div>
                <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-600">
                  Authorized Signatory
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
