"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Stethoscope, 
  LogOut, 
  Settings, 
  User, 
  Mic, 
  MicOff, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Send, 
  Pill, 
  Activity, 
  Users, 
  Sparkles,
  ChevronRight,
  Printer,
  HeartPulse,
  ClipboardList,
  History,
  Calendar,
  Search,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  X,
  Power,
  Radio
} from "lucide-react";
import { apiRequest } from "@/lib/api";

interface Task {
  task_id: number;
  doctor_id: string;
  task_date: string;
  task_title: string;
  task_description: string;
  task_type: string;
  start_time: string;
  end_time: string;
  priority: string;
  is_completed?: boolean;
}

interface PastMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface PastPrescription {
  id: string;
  date: string;
  doctor: string;
  clinic: string;
  diagnosis: string;
  medicines: PastMedication[];
  notes?: string;
  receiptNumber: string;
}

interface Patient {
  id: string;
  token: string;
  name: string;
  age: number;
  gender: string;
  bloodGroup: string;
  allergies: string[];
  complaint: string;
  labHistory: string[];
  time: string;
  pastPrescriptions: PastPrescription[];
}

const SAMPLE_QUEUE: Patient[] = [
  {
    id: "PAT-101",
    token: "#01",
    name: "Kasun Perera",
    age: 34,
    gender: "Male",
    bloodGroup: "O+",
    allergies: ["Penicillin", "Aspirin"],
    complaint: "High fever (>38.5°C), persistent dry cough, body aches for 3 days.",
    labHistory: ["FBC (Platelets: 165,000 /μL - Borderline)", "Dengue NS1 Antigen: Negative (Day 2)", "CRP: 18 mg/L"],
    time: "09:15 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-881",
        receiptNumber: "REC-0881",
        date: "14 Aug 2026",
        doctor: "Dr. Nimal Silva",
        clinic: "MediTrack Outpatient Clinic",
        diagnosis: "Acute Bronchitis",
        medicines: [
          { name: "Azithromycin 500mg", dosage: "1 Tablet", frequency: "OD (Once daily)", duration: "3 Days" },
          { name: "Salbutamol Inhaler 100mcg", dosage: "2 Puffs", frequency: "PRN (When needed)", duration: "As required" },
          { name: "Cetirizine 10mg", dosage: "1 Tablet", frequency: "Nocte (At bedtime)", duration: "5 Days" }
        ],
        notes: "Advised chest X-ray if persistent coughing exceeds 10 days. Ensure oral rehydration."
      },
      {
        id: "RX-2026-412",
        receiptNumber: "REC-0412",
        date: "02 May 2026",
        doctor: "Dr. K. Perera",
        clinic: "General Medical OPD",
        diagnosis: "Viral Pharyngitis",
        medicines: [
          { name: "Paracetamol 500mg", dosage: "2 Tablets", frequency: "TDS (Every 8h)", duration: "3 Days" },
          { name: "Chlorpheniramine 4mg", dosage: "1 Tablet", frequency: "BD (Twice daily)", duration: "3 Days" }
        ],
        notes: "Warm saline gargle 3 times a day. Rest recommended."
      },
      {
        id: "RX-2026-105",
        receiptNumber: "REC-0105",
        date: "10 Jan 2026",
        doctor: "Dr. S. Jayasinghe",
        clinic: "ENT Specialized Unit",
        diagnosis: "Seasonal Allergic Rhinitis",
        medicines: [
          { name: "Montelukast 10mg", dosage: "1 Tablet", frequency: "Nocte", duration: "14 Days" },
          { name: "Fluticasone Nasal Spray", dosage: "1 Spray/nostril", frequency: "BD", duration: "1 Month" }
        ],
        notes: "Avoid dust allergens and air conditioner draft."
      }
    ]
  },
  {
    id: "PAT-102",
    token: "#02",
    name: "Nimali Fernando",
    age: 28,
    gender: "Female",
    bloodGroup: "A+",
    allergies: ["Sulfa Drugs"],
    complaint: "Throbbing frontal headache, sinus pressure, nasal congestion.",
    labHistory: ["Past Blood Pressure: 118/76 mmHg", "No chronic conditions recorded"],
    time: "09:30 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-620",
        receiptNumber: "REC-0620",
        date: "20 Jul 2026",
        doctor: "Dr. R. Silva",
        clinic: "MediTrack General Clinic",
        diagnosis: "Acute Frontal Sinusitis",
        medicines: [
          { name: "Amoxicillin-Clavulanate 625mg", dosage: "1 Tablet", frequency: "BD (Twice daily)", duration: "5 Days" },
          { name: "Pseudoephedrine 30mg", dosage: "1 Tablet", frequency: "TDS", duration: "4 Days" }
        ],
        notes: "Steam inhalation recommended twice daily."
      },
      {
        id: "RX-2026-190",
        receiptNumber: "REC-0190",
        date: "15 Feb 2026",
        doctor: "Dr. W.G. Dulaksha",
        clinic: "MediTrack Outpatient Clinic",
        diagnosis: "Tension Headache",
        medicines: [
          { name: "Paracetamol 500mg", dosage: "1-2 Tablets", frequency: "PRN (As needed)", duration: "3 Days" },
          { name: "Vitamin B-Complex", dosage: "1 Tablet", frequency: "OD", duration: "1 Month" }
        ],
        notes: "Improve sleep hygiene and reduce screen exposure."
      }
    ]
  },
  {
    id: "PAT-103",
    token: "#03",
    name: "Mohamed Rizwan",
    age: 52,
    gender: "Male",
    bloodGroup: "B+",
    allergies: ["None known"],
    complaint: "Routine Type-2 Diabetes follow up, mild peripheral numbness.",
    labHistory: ["HbA1c: 7.2% (Last month)", "FBS: 138 mg/dL", "Serum Creatinine: 1.0 mg/dL"],
    time: "09:45 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-904",
        receiptNumber: "REC-0904",
        date: "28 Aug 2026",
        doctor: "Dr. C. Fernando",
        clinic: "Endocrine & Diabetes Care Center",
        diagnosis: "T2DM Regular Review",
        medicines: [
          { name: "Metformin 500mg", dosage: "1 Tablet", frequency: "BD (After meals)", duration: "3 Months" },
          { name: "Glimepiride 1mg", dosage: "1 Tablet", frequency: "Mane (Morning)", duration: "3 Months" }
        ],
        notes: "Strict dietary carbohydrate moderation. Fasting lipid profile due next visit."
      },
      {
        id: "RX-2026-550",
        receiptNumber: "REC-0550",
        date: "12 Jun 2026",
        doctor: "Dr. W.G. Dulaksha",
        clinic: "MediTrack OPD",
        diagnosis: "Diabetic Neuropathy Early Signs",
        medicines: [
          { name: "Pregabalin 50mg", dosage: "1 Capsule", frequency: "Nocte (Night)", duration: "1 Month" },
          { name: "Methylcobalamin 500mcg", dosage: "1 Tablet", frequency: "OD", duration: "1 Month" }
        ],
        notes: "Foot care examination performed. No active ulcers."
      }
    ]
  },
  {
    id: "PAT-104",
    token: "#04",
    name: "Anusha Kumari",
    age: 41,
    gender: "Female",
    bloodGroup: "AB+",
    allergies: ["Ibuprofen"],
    complaint: "Joint stiffness and knee inflammation, worsens in the morning.",
    labHistory: ["ESR: 32 mm/hr", "Uric Acid: 5.4 mg/dL"],
    time: "10:00 AM",
    pastPrescriptions: [
      {
        id: "RX-2026-912",
        receiptNumber: "REC-0912",
        date: "05 Sep 2026",
        doctor: "Dr. D. Liyanage",
        clinic: "Rheumatology & Joint Care",
        diagnosis: "Osteoarthritis (Bilateral Knees)",
        medicines: [
          { name: "Paracetamol 1000mg", dosage: "2 Tablets", frequency: "TDS PRN", duration: "7 Days" },
          { name: "Glucosamine Sulfate 1500mg", dosage: "1 Sachet", frequency: "OD with water", duration: "2 Months" },
          { name: "Topical Diclofenac Gel", dosage: "Apply thin layer", frequency: "TDS", duration: "1 Tube" }
        ],
        notes: "Avoid high-impact exercises. Daily gentle quadriceps stretches advised."
      },
      {
        id: "RX-2026-380",
        receiptNumber: "REC-0380",
        date: "18 Apr 2026",
        doctor: "Dr. Nimal Silva",
        clinic: "MediTrack General OPD",
        diagnosis: "Hyperuricemia Check",
        medicines: [
          { name: "Colchicine 0.5mg", dosage: "1 Tablet", frequency: "BD", duration: "3 Days" },
          { name: "Allopurinol 100mg", dosage: "1 Tablet", frequency: "OD", duration: "1 Month" }
        ],
        notes: "Increase water intake to at least 2.5 Liters daily. Reduce red meat."
      }
    ]
  }
];

