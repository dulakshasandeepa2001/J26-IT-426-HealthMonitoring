import type { ProposedDose } from "./draftApi";

export function regimenSummary(dose: ProposedDose): string {
  if (dose.schedule_type === "topical_prn") return "Apply to affected skin as needed · Topical · No fixed amount or course";
  if (dose.schedule_type === "oral_prn") return `${dose.amount} ${dose.unit} when needed · At least ${dose.interval_hours} hours between doses · Maximum ${dose.max_doses_per_day} doses (${dose.max_daily_amount_mg} mg) per 24 hours · Oral · No fixed course`;
  return `${dose.amount} ${dose.unit}, ${dose.doses_per_day} doses/day for ${dose.duration_days} days (${dose.route})`;
}

export function RegimenDetails({ dose }: { dose: ProposedDose }) {
  return <div className="space-y-2 text-xs leading-relaxed"><p className="font-semibold">{regimenSummary(dose)}</p>{dose.instructions && <p>{dose.instructions}</p>}{dose.review_after_days != null && <p>Symptom review limit: {dose.review_after_days} days; seek review sooner if symptoms worsen. This is a reassessment limit, not a prescribed course length.</p>}</div>;
}
