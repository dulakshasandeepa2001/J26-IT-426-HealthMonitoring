"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useDoctor } from "@/features/doctor-dashboard/DoctorContext";
import PrescriptionHistory from "@/features/doctor-dashboard/PrescriptionHistory";
import { 
  User, 
  Mic, 
  MicOff, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Activity, 
  Users, 
  Sparkles,
  ChevronRight,
  HeartPulse,
  ClipboardList,
  Calendar,
  RefreshCw,
  X
} from "lucide-react";

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

export default function DoctorDashboard() {
  const {
    doctorId, queue, currentPatientIndex, setCurrentPatientIndex, currentPatient,
    isListening, setIsListening, transcript, setTranscript,
    setHistorySearch, setSelectedReceipt,
  } = useDoctor();

  // Sidebar tab switcher: Queue vs Tasks
  const [sidebarTab, setSidebarTab] = useState<"queue" | "tasks">("queue");

  // Doctor Tasks state (get_tasks)
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

  // Core getTasks function to retrieve scheduled tasks from backend /get-tasks/
  const getTasks = useCallback(async (customDate?: string, customDocId?: string) => {
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
  }, [selectedTaskDate, doctorId]);

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

  // Keep the existing schedule API synchronized with the doctor and chosen date.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetching the schedule is synchronization with the existing backend.
    void getTasks();
  }, [getTasks]);

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


  return (
    <div className="flex flex-1 flex-col text-slate-900">
      
      <div className="mx-auto w-full max-w-[1700px] px-4 pt-6 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Doctor Dashboard</h1>
        <p className="mt-1 text-xs text-slate-500">Patient details, consultation notes, prescription history and clinical schedule.</p>
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <strong>Sample patient overview.</strong> Queue, patient details, notes and past prescriptions use the illustrative data. Voice input is a simulation. The schedule uses the existing backend.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* MAIN BODY: 3 COLUMNS                                                      */}
      {/* Column 1 (3/12): Live Consultation Queue                                  */}
      {/* Column 2 (5/12): Current Patient & Central Voice Mic                      */}
      {/* Column 3 (4/12): Patient Reception & Past Prescription History (Right)   */}
      {/* ========================================================================= */}
      <main className="flex-grow max-w-[1700px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-12 gap-6">

        {/* ======================================================================= */}
        {/* ======================================================================= */}
        {/* COLUMN 1: "Next Patient" Queue OR Doctor Scheduled Tasks (get_tasks)    */}
        {/* ======================================================================= */}
        <div className="xl:col-span-1 2xl:col-span-3 space-y-4">

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
                      <button
                        type="button"
                        aria-label={`Select sample patient ${p.name}`}
                        key={p.id}
                        onClick={() => {
                          setCurrentPatientIndex(idx);
                          setSelectedReceipt(null);
                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex w-full items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${
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
                      </button>
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
                  aria-label="Schedule date"
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
        <div className="xl:col-span-1 2xl:col-span-5 space-y-6">

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
                      <div className="flex flex-wrap items-center gap-2">
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
                aria-label="Consultation notes"
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
        <div className="xl:col-span-2 2xl:col-span-4 space-y-4">
          
          <PrescriptionHistory />

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
                aria-label="Close new task form"
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


    </div>
  );
}
