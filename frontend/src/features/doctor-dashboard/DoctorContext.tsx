"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { SAMPLE_QUEUE, type PastPrescription } from "./sample-patients";

function readSession() {
  return localStorage.getItem("meditrack_user");
}

function subscribeSession(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function useDoctorState() {
  const stored = useSyncExternalStore(subscribeSession, readSession, () => null);
  let username = "";
  let doctorId = "DOC-0001";
  let isDoctorSession = false;
  try {
    const session = stored ? JSON.parse(stored) : null;
    if (session?.role === "doctor") {
      isDoctorSession = true;
      username = typeof session.username === "string" ? session.username : "";
      doctorId = typeof session.doctorID === "string" ? session.doctorID : doctorId;
    }
  } catch {
    // The existing overview remains available with its sample clinician.
  }
  const rawName = username.replace(/^dr[._\s]*/i, "");
  const doctorName = rawName ? `Dr. ${rawName.charAt(0).toUpperCase()}${rawName.slice(1)}` : "Dr. W.G. Dulaksha";
  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(
    "Patient reports acute onset of high fever and productive cough. Lung auscultation reveals mild bilateral wheezing. Advised paracetamol and hydration."
  );
  const [historySearch, setHistorySearch] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<PastPrescription | null>(null);

  function selectSamplePatient(patientId: string) {
    const index = SAMPLE_QUEUE.findIndex((patient) => patient.id === patientId);
    if (index < 0) return;
    setCurrentPatientIndex(index);
    setSelectedReceipt(null);
    setHistorySearch("");
  }

  return {
    doctorName, doctorId, isDoctorSession,
    hospital: "MediTrack General Hospital",
    queue: SAMPLE_QUEUE,
    currentPatientIndex, setCurrentPatientIndex,
    currentPatient: SAMPLE_QUEUE[currentPatientIndex] ?? null,
    selectSamplePatient,
    isListening, setIsListening, transcript, setTranscript,
    historySearch, setHistorySearch, selectedReceipt, setSelectedReceipt,
  };
}

const DoctorContext = createContext<ReturnType<typeof useDoctorState> | null>(null);

export function DoctorProvider({ children }: { children: ReactNode }) {
  const value = useDoctorState();
  return <DoctorContext.Provider value={value}>{children}</DoctorContext.Provider>;
}

export function useDoctor() {
  const context = useContext(DoctorContext);
  if (!context) throw new Error("DoctorProvider is required.");
  return context;
}
