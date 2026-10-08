"use client";

import { Settings, UserRound } from "lucide-react";
import { useDoctor } from "@/features/doctor-dashboard/DoctorContext";
import { PageFrame, Section, Unavailable } from "@/features/prescription-intelligence/PageFrame";

export default function ProfileSettings() {
  const { doctorName, doctorId, hospital, isDoctorSession } = useDoctor();
  return (
    <PageFrame title="Profile and Settings" description="Your existing doctor session details and clinical console settings.">
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Section title="Doctor profile" icon={UserRound}>
          {!isDoctorSession && <p className="mb-4 text-xs font-semibold text-amber-800">Sample clinician details from the existing overview.</p>}
          <dl className="space-y-4 text-xs"><div><dt className="font-semibold text-slate-500">Doctor</dt><dd className="mt-1 font-bold text-slate-800">{doctorName}</dd></div><div><dt className="font-semibold text-slate-500">Doctor ID</dt><dd className="mt-1 font-mono text-slate-800">{doctorId}</dd></div><div><dt className="font-semibold text-slate-500">Hospital (existing sample setting)</dt><dd className="mt-1 text-slate-800">{hospital}</dd></div></dl>
        </Section>
        <Section title="Console settings" icon={Settings}><p className="mb-4 text-xs leading-relaxed text-slate-500">Use the sidebar control to switch between expanded labels and compact icons. On smaller screens, use the navigation menu.</p><Unavailable title="Profile updates unavailable">No profile-editing or saved-settings service is connected. These session details are read-only.</Unavailable></Section>
      </div>
    </PageFrame>
  );
}
