"use client";

import React from "react";
import Link from "next/link";
import { 
  Stethoscope, 
  Bed, 
  AlertCircle, 
  Activity, 
  FlaskConical, 
  Pill, 
  ArrowRight,
  Sparkles
} from "lucide-react";

const SERVICES = [
  {
    id: 1,
    title: "Specialist Clinics",
    subtitle: "Doctor Consultations",
    description: "Expert specialist care in cardiology, pediatrics, surgery, gynecology, and neurology.",
    image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80",
    icon: Stethoscope,
    badgeColor: "bg-blue-600 text-white",
  },
  {
    id: 2,
    title: "Inpatient Care",
    subtitle: "Modern Inpatient Wards",
    description: "VIP and standard inpatient rooms equipped with comfort and 24/7 clinical supervision.",
    image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=600&q=80",
    icon: Bed,
    badgeColor: "bg-indigo-600 text-white",
  },
  {
    id: 3,
    title: "24/7 Emergency Room",
    subtitle: "Urgent Trauma Care",
    description: "24-hour emergency room staffed with trauma specialists and emergency physicians.",
    image: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80",
    icon: AlertCircle,
    badgeColor: "bg-rose-600 text-white",
  },
  {
    id: 4,
    title: "Radiology & Imaging",
    subtitle: "CT-Scan & X-Ray",
    description: "Advanced imaging technology including MRI, Ultrasound (USG), and digital X-ray scans.",
    image: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80",
    icon: Activity,
    badgeColor: "bg-sky-600 text-white",
  },
  {
    id: 5,
    title: "Diagnostic Laboratory",
    subtitle: "Blood & Pathology Tests",
    description: "Automated blood analysis, pathology testing, and rapid diagnostic lab reports.",
    image: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80",
    icon: FlaskConical,
    badgeColor: "bg-emerald-600 text-white",
  },
  {
    id: 6,
    title: "Pharmacy",
    subtitle: "Prescriptions & Medicine",
    description: "24/7 hospital pharmacy offering prescription medications and pharmacist consultations.",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
    icon: Pill,
    badgeColor: "bg-amber-600 text-white",
  },
];

export default function ServicesSection() {
  return (
    <section id="services" className="py-20 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Title Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-bold text-blue-700 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Core Services</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Our Medical Services
            </h2>
            <p className="text-slate-500 text-sm mt-1 max-w-xl font-normal">
              We provide comprehensive medical specializations and diagnostic care for your entire family.
            </p>
          </div>

          <a 
            href="#contact" 
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition group"
          >
            <span>View All Services</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        {/* 6 Grid Service Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <div 
                key={service.id}
                className="group relative rounded-3xl bg-slate-50 border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col justify-between"
              >
                {/* Image Area with Badge Overlay */}
                <div className="relative h-48 w-full overflow-hidden bg-slate-200">
                  <img
                    src={service.image}
                    alt={service.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />

                  {/* Icon Pill Overlay at Bottom Center */}
                  <div className="absolute -bottom-5 left-6 h-12 w-12 rounded-2xl bg-white shadow-lg border border-slate-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <Icon className="w-6 h-6" />
                  </div>

                  {/* Category Pill Tag */}
                  <span className="absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-slate-800 shadow-sm">
                    {service.subtitle}
                  </span>
                </div>

                {/* Text Content */}
                <div className="p-6 pt-8 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {service.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed mt-2 font-normal">
                      {service.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200/60 flex justify-between items-center text-xs">
                    <Link 
                      href="/register" 
                      className="font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 group/link"
                    >
                      <span>Book Consultation</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover/link:translate-x-0.5 transition-transform" />
                    </Link>
                    <span className="text-[11px] font-semibold text-slate-400">Available 24/7</span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
