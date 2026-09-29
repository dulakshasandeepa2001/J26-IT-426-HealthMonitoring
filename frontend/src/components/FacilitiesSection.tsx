"use client";

import React from "react";
import { Sparkles } from "lucide-react";

const FACILITIES = [
  {
    id: 1,
    name: "ICU Ward",
    description: "Intensive care with 24/7 vital monitoring & life support",
    image: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 2,
    name: "VIP Patient Rooms",
    description: "Exclusive inpatient suites with premium privacy & comfort",
    image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 3,
    name: "Operation Theaters",
    description: "Sterile surgical suites with international safety standards",
    image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 4,
    name: "Diagnostic Lab",
    description: "Automated laboratory testing for rapid & accurate results",
    image: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 5,
    name: "24/7 Ambulance",
    description: "Fully-equipped emergency fleet ready for immediate dispatch",
    image: "https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=600&q=80",
  },
];

export default function FacilitiesSection() {
  return (
    <section id="facilities" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Dark Navy Banner Outer Container */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 rounded-[2.5rem] p-8 sm:p-12 text-white shadow-2xl overflow-hidden relative border border-slate-800">
          
          {/* Subtle Ambient Light Glows */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Section Header */}
          <div className="relative z-10 max-w-2xl mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-bold text-blue-400 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Modern Facilities</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              Modern Facilities for Best Patient Care
            </h2>
            <p className="text-slate-400 text-sm mt-2 font-normal">
              Comfortable medical environments and advanced technology to support fast patient recovery.
            </p>
          </div>

          {/* 5 Cards Row Grid */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {FACILITIES.map((facility) => (
              <div
                key={facility.id}
                className="group relative rounded-2xl overflow-hidden bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 transition-all duration-300 shadow-md flex flex-col justify-end h-56"
              >
                {/* Image Background */}
                <img
                  src={facility.image}
                  alt={facility.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60 group-hover:opacity-80"
                />
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />

                {/* Content Overlay */}
                <div className="relative p-4 z-10">
                  <h3 className="text-sm font-extrabold text-white group-hover:text-blue-400 transition-colors">
                    {facility.name}
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 font-normal leading-relaxed">
                    {facility.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </section>
  );
}
