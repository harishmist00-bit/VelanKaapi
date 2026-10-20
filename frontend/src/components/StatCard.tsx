import type { LucideIcon } from "lucide-react";

export function StatCard({ label, value, icon: Icon, hint, tone = "default" }: { label: string; value: string | number; icon: LucideIcon; hint?: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const tones = { default: "bg-slate-100 text-slate-600", good: "bg-brand-100 text-brand-700", warn: "bg-amber-100 text-amber-700", bad: "bg-red-100 text-red-700" };
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}><Icon size={22} /></div>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">{label}</p>
        <p className="truncate text-xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
