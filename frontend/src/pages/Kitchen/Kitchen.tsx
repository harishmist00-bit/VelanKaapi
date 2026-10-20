import { ChefHat, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../../api/client";
import { kitchenApi } from "../../api/endpoints";
import { EmptyState, ErrorState } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { usePolling } from "../../hooks/usePolling";
import type { KitchenOrder, KitchenStatus } from "../../types/models";

const COLUMNS: { key: KitchenStatus; title: string; next?: KitchenStatus; action?: string }[] = [
  { key: "NEW", title: "New", next: "PREPARING", action: "Start preparing" },
  { key: "PREPARING", title: "Preparing", next: "READY", action: "Mark ready" },
  { key: "READY", title: "Ready", next: "COMPLETED", action: "Served / done" },
];

function elapsed(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min`;
}

export default function Kitchen() {
  const toast = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seen = useRef<Set<number> | null>(null);

  usePolling(async () => {
    try {
      const data = await kitchenApi.list();
      const ids = new Set(data.map((o) => o.id));
      if (seen.current) {
        const added = data.filter((o) => !seen.current!.has(o.id)).map((o) => o.id);
        if (added.length) {
          setFresh((f) => new Set([...f, ...added]));
          setTimeout(() => setFresh((f) => { const n = new Set(f); added.forEach((i) => n.delete(i)); return n; }), 30000);
        }
      }
      seen.current = ids;
      setOrders(data); setError(null);
    } catch (e) { setError(errorMessage(e)); }
  }, 5000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const advance = async (o: KitchenOrder, status: KitchenStatus) => {
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, kitchen_status: status } : x)).filter((x) => x.kitchen_status !== "COMPLETED"));
    try { await kitchenApi.setStatus(o.id, status); } catch (e) { toast.error(errorMessage(e)); }
    try { setOrders(await kitchenApi.list()); } catch { /* next poll will recover */ }
  };

  return (
    <>
      <PageHeader title="Kitchen display" subtitle="Updates every 5 seconds" />
      {error && <div className="mb-4"><ErrorState message={`${error} Showing the last orders received.`} /></div>}
      {orders.length === 0 && !error ? <EmptyState title="No orders in the kitchen" hint="New orders appear here as soon as they are placed." /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = orders.filter((o) => o.kitchen_status === col.key);
            return (
              <section key={col.key} aria-label={col.title}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><ChefHat size={16} /> {col.title} <span className="rounded-full bg-slate-200 px-2 text-xs">{list.length}</span></h2>
                <div className="space-y-3">
                  {list.map((o) => (
                    <article key={o.id} className={`card p-4 ${fresh.has(o.id) ? "ring-2 ring-brand-500" : ""}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-lg font-semibold">{o.table_number ? `Table ${o.table_number}` : o.order_number}</p>
                          <p className="text-xs text-slate-500">{o.order_number} · {o.order_type.replace("_", "-").toLowerCase()}</p>
                        </div>
                        <div className="text-right">
                          {fresh.has(o.id) && <span className="mb-1 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">New</span>}
                          <p className="flex items-center justify-end gap-1 text-xs text-slate-500"><Clock size={12} /> {elapsed(o.created_at, now)}</p>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                        {o.items.map((i) => (
                          <li key={i.id} className="text-sm"><span className="mr-2 inline-block min-w-6 rounded bg-slate-100 px-1.5 text-center font-semibold">{i.quantity}×</span>{i.name}{i.notes && <span className="block pl-9 text-xs font-medium text-amber-700">Note: {i.notes}</span>}</li>
                        ))}
                      </ul>
                      {o.notes && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Order note: {o.notes}</p>}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <StatusBadge status={o.payment_status} />
                        {col.next && <button className="btn-primary btn-sm" onClick={() => advance(o, col.next!)}>{col.action}</button>}
                      </div>
                    </article>
                  ))}
                  {list.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
