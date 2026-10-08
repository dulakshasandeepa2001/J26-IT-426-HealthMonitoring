import type { ReactNode } from "react";
import DoctorShell from "@/features/doctor-dashboard/DoctorShell";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  return <DoctorShell>{children}</DoctorShell>;
}
