"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest, getSession } from "@/lib/api";
import { Lock, User, AlertCircle, ArrowLeft, Plus, ShieldCheck, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then(({ user }) => {
      if (!active) return;
      if (!user) {
        localStorage.removeItem("meditrack_user");
        return;
      }
      localStorage.setItem("meditrack_user", JSON.stringify(user));
      let route = "patient";
      if (["admin", "doctor", "lab"].includes(user.role)) {
        route = user.role;
      } else if (["medical_officer", "phi"].includes(user.role)) {
        route = "medical-officer";
      }
      router.replace(`/${route}/dashboard`);
    }).catch(() => { /* Keep login available if the backend is temporarily offline. */ });
    return () => { active = false; };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!username || !password) {
      setError("Please enter your username and password.");
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest("/login/", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      // Save user session details
      localStorage.setItem(
        "meditrack_user",
        JSON.stringify({
          id: data.id,
          username: data.username,
          role: data.role,
          doctorID: data.doctorID,
          lab_name: data.lab_name,
          license_id: data.license_id,
          lab_address: data.lab_address,
          officer_id: data.officer_id || data.doctorID || data.license_id,
          assigned_area: data.assigned_area,
          moh_office: data.moh_office,
          designation: data.designation,
        })
      );

      if (data.role === "admin") {
        router.push("/admin/dashboard");
      } else if (data.role === "doctor") {
        router.push("/doctor/dashboard");
      } else if (data.role === "lab") {
        router.push("/lab/dashboard");
      } else if (data.role === "medical_officer" || data.role === "phi") {
        router.push("/medical-officer/dashboard");
      } else {
        router.push("/patient/dashboard");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Invalid username or password");
      } else {
        setError("Invalid username or password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/70 via-slate-50 to-white text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header Navbar */}
      <Navbar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 relative overflow-hidden">
        
        {/* Background Glowing Blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-200/40 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-[140px] pointer-events-none" />

        {/* Back to Home Link */}
        <div className="mb-6 w-full max-w-md">
          <Link
            href="/"
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Homepage</span>
          </Link>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-blue-600/10 relative z-10">
          
          {/* Card Header Title */}
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-blue-600 text-white items-center justify-center shadow-lg shadow-blue-600/30 mb-4">
              <Plus className="w-8 h-8 stroke-[3]" />
            </div>
            
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Welcome Back
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Sign in to access your MediTrack portal dashboard
            </p>

            {/* Portal Badge Pills */}
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full border border-blue-100 text-[11px] font-bold text-blue-700">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Patient • Doctor • Admin Portal</span>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-medium text-rose-700 flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700" htmlFor="username">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700" htmlFor="password">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-8"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={() => { setUsername("phi_officer"); setPassword("Password@123"); }}
              className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>🛡️ Fill Medical Officer / PHI Demo</span>
            </button>
          </div>

          {/* Card Footer Link */}
          <div className="text-center mt-4 text-xs text-slate-500 font-medium">
            Don&apos;t have an account yet?{" "}
            <Link href="/register" className="text-blue-600 hover:underline font-bold ml-1">
              Create Account
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
