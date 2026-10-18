import type { MedicineReviewStatus } from "./medicineApi";

export const contentReviewLabels: Record<MedicineReviewStatus, string> = {
  pending: "Pending review", reviewed: "Content reviewed", rejected: "Rejected",
};

export function currentContentStatus(status: MedicineReviewStatus, isCurrent: boolean): MedicineReviewStatus {
  return isCurrent ? "reviewed" : status === "rejected" ? "rejected" : "pending";
}

export function MedicineReviewBadge({ status }: { status: MedicineReviewStatus }) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold ${status === "reviewed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{contentReviewLabels[status]}</span>;
}
