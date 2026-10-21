"use client";

import React from "react";
import Link from "next/link";
import { 
  Plus, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  ShieldCheck, 
  ChevronRight
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-300 pt-16 pb-12 border-t border-slate-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-900">
          
          {/* Column 1: Hospital Brand info */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-600/30">
                <Plus className="w-6 h-6 stroke-[3]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold text-white tracking-tight">
                  MEDITRACK
                </span>
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                  Healthcare & Medical Center
                </span>
              </div>
            </Link>

            <p className="text-xs text-slate-400 leading-relaxed max-w-sm font-normal">
              MediTrack Medical Center provides comprehensive international standard healthcare 
              services with 24/7 modern facilities and certified specialist medical teams for your whole family.
            </p>

            <div className="pt-2 flex items-center gap-3 text-xs text-slate-400 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Accredited Healthcare Standard 2026</span>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Navigation</h4>
            <ul className="space-y-2 text-xs text-slate-400 font-medium">
              <li>
                <a href="#" className="hover:text-blue-400 transition flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-blue-500" />
                  <span>Home</span>
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-blue-400 transition flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-blue-500" />
                  <span>About Us</span>
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-blue-400 transition flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-blue-500" />
                  <span>Medical Services</span>
                </a>
              </li>
              <li>
                <a href="#doctors" className="hover:text-blue-400 transition flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-blue-500" />
                  <span>Specialist Doctors</span>
                </a>
              </li>
              <li>
                <a href="#facilities" className="hover:text-blue-400 transition flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-blue-500" />
                  <span>Modern Facilities</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Medical Specializations */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Medical Services</h4>
            <ul className="space-y-2 text-xs text-slate-400 font-medium">
              <li>Cardiology Clinic</li>
              <li>Pediatric Care</li>
              <li>24/7 Emergency Room</li>
              <li>Radiology & CT-Scan</li>
              <li>Medical Laboratory</li>
              <li>24/7 Pharmacy</li>
            </ul>
          </div>

          {/* Column 4: Contact & Address */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Contact Info</h4>
            <ul className="space-y-2.5 text-xs text-slate-400 font-medium">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>123 Medical Center Road, Colombo 07, Sri Lanka</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-white font-bold">+94 11 234 5678</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                <span>info@meditrack.org</span>
              </li>
              <li className="flex items-center gap-2 pt-1">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-semibold">24/7 Emergency Care Ready</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium">
          <div>
            &copy; {new Date().getFullYear()} MediTrack Hospital. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-slate-300 transition">Terms of Service</a>
            <a href="#" className="hover:text-slate-300 transition">Privacy Policy</a>
            <a href="#" className="hover:text-slate-300 transition">Patient Support</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
