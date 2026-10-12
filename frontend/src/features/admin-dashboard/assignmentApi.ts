import { apiRequest } from "@/lib/api";
import type { Consultation, RegisteredPatient } from "@/features/prescription-intelligence/prescriptionApi";

export interface AssignmentDoctor {
  id: number;
  username: string;
  display_name: string;
  doctorID: string | null;
  working_hospital: string | null;
}

export interface AssignmentOptions {
  doctors: AssignmentDoctor[];
  patients: RegisteredPatient[];
}

export interface AssignedConsultation extends Consultation {
  doctor_name: string;
}

export async function fetchAssignmentOptions(): Promise<AssignmentOptions> {
  return apiRequest("/api/prescription/admin/assignments/options/");
}

export async function fetchAssignments(): Promise<AssignedConsultation[]> {
  return apiRequest("/api/prescription/admin/assignments/");
}

export async function assignConsultation(data: {
  doctor: number; patient: number; reason: string; is_demo: boolean;
}): Promise<AssignedConsultation> {
  return apiRequest("/api/prescription/admin/assignments/", {
    method: "POST", body: JSON.stringify(data),
  });
}
