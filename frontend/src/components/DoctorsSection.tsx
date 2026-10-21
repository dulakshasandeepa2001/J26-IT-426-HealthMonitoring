"use client";

import React from "react";
import Link from "next/link";
import { 
  Star, 
  ArrowRight, 
  Calendar, 
  Stethoscope
} from "lucide-react";

const DOCTORS = [
  {
    id: 1,
    name: "Dr. Andika Pratama",
    specialty: "Cardiology Specialist",
    hospital: "MediTrack Hospital",
    rating: 4.9,
    reviews: 128,
    image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 2,
    name: "Dr. Salsabila Putri",
    specialty: "Pediatric Specialist",
    hospital: "MediTrack Hospital",
    rating: 4.9,
    reviews: 154,
    image: "https://images.unsplash.com/photo-1594824813566-88855474668b?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 3,
    name: "Dr. Budi Santoso",
    specialty: "Surgical Specialist",
    hospital: "MediTrack Hospital",
    rating: 4.8,
    reviews: 96,
    image: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: 4,
    name: "Dr. Meilani Putri",
    specialty: "Internal Medicine Specialist",
    hospital: "MediTrack Hospital",
    rating: 4.9,
    reviews: 210,
    image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
  },
];

export default function DoctorsSection() {
  return (
    <section id="doctors" className="py-20 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-bold text-blue-700 mb-3">
              <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
              <span>Our Doctors</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Experienced Specialist Doctors
            </h2>
            <p className="text-slate-500 text-sm mt-1 max-w-xl font-normal">
              Our dedicated team of medical specialists is ready to provide exceptional clinical care for you and your family.
            </p>
          </div>

          <a
            href="#contact"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition group"
          >
            <span>View All Doctors</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        {/* 4 Doctor Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DOCTORS.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col justify-between group"
            >
              {/* Doctor Image Container */}
              <div className="relative rounded-2xl overflow-hidden h-64 bg-slate-100 mb-4">
                <img
                  src={doc.image}
                  alt={doc.name}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                />
                
                {/* Rating Badge Overlay */}
                <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-md border border-white/80 flex items-center gap-1 text-xs font-bold text-slate-900">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{doc.rating}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({doc.reviews})</span>
                </div>
              </div>

              {/* Doctor Information */}
              <div className="text-center px-2">
                <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {doc.name}
                </h3>
                <p className="text-xs font-semibold text-blue-600 mt-0.5">
                  {doc.specialty}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {doc.hospital}
                </p>
              </div>

              {/* Action Button */}
              <div className="mt-5 pt-3 border-t border-slate-100">
                <Link
                  href="/register"
                  className="w-full flex items-center justify-center gap-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white py-2.5 text-xs font-bold transition-all duration-300"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Book Appointment</span>
                </Link>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
