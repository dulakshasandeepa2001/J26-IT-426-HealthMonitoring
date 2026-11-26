"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest, logoutUser } from "@/lib/api";
import { 
  User, 
  Clock, 
  Calendar, 
  Pill, 
  AlertCircle, 
  CheckCircle2, 
  Radio, 
  Activity, 
  Search, 
  Stethoscope, 
  LogOut, 
  Sparkles, 
  HeartPulse, 
  ShieldAlert, 
  Building2, 
  Award, 
  ArrowRight, 
  ChevronRight, 
  Check, 
  PhoneCall, 
  Info,
  Layers,
  Thermometer,
  ShieldCheck,
  TrendingUp,
  FileText,
  RefreshCw,
  X,
  Ticket,
  ClipboardList
} from "lucide-react";

interface Doctor {
  doctor_id: string;
  register_id: string;
  doctor_nicnumber: string;
  doctors_name: string;
  dob: string;
  degrees: string;
  university: string;
  working_hospital: string;
}

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
  is_completed: boolean;
}

interface MedicationDose {
  id: string;
  timeSlot: "Morning" | "Afternoon" | "Evening" | "Night";
  timeString: string;
  medicine: string;
  dosage: string;
  mealInstruction: string;
  taken: boolean;
  prescribedBy: string;
}

const DEFAULT_DOCTORS: Doctor[] = [
  {
    doctor_id: "DOC-0001",
    register_id: "SLMC-34901",
    doctor_nicnumber: "198512345678",
    doctors_name: "Dr. Nimal Silva",
    dob: "1985-05-12",
    degrees: "MBBS, MD (Cardiology)",
    university: "University of Colombo",
    working_hospital: "National Hospital of Sri Lanka"
  },
  {
    doctor_id: "DOC-0002",
    register_id: "SLMC-28419",
    doctor_nicnumber: "199087654321",
    doctors_name: "Dr. Priyantha Perera",
    dob: "1990-09-20",
    degrees: "MBBS, MD (General Medicine)",
    university: "University of Peradeniya",
    working_hospital: "Colombo South Teaching Hospital"
  },
  {
    doctor_id: "DOC-0003",
    register_id: "SLMC-41002",
    doctor_nicnumber: "198823456789",
    doctors_name: "Dr. Anusha Senaratne",
    dob: "1988-11-04",
    degrees: "MBBS, DCH (Pediatrics)",
    university: "University of Sri Jayewardenepura",
    working_hospital: "Lady Ridgeway Hospital"
  }
];

