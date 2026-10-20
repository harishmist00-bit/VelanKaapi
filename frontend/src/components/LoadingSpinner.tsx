import { Loader2 } from "lucide-react";

export function LoadingSpinner({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-sm text-slate-500 ${className}`} role="status">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}
