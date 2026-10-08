"use client";

import { Calendar, History, Pill, Search, ShieldAlert } from "lucide-react";
import { useDoctor } from "./DoctorContext";

export default function PrescriptionHistory() {
  const { currentPatient, historySearch, setHistorySearch, selectedReceipt, setSelectedReceipt } = useDoctor();
  // Filter past prescriptions based on search input
  const filteredPastPrescriptions = (currentPatient?.pastPrescriptions || []).filter((rx) =>
    rx.diagnosis.toLowerCase().includes(historySearch.toLowerCase()) ||
    rx.doctor.toLowerCase().includes(historySearch.toLowerCase()) ||
    rx.medicines.some((m) => m.name.toLowerCase().includes(historySearch.toLowerCase()))
  );

  return (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[640px]">
            
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                      Prescription History
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Past receipts & medications for {currentPatient?.name}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full border border-purple-200">
                  {currentPatient?.pastPrescriptions.length || 0} Records
                </span>
              </div>

              <p className="text-[11px] font-semibold text-amber-800">Sample prescription history from the existing dashboard. Not verified clinical records.</p>

              {/* Search in Past Prescriptions */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search prescription history"
                  placeholder="Search past medicine, diagnosis..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* Past Prescriptions Timeline / Receipt List */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {filteredPastPrescriptions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-500">No past prescription history found.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Previous treatment records will appear here.</p>
                  </div>
                ) : (
                  filteredPastPrescriptions.map((rx) => {
                    const isSelected = selectedReceipt?.id === rx.id;

                    return (
                      <div
                        key={rx.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`View sample prescription ${rx.receiptNumber}`}
                        aria-expanded={isSelected}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedReceipt(isSelected ? null : rx);
                          }
                        }}
                        onClick={() => setSelectedReceipt(isSelected ? null : rx)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${
                          isSelected
                            ? "bg-purple-50/70 border-purple-300 shadow-sm"
                            : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200"
                        }`}
                      >
                        {/* Receipt Top: Date, Receipt ID, Diagnosis Badge */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-purple-600" />
                              <span className="text-xs font-bold text-slate-900">{rx.date}</span>
                              <span className="text-[10px] font-mono text-slate-400">({rx.receiptNumber})</span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                              {rx.doctor} &bull; {rx.clinic}
                            </span>
                          </div>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase tracking-wide shrink-0">
                            {rx.diagnosis}
                          </span>
                        </div>

                        {/* Prescribed Medicines List */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                          {rx.medicines.map((med, mIdx) => (
                            <div key={mIdx} className="flex justify-between items-center text-xs bg-white p-2 rounded-xl border border-slate-200/50">
                              <div className="flex items-center gap-1.5">
                                <Pill className="w-3 h-3 text-purple-600 shrink-0" />
                                <span className="font-bold text-slate-800 text-[11px]">{med.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-600 font-mono font-semibold block">{med.dosage}</span>
                                <span className="text-[9px] text-slate-400 block">{med.frequency}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Doctor's Past Notes if present */}
                        {rx.notes && (
                          <p className="text-[10px] text-slate-600 italic bg-white/80 p-2 rounded-xl border border-slate-200/40">
                            &ldquo;{rx.notes}&rdquo;
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>

            {/* Quick Practice Tip Box */}
            <div className="pt-3 border-t border-slate-100">
              <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-2xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-600 leading-snug">
                  <strong>Clinical Safety Note:</strong> Verify patient antibiotic sensitivity against previous responses prior to prescribing.
                </p>
              </div>
            </div>

          </div>
  );
}
