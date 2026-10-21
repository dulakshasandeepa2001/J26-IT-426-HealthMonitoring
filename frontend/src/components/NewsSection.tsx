"use client";

import React from "react";
import { 
  FileText, 
  ArrowRight, 
  Calendar
} from "lucide-react";

const ARTICLES = [
  {
    id: 1,
    category: "Cardiology",
    title: "Essential Daily Tips for Heart Health",
    summary: "Simple lifestyle habits to prevent cardiovascular diseases and maintain optimal heart wellness.",
    date: "28 Sep 2026",
    image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80",
    badgeColor: "bg-rose-100 text-rose-700",
  },
  {
    id: 2,
    category: "Pediatrics",
    title: "Importance of Early Child Immunization",
    summary: "Complete guide to essential child vaccination schedules for strong childhood immunity.",
    date: "25 Sep 2026",
    image: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    id: 3,
    category: "Nutrition",
    title: "Healthy Nutrition for a Balanced Lifestyle",
    summary: "Nutritional recommendations and dietary guidelines to boost your daily immune system.",
    date: "20 Sep 2026",
    image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    id: 4,
    category: "Senior Care",
    title: "Best Elderly Care Practices for Loved Ones",
    summary: "Effective strategies for managing physical & emotional wellness for seniors at home.",
    date: "15 Sep 2026",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80",
    badgeColor: "bg-amber-100 text-amber-700",
  },
];

export default function NewsSection() {
  return (
    <section id="news" className="py-20 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-bold text-blue-700 mb-3">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Medical Information</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Health News & Care Tips
            </h2>
            <p className="text-slate-500 text-sm mt-1 max-w-xl font-normal">
              Read medical articles, health education, and wellness guides published by our medical specialists.
            </p>
          </div>

          <a
            href="#contact"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition group"
          >
            <span>View All News</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        {/* 4 Article Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ARTICLES.map((article) => (
            <article
              key={article.id}
              className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                {/* Article Image Container */}
                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  
                  {/* Category Pill Tag */}
                  <span className={`absolute top-4 left-4 text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm ${article.badgeColor}`}>
                    {article.category}
                  </span>
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold mb-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{article.date}</span>
                  </div>

                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                    {article.title}
                  </h3>

                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed font-normal">
                    {article.summary}
                  </p>
                </div>
              </div>

              {/* Footer Read More link */}
              <div className="px-5 pb-5 pt-2 border-t border-slate-100/60">
                <span className="text-xs font-bold text-blue-600 group-hover:text-blue-700 flex items-center gap-1">
                  <span>Read Article</span>
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                </span>
              </div>

            </article>
          ))}
        </div>

      </div>
    </section>
  );
}
