"use client";

import React from "react";
import Link from "next/link";
import { 
  Heart, 
  ArrowRight, 
  Calendar, 
  Users, 
  Building2, 
  Star, 
  CheckCircle2, 
  Stethoscope,
  Activity
} from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative bg-gradient-to-b from-blue-50/70 via-slate-50 to-white pt-10 pb-20 overflow-hidden">
      {/* Background Soft Blobs */}
      <div className="absolute top-0 right-0 w-[550px] h-[550px] bg-blue-200/30 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-indigo-200/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-12 lg:gap-8">
          
          {/* Left Hero Text Content */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/90 px-4 py-2 text-xs font-bold text-blue-700 shadow-sm shadow-blue-500/10 mb-6 backdrop-blur-md">
              <Heart className="w-4 h-4 text-blue-600 fill-blue-600 animate-pulse" />
              <span>Your Health, Our Priority</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.12]">
              Best Healthcare Service <br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 bg-clip-text text-transparent">
                for You & Your Family
              </span>
            </h1>

            {/* Paragraph Subtitle */}
            <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
              We deliver high-quality medical services, experienced medical specialists, 
              and state-of-the-art healthcare facilities 24/7 to provide comfortable, fast, 
              and reliable medical care.
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <a
                href="#services"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>Explore Services</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <Link
                href="/register"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-3.5 text-sm font-bold text-slate-800 shadow-md shadow-slate-900/5 hover:bg-slate-50 hover:border-slate-300 transition-all hover:-translate-y-0.5"
              >
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Book Appointment</span>
              </Link>
            </div>

            {/* Quick Feature Badges */}
            <div className="mt-10 flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-600 pt-4 border-t border-slate-200/60 w-full">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>24/7 Emergency Care</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Specialist Doctors</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Modern Inpatient Wards</span>
              </div>
            </div>

          </div>

          {/* Right Hero Image Frame */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-[2.5rem] bg-gradient-to-tr from-blue-600 to-indigo-500 p-2.5 shadow-2xl shadow-blue-500/20">
              
              {/* Inner Card Container */}
              <div className="relative rounded-[2rem] overflow-hidden bg-white">
                <img
                  src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1000&q=85"
                  alt="Doctor caring for pediatric patient in hospital"
                  className="w-full h-[460px] object-cover object-center transform hover:scale-105 transition-transform duration-700"
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />

                {/* Floating Hospital Badge on top right */}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-white/80 flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    M
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 leading-tight">MediTrack</p>
                    <p className="text-[10px] font-bold text-blue-600 uppercase">Hospital</p>
                  </div>
                </div>

                {/* Doctor Patient Caption Overlay at bottom */}
                <div className="absolute bottom-5 left-5 right-5 p-4 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-white/90">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-100 border-2 border-blue-600 flex items-center justify-center text-blue-700 font-bold">
                        <Stethoscope className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Compassionate & Professional Care</h4>
                        <p className="text-[11px] text-slate-500 font-medium">24/7 Medical & Nursing Team</p>
                      </div>
                    </div>
                    <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                </div>

              </div>
            </div>

            {/* Secondary Floating Card */}
            <div className="hidden sm:flex absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 items-center gap-3.5 backdrop-blur-md">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900">Emergency Response</p>
                <p className="text-[11px] text-emerald-600 font-bold">Fast Response &lt; 5 Mins</p>
              </div>
            </div>

          </div>

        </div>

        {/* Floating Bottom Stats Card */}
        <div className="mt-16 bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100/80 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          
          {/* Stat 1 */}
          <div className="flex items-center justify-center sm:justify-start gap-4 px-2 py-3 sm:py-0">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">15+</h3>
              <p className="text-xs font-semibold text-slate-500">Specialist Doctors</p>
            </div>
          </div>

          {/* Stat 2 */}
          <div className="flex items-center justify-center sm:justify-start gap-4 px-2 py-3 sm:py-0 sm:pl-6">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
              <Heart className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">25,000+</h3>
              <p className="text-xs font-semibold text-slate-500">Patients Served</p>
            </div>
          </div>

          {/* Stat 3 */}
          <div className="flex items-center justify-center sm:justify-start gap-4 px-2 py-3 sm:py-0 sm:pl-6">
            <div className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">120+</h3>
              <p className="text-xs font-semibold text-slate-500">Inpatient Beds</p>
            </div>
          </div>

          {/* Stat 4 */}
          <div className="flex items-center justify-center sm:justify-start gap-4 px-2 py-3 sm:py-0 sm:pl-6">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
              <Star className="w-6 h-6 fill-amber-500 text-amber-500" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">98%</h3>
              <p className="text-xs font-semibold text-slate-500">Patient Satisfaction</p>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
