const COLORS: Record<string, string> = {
  PAID: "bg-brand-100 text-brand-700", COMPLETED: "bg-brand-100 text-brand-700", AVAILABLE: "bg-brand-100 text-brand-700", READY: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700", NEW: "bg-amber-100 text-amber-700", PARTIAL: "bg-amber-100 text-amber-700", RESERVED: "bg-sky-100 text-sky-700",
  PREPARING: "bg-blue-100 text-blue-700", OCCUPIED: "bg-orange-100 text-orange-700", UNPAID: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-red-100 text-red-700", REFUNDED: "bg-red-100 text-red-700", PARTIALLY_REFUNDED: "bg-orange-100 text-orange-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}
