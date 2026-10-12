"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen, ClipboardCheck, FileClock, History, LayoutDashboard, LogOut,
  Menu, PanelLeftClose, PanelLeftOpen, Pill, Settings, X,
} from "lucide-react";
import { DoctorProvider, useDoctor } from "./DoctorContext";
import { logoutUser } from "@/lib/api";

const navigation = [
  { label: "Dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
  { label: "Prescription Workspace", href: "/doctor/prescription-workspace", icon: Pill },
  { label: "Prescription Records", href: "/doctor/prescription-records", icon: FileClock },
  { label: "Patient Medication History", href: "/doctor/patient-medication-history", icon: History },
  { label: "Medicine Knowledge", href: "/doctor/medicine-knowledge", icon: BookOpen },
  { label: "Validation and Approval History", href: "/doctor/validation-approval-history", icon: ClipboardCheck },
];
const settings = { label: "Profile and Settings", href: "/doctor/profile-settings", icon: Settings };
const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2";

function Navigation({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { doctorName, isDoctorSession } = useDoctor();
  const [tooltip, setTooltip] = useState<{ label: string; left: number; top: number } | null>(null);

  function showTooltip(element: HTMLElement, label: string) {
    if (!compact) return;
    const bounds = element.getBoundingClientRect();
    setTooltip({ label, left: bounds.right + 12, top: bounds.top + bounds.height / 2 });
  }

  function renderLink(item: typeof settings) {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <div key={item.href} className="group relative">
        <Link
          href={item.href}
          onClick={() => { setTooltip(null); onNavigate?.(); }}
          onMouseEnter={(event) => showTooltip(event.currentTarget, item.label)}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(event) => showTooltip(event.currentTarget, item.label)}
          onBlur={() => setTooltip(null)}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          title={compact ? item.label : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${focusStyle} ${compact ? "justify-center" : ""} ${active ? "border-purple-200 bg-purple-50 text-purple-700" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-purple-700"}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className={compact ? "sr-only" : "leading-relaxed"}>{item.label}</span>
        </Link>
      </div>
    );
  }

  async function logout() {
    try {
      await logoutUser();
      onNavigate?.();
      router.push("/login");
    } catch {
      window.alert("Logout failed. Please try again.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onScrollCapture={() => setTooltip(null)}>
      <nav aria-label="Doctor navigation" className="min-h-0 space-y-1.5 overflow-y-auto px-3 py-5">
        {navigation.map(renderLink)}
      </nav>
      <div className="mt-auto shrink-0 space-y-2 border-t border-slate-200 p-3">
        {!compact && (
          <div className="px-3 py-2">
            <p className="text-xs font-bold text-slate-800">{doctorName}</p>
            <p className="mt-1 text-[11px] text-slate-500">{isDoctorSession ? "Doctor session" : "Sample clinician"}</p>
          </div>
        )}
        {renderLink(settings)}
        <div className="group relative">
          <button type="button" onClick={logout} aria-label="Log out" title={compact ? "Log out" : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget, "Log out")}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event.currentTarget, "Log out")}
            onBlur={() => setTooltip(null)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 ${focusStyle} ${compact ? "justify-center" : ""}`}>
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className={compact ? "sr-only" : ""}>Log out</span>
          </button>
        </div>
      </div>
      {compact && tooltip && <span data-sidebar-tooltip aria-hidden="true" style={{ left: tooltip.left, top: tooltip.top }} className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">{tooltip.label}</span>}
    </div>
  );
}

function ClinicalShell({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { doctorName, hospital, isDoctorSession } = useDoctor();

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  function closeDrawer() { drawer.current?.close(); }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <a href="#doctor-content" className={`sr-only fixed left-4 top-4 z-[60] rounded-xl bg-white p-3 text-sm font-semibold focus:not-sr-only ${focusStyle}`}>Skip to content</a>
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button ref={menuButton} type="button" aria-label="Open doctor navigation" aria-haspopup="dialog" aria-controls="doctor-mobile-navigation" aria-expanded={mobileOpen}
            onClick={() => { drawer.current?.showModal(); setMobileOpen(true); }} className={`rounded-xl border border-slate-200 p-2.5 text-slate-600 lg:hidden ${focusStyle}`}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-600 text-lg font-black text-white shadow-md shadow-purple-600/25">M</div>
          <div className="min-w-0">
            <p className="text-xl font-black tracking-tight">MediTrack <span className="ml-1 hidden rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-purple-700 sm:inline">Clinical Console</span></p>
          </div>
        </div>
        <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-3 py-1.5 md:flex">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-xs font-bold text-white">DR</span>
          <div><p className="text-xs font-bold">{doctorName}</p><p className="text-[10px] text-slate-500">{hospital}{!isDoctorSession && " · Sample clinician"}</p></div>
        </div>
      </header>

      <div className="flex">
        <aside aria-label="Doctor sidebar" className={`sticky top-20 z-40 hidden h-[calc(100dvh-5rem)] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex ${compact ? "w-20" : "w-64"}`}>
          <div className={`flex min-h-14 items-center border-b border-slate-100 px-3 ${compact ? "justify-center" : "justify-between"}`}>
            {!compact && <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Doctor workspace</span>}
            <button type="button" aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!compact} title={compact ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCompact((value) => !value)} className={`rounded-lg p-2 text-slate-500 hover:bg-purple-50 hover:text-purple-700 ${focusStyle}`}>
              {compact ? <PanelLeftOpen aria-hidden="true" className="h-4 w-4" /> : <PanelLeftClose aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
          <Navigation compact={compact} />
        </aside>
        <div id="doctor-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
          <footer className="mt-auto flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-500">
            <span>&copy; {new Date().getFullYear()} MediTrack Clinical Decision Support System.</span>
            <span>Doctor Diagnostic &amp; Patient Prescription History Console.</span>
          </footer>
        </div>
      </div>

      <dialog ref={drawer} id="doctor-mobile-navigation" aria-labelledby="doctor-drawer-title"
        onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}
        onClose={() => { setMobileOpen(false); menuButton.current?.focus(); }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-slate-900/50">
        <div className="flex h-full w-[min(20rem,85vw)] flex-col overflow-y-auto bg-white shadow-2xl">
          <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-5">
            <h2 id="doctor-drawer-title" className="text-sm font-bold">Doctor navigation</h2>
            <button type="button" aria-label="Close doctor navigation" onClick={closeDrawer} className={`rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 ${focusStyle}`}><X aria-hidden="true" className="h-5 w-5" /></button>
          </div>
          <Navigation onNavigate={closeDrawer} />
        </div>
      </dialog>
    </div>
  );
}

export default function DoctorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasClinicalNavigation = [...navigation, settings].some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  // Keep the separate outbreak page and any other doctor modules in their existing layout.
  if (!hasClinicalNavigation) return children;
  return <DoctorProvider><ClinicalShell>{children}</ClinicalShell></DoctorProvider>;
}