export default function PatientDashboard() {
  const router = useRouter();
  const [userSession, setUserSession] = useState<{ username: string; role: string; doctorID: string } | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>(DEFAULT_DOCTORS);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Availability Checker State
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(DEFAULT_DOCTORS[0]);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [doctorTasks, setDoctorTasks] = useState<Task[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  // Live Queue Token State (Dan yana appointment number eka)
  const [hasLiveAppointment, setHasLiveAppointment] = useState(false);
  const [liveAppointment, setLiveAppointment] = useState<{
    id: number;
    my_token: string;
    my_token_number: number;
    doctor_name: string;
    doctor_id: string;
    hospital_name: string;
    appointment_date: string;
    session_start_time: string;
    current_serving_token: string;
    patients_ahead: number;
    estimated_wait_minutes: number;
    status: string;
    estimated_time: string;
  } | null>(null);
  const [myToken, setMyToken] = useState("#01");
  const [currentServingToken, setCurrentServingToken] = useState("#01");
  const [patientsAhead, setPatientsAhead] = useState(0);
  const [estimatedWaitMinutes, setEstimatedWaitMinutes] = useState(10);
  const [queueLoading, setQueueLoading] = useState(false);
  const [cancellingAppointment, setCancellingAppointment] = useState(false);

  // Booking Flow State
  const [bookingReason, setBookingReason] = useState("");
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingSuccessModal, setBookingSuccessModal] = useState<any>(null);

  // Patient Appointments List Modal State
  const [showAppointmentsModal, setShowAppointmentsModal] = useState(false);
  const [patientAppointmentsList, setPatientAppointmentsList] = useState<any[]>([]);
  const [loadingAppointmentsList, setLoadingAppointmentsList] = useState(false);

  // Daily Medication / Pill Adherence Schedule State (Bonna beth schedule)
  const [medications, setMedications] = useState<MedicationDose[]>([
    {
      id: "med-1",
      timeSlot: "Morning",
      timeString: "08:00 AM",
      medicine: "Metformin 500mg",
      dosage: "1 Tablet",
      mealInstruction: "After breakfast",
      taken: true,
      prescribedBy: "Dr. Nimal Silva"
    },
    {
      id: "med-2",
      timeSlot: "Morning",
      timeString: "08:30 AM",
      medicine: "Paracetamol 500mg",
      dosage: "2 Tablets",
      mealInstruction: "After food",
      taken: true,
      prescribedBy: "Dr. Priyantha Perera"
    },
    {
      id: "med-3",
      timeSlot: "Afternoon",
      timeString: "01:30 PM",
      medicine: "Amoxicillin 250mg",
      dosage: "1 Capsule",
      mealInstruction: "After lunch",
      taken: true,
      prescribedBy: "Dr. Priyantha Perera"
    },
    {
      id: "med-4",
      timeSlot: "Evening",
      timeString: "06:30 PM",
      medicine: "Vitamin C 500mg",
      dosage: "1 Chewable Tab",
      mealInstruction: "With water",
      taken: false,
      prescribedBy: "Dr. Nimal Silva"
    },
    {
      id: "med-5",
      timeSlot: "Night",
      timeString: "09:30 PM",
      medicine: "Montelukast 10mg",
      dosage: "1 Tablet",
      mealInstruction: "Before bedtime",
      taken: false,
      prescribedBy: "Dr. Anusha Senaratne"
    }
  ]);

  // Toggle Medication Dose Checkbox
  const toggleDose = (id: string) => {
    setMedications((prev) =>
      prev.map((med) => (med.id === id ? { ...med, taken: !med.taken } : med))
    );
  };

  const completedDoses = medications.filter((m) => m.taken).length;
  const adherenceRate = Math.round((completedDoses / medications.length) * 100);

  // Initialize Session
  useEffect(() => {
    const storedUser = localStorage.getItem("meditrack_user");
    if (!storedUser) {
      router.push("/login");
      return;
    }
    
    try {
      const parsed = JSON.parse(storedUser);
      setUserSession(parsed);
      
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localToday = new Date(today.getTime() - (offset * 60 * 1000));
      setAvailabilityDate(localToday.toISOString().split("T")[0]);
    } catch {
      localStorage.removeItem("meditrack_user");
      router.push("/login");
    }
  }, [router]);

  // Load registered doctors from backend API
  useEffect(() => {
    async function loadDoctors() {
      try {
        const data = await apiRequest("/get-doctor/");
        if (data.doctors && data.doctors.length > 0) {
          setDoctors(data.doctors);
          setSelectedDoctor(data.doctors[0]);
        }
      } catch (err) {
        console.warn("Backend doctors not reachable, using verified fallback list:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDoctors();
  }, []);

  // Fetch doctor availability tasks
  const checkDoctorAvailability = async () => {
    if (!selectedDoctor || !availabilityDate) return;

    setCheckingAvailability(true);
    setAvailabilityError("");
    try {
      const data = await apiRequest("/get-tasks/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: selectedDoctor.doctor_id,
          task_date: availabilityDate
        })
      });
      setDoctorTasks(data.tasks || []);
    } catch (err: any) {
      setAvailabilityError(err.message || "Could not retrieve doctor's schedule.");
      setDoctorTasks([]);
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Fetch live queue status for the logged-in patient
  const fetchLiveQueue = async () => {
    const username = userSession?.username;
    if (!username) return;
    setQueueLoading(true);
    try {
      const data = await apiRequest(`/api/appointments/my-queue/?username=${encodeURIComponent(username)}`);
      if (data && data.has_appointment && data.appointment) {
        setHasLiveAppointment(true);
        setLiveAppointment(data.appointment);
        setMyToken(data.appointment.my_token || "#01");
        setCurrentServingToken(data.appointment.current_serving_token || "#01");
        setPatientsAhead(data.appointment.patients_ahead ?? 0);
        setEstimatedWaitMinutes(data.appointment.estimated_wait_minutes ?? 10);
      } else {
        setHasLiveAppointment(false);
        setLiveAppointment(null);
      }
    } catch (e) {
      console.warn("Could not fetch patient live queue:", e);
    } finally {
      setQueueLoading(false);
    }
  };

  // Fetch patient appointments history
  const fetchPatientAppointments = async () => {
    const username = userSession?.username;
    if (!username) return;
    setLoadingAppointmentsList(true);
    try {
      const data = await apiRequest(`/api/patient/my-appointments/?username=${encodeURIComponent(username)}`);
      if (data && data.appointments) {
        setPatientAppointmentsList(data.appointments);
      }
    } catch (e) {
      console.warn("Could not fetch appointment history:", e);
    } finally {
      setLoadingAppointmentsList(false);
    }
  };

  // Poll live queue periodically
  useEffect(() => {
    if (userSession?.username) {
      fetchLiveQueue();
      fetchPatientAppointments();
      const interval = setInterval(() => {
        fetchLiveQueue();
      }, 12000);
      return () => clearInterval(interval);
    }
  }, [userSession]);

  // Handle Book Queue Token
  const handleBookToken = async (doc: Doctor, customDate?: string) => {
    if (!userSession) {
      alert("Please log in to book an appointment token.");
      return;
    }
    setSubmittingBooking(true);
    const targetDate = customDate || availabilityDate || new Date().toISOString().split("T")[0];
    try {
      const data = await apiRequest("/api/appointments/book/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doc.doctor_id,
          doctor_name: doc.doctors_name,
          hospital_name: doc.working_hospital,
          appointment_date: targetDate,
          username: userSession.username,
          patient_username: userSession.username,
          reason: bookingReason || "Routine Medical Checkup",
        }),
      });

      if (data && data.appointment) {
        setBookingReason("");
        setBookingSuccessModal(data.appointment);
        await fetchLiveQueue();
        await fetchPatientAppointments();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to book appointment token.";
      alert("Booking Notice: " + msg);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Handle Cancel Appointment
  const handleCancelAppointment = async (apptId: number) => {
    if (!confirm("Are you sure you want to cancel this appointment token?")) return;
    setCancellingAppointment(true);
    try {
      await apiRequest("/api/appointments/cancel/", {
        method: "POST",
        body: JSON.stringify({ appointment_id: apptId }),
      });
      alert("Your appointment token has been cancelled.");
      await fetchLiveQueue();
      await fetchPatientAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel appointment.";
      alert("Error: " + msg);
    } finally {
      setCancellingAppointment(false);
    }
  };

  useEffect(() => {
    if (selectedDoctor && availabilityDate) {
      checkDoctorAvailability();
    }
  }, [selectedDoctor, availabilityDate]);

  const handleLogout = async () => {
    try {
      await logoutUser();
      router.push("/login");
    } catch {
      window.alert("Logout failed. Please try again.");
    }
  };

  const filteredDoctors = doctors.filter((doc) =>
    (doc.doctors_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (doc.degrees || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (doc.working_hospital || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* ========================================================================= */}
      {/* 1. TOP NAVBAR                                                             */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between shadow-sm">
        
        {/* Brand */}
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
                Patient Portal
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Healthcare Identity, Daily Schedule & Epidemic Radar</p>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          
          <button
            onClick={() => {
              fetchPatientAppointments();
              setShowAppointmentsModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-all cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5 text-purple-600" />
            <span>My Appointments</span>
          </button>

          <Link
            href="/patient/symptom-checker"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 text-xs font-bold transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>AI Symptom Triage</span>
          </Link>

          {/* User Welcome Pill */}
          <div className="flex items-center gap-2.5 bg-slate-100 border border-slate-200 py-1.5 px-3 rounded-2xl">
            <div className="w-7 h-7 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
              {userSession?.username?.charAt(0).toUpperCase() || "P"}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-xs font-bold text-slate-900 leading-tight">
                {userSession?.username || "Dulaksha Sandeepa"}
              </span>
              <span className="text-[10px] text-slate-500 block">ID: PAT-2026-088</span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Log Out</span>
          </button>

        </div>

      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN DASHBOARD CONTENT                                                 */}
      {/* ========================================================================= */}
      <main className="flex-grow max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* ----------------------------------------------------------------------- */}
        {/* ROW 1: Patient Health Pass + Live Queue / Appointment Status Card       */}
        {/* ----------------------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left: Patient Profile & Health Identity Card (5 / 12) */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between space-y-4">
            
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Patient Health Identity</span>
                <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                  SL-HEALTH-PASS
                </span>
              </div>

              <div className="flex items-center gap-4 mt-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-md shadow-purple-600/20">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {userSession?.username || "Dulaksha Sandeepa"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                    <span><strong>Age:</strong> 24 Yrs</span>
                    <span>&bull;</span>
                    <span><strong>Gender:</strong> Male</span>
                    <span>&bull;</span>
                    <span><strong>Blood:</strong> <strong className="text-purple-700 font-bold">O+</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Health Highlights & Documented Allergies */}
            <div className="space-y-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-600 uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    Documented Drug Allergies
                  </span>
                  <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.2 rounded-full border border-rose-200">
                    Active Alert
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-lg border border-rose-200">
                    Penicillin
                  </span>
                  <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-lg border border-rose-200">
                    Aspirin
                  </span>
                  <span className="text-[11px] text-slate-400 self-center">Strictly cross-screened in all prescriptions</span>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>Emergency Contact: <strong>+94 77 123 4567 (Father)</strong></span>
                <span className="text-purple-700 font-semibold cursor-pointer hover:underline">Update Vitals</span>
              </div>
            </div>

          </div>

          {/* Right: Live Queue / Appointment Status Card ("Dan yana appointment number eka") (7 / 12) */}
          <div className="lg:col-span-7 bg-gradient-to-br from-purple-700 via-indigo-700 to-purple-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-purple-900/15 flex flex-col justify-between relative overflow-hidden">
            
            {/* Background glow decoration */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                    Live Clinic Queue Status
                  </span>
                  <button
                    onClick={() => fetchLiveQueue()}
                    disabled={queueLoading}
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all ml-1 cursor-pointer"
                    title="Refresh Live Queue"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${queueLoading ? "animate-spin text-purple-300" : ""}`} />
                  </button>
                </div>
                {hasLiveAppointment ? (
                  liveAppointment?.status === "serving" ? (
                    <span className="text-[11px] bg-emerald-400 text-emerald-950 px-3 py-1 rounded-full font-black animate-pulse flex items-center gap-1 shadow-md">
                      <Radio className="w-3.5 h-3.5" /> Calling Token {myToken}!
                    </span>
                  ) : liveAppointment?.status === "completed" ? (
                    <span className="text-[11px] bg-white/20 text-white px-3 py-1 rounded-full font-bold backdrop-blur-md">
                      Consultation Completed
                    </span>
                  ) : (
                    <span className="text-[11px] bg-white/15 px-3 py-1 rounded-full font-bold backdrop-blur-md">
                      Queue Position Confirmed
                    </span>
                  )
                ) : (
                  <span className="text-[11px] bg-white/10 text-purple-200 px-3 py-1 rounded-full font-medium backdrop-blur-md">
                    No Active Queue Token
                  </span>
                )}
              </div>

              {/* Turn Announcement Banner */}
              {hasLiveAppointment && liveAppointment?.status === "serving" && (
                <div className="mt-4 p-3.5 bg-emerald-400 text-emerald-950 font-black rounded-2xl text-xs flex items-center justify-between shadow-lg animate-pulse">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 animate-ping shrink-0" />
                    <span>YOUR TURN NOW! The doctor is currently serving your token ({myToken}). Please enter the room!</span>
                  </div>
                </div>
              )}

              {/* Main Token Display Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-6 text-center sm:text-left">
                
                {/* YOUR TOKEN */}
                <div className="bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-2xl">
                  <span className="text-xs text-purple-200 font-bold uppercase tracking-wider block mb-1">
                    Your Assigned Token
                  </span>
                  <div className="text-4xl font-black text-white">
                    {hasLiveAppointment ? myToken : "#--"}
                  </div>
                  <span className="text-[11px] text-emerald-300 font-bold mt-1 inline-block">
                    {hasLiveAppointment 
                      ? (liveAppointment?.status === "serving" ? "In Room Right Now" : `Turn in ~${estimatedWaitMinutes}m`)
                      : "No token booked yet"}
                  </span>
                </div>

                {/* CURRENTLY SERVING (Dan yana appointment number eka) */}
                <div className="bg-white/15 backdrop-blur-md border border-white/20 p-4 rounded-2xl relative shadow-lg">
                  <span className="text-xs text-amber-300 font-bold uppercase tracking-wider block mb-1 flex items-center justify-center sm:justify-start gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    Now Calling / Serving
                  </span>
                  <div className="text-4xl font-black text-amber-300">{currentServingToken}</div>
                  <span className="text-[11px] text-purple-200 mt-1 inline-block">
                    {hasLiveAppointment
                      ? `${patientsAhead} patients ahead of you`
                      : "Live clinic consultation stream"}
                  </span>
                </div>

                {/* ESTIMATED WAIT TIME */}
                <div className="bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-2xl">
                  <span className="text-xs text-purple-200 font-bold uppercase tracking-wider block mb-1">
                    Est. Wait Time
                  </span>
                  <div className="text-4xl font-black text-white">
                    {hasLiveAppointment ? estimatedWaitMinutes : 0} <span className="text-lg font-bold">Mins</span>
                  </div>
                  <span className="text-[11px] text-purple-200 mt-1 inline-block">
                    {hasLiveAppointment ? "Average ~8 min/patient" : "Slots currently open"}
                  </span>
                </div>

              </div>
            </div>

            {/* Doctor & Room Info Bar */}
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              {hasLiveAppointment && liveAppointment ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                      <Stethoscope className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="font-bold block text-white">{liveAppointment.doctor_name}</span>
                      <span className="text-purple-200 text-[11px]">
                        {liveAppointment.hospital_name} &bull; {liveAppointment.appointment_date}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCancelAppointment(liveAppointment.id)}
                      disabled={cancellingAppointment}
                      className="px-3 py-2 rounded-xl bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 font-bold border border-rose-400/40 transition-all cursor-pointer"
                    >
                      {cancellingAppointment ? "Cancelling..." : "Cancel Token"}
                    </button>
                    <button 
                      onClick={() => alert(`Digital Queue Pass:\nToken: ${myToken}\nDoctor: ${liveAppointment.doctor_name}\nHospital: ${liveAppointment.hospital_name}\nDate: ${liveAppointment.appointment_date}\nStatus: ${liveAppointment.status}`)}
                      className="px-4 py-2 rounded-xl bg-white text-purple-900 font-extrabold hover:bg-purple-50 transition-all shadow-md cursor-pointer"
                    >
                      View Digital Pass &rarr;
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                      <Stethoscope className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="font-bold block text-white">General Outpatient Clinic</span>
                      <span className="text-purple-200 text-[11px]">Select a doctor below to book your queue token</span>
                    </div>
                  </div>

                  <a 
                    href="#doctors-directory"
                    className="px-4 py-2 rounded-xl bg-white text-purple-900 font-extrabold hover:bg-purple-50 transition-all shadow-md inline-block"
                  >
                    Book Next Token &darr;
                  </a>
                </>
              )}
            </div>

          </div>

        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* ROW 2: Daily Medication Schedule ("Bonna Beth Schedule") + Outbreak Radar*/}
        {/* ----------------------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left: Medication Schedule (Bonna beth schedule) (7 / 12) */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Daily Medication Schedule
                  </h3>
                  <p className="text-[11px] text-slate-500">Track and confirm your daily prescribed doses</p>
                </div>
              </div>

              {/* Adherence Rate Badge */}
              <div className="text-right">
                <span className="text-xs font-black text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                  {adherenceRate}% Adherence
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{completedDoses} of {medications.length} Doses Taken</span>
              </div>
            </div>

            {/* Adherence Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-600 to-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${adherenceRate}%` }}
              />
            </div>

            {/* Medication Cards List */}
            <div className="space-y-2.5 pt-2">
              {medications.map((med) => (
                <div
                  key={med.id}
                  onClick={() => toggleDose(med.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    med.taken
                      ? "bg-emerald-50/60 border-emerald-200/80"
                      : "bg-slate-50/80 hover:bg-slate-100/80 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {/* Checkbox Button */}
                    <div
                      className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all ${
                        med.taken
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "border-2 border-slate-300 bg-white"
                      }`}
                    >
                      {med.taken && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${med.taken ? "line-through text-slate-400" : "text-slate-900"}`}>
                          {med.medicine}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-purple-100 text-purple-700">
                          {med.dosage}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {med.mealInstruction} &bull; <strong className="text-slate-700">{med.timeSlot} ({med.timeString})</strong>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        med.taken
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800 animate-pulse"
                      }`}
                    >
                      {med.taken ? "Completed" : "Due Soon"}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1">{med.prescribedBy}</span>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Right: Viral Disaster & Outbreak Radar (Viral disease outbreak) (5 / 12) */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                    <Radio className="w-4 h-4 animate-pulse text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                      Regional Viral Outbreak Radar
                    </h3>
                    <p className="text-[11px] text-slate-500">Epidemic surveillance & district threat levels</p>
                  </div>
                </div>

                <Link
                  href="/doctor/outbreak-radar"
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-0.5"
                >
                  <span>Radar Map</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* District Outbreak Status Badges */}
              <div className="space-y-2.5">
                
                {/* Colombo Alert */}
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                      Colombo District
                    </span>
                    <span className="text-[10px] font-black uppercase bg-rose-600 text-white px-2 py-0.5 rounded-full">
                      High Spike
                    </span>
                  </div>
                  <p className="text-xs text-rose-800 leading-snug">
                    <strong>Influenza A & Dengue Serotype 2:</strong> 342 localized cases detected in the past 7 days.
                  </p>
                  <span className="text-[10px] text-rose-600 font-semibold block pt-0.5">
                    Safety: Wear masks in crowded clinic rooms and clear rain water containers.
                  </span>
                </div>

                {/* Gampaha Alert */}
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                      Gampaha District
                    </span>
                    <span className="text-[10px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                      Moderate
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 leading-snug">
                    Seasonal viral pharyngitis cases rising (+18% week-over-week).
                  </p>
                </div>

                {/* Kandy Status */}
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Kandy District
                  </span>
                  <span className="text-emerald-700 font-semibold text-[11px]">Normal Baseline (Low Risk)</span>
                </div>

              </div>
            </div>

            {/* Quick Proximity Tip */}
            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Your current registered location has active surveillance enabled via H3 spatial density mapping.</span>
            </div>

          </div>

        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* ROW 3: Find Verified Medical Consultants & Real-time Schedule Checker   */}
        {/* ----------------------------------------------------------------------- */}
        <div id="doctors-directory" className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-purple-600" />
                <span>Find Registered Medical Consultants & Availability</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Check doctor consultation schedules, degrees, hospital affiliations, and book queue slots
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search doctor, hospital, degree..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          {/* Doctors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredDoctors.map((doc) => {
              const isSelected = selectedDoctor?.doctor_id === doc.doctor_id;

              return (
                <div
                  key={doc.doctor_id}
                  onClick={() => setSelectedDoctor(doc)}
                  className={`p-5 rounded-2xl border text-left cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? "bg-purple-50/70 border-purple-400 shadow-md shadow-purple-600/10"
                      : "bg-slate-50/60 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="w-9 h-9 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
                        DR
                      </div>
                      <span className="text-[10px] bg-white border border-slate-200 text-purple-700 font-mono font-bold px-2 py-0.5 rounded-full">
                        {doc.register_id}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm">{doc.doctors_name}</h4>
                    <p className="text-xs text-purple-700 font-semibold mt-0.5">{doc.degrees}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{doc.working_hospital}</p>
                  </div>

                  <button
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? "bg-purple-600 text-white shadow-sm"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {isSelected ? "Selected for Availability" : "Check Schedule"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Schedule Calendar Viewer for Selected Doctor */}
          {selectedDoctor && (
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Check Active Sessions for {selectedDoctor.doctors_name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Date:</label>
                  <input
                    type="date"
                    value={availabilityDate}
                    onChange={(e) => setAvailabilityDate(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:border-purple-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Task Availability Timeline */}
              {checkingAvailability ? (
                <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Checking doctor sessions...</span>
                </div>
              ) : doctorTasks.length === 0 ? (
                <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Doctor is fully available on <strong>{availabilityDate}</strong>. General consultation slots are open.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {doctorTasks.map((t) => (
                    <div key={t.task_id} className="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block">{t.task_title}</span>
                        <span className="text-[10px] text-slate-400 capitalize">{t.task_type}</span>
                      </div>
                      <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200">
                        {t.start_time.slice(0, 5)} - {t.end_time.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Quick Book Queue Token for Selected Doctor */}
              <div className="p-4 bg-white rounded-2xl border border-purple-200 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-purple-600" />
                    <span>Book Queue Token with {selectedDoctor.doctors_name}</span>
                  </span>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 self-start sm:self-auto">
                    Session Date: {availabilityDate}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    placeholder="Chief Complaint / Reason for visit (e.g. High fever, cough, diabetes review)..."
                    value={bookingReason}
                    onChange={(e) => setBookingReason(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600"
                  />
                  <button
                    onClick={() => handleBookToken(selectedDoctor, availabilityDate)}
                    disabled={submittingBooking}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Ticket className="w-4 h-4" />
                    <span>{submittingBooking ? "Issuing Token..." : "Confirm & Book Token"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </main>

      {/* Booking Success Confirmation Modal */}
      {bookingSuccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">Queue Token Confirmed!</h3>
              <p className="text-xs text-slate-500 mt-1">Your appointment has been recorded in the clinic database.</p>
            </div>

            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 text-left space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-semibold">Assigned Token:</span>
                <span className="text-2xl font-black text-purple-700">{bookingSuccessModal.token_label}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-700">
                <span className="font-semibold text-slate-500">Doctor:</span>
                <span className="font-bold">{bookingSuccessModal.doctor_name}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-700">
                <span className="font-semibold text-slate-500">Hospital:</span>
                <span>{bookingSuccessModal.hospital_name}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-700">
                <span className="font-semibold text-slate-500">Date:</span>
                <span>{bookingSuccessModal.appointment_date}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-700">
                <span className="font-semibold text-slate-500">Est. Wait:</span>
                <span className="font-bold text-emerald-600">~{bookingSuccessModal.estimated_wait_minutes ?? 10} Mins</span>
              </div>
            </div>

            <button
              onClick={() => {
                setBookingSuccessModal(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/25 transition-all cursor-pointer"
            >
              View in Live Queue Card &rarr;
            </button>
          </div>
        </div>
      )}

      {/* My Appointments History Modal */}
      {showAppointmentsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">My Consultation Appointments</h3>
                  <p className="text-[11px] text-slate-500">Active tokens and past history for {userSession?.username}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAppointmentsModal(false)}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingAppointmentsList ? (
                <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading appointments...</span>
                </div>
              ) : patientAppointmentsList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                  <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700">No appointments found</p>
                  <p className="text-[11px] text-slate-400">You haven't booked any doctor appointments yet.</p>
                </div>
              ) : (
                patientAppointmentsList.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black px-3 py-1.5 rounded-xl bg-purple-600 text-white shadow-xs">
                        {appt.token_label}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 leading-snug">{appt.doctor_name}</h4>
                        <p className="text-[11px] text-slate-500">{appt.hospital_name} &bull; {appt.appointment_date}</p>
                        {appt.reason && (
                          <p className="text-[11px] text-purple-700 font-medium mt-0.5">{appt.reason}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        appt.status === "serving"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse"
                          : appt.status === "completed"
                            ? "bg-slate-200 text-slate-700"
                            : appt.status === "cancelled"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-purple-100 text-purple-800"
                      }`}>
                        {appt.status}
                      </span>

                      {appt.status === "booked" && (
                        <button
                          onClick={() => handleCancelAppointment(appt.id)}
                          disabled={cancellingAppointment}
                          className="px-2.5 py-1 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} MediTrack Patient Health Console.</span>
          <span>Emergency Medical Assistance Hotline: 1990 (Suwa Seriya).</span>
        </div>
      </footer>

    </div>
  );
}