export default function DoctorDashboard() {
  const router = useRouter();

  // Doctor session state
  const [doctorName, setDoctorName] = useState("Dr. W.G. Dulaksha");
  const [hospital, setHospital] = useState("MediTrack General Hospital");

  // Patient Queue & Active Patient State
  const [queue, setQueue] = useState<Patient[]>(SAMPLE_QUEUE);
  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const currentPatient = queue[currentPatientIndex] || null;

  // Search filter for past prescription history
  const [historySearch, setHistorySearch] = useState("");

  // Selected past receipt for detailed view modal
  const [selectedReceipt, setSelectedReceipt] = useState<PastPrescription | null>(null);

  // AI Voice Consultation State
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(
    "Patient reports acute onset of high fever and productive cough. Lung auscultation reveals mild bilateral wheezing. Advised paracetamol and hydration."
  );

  // Sidebar tab switcher: Queue vs Tasks
  const [sidebarTab, setSidebarTab] = useState<"queue" | "tasks">("queue");

  // Doctor Tasks state (get_tasks)
  const [doctorId, setDoctorId] = useState("DOC-0001");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [selectedTaskDate, setSelectedTaskDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    return localToday.toISOString().split("T")[0];
  });

  // New task modal/form state
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState("consultation");
  const [newTaskStartTime, setNewTaskStartTime] = useState("09:00");
  const [newTaskEndTime, setNewTaskEndTime] = useState("10:00");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // Live Availability State (Instant 1-Click Availability without needing tasks/schedules)
  const [isAvailable, setIsAvailable] = useState(false);
  const [availableUntilTime, setAvailableUntilTime] = useState("13:00");
  const [availableUntilDisplay, setAvailableUntilDisplay] = useState<string | null>(null);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [isInitialLoginPrompt, setIsInitialLoginPrompt] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Helper to add hours/minutes for quick availability presets
  const getOffsetTime = (hours: number, minutes: number = 0) => {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    d.setMinutes(d.getMinutes() + minutes);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  // Fetch live availability from backend
  const getDoctorAvailability = async (customDocId?: string) => {
    const targetDocId = customDocId || doctorId || "DOC-0001";
    try {
      const data = await apiRequest(`/api/doctor/get-availability/?doctor_id=${targetDocId}`, {
        method: "GET",
      });
      if (data) {
        const avail = Boolean(data.is_available);
        setIsAvailable(avail);
        if (data.available_until) {
          setAvailableUntilDisplay(data.available_until);
        }
        // If not available and not yet asked during this session, prompt the doctor
        const promptKey = `meditrack_prompted_${targetDocId}_${new Date().toISOString().split("T")[0]}`;
        const alreadyPrompted = sessionStorage.getItem(promptKey);
        if (!avail && !alreadyPrompted) {
          setShowAvailabilityModal(true);
          setIsInitialLoginPrompt(true);
          sessionStorage.setItem(promptKey, "true");
        }
      }
    } catch (e) {
      console.error("Failed to load doctor availability:", e);
    }
  };

  // Update live availability in backend (Supabase)
  const handleUpdateAvailability = async (newAvail: boolean, customTime?: string) => {
    setSavingAvailability(true);
    const chosenTime = customTime || availableUntilTime || "13:00";
    try {
      const data = await apiRequest("/api/doctor/set-availability/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doctorId || "DOC-0001",
          doctor_name: doctorName || "Doctor",
          is_available: newAvail,
          available_until: newAvail ? chosenTime : null,
        }),
      });

      if (data) {
        setIsAvailable(Boolean(data.is_available));
        setAvailableUntilDisplay(data.available_until || null);
        if (newAvail && chosenTime) {
          setAvailableUntilTime(chosenTime);
        }
        setShowAvailabilityModal(false);
        setIsInitialLoginPrompt(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update availability";
      alert("Error: " + msg);
    } finally {
      setSavingAvailability(false);
    }
  };
  const getTasks = async (customDate?: string, customDocId?: string) => {
    const targetDate = customDate || selectedTaskDate;
    const targetDocId = customDocId || doctorId || "DOC-0001";

    setTasksLoading(true);
    setTasksError("");
    try {
      const data = await apiRequest("/get-tasks/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: targetDocId,
          task_date: targetDate,
        }),
      });

      if (data && data.tasks) {
        setTasks(data.tasks);
      } else {
        setTasks([]);
      }
    } catch (err: unknown) {
      console.error("Error fetching tasks:", err);
      if (err instanceof Error) {
        setTasksError(err.message || "Failed to fetch tasks.");
      } else {
        setTasksError("Failed to fetch tasks.");
      }
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  // Create Task Function
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskStartTime || !newTaskEndTime) return;
    setCreatingTask(true);
    try {
      await apiRequest("/create-task/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doctorId || "DOC-0001",
          task_date: selectedTaskDate,
          task_title: newTaskTitle,
          task_description: newTaskDescription,
          task_type: newTaskType,
          start_time: newTaskStartTime + ":00",
          end_time: newTaskEndTime + ":00",
          priority: newTaskPriority,
        }),
      });
      setShowNewTaskModal(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      await getTasks(selectedTaskDate);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create task";
      alert("Error creating task: " + msg);
    } finally {
      setCreatingTask(false);
    }
  };

  // Delete Task Function
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("Are you sure you want to remove this scheduled session?")) return;
    try {
      await apiRequest(`/delete-task/${taskId}/`, { method: "DELETE" });
      await getTasks(selectedTaskDate);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete task";
      alert("Error deleting task: " + msg);
    }
  };

  // Initialize doctor session
  useEffect(() => {
    let currentDocId = "DOC-0001";
    const stored = localStorage.getItem("meditrack_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.username) {
          const raw = parsed.username.replace(/^dr[._\s]*/i, "");
          const cleanName = raw.charAt(0).toUpperCase() + raw.slice(1);
          setDoctorName(`Dr. ${cleanName}`);
        }
        if (parsed.doctorID) {
          currentDocId = parsed.doctorID;
          setDoctorId(parsed.doctorID);
        }
      } catch (e) {
        // use default
      }
    }
    getTasks(selectedTaskDate, currentDocId);
    getDoctorAvailability(currentDocId);
  }, []);

  // Reload tasks when selectedTaskDate changes
  useEffect(() => {
    if (selectedTaskDate) {
      getTasks(selectedTaskDate);
    }
  }, [selectedTaskDate]);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("meditrack_user");
    router.push("/login");
  };

  // Next Patient Action
  const handleNextPatient = () => {
    if (currentPatientIndex < queue.length - 1) {
      setCurrentPatientIndex((prev) => prev + 1);
      setIsListening(false);
      setTranscript("Listening for patient consultation notes...");
      setHistorySearch("");
      setSelectedReceipt(null);
    } else {
      alert("All queued patients for this session have been completed!");
    }
  };

  // Toggle Voice Recording
  const toggleListening = () => {
    if (!isListening) {
      setIsListening(true);
      setTranscript(
        "Voice input active: Doctor discussing symptom severity, duration of chills, and evaluating breathing rate..."
      );
    } else {
      setIsListening(false);
    }
  };

  // Filter past prescriptions based on search input
  const filteredPastPrescriptions = (currentPatient?.pastPrescriptions || []).filter((rx) =>
    rx.diagnosis.toLowerCase().includes(historySearch.toLowerCase()) ||
    rx.doctor.toLowerCase().includes(historySearch.toLowerCase()) ||
    rx.medicines.some((m) => m.name.toLowerCase().includes(historySearch.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* ========================================================================= */}
      {/* 1. TOP HEADER: Site Logo (Left), Doctor Info, Settings, Logout (Right)    */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-sm">
        
        {/* Site Logo */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-purple-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-purple-600/25">
            M
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-slate-900">
                MediTrack
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                Clinical Console
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Physician Diagnostic & Prescription Workspace</p>
          </div>
        </div>

        {/* Center: Live Availability Quick Toggle & Time Adjust Capsule */}
        <div className="flex items-center">
          <button
            onClick={() => {
              setIsInitialLoginPrompt(false);
              setShowAvailabilityModal(true);
            }}
            className={`group flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all cursor-pointer shadow-sm hover:shadow-md ${
              isAvailable
                ? "bg-gradient-to-r from-emerald-500/10 via-emerald-50 to-teal-50 border-emerald-300 hover:border-emerald-400"
                : "bg-slate-100/90 border-slate-300 hover:border-slate-400"
            }`}
            title="Click to adjust live availability hours or go offline"
          >
            <div className="relative flex items-center justify-center">
              {isAvailable ? (
                <>
                  <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
                </>
              ) : (
                <span className="inline-flex rounded-full h-3 w-3 bg-slate-400"></span>
              )}
            </div>

            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-black tracking-wide ${isAvailable ? "text-emerald-900" : "text-slate-700"}`}>
                  {isAvailable ? "ACCEPTING PATIENTS" : "CURRENTLY OFFLINE"}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                  isAvailable 
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs" 
                    : "bg-slate-200 text-slate-600 border-slate-300"
                }`}>
                  {isAvailable ? "LIVE" : "PAUSED"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {isAvailable 
                  ? `Available Until: ${availableUntilDisplay || availableUntilTime} (Click to edit)`
                  : "Click here to set available time & accept bookings"}
              </p>
            </div>

            <div className={`p-1.5 rounded-xl border transition-all ml-1 ${
              isAvailable 
                ? "bg-emerald-100 text-emerald-800 border-emerald-200 group-hover:bg-emerald-200" 
                : "bg-white text-slate-500 border-slate-200 group-hover:bg-slate-200"
            }`}>
              <Power className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>

        {/* Right Section: Doctor Badge, Settings, Logout */}
        <div className="flex items-center gap-4">
          
          {/* Doctor Profile Pill */}
          <div className="flex items-center gap-3 bg-slate-100/80 border border-slate-200 py-1.5 px-3 rounded-2xl">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
              DR
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-slate-900 leading-tight">{doctorName}</div>
              <div className="text-[10px] text-slate-500">{hospital}</div>
            </div>
          </div>

          {/* Settings Icon */}
          <button 
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-purple-600 transition-all cursor-pointer"
            title="Console Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Logout Icon */}
          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-600 transition-all cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </header>

      {/* ========================================================================= */}
      {/* MAIN BODY: 3 COLUMNS                                                      */}
      {/* Column 1 (3/12): Live Consultation Queue                                  */}
      {/* Column 2 (5/12): Current Patient & Central Voice Mic                      */}
      {/* Column 3 (4/12): Patient Reception & Past Prescription History (Right)   */}
      {/* ========================================================================= */}
      <main className="flex-grow max-w-[1700px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ======================================================================= */}
        {/* ======================================================================= */}
        {/* COLUMN 1: "Next Patient" Queue OR Doctor Scheduled Tasks (get_tasks)    */}
        {/* ======================================================================= */}
        <div className="lg:col-span-3 space-y-4">

          {/* Tab Switcher: Queue vs Tasks */}
          <div className="flex p-1 bg-slate-200/80 rounded-2xl border border-slate-300/60">
            <button
              onClick={() => setSidebarTab("queue")}
              className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                sidebarTab === "queue"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Queue ({queue.length})</span>
            </button>
            <button
              onClick={() => setSidebarTab("tasks")}
              className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                sidebarTab === "tasks"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Schedule ({tasks.length})</span>
            </button>
          </div>

          {/* VIEW A: CONSULTATION QUEUE */}
          {sidebarTab === "queue" && (
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Consultation Queue</span>
                <span className="text-xs font-bold bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full border border-purple-200">
                  {currentPatientIndex + 1} of {queue.length}
                </span>
              </div>

              {/* Doctor Availability Live Alert in Queue */}
              {!isAvailable ? (
                <div 
                  onClick={() => {
                    setIsInitialLoginPrompt(false);
                    setShowAvailabilityModal(true);
                  }}
                  className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] font-bold text-amber-900">Currently Offline</div>
                      <div className="text-[10px] text-amber-700">Patients cannot book live queue tokens</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold bg-amber-600 text-white px-2.5 py-1 rounded-xl shadow-xs hover:bg-amber-700">
                    Go Live
                  </span>
                </div>
              ) : (
                <div 
                  onClick={() => {
                    setIsInitialLoginPrompt(false);
                    setShowAvailabilityModal(true);
                  }}
                  className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-emerald-100/80 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                    </span>
                    <div>
                      <div className="text-[11px] font-bold text-emerald-900">Accepting Appointments</div>
                      <div className="text-[10px] text-emerald-700">Until {availableUntilDisplay || availableUntilTime} &bull; Click to adjust</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 px-2 py-0.5 rounded-lg shadow-xs">
                    Adjust
                  </span>
                </div>
              )}

              {/* BIG NEXT PATIENT BUTTON */}
              <button
                onClick={handleNextPatient}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-lg shadow-purple-600/25 hover:shadow-purple-600/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Next Patient</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Waiting Queue List */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Queue Timeline</div>
                
                <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                  {queue.map((p, idx) => {
                    const isActive = idx === currentPatientIndex;
                    const isCompleted = idx < currentPatientIndex;

                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setCurrentPatientIndex(idx);
                          setSelectedReceipt(null);
                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isActive
                            ? "bg-purple-50/80 border-purple-300 shadow-sm"
                            : isCompleted
                              ? "bg-slate-50/80 border-slate-200 opacity-60"
                              : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-black px-2 py-1 rounded-xl ${
                            isActive
                              ? "bg-purple-600 text-white shadow-sm"
                              : isCompleted
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-700"
                          }`}>
                            {p.token}
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">{p.name}</h4>
                            <span className="text-[10px] text-slate-500">{p.age} Yrs &bull; {p.gender}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {p.time}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-bold text-purple-700 uppercase tracking-wide">
                              Consulting
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-0.5 justify-end">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* VIEW B: DOCTOR TASKS & SCHEDULE (get_tasks) */}
          {sidebarTab === "tasks" && (
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    Doctor Schedule
                  </span>
                  <span className="text-[10px] text-slate-400">Doctor ID: {doctorId}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => getTasks(selectedTaskDate)}
                    disabled={tasksLoading}
                    className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-all cursor-pointer"
                    title="Reload Tasks"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${tasksLoading ? "animate-spin text-purple-600" : ""}`} />
                  </button>
                  <button
                    onClick={() => setShowNewTaskModal(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Task</span>
                  </button>
                </div>
              </div>

              {/* Date Filter Input */}
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                  Date:
                </span>
                <input
                  type="date"
                  value={selectedTaskDate}
                  onChange={(e) => setSelectedTaskDate(e.target.value)}
                  className="px-2 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-purple-600 cursor-pointer"
                />
              </div>

              {/* Error Alert */}
              {tasksError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{tasksError}</span>
                </div>
              )}

              {/* Tasks List */}
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {tasksLoading ? (
                  <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Fetching doctor tasks...</span>
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-500 space-y-2">
                    <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="font-semibold text-slate-700">No tasks on this date</p>
                    <p className="text-[11px] text-slate-400">No scheduled consultations or surgeries found.</p>
                    <button
                      onClick={() => setShowNewTaskModal(true)}
                      className="mt-2 text-xs font-bold text-purple-700 hover:underline cursor-pointer block mx-auto"
                    >
                      + Add a task now
                    </button>
                  </div>
                ) : (
                  tasks.map((task) => {
                    const priorityBadge = {
                      urgent: "bg-rose-100 text-rose-800 border-rose-200",
                      high: "bg-amber-100 text-amber-800 border-amber-200",
                      medium: "bg-blue-100 text-blue-800 border-blue-200",
                      low: "bg-slate-100 text-slate-700 border-slate-200",
                    }[task.priority.toLowerCase()] || "bg-slate-100 text-slate-700";

                    return (
                      <div
                        key={task.task_id}
                        className="p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-purple-300 transition-all space-y-2 shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-bold text-xs text-slate-900 block leading-tight">
                              {task.task_title}
                            </span>
                            <span className="text-[10px] font-semibold text-purple-700 capitalize">
                              {task.task_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityBadge}`}>
                              {task.priority}
                            </span>
                            <button
                              onClick={() => handleDeleteTask(task.task_id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                              title="Delete Task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {task.task_description && (
                          <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                            {task.task_description}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] font-mono text-slate-600">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-600" />
                            {task.start_time.slice(0, 5)} - {task.end_time.slice(0, 5)}
                          </span>
                          {task.is_completed ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1 text-[10px]">
                              <CheckCircle2 className="w-3 h-3" /> Completed
                            </span>
                          ) : (
                            <span className="text-amber-600 font-bold text-[10px]">Scheduled</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

        </div>

        {/* ======================================================================= */}
        {/* COLUMN 2: Current Patient Details + Central Voice Mic (5 / 12 Cols)     */}
        {/* ======================================================================= */}
        <div className="lg:col-span-5 space-y-6">

          {/* --------------------------------------------------------------------- */}
          {/* A. CURRENT PATIENT DETAILS BANNER                                    */}
          {/* --------------------------------------------------------------------- */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            {currentPatient ? (
              <div className="space-y-4">
                
                {/* Header Row: Avatar, Name, Age, Allergies */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="w-13 h-13 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 text-2xl shadow-sm">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-extrabold text-slate-900">{currentPatient.name}</h2>
                        <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                          Token {currentPatient.token}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 font-semibold">
                          ID: {currentPatient.id}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium mt-1">
                        <span><strong>Age:</strong> {currentPatient.age} Yrs</span>
                        <span className="text-slate-300">&bull;</span>
                        <span><strong>Gender:</strong> {currentPatient.gender}</span>
                        <span className="text-slate-300">&bull;</span>
                        <span><strong>Blood Group:</strong> <strong className="text-purple-700">{currentPatient.bloodGroup}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Allergy Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Allergies:</span>
                    {currentPatient.allergies.map((allergy, i) => (
                      <span key={i} className="text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                        <AlertCircle className="w-3 h-3 text-rose-600" />
                        {allergy}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Complaint & Lab Details / History Row */}
                <div className="space-y-3 pt-1">
                  
                  {/* Chief Complaint */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <div className="text-[11px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-purple-600" />
                      <span>Chief Consultation Complaint</span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">
                      {currentPatient.complaint}
                    </p>
                  </div>

                  {/* Lab Details / History */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <div className="text-[11px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Lab Details & Clinical History</span>
                    </div>
                    <ul className="text-xs text-slate-700 space-y-1 font-medium">
                      {currentPatient.labHistory.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>

              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No patient currently selected.
              </div>
            )}
          </section>

          {/* --------------------------------------------------------------------- */}
          {/* B. CENTRAL AI VOICE CONSULTATION (THE PROMINENT MIC (( 🎙️ )) )        */}
          {/* --------------------------------------------------------------------- */}
          <section className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
            
            {/* Background Glow when Listening */}
            {isListening && (
              <div className="absolute inset-0 bg-purple-500/5 pointer-events-none animate-pulse" />
            )}

            <span className="text-xs font-bold uppercase tracking-widest text-purple-700 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Live Consultation Voice Diagnostic Engine
            </span>
            <p className="text-xs text-slate-500 max-w-md mb-6">
              Click the microphone to record clinical dialogue. AI automatically captures symptoms and medication requests.
            </p>

            {/* Central Animated Mic Button */}
            <div className="relative mb-6">
              {isListening && (
                <>
                  <div className="absolute -inset-4 rounded-full bg-purple-500/20 animate-ping" />
                  <div className="absolute -inset-8 rounded-full bg-purple-500/10 animate-pulse" />
                </>
              )}

              <button
                onClick={toggleListening}
                className={`relative w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-xl cursor-pointer ${
                  isListening
                    ? "bg-purple-600 text-white shadow-purple-600/40 scale-105"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-2 border-slate-300 hover:border-purple-400"
                }`}
              >
                {isListening ? (
                  <>
                    <Mic className="w-9 h-9 animate-bounce" />
                    <span className="text-[10px] font-bold mt-1">Listening...</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-8 h-8 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 mt-1">Start Voice</span>
                  </>
                )}
              </button>
            </div>

            {/* Live Real-time Transcript Area */}
            <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-purple-600" />
                  Real-Time Clinical Transcript
                </span>
                {isListening && (
                  <span className="flex items-center gap-1.5 text-[10px] text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
                    Capturing Audio
                  </span>
                )}
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={2}
                className="w-full bg-transparent border-none text-xs text-slate-800 focus:outline-none resize-none font-medium leading-relaxed"
                placeholder="Doctor consultation notes will appear here in real time..."
              />
            </div>

          </section>

        </div>

        {/* ======================================================================= */}
        {/* COLUMN 3 (RIGHT): PATIENT PAST PRESCRIPTION & RECEPTION HISTORY (4/12) */}
        {/* ======================================================================= */}
        <div className="lg:col-span-4 space-y-4">
          
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[640px]">
            
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                      Prescription History
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Past receipts & medications for {currentPatient?.name}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full border border-purple-200">
                  {currentPatient?.pastPrescriptions.length || 0} Records
                </span>
              </div>

              {/* Search in Past Prescriptions */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search past medicine, diagnosis..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* Past Prescriptions Timeline / Receipt List */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {filteredPastPrescriptions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-500">No past prescription history found.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Previous treatment records will appear here.</p>
                  </div>
                ) : (
                  filteredPastPrescriptions.map((rx) => {
                    const isSelected = selectedReceipt?.id === rx.id;

                    return (
                      <div
                        key={rx.id}
                        onClick={() => setSelectedReceipt(isSelected ? null : rx)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                          isSelected
                            ? "bg-purple-50/70 border-purple-300 shadow-sm"
                            : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200"
                        }`}
                      >
                        {/* Receipt Top: Date, Receipt ID, Diagnosis Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-purple-600" />
                              <span className="text-xs font-bold text-slate-900">{rx.date}</span>
                              <span className="text-[10px] font-mono text-slate-400">({rx.receiptNumber})</span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                              {rx.doctor} &bull; {rx.clinic}
                            </span>
                          </div>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase tracking-wide shrink-0">
                            {rx.diagnosis}
                          </span>
                        </div>

                        {/* Prescribed Medicines List */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                          {rx.medicines.map((med, mIdx) => (
                            <div key={mIdx} className="flex justify-between items-center text-xs bg-white p-2 rounded-xl border border-slate-200/50">
                              <div className="flex items-center gap-1.5">
                                <Pill className="w-3 h-3 text-purple-600 shrink-0" />
                                <span className="font-bold text-slate-800 text-[11px]">{med.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-600 font-mono font-semibold block">{med.dosage}</span>
                                <span className="text-[9px] text-slate-400 block">{med.frequency}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Doctor's Past Notes if present */}
                        {rx.notes && (
                          <p className="text-[10px] text-slate-600 italic bg-white/80 p-2 rounded-xl border border-slate-200/40">
                            &ldquo;{rx.notes}&rdquo;
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>

            {/* Quick Practice Tip Box */}
            <div className="pt-3 border-t border-slate-100">
              <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-2xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-600 leading-snug">
                  <strong>Clinical Safety Note:</strong> Verify patient antibiotic sensitivity against previous responses prior to prescribing.
                </p>
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* Create New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Clinical Task / Session</h3>
                  <p className="text-[10px] text-slate-400">Date: {selectedTaskDate} &bull; Doctor: {doctorId}</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Morning OPD Consultation"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Category</label>
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-600"
                  >
                    <option value="consultation">Consultation</option>
                    <option value="surgery">Surgery</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="administrative">Administrative</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-600"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={newTaskStartTime}
                    onChange={(e) => setNewTaskStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">End Time *</label>
                  <input
                    type="time"
                    required
                    value={newTaskEndTime}
                    onChange={(e) => setNewTaskEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Notes, clinic room number, or special instructions..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:border-purple-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTask}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 cursor-pointer disabled:opacity-50"
                >
                  {creatingTask ? "Saving..." : "Add to Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DOCTOR LIVE AVAILABILITY ADJUST MODAL & ON-LOGIN PROMPT                */}
      {/* ========================================================================= */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 p-6 text-white relative">
              <button
                onClick={() => {
                  setShowAvailabilityModal(false);
                  setIsInitialLoginPrompt(false);
                }}
                className="absolute top-5 right-5 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  isAvailable 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" 
                    : "bg-purple-500/20 text-purple-200 border-purple-400/30"
                }`}>
                  {isInitialLoginPrompt ? "Doctor Login Check" : "Live Availability Control"}
                </span>
              </div>

              <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-400" />
                {isInitialLoginPrompt ? `Welcome, ${doctorName}!` : "Adjust Consultation Hours"}
              </h3>
              <p className="text-xs text-purple-200/80 mt-1 leading-relaxed">
                {isInitialLoginPrompt 
                  ? "Are you currently accepting patient appointments today? Adjust until what time you will be available for queue tokens."
                  : "Set or adjust your active window. Patients on the mobile app can only book queue numbers while you are live."}
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              
              {/* Online / Offline Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Consultation Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAvailable(true)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      isAvailable
                        ? "bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm ring-2 ring-emerald-500/30"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${isAvailable ? "bg-emerald-500 text-white shadow-xs" : "bg-slate-200 text-slate-500"}`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold leading-tight">Accept Patients</div>
                      <div className="text-[10px] opacity-75">Online & Live</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAvailable(false)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                      !isAvailable
                        ? "bg-rose-50 border-rose-300 text-rose-950 shadow-sm ring-2 ring-rose-500/30"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${!isAvailable ? "bg-rose-500 text-white shadow-xs" : "bg-slate-200 text-slate-500"}`}>
                      <Power className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold leading-tight">Remain Offline</div>
                      <div className="text-[10px] opacity-75">Pause Bookings</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Working Window / Available Until (if Online is chosen) */}
              {isAvailable && (
                <div className="space-y-3 bg-purple-50/50 p-4 rounded-2xl border border-purple-100 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      Available Until (Consultation End Time):
                    </label>
                    <span className="text-xs font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg font-mono">
                      {availableUntilTime}
                    </span>
                  </div>

                  {/* 1-Click Quick Time Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Quick Adjust Presets:
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setAvailableUntilTime(getOffsetTime(1, 0))}
                        className="py-1.5 px-2 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-700 hover:text-purple-700 transition-all cursor-pointer"
                      >
                        +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvailableUntilTime(getOffsetTime(2, 0))}
                        className="py-1.5 px-2 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-700 hover:text-purple-700 transition-all cursor-pointer"
                      >
                        +2 Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvailableUntilTime(getOffsetTime(3, 0))}
                        className="py-1.5 px-2 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-700 hover:text-purple-700 transition-all cursor-pointer"
                      >
                        +3 Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvailableUntilTime("13:00")}
                        className="py-1.5 px-2 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-700 hover:text-purple-700 transition-all cursor-pointer"
                      >
                        Until 1:00 PM
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvailableUntilTime("15:00")}
                        className="py-1.5 px-2 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-700 hover:text-purple-700 transition-all cursor-pointer"
                      >
                        Until 3:00 PM
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvailableUntilTime("17:00")}
                        className="py-1.5 px-2 bg-white hover:bg-purple-100 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-bold text-slate-700 hover:text-purple-700 transition-all cursor-pointer"
                      >
                        Until 5:00 PM
                      </button>
                    </div>
                  </div>

                  {/* Or Manual Custom Time */}
                  <div className="pt-2 border-t border-purple-100 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-600">Custom Time Picker:</span>
                    <input
                      type="time"
                      value={availableUntilTime}
                      onChange={(e) => setAvailableUntilTime(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-purple-600 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAvailabilityModal(false);
                    setIsInitialLoginPrompt(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingAvailability}
                  onClick={() => handleUpdateAvailability(isAvailable, availableUntilTime)}
                  className={`flex-1 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-md transition-all cursor-pointer disabled:opacity-50 ${
                    isAvailable
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/25"
                  }`}
                >
                  {savingAvailability 
                    ? "Updating..." 
                    : isAvailable 
                      ? "Save & Go Live" 
                      : "Confirm Offline"}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 mt-auto">
        <div className="max-w-[1700px] mx-auto px-6 flex justify-between items-center text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} MediTrack Clinical Decision Support System.</span>
          <span>Doctor Diagnostic & Patient Prescription History Console.</span>
        </div>
      </footer>

    </div>
  );
}
