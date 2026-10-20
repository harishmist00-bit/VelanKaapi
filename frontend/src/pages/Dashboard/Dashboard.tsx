import { Ban, Clock, IndianRupee, Package, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { reportsApi } from "../../api/endpoints";
import { DataTable } from "../../components/DataTable";
import { ErrorState } from "../../components/ErrorState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { useFetch } from "../../hooks/useFetch";
import { usePolling } from "../../hooks/usePolling";
import { formatDateTime, formatMoney } from "../../utils/money";

const TYPES = { DINE_IN: "Dine-in", TAKEAWAY: "Takeaway", DELIVERY: "Delivery" } as const;

export default function Dashboard() {
  const [days, setDays] = useState<7 | 30>(7);
  const summary = useFetch(reportsApi.summary, []);
  const chart = useFetch(() => reportsApi.chart(days), [days]);
  usePolling(() => { void summary.reload(); }, 60000);

  if (summary.error && !summary.data) return <ErrorState message={summary.error} onRetry={summary.reload} />;
  if (!summary.data) return <LoadingSpinner />;
  const s = summary.data;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Today, ${new Date(s.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Today’s total sales" value={formatMoney(s.total_sales)} icon={IndianRupee} tone="good" />
        <StatCard label="Orders" value={s.orders} icon={ShoppingBag} />
        <StatCard label="Revenue collected" value={formatMoney(s.revenue_collected)} icon={Wallet} tone="good" hint="Payments received minus refunds" />
        <StatCard label="Pending payments" value={formatMoney(s.pending_payments)} icon={Clock} tone="warn" hint={`${s.pending_orders} open ${s.pending_orders === 1 ? "order" : "orders"}`} />
        <StatCard label="Cancelled orders" value={s.cancelled_orders} icon={Ban} tone={s.cancelled_orders ? "bad" : "default"} />
        <StatCard label="Average order value" value={formatMoney(s.average_order_value)} icon={TrendingUp} />
      </div>
      {s.low_stock_count > 0 && <p className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"><Package size={16} /> {s.low_stock_count} ingredient{s.low_stock_count > 1 ? "s are" : " is"} at or below the reorder level. Check Inventory.</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Sales, last {days} days</h3>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              {([7, 30] as const).map((d) => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`px-3 py-1 ${days === d ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}>{d} days</button>)}
            </div>
          </div>
          {chart.error ? <ErrorState message={chart.error} onRetry={chart.reload} /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(chart.data ?? []).map((d) => ({ ...d, total: Number(d.total), label: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={days === 30 ? 4 : 0} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Bar dataKey="total" name="Sales" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h3 className="mb-3 font-semibold text-slate-800">Order types today</h3>
          <ul className="space-y-3">
            {(Object.keys(TYPES) as (keyof typeof TYPES)[]).map((k) => (
              <li key={k} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{TYPES[k]}</span>
                <span><strong>{s.order_types[k]?.orders ?? 0}</strong> <span className="text-slate-400">· {formatMoney(s.order_types[k]?.total)}</span></span>
              </li>
            ))}
          </ul>
          <h3 className="mb-3 mt-6 font-semibold text-slate-800">Best sellers (30 days)</h3>
          {s.top_items.length === 0 ? <p className="text-sm text-slate-400">No sales yet.</p> : (
            <ol className="space-y-2">
              {s.top_items.map((i) => <li key={i.menu_item_id} className="flex justify-between text-sm"><span className="truncate pr-2 text-slate-700">{i.name}</span><span className="shrink-0 text-slate-500">{i.quantity} sold</span></li>)}
            </ol>
          )}
        </section>
      </div>

      <section className="card mt-6">
        <h3 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold text-slate-800"><Receipt size={16} /> Recent transactions</h3>
        <DataTable rows={s.recent_transactions} rowKey={(o) => o.id} emptyTitle="No transactions yet" emptyHint="Orders placed in POS Billing appear here."
          columns={[
            { key: "order_number", header: "Order", render: (o) => <span className="font-medium">{o.order_number}</span> },
            { key: "created_at", header: "Time", render: (o) => formatDateTime(o.created_at) },
            { key: "type", header: "Type", render: (o) => TYPES[o.order_type] + (o.table_number ? ` · ${o.table_number}` : "") },
            { key: "payment", header: "Payment", render: (o) => <StatusBadge status={o.payment_status} /> },
            { key: "total", header: "Total", className: "text-right", render: (o) => formatMoney(o.grand_total) },
          ]} />
      </section>
    </>
  );
}
