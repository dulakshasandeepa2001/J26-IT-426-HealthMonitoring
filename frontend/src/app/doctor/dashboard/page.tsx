"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { 
  Calendar, 
  Clock, 
  Trash2, 
  Plus, 
  LogOut, 
  User, 
  Building, 
  Award, 
  Sparkles, 
  Activity,
  Mic,
  MicOff,
  Pill,
  Stethoscope,
  AlertCircle,
  CheckCircle2,
  FileText,
  HeartPulse,
  Send,
  Check,
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

interface PatientConsultation {
  id: string;
  name: string;
  patientId: string;
  age: number;
  gender: string;
  lastVisit: string;
  allergies: string[];
  bloodGroup: string;
  transcript: string;
  diagnoses: {
    title: string;
    match: number;
    description: string;
    tags: string[];
    matchType: "high" | "medium" | "low";
  }[];
  prescriptions: {
    name: string;
    date: string;
    dosage: string;
    indication: string;
  }[];
}

export default function DoctorDashboard() {
  const router = useRouter();
  const [userSession, setUserSession] = useState<{ username: string; role: string; doctorID: string } | null>(null);
  const [doctorInfo, setDoctorInfo] = useState<Doctor | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState("");
  
  // AI Voice Consultation State
  const [isListening, setIsListening] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<PatientConsultation | null>(null);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null);
  
  // Create Task Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskType, setTaskType] = useState("consultation");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [priority, setPriority] = useState("medium");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Initialize page, fetch session details
  useEffect(() => {
    const storedUser = localStorage.getItem("meditrack_user");
    if (!storedUser) {
      router.push("/login");
      return;
    }
    
    try {
      const parsed = JSON.parse(storedUser);
      if (parsed.role !== "doctor") {
        router.push("/patient/dashboard");
        return;
      }
      setUserSession(parsed);
      
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localToday = new Date(today.getTime() - (offset * 60 * 1000));
      setSelectedDate(localToday.toISOString().split("T")[0]);
    } catch {
      localStorage.removeItem("meditrack_user");
      router.push("/login");
    }
  }, [router]);

  // Fetch Doctor profile
  useEffect(() => {
    if (!userSession) return;
    
    async function loadDoctorProfile() {
      try {
        const data = await apiRequest("/get-doctor/");
        const matchedDoctor = data.doctors?.find(
          (d: Doctor) => d.doctor_id === userSession?.doctorID
        );
        if (matchedDoctor) {
          setDoctorInfo(matchedDoctor);
        } else {
          setDoctorInfo({
            doctor_id: userSession?.doctorID || "DOC-DEV",
            doctors_name: userSession?.username || "Doctor",
            working_hospital: "MediTrack General Hospital",
            degrees: "MBBS, MD",
            university: "Colombo Medical Faculty",
            register_id: "REG-DEFAULT",
            dob: "1980-01-01",
            doctor_nicnumber: "198000000000"
          });
        }
      } catch (err) {
        console.error("Failed to load doctor profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDoctorProfile();
  }, [userSession]);

  // Demo patient consultation when AI is activated
  useEffect(() => {
    if (isListening && !currentPatient) {
      setCurrentPatient({
        id: "P-1049",
        name: "Samantha Wickramasinghe",
        patientId: "MED-PT-8821",
        age: 34,
        gender: "Female",
        lastVisit: "12 Aug 2026",
        allergies: ["Penicillin", "Sulfa drugs"],
        bloodGroup: "O+",
        transcript: "Doctor, I have had a continuous dry cough for 4 days, slight tightness in chest, and fever reaching 101F yesterday evening...",
        diagnoses: [
          {
            title: "Acute Bronchitis",
            match: 94,
            description: "Inflammation of bronchial tubes typically presenting with dry/productive cough and retrosternal discomfort.",
            tags: ["Respiratory", "Viral"],
            matchType: "high"
          },
          {
            title: "Early Viral Pneumonitis",
            match: 78,
            description: "Mild pulmonary involvement, chest auscultation recommended.",
            tags: ["Pulmonary", "Infection"],
            matchType: "medium"
          }
        ],
        prescriptions: [
          {
            name: "Amoxicillin / Clavulanate (Contraindicated - Penicillin allergy)",
            date: "Avoid",
            dosage: "-",
            indication: "Allergy Alert"
          },
          {
            name: "Azithromycin 500mg",
            date: "10 Mar 2026",
            dosage: "OD x 3 days",
            indication: "Bacterial Infection"
          }
        ]
      });
    }
  }, [isListening, currentPatient]);

  // Fetch tasks
  const fetchDoctorTasks = async () => {
    if (!userSession || !selectedDate) return;
    
    setTasksLoading(true);
    setError("");
    try {
      const docId = userSession.doctorID || doctorInfo?.doctor_id || userSession.username || "DOC-DEV";
      const data = await apiRequest("/get-tasks/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: docId,
          task_date: selectedDate
        })
      });
      setTasks(data.tasks || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to load tasks list");
      } else {
        setError("Failed to load tasks list");
      }
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorTasks();
  }, [userSession, selectedDate]);

  const handleLogout = () => {
    localStorage.removeItem("meditrack_user");
    router.push("/");
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);

    if (!taskTitle || !startTime || !endTime) {
      setFormError("Task title, start time and end time are required.");
      setFormLoading(false);
      return;
    }

    try {
      const docId = userSession?.doctorID || doctorInfo?.doctor_id || userSession?.username || "DOC-DEV";
      await apiRequest("/create-task/", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: docId,
          task_date: selectedDate,
          task_title: taskTitle,
          task_description: taskDescription,
          task_type: taskType,
          start_time: startTime,
          end_time: endTime,
          priority: priority
        })
      });

      setTaskTitle("");
      setTaskDescription("");
      setTaskType("consultation");
      setStartTime("09:00");
      setEndTime("10:00");
      setPriority("medium");
      setShowAddModal(false);
      fetchDoctorTasks();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFormError(err.message || "Failed to create task.");
      } else {
        setFormError("Failed to create task.");
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("Are you sure you want to delete this scheduled task?")) return;
    
    try {
      await apiRequest(`/delete-task/${taskId}/`, {
        method: "DELETE"
      });
      fetchDoctorTasks();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || "Failed to delete task.");
      } else {
        alert("Failed to delete task.");
      }
    }
  };

  // Helper styles for Priority badges
  const getPriorityStyle = (p: string) => {
    switch (p.toLowerCase()) {
      case "urgent":
        return "bg-rose-100 text-rose-700 border border-rose-200";
      case "high":
        return "bg-amber-100 text-amber-700 border border-amber-200";
      case "medium":
        return "bg-blue-100 text-blue-700 border border-blue-200";
      default:
        return "bg-slate-100 text-slate-600 border border-slate-200";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600">Loading Doctor Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/70 via-slate-50 to-white text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Top Navigation Bar */}
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
                  Doctor Portal
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">Doctor Diagnostic & Clinical Operations</p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsListening(!isListening)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                isListening 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm" 
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {isListening ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <Mic className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Live AI Active</span>
                </>
              ) : (
                <>
                  <MicOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>AI Listening Paused</span>
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-3 border-l border-slate-200 pl-4">
              <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                DR
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">{doctorInfo?.doctors_name || userSession?.username}</div>
                <div className="text-[10px] text-slate-500 font-medium">{doctorInfo?.working_hospital}</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2.5 rounded-full border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-all cursor-pointer shadow-sm"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (Clinical AI Workspace) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Active Patient Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xl shadow-blue-600/5">
            {currentPatient ? (
              <>
                <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-100 gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-extrabold text-slate-900">{currentPatient.name}</h2>
                        <span className="text-[10px] bg-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded-full">
                          {currentPatient.patientId}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500 font-medium mt-0.5">
                        <span><strong>Age:</strong> {currentPatient.age} Yrs</span>
                        <span>•</span>
                        <span><strong>Gender:</strong> {currentPatient.gender}</span>
                        <span>•</span>
                        <span><strong>Last Visit:</strong> {currentPatient.lastVisit}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {currentPatient.allergies.map((allergy, i) => (
                      <span key={i} className="text-xs bg-rose-50 text-rose-700 border border-rose-200 font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        Allergy: {allergy}
                      </span>
                    ))}
                    <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <HeartPulse className="w-3.5 h-3.5 text-emerald-600" />
                      Blood: {currentPatient.bloodGroup}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2 mb-2">
                    <Mic className="w-4 h-4 text-blue-600" />
                    Real-time Consultation Transcript
                  </label>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 italic leading-relaxed">
                    &ldquo;{currentPatient.transcript}&rdquo;
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Stethoscope className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-base font-bold text-slate-800">No Active Patient Consultation</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm font-normal">
                  Click &quot;Live AI Active&quot; above to begin speech consultation and view real-time diagnostic recommendations.
                </p>
              </div>
            )}
          </div>

          {/* AI Diagnoses & Prescriptions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* AI Diagnoses */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl shadow-blue-600/5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-blue-600" />
                  <span>AI Possible Diagnoses</span>
                </h3>
              </div>

              {currentPatient && currentPatient.diagnoses.length > 0 ? (
                <div className="space-y-3">
                  {currentPatient.diagnoses.map((diag, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedDiagnosis(diag.title)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        selectedDiagnosis === diag.title
                          ? "bg-blue-50/60 border-blue-500 shadow-md"
                          : "bg-slate-50 border-slate-200/80 hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-extrabold text-slate-900 text-sm">{diag.title}</h4>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-600 text-white">
                          {diag.match}% Match
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{diag.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200/60">
                  <p className="text-xs text-slate-500 font-semibold">No diagnostic suggestions active</p>
                </div>
              )}
            </div>

            {/* Past Treatments & Notes */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl shadow-blue-600/5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Pill className="w-4.5 h-4.5 text-indigo-600" />
                    <span>Past Treatments</span>
                  </h3>
                </div>

                {currentPatient && currentPatient.prescriptions.length > 0 ? (
                  <div className="space-y-2.5 mt-3">
                    {currentPatient.prescriptions.map((drug, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div className="flex justify-between font-bold text-slate-900">
                          <span className="text-indigo-600">{drug.name}</span>
                          <span className="text-slate-400 font-normal">{drug.date}</span>
                        </div>
                        <p className="text-slate-500 mt-1">{drug.dosage} • {drug.indication}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <p className="text-xs text-slate-500 font-semibold">No prescription history</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block mb-1">Consultation Notes</label>
                <textarea
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Type notes for patient..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-all resize-none"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Right Sidebar (Schedule) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xl shadow-blue-600/5 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Doctor Schedule</span>
              </h3>

              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-md shadow-blue-600/20 flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add Task</span>
              </button>
            </div>

            <div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-semibold focus:bg-white focus:border-blue-600 focus:outline-none transition-all"
              />
            </div>

            {/* Task list */}
            <div className="space-y-2 pt-2">
              {tasksLoading ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading schedule...</div>
              ) : tasks.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-200/60 p-4">
                  <ClipboardList className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500 font-semibold">No tasks scheduled for today</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {tasks.map((task) => (
                    <div key={task.task_id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${getPriorityStyle(task.priority)}`}>
                            {task.priority}
                          </span>
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold uppercase">
                            {task.task_type}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{task.task_title}</h4>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3 text-blue-600" />
                          <span>{task.start_time.slice(0, 5)} - {task.end_time.slice(0, 5)}</span>
                        </div>
                        {task.task_description && (
                          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">{task.task_description}</p>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteTask(task.task_id)}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 hover:border-rose-300 text-slate-400 hover:text-rose-600 transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </main>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl relative">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Add Schedule Task</h2>
            
            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Cardiological Consultation"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Task Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                  >
                    <option value="consultation">Consultation</option>
                    <option value="surgery">Surgery</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="administrative">Administrative</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Priority Level</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Description (Optional)</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Additional patient reference detail..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-all resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold rounded-xl text-slate-600 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center space-x-1.5 cursor-pointer"
                >
                  {formLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <span>Add to Schedule</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center text-xs text-slate-500 font-medium">
          <span>&copy; {new Date().getFullYear()} MEDITRACK Doctor Portal.</span>
          <span>Diagnostic & Clinical Operations Console.</span>
        </div>
      </footer>

    </div>
  );
}
