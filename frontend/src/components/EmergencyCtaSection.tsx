"use client";

import React from "react";
import Link from "next/link";
import { 
  PhoneCall, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  Building2, 
  AlertCircle,
  ArrowRight
} from "lucide-react";

export default function EmergencyCtaSection() {
  return (
    <section id="contact" className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Banner Card */}
        <div className="relative rounded-[2.5rem] bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-8 sm:p-12 text-white shadow-2xl overflow-hidden">
          
          {/* Background Ambient Glows & Image Overlay */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-12">
            
            {/* Left Column Text & Feature Badges */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              
              {/* Emergency Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/30 px-3.5 py-1 text-xs font-bold text-blue-100 mb-4 backdrop-blur-md">
                <AlertCircle className="w-4 h-4 text-amber-300 animate-bounce" />
                <span>24/7 Emergency Care Ready</span>
              </div>

              {/* Title */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                Need Emergency Medical Assistance?
              </h2>

              {/* Subtitle */}
              <p className="mt-3 text-base sm:text-lg text-blue-100 leading-relaxed font-normal max-w-xl">
                We are ready to serve you 24 hours a day, 7 days a week. Our emergency physicians and ambulance dispatch team are on standby for immediate response.
              </p>

              {/* 3 Badges */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md text-xs font-bold text-white">
                  <Clock className="w-4 h-4 text-amber-300" />
                  <span>24/7 Emergency Room</span>
                </div>
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md text-xs font-bold text-white">
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  <span>Professional Medical Staff</span>
                </div>
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md text-xs font-bold text-white">
                  <Building2 className="w-4 h-4 text-sky-300" />
                  <span>Full ICU & Facilities</span>
                </div>
              </div>

            </div>

            {/* Right Column Call & Appointment Box */}
            <div className="lg:col-span-5 flex flex-col items-center lg:items-end">
              <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 text-slate-900 shadow-2xl border border-white/90">
                
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center lg:text-left">
                  Call Us Directly
                </p>

                {/* Phone Call Box */}
                <a
                  href="tel:+94112345678"
                  className="mt-3 flex items-center justify-center lg:justify-start gap-4 p-4 rounded-2xl bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors group"
                >
                  <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0 group-hover:scale-105 transition-transform">
                    <PhoneCall className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-medium">24/7 Emergency Hotline</span>
                    <h3 className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight leading-none mt-0.5">
                      +94 11 234 5678
                    </h3>
                  </div>
                </a>

                {/* Secondary CTA Button */}
                <div className="mt-5 text-center">
                  <span className="text-xs text-slate-400 font-medium block mb-2">
                    Or Book Your Consultation Online
                  </span>
                  <Link
                    href="/register"
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-slate-900 hover:bg-blue-600 text-white py-3.5 text-xs font-bold shadow-lg transition-all hover:shadow-blue-600/30"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Book Online Appointment</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
