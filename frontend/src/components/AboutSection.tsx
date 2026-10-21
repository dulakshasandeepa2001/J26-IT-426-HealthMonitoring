"use client";

import React from "react";
import { 
  Clock, 
  UserCheck, 
  Building, 
  Sparkles,
  CheckCircle,
  Award
} from "lucide-react";

export default function AboutSection() {
  return (
    <section id="about" className="py-20 bg-slate-50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Hospital Building Image */}
          <div className="lg:col-span-6 relative">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-slate-200/80 group">
              <img
                src="https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=1000&q=85"
                alt="MediTrack Hospital Exterior"
                className="w-full h-[450px] object-cover group-hover:scale-105 transition-transform duration-700"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />

              {/* Floating Badge */}
              <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-white/90 shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900">Accredited Healthcare Standard</h4>
                    <p className="text-[11px] text-slate-500 font-medium">Top Quality Patient Care</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                  Certified 2026
                </span>
              </div>
            </div>

            {/* Decorative background accent */}
            <div className="absolute -bottom-6 -right-6 w-72 h-72 bg-blue-200/40 rounded-full blur-3xl -z-10" />
          </div>

          {/* Right Column: About Info & 4 Grid Feature Cards */}
          <div className="lg:col-span-6 flex flex-col items-start">
            
            {/* Sub-badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-bold text-blue-700 mb-4">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>About Us</span>
            </div>

            {/* Heading */}
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              MediTrack Hospital <br />
              <span className="text-blue-600">For a Healthier Life</span>
            </h2>

            {/* Description */}
            <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
              MediTrack Hospital is dedicated to delivering comprehensive professional healthcare 
              supported by cutting-edge medical technology, expert medical specialists, and a safe, 
              welcoming environment for patients and their families.
            </p>

            {/* 4 Feature Icon Cards Grid */}
            <div className="mt-8 grid grid-cols-2 gap-4 w-full">
              
              {/* Feature 1: 24 Hours Service */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900">24/7 Medical Care</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Emergency & ambulance on standby</p>
                </div>
              </div>

              {/* Feature 2: Professional Team */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900">Professional Medical Team</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Certified specialists & nurses</p>
                </div>
              </div>

              {/* Feature 3: Modern Facilities */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900">Modern Facilities</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Advanced diagnostic equipment</p>
                </div>
              </div>

              {/* Feature 4: Quality Care */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900">Quality Patient Care</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">High safety & clinical standards</p>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
