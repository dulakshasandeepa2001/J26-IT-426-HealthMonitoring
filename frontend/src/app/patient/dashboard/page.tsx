"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { 
  Search, 
  Clock, 
  Award, 
  Stethoscope, 
  LogOut, 
  User, 
  ShieldAlert, 
  Info,
  CalendarCheck,
  Building2,
  Plus,
  ArrowRight
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

export default function PatientDashboard() {
  const router = useRouter();
  const [userSession, setUserSession] = useState<{ username: string; role: string; doctorID: string } | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Availability Checker State
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [doctorTasks, setDoctorTasks] = useState<Task[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("meditrack_user");
    if (!storedUser) {
      router.push("/login");
      return;
    }
    
    try {
      const parsed = JSON.parse(storedUser);
      setUserSession(parsed);
      
      // Set default date to today for availability check
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localToday = new Date(today.getTime() - (offset * 60 * 1000));
      setAvailabilityDate(localToday.toISOString().split("T")[0]);
    } catch {
      localStorage.removeItem("meditrack_user");
      router.push("/login");
    }
  }, [router]);

  // Load all doctors
  useEffect(() => {
    async function loadDoctors() {
      try {
        const data = await apiRequest("/get-doctor/");
        setDoctors(data.doctors || []);
      } catch (err) {
        console.error("Failed to load doctor registry:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDoctors();
  }, []);

  // Fetch doctor's tasks when selected doctor or date changes
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAvailabilityError(err.message || "Could not retrieve doctor's schedule.");
      } else {
        setAvailabilityError("Could not retrieve doctor's schedule.");
      }
      setDoctorTasks([]);
    } finally {
      setCheckingAvailability(false);
    }
  };

  useEffect(() => {
    checkDoctorAvailability();
  }, [selectedDoctor, availabilityDate]);

  const handleLogout = () => {
    localStorage.removeItem("meditrack_user");
    router.push("/");
  };

  const filteredDoctors = doctors.filter((doc) =>
    doc.doctors_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.degrees.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.working_hospital.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600">Loading Patient Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/70 via-slate-50 to-white text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Header Dashboard Nav */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Plus className="w-6 h-6 stroke-[3]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-extrabold text-slate-900 tracking-tight">
                  MEDITRACK
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Patient Portal
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">Healthcare & Doctor Consultation System</p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Welcome, <strong className="text-slate-900">{userSession?.username}</strong></span>
            </div>

            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-xs font-bold text-rose-600 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns: Find & Check Doctor Schedule */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Doctor Finder Search Card */}
          <div className="p-6 sm:p-8 bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-blue-600/5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <span>Search Medical Consultants</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">Find specialist doctors registered in our clinical network</p>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Name, degree, or hospital..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                />
              </div>
            </div>

            {filteredDoctors.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-200/60">
                <Search className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-500">No doctors match your search query</p>
                <p className="text-[11px] text-slate-400 mt-1">Try searching by hospital, degree, or doctor name</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredDoctors.map((doc) => {
                  const isSelected = selectedDoctor?.doctor_id === doc.doctor_id;
                  return (
                    <div
                      key={doc.doctor_id}
                      onClick={() => setSelectedDoctor(doc)}
                      className={`p-5 rounded-2xl border text-left cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                        isSelected
                          ? "bg-blue-50/60 border-blue-500 shadow-md shadow-blue-500/10"
                          : "bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-md"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-extrabold text-slate-900 text-sm">{doc.doctors_name}</h3>
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                            {doc.doctor_id}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-blue-600">{doc.degrees}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{doc.working_hospital}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{doc.university}</span>
                        </div>
                      </div>

                      <button
                        className={`mt-4 w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                            : "bg-slate-100 text-slate-700 hover:bg-blue-600 hover:text-white"
                        }`}
                      >
                        <span>Check Schedule</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Schedule availability & Outbreaks */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Availability Card Panel */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-blue-600/5 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-blue-600" />
              <span>Availability Checker</span>
            </h2>

            {selectedDoctor ? (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200/80">
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Consultant Selected</div>
                  <div className="font-extrabold text-slate-900 text-base mt-0.5">{selectedDoctor.doctors_name}</div>
                  <div className="text-xs text-slate-600 font-medium mt-0.5">{selectedDoctor.working_hospital}</div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Check Schedule Date</label>
                  <input
                    type="date"
                    value={availabilityDate}
                    onChange={(e) => setAvailabilityDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-all font-semibold"
                  />
                </div>

                {/* Queue status */}
                <div className="pt-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Doctor Scheduled Times</div>
                  
                  {checkingAvailability ? (
                    <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Checking queue schedule...</span>
                    </div>
                  ) : availabilityError ? (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium">
                      {availabilityError}
                    </div>
                  ) : doctorTasks.length === 0 ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-medium flex items-center gap-2">
                      <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Doctor is fully available on this date. No busy times scheduled.</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {doctorTasks.map((t) => (
                        <div key={t.task_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-slate-900">{t.task_title}</div>
                            <div className="text-[10px] text-slate-500 capitalize mt-0.5">{t.task_type}</div>
                          </div>
                          <div className="text-slate-600 font-mono text-[11px] flex items-center gap-1 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>{t.start_time.slice(0,5)} - {t.end_time.slice(0,5)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-200/60 p-4">
                <Info className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-medium">Select a doctor from the registry list to verify their availability calendar.</p>
              </div>
            )}
          </div>

          {/* Health Alerts Card */}
          <div className="p-6 bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-blue-600/5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Public Health Advisory Alerts</span>
            </h2>

            <div className="space-y-3">
              <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs">
                <div className="font-bold text-rose-900 mb-1">Colombo Influenza Spike</div>
                <p className="text-rose-700 text-[11px] leading-relaxed font-normal">High density regions showing flu reports. Avoid crowds where applicable.</p>
              </div>
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs">
                <div className="font-bold text-amber-900 mb-1">Dengue Prevention Notice</div>
                <p className="text-amber-700 text-[11px] leading-relaxed font-normal">Check water stagnation zones near residence compounds.</p>
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center text-xs text-slate-500 font-medium">
          <span>&copy; {new Date().getFullYear()} MediTrack Hospital.</span>
          <span>Patient Portal Account Console</span>
        </div>
      </footer>
    </div>
  );
}
