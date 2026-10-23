"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { getStoredUser, clearStoredUser } from "@/lib/auth";
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Mail,
  Phone,
  Calendar,
  Building,
  Award,
  GraduationCap,
  AlertCircle,
  LogOut,
  Plus,
  RefreshCw
} from "lucide-react";

interface ApiError {
  message: string;
  response?: { status: number };
}

interface PendingDoctor {
  id: number;
  username: string;
  email: string;
  phone: string;
  NIC_number: string;
  doctorID: string;
  degrees: string;
  university: string;
  working_hospital: string;
  birthday: string;
  created_at: string;
  message: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [pendingDoctors, setPendingDoctors] = useState<PendingDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Load pending doctors on page load & route protection check
  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== "admin") {
      router.push("/login");
      return;
    }

    fetchPendingDoctors();
  }, [router]);

  async function fetchPendingDoctors() {
    try {
      setLoading(true);
      const data = await apiRequest("/pending-doctors/");
      setPendingDoctors(data.pending_doctors || []);
    } catch (err: unknown) {
      const error = err as ApiError;
      setError(error.message || "Failed to load pending approvals");
    } finally {
      setLoading(false);
    }
  }

  // Approve doctor
  async function handleApprove(id: number) {
    try {
      setActionLoading(id);
      setError("");
      setMessage("");
      await apiRequest(`/approve-doctor/${id}/`, { method: "POST" });
      setPendingDoctors((prev) => prev.filter((d) => d.id !== id));
      setMessage("Doctor approved successfully! Account is now active.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err: unknown) {
      const error = err as ApiError;
      setError(error.message || "Approval failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Reject doctor
  async function handleReject(id: number) {
    try {
      setActionLoading(id);
      setError("");
      setMessage("");
      await apiRequest(`/reject-doctor/${id}/`, { method: "POST" });
      setPendingDoctors((prev) => prev.filter((d) => d.id !== id));
      setMessage("Doctor registration rejected.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err: unknown) {
      const error = err as ApiError;
      setError(error.message || "Rejection failed");
    } finally {
      setActionLoading(null);
    }
  }

  function handleLogout() {
    clearStoredUser();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/70 via-slate-50 to-white text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* HEADER */}
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
                <span className="text-[9px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                  Admin Panel
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">Doctor Registration & Approval System</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-xs font-bold text-rose-600 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-lg shadow-blue-600/5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">{pendingDoctors.length}</p>
                <p className="text-xs font-bold text-slate-500">Pending Approvals</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-lg shadow-blue-600/5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">Active</p>
                <p className="text-xs font-bold text-slate-500">System Approvals</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-lg shadow-blue-600/5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">Secured</p>
                <p className="text-xs font-bold text-slate-500">Admin Control Console</p>
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {message && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-center gap-2 shadow-sm">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2 shadow-sm">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Pending Table */}
        <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xl shadow-blue-600/5">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Pending Doctor Registrations</h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Review and approve or reject doctor signup applications
              </p>
            </div>
            <button
              onClick={fetchPendingDoctors}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh List</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : pendingDoctors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
              <p className="text-sm font-bold text-slate-700">No Pending Approvals</p>
              <p className="text-xs text-slate-500 mt-1">All doctor registration applications have been processed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3.5 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                      Doctor Info
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                      Qualifications
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                      Hospital
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="text-center px-6 py-3.5 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {pendingDoctors.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-900 text-sm">{doc.username}</p>
                            <p className="text-[11px] text-slate-500">NIC: {doc.NIC_number}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 space-y-1 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.birthday}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 space-y-1 text-slate-600">
                        <div className="flex items-center gap-1.5 font-bold text-blue-600">
                          <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                          <span>{doc.degrees || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Award className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.university || "N/A"}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-700">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.working_hospital || "N/A"}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleApprove(doc.id)}
                            disabled={actionLoading === doc.id}
                            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === doc.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                            <span>Approve</span>
                          </button>

                          <button
                            onClick={() => handleReject(doc.id)}
                            disabled={actionLoading === doc.id}
                            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}