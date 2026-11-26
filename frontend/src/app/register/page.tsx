"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { 
  Lock, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Landmark, 
  AlertCircle, 
  ArrowLeft, 
  GraduationCap, 
  Plus, 
  ShieldCheck, 
  ArrowRight,
  Stethoscope,
  Building2,
  FlaskConical,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Loader2
} from "lucide-react";
import Navbar from "@/components/Navbar";

export default function Register() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [role, setRole] = useState("patient");
  const [nicNumber, setNicNumber] = useState("");
  const [degrees, setDegrees] = useState("");
  const [universityList, setUniversityList] = useState<string[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState("");
  const [otherUniversity, setOtherUniversity] = useState("");
  const [workingHospital, setWorkingHospital] = useState("");
  const [slmcRegNo, setSlmcRegNo] = useState("");
  const [slmcVerified, setSlmcVerified] = useState<boolean | null>(null);
  const [slmcChecking, setSlmcChecking] = useState(false);
  const [slmcFeedback, setSlmcFeedback] = useState("");
  const [labName, setLabName] = useState("");
  const [labAddress, setLabAddress] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [assignedArea, setAssignedArea] = useState("Colombo North");
  const [mohOffice, setMohOffice] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadUniversities = async () => {
      try {
        const response = await fetch(
          "http://universities.hipolabs.com/search?country=Sri Lanka"
        );
        const data = await response.json();
        const universityNames = data.map((item: { name: string }) => item.name);
        setUniversityList(universityNames);
      } catch (error) {
        console.error("Failed to load universities:", error);
      }
    };
    loadUniversities();
  }, []);

  const handleVerifySlmc = async () => {
    if (!slmcRegNo.trim()) {
      setSlmcFeedback("Please enter your SLMC Registration Number first.");
      setSlmcVerified(false);
      return;
    }
    setSlmcChecking(true);
    setSlmcFeedback("");
    try {
      const res = await apiRequest("/api/doctor/verify-slmc/", {
        method: "POST",
        body: JSON.stringify({
          slmc_reg_no: slmcRegNo.trim(),
          nic: nicNumber.trim(),
          name: username.trim(),
        }),
      });
      if (res && res.verified) {
        setSlmcVerified(true);
        setSlmcFeedback(res.message || `Verified: ${res.slmc_reg_no}`);
      } else {
        setSlmcVerified(false);
        setSlmcFeedback(res.message || "Registration number could not be verified on medicalcouncil.lk");
      }
    } catch (err: unknown) {
      setSlmcVerified(false);
      setSlmcFeedback(err instanceof Error ? err.message : "SLMC verification check failed.");
    } finally {
      setSlmcChecking(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!username || !email || !password || !phone || !birthday || !role || !nicNumber) {
      setError("Please fill in all required fields.");
      setLoading(false);
      return;
    }

    if (role === "doctor" && !slmcRegNo.trim()) {
      setError("Please enter your Sri Lanka Medical Council (SLMC) Registration Number.");
      setLoading(false);
      return;
    }

    if (role === "lab" && (!labName || !labAddress || !licenseId)) {
      setError("Please fill in all laboratory details.");
      setLoading(false);
      return;
    }

    if (role === "medical_officer" && (!officerId || !assignedArea)) {
      setError("Please fill in Officer Registration ID and Assigned Health Area.");
      setLoading(false);
      return;
    }

    try {
      const now = new Date().toISOString();
      const uniToSubmit = selectedUniversity === "other" ? otherUniversity : selectedUniversity;

      const res = await apiRequest("/create-user/", {
        method: "POST",
        body: JSON.stringify({
          username,
          email,
          password,
          phone,
          birthday,
          role,
          NIC_number: nicNumber,
          degrees,
          university: uniToSubmit,
          working_hospital: workingHospital,
          slmc_reg_no: slmcRegNo.trim(),
          lab_name: labName,
          lab_address: labAddress,
          license_id: licenseId,
          officer_id: officerId,
          assigned_area: assignedArea,
          moh_office: mohOffice || `MOH Office - ${assignedArea}`,
          created_at: now,
          updated_at: now,
        }),
      });

      if (role === "doctor") {
        setSuccess(res.message || "SLMC Verified! Doctor account created successfully! Redirecting to login...");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else if (role === "lab") {
        setSuccess("Laboratory registered successfully! Redirecting to login...");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else if (role === "medical_officer") {
        setSuccess("Medical Officer / PHI registered successfully! Redirecting to login...");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else {
        setSuccess("Account created successfully! Redirecting to login...");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to create account. Please check user details.");
      } else {
        setError("Failed to create account. Please check user details.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/70 via-slate-50 to-white text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Navbar */}
      <Navbar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 relative overflow-hidden">
        
        {/* Glowing Blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-200/40 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-[140px] pointer-events-none" />

        {/* Back Link */}
        <div className="mb-6 w-full max-w-xl">
          <Link
            href="/"
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Homepage</span>
          </Link>
        </div>

        {/* Card */}
        <div className="w-full max-w-xl bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-blue-600/10 relative z-10">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-blue-600 text-white items-center justify-center shadow-lg shadow-blue-600/30 mb-4">
              <Plus className="w-8 h-8 stroke-[3]" />
            </div>
            
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Create Account
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Register your profile on the MediTrack Clinical Network
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-medium text-rose-700 flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-medium text-emerald-700 flex items-start gap-2.5 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            
            {/* Row 1: Username & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    placeholder="e.g. johndoe"
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Password & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="phone">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0771234567"
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Birthday & NIC */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="birthday">
                  Birthday
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="birthday"
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="nic">
                  NIC Number
                </label>
                <div className="relative">
                  <Landmark className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="nic"
                    type="text"
                    value={nicNumber}
                    onChange={(e) => setNicNumber(e.target.value)}
                    placeholder="199912345678"
                    className="w-full pl-10 pr-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Portal Role Selection */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-700" htmlFor="role">
                Select Portal Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-semibold focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none transition-all"
              >
                <option value="patient">Patient Portal</option>
                <option value="doctor">Doctor Portal (Instant SLMC Verification)</option>
                <option value="lab">Laboratory Portal</option>
                <option value="medical_officer">Medical Officer / PHI (Public Health Inspector)</option>
              </select>
            </div>

            {/* Medical Officer / PHI Specific Additional Fields */}
            {role === "medical_officer" && (
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 space-y-4 animate-in fade-in duration-300 mt-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <ShieldAlert className="w-4 h-4 text-emerald-600" />
                  <span>Public Health Inspector / MOH Official Credentials</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Officer / PHI Registration ID *</label>
                    <div className="relative">
                      <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={officerId}
                        onChange={(e) => setOfficerId(e.target.value)}
                        placeholder="e.g. MOH-COL-04 or PHI-442"
                        className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Assigned District / MOH Area *</label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <select
                        value={assignedArea}
                        onChange={(e) => setAssignedArea(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 font-medium focus:border-emerald-600 focus:outline-none"
                      >
                        <option value="Colombo North">Colombo North</option>
                        <option value="Colombo South">Colombo South</option>
                        <option value="Colombo East">Colombo East</option>
                        <option value="Gampaha">Gampaha</option>
                        <option value="Negombo">Negombo</option>
                        <option value="Kalutara">Kalutara</option>
                        <option value="Kandy">Kandy</option>
                        <option value="Matale">Matale</option>
                        <option value="Galle">Galle</option>
                        <option value="Matara">Matara</option>
                        <option value="Kurunegala">Kurunegala</option>
                        <option value="Jaffna">Jaffna</option>
                        <option value="Ratnapura">Ratnapura</option>
                        <option value="Kegalle">Kegalle</option>
                        <option value="Anuradhapura">Anuradhapura</option>
                        <option value="Badulla">Badulla</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Regional MOH Office</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={mohOffice}
                      onChange={(e) => setMohOffice(e.target.value)}
                      placeholder="e.g. MOH Office Kaduwela / Colombo North Directorate"
                      className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Laboratory Specific Additional Fields */}
            {role === "lab" && (
              <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 space-y-4 animate-in fade-in duration-300 mt-2">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-700">
                  <FlaskConical className="w-4 h-4 text-teal-600" />
                  <span>Laboratory Facility Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Laboratory Name *</label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={labName}
                        onChange={(e) => setLabName(e.target.value)}
                        placeholder="e.g. Asiri Central Lab"
                        className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">License / Registration ID *</label>
                    <div className="relative">
                      <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={licenseId}
                        onChange={(e) => setLicenseId(e.target.value)}
                        placeholder="e.g. SLMC-LAB-2026-441"
                        className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Laboratory Address *</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <textarea
                      rows={2}
                      value={labAddress}
                      onChange={(e) => setLabAddress(e.target.value)}
                      placeholder="e.g. No. 114, Norris Canal Road, Colombo 10"
                      className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-teal-600 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Doctor Specific Additional Fields */}
            {role === "doctor" && (
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100 space-y-4 animate-in fade-in duration-300 mt-2">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                  <Stethoscope className="w-4 h-4 text-blue-600" />
                  <span>Doctor Professional Information</span>
                </div>

                {/* SLMC Registration Number & Verification */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span>SLMC Registration Number *</span>
                      <span className="text-[10px] text-blue-600 bg-blue-100/70 px-1.5 py-0.5 rounded font-semibold">
                        medicalcouncil.lk
                      </span>
                    </label>
                    <a
                      href="https://medicalcouncil.lk/renewal/verify/registration"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>Verify on SLMC Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={slmcRegNo}
                        onChange={(e) => {
                          setSlmcRegNo(e.target.value);
                          setSlmcVerified(null);
                          setSlmcFeedback("");
                        }}
                        placeholder="e.g. SLMC-28491 or 24501"
                        className={`w-full pl-10 pr-3 py-2 rounded-xl bg-white border text-xs text-slate-900 focus:outline-none transition-colors ${
                          slmcVerified === true
                            ? "border-emerald-500 focus:border-emerald-600"
                            : slmcVerified === false
                            ? "border-rose-400 focus:border-rose-600"
                            : "border-slate-200 focus:border-blue-600"
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={slmcChecking || !slmcRegNo.trim()}
                      onClick={handleVerifySlmc}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {slmcChecking ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        <span>Verify SLMC</span>
                      )}
                    </button>
                  </div>

                  {slmcFeedback && (
                    <div
                      className={`text-[11px] p-2 rounded-lg flex items-start gap-1.5 mt-1 ${
                        slmcVerified === true
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {slmcVerified === true ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span>{slmcFeedback}</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500">
                    Registration will be verified with the Sri Lanka Medical Council (SLMC) before login is permitted.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Degrees</label>
                    <div className="relative">
                      <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={degrees}
                        onChange={(e) => setDegrees(e.target.value)}
                        placeholder="e.g. MBBS, MD"
                        className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Working Hospital</label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={workingHospital}
                        onChange={(e) => setWorkingHospital(e.target.value)}
                        placeholder="e.g. General Hospital"
                        className="w-full pl-10 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">University</label>
                  <select
                    value={selectedUniversity}
                    onChange={(e) => setSelectedUniversity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-blue-600"
                  >
                    <option value="">Select University</option>
                    {universityList.map((uni) => (
                      <option key={uni} value={uni}>
                        {uni}
                      </option>
                    ))}
                    <option value="other">Other University</option>
                  </select>
                </div>

                {selectedUniversity === "other" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Other University Name</label>
                    <input
                      type="text"
                      value={otherUniversity}
                      onChange={(e) => setOtherUniversity(e.target.value)}
                      placeholder="Enter university name"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:border-blue-600"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-6"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="text-center mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500 font-medium">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline font-bold ml-1">
              Sign In
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
