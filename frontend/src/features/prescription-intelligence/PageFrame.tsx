import type { ReactNode } from "react";
import { CircleSlash, type LucideIcon } from "lucide-react";

export const controlStyle = "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
export const buttonStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function PageFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      {children}
    </main>
  );
}

export function Section({ title, icon: Icon, children, id }: { title: string; icon: LucideIcon; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label={title}>
      <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold text-slate-900"><Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-purple-600" />{title}</h2>
      {children}
    </section>
  );
}

export function Unavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
      <CircleSlash aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div><p className="text-xs font-bold text-slate-700">{title}</p><div className="mt-1.5 text-xs leading-relaxed text-slate-500">{children}</div></div>
    </div>
  );
}
