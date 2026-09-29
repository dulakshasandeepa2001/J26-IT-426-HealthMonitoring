"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Plus, 
  Phone, 
  Calendar, 
  Menu, 
  X, 
  ShieldCheck, 
  Clock
} from "lucide-react";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all">
      {/* Top Announcement Bar */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white text-xs py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <Phone className="w-3.5 h-3.5 text-blue-200" />
              <span>Emergency 24/7 Hotline:</span>
              <strong className="text-amber-300 font-bold ml-1">+94 11 234 5678</strong>
            </span>
            <span className="hidden md:inline-block text-blue-200">|</span>
            <span className="hidden md:flex items-center gap-1.5 text-blue-100">
              <Clock className="w-3.5 h-3.5 text-blue-200" />
              <span>Outpatient Hours: 08:00 AM - 09:00 PM</span>
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-medium text-blue-100">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>Accredited Healthcare Center</span>
            </span>
            <span className="hidden sm:inline-block">•</span>
            <Link href="/login" className="hover:text-white underline font-semibold transition">
              Portal Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 group-hover:scale-105 transition-transform duration-300">
            <Plus className="w-7 h-7 stroke-[3]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-slate-900 leading-none group-hover:text-blue-600 transition">
                MEDITRACK
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                Hospital
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide mt-1">
              Healthcare & Medical Center
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-semibold text-slate-700">
          <Link 
            href="/" 
            className="text-blue-600 font-bold relative py-1 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-blue-600 after:rounded-full"
          >
            Home
          </Link>
          <a href="#about" className="hover:text-blue-600 transition-colors">
            About Us
          </a>
          <a href="#services" className="hover:text-blue-600 transition-colors">
            Services
          </a>
          <a href="#doctors" className="hover:text-blue-600 transition-colors">
            Doctors
          </a>
          <a href="#facilities" className="hover:text-blue-600 transition-colors">
            Facilities
          </a>
          <a href="#news" className="hover:text-blue-600 transition-colors">
            Health News
          </a>
          <a href="#contact" className="hover:text-blue-600 transition-colors">
            Contact
          </a>
        </nav>

        {/* Right Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="text-xs font-bold text-slate-700 hover:text-blue-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition"
          >
            Sign In
          </Link>

          <Link
            href="/register"
            className="flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <Calendar className="w-4 h-4" />
            <span>Book Online</span>
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition"
          aria-label="Toggle Menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-5 shadow-xl animate-in slide-in-from-top duration-200">
          <nav className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
            <Link 
              href="/" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-blue-600 font-bold py-1 border-b border-slate-100"
            >
              Home
            </Link>
            <a 
              href="#about" 
              onClick={() => setMobileMenuOpen(false)} 
              className="hover:text-blue-600 py-1 border-b border-slate-100"
            >
              About Us
            </a>
            <a 
              href="#services" 
              onClick={() => setMobileMenuOpen(false)} 
              className="hover:text-blue-600 py-1 border-b border-slate-100"
            >
              Medical Services
            </a>
            <a 
              href="#doctors" 
              onClick={() => setMobileMenuOpen(false)} 
              className="hover:text-blue-600 py-1 border-b border-slate-100"
            >
              Specialist Doctors
            </a>
            <a 
              href="#facilities" 
              onClick={() => setMobileMenuOpen(false)} 
              className="hover:text-blue-600 py-1 border-b border-slate-100"
            >
              Modern Facilities
            </a>
            <a 
              href="#news" 
              onClick={() => setMobileMenuOpen(false)} 
              className="hover:text-blue-600 py-1 border-b border-slate-100"
            >
              Health News & Tips
            </a>
            <a 
              href="#contact" 
              onClick={() => setMobileMenuOpen(false)} 
              className="hover:text-blue-600 py-1"
            >
              Contact Us
            </a>

            <div className="pt-4 flex flex-col gap-3">
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white py-3 text-sm font-bold shadow-md shadow-blue-600/30"
              >
                <Calendar className="w-4 h-4" />
                <span>Book Online Now</span>
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 text-xs font-bold text-slate-600 hover:text-blue-600"
              >
                Sign In to Portal
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
