import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { errorMessage } from "../../api/client";
import { reportsApi } from "../../api/endpoints";
import { DataTable } from "../../components/DataTable";
import { ErrorState } from "../../components/ErrorState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../context/ToastContext";
import { useFetch } from "../../hooks/useFetch";
import { formatMoney } from "../../utils/money";
import { printArea } from "../../utils/print";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const PRESETS: [string, number][] = [["Today", 0], ["Last 7 days", 6], ["Last 30 days", 29]];

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [group, setGroup] = useState<"day" | "week" | "month">("day");
  const p = { date_from: from, date_to: to };
  const sales = useFetch(() => reportsApi.sales({ ...p, group }), [from, to, group]);
  const pay = useFetch(() => reportsApi.payments(p), [from, to]);
  const top = useFetch(() => reportsApi.topItems({ ...p, limit: 10 }), [from, to]);

  const download = async (type: string) => {
    try {
      const blob = await reportsApi.csv({ ...p, type, group });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${type}_${from}_${to}.csv`; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const s = sales.data?.summary;

  return (
    <>
      <PageHeader title="Reports" subtitle="Calculated on the server from recorded orders and payments"
        actions={<button className="btn-secondary" onClick={() => printArea("a4")} disabled={!sales.data}><Printer size={16} /> Print report</button>} />
      <div className="no-print card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="flex gap-1">{PRESETS.map(([l, n]) => <button key={l} className="btn-secondary btn-sm" onClick={() => { setFrom(daysAgo(n)); setTo(daysAgo(0)); }}>{l}</button>)}</div>
        <label className="text-sm text-slate-600">From <input type="date" className="input !w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm text-slate-600">To <input type="date" className="input !w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm text-slate-600">Group by <select className="input !w-auto" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label>
        <div className="ml-auto flex flex-wrap gap-1">{[["sales", "Sales"], ["orders", "Orders"], ["payments", "Payments"], ["top-items", "Top items"], ["categories", "Categories"], ["cashiers", "Cashiers"]].map(([k, l]) => <button key={k} className="btn-secondary btn-sm" onClick={() => download(k)}><Download size={13} /> {l} CSV</button>)}</div>
      </div>

      {sales.error ? <ErrorState message={sales.error} onRetry={sales.reload} /> : !sales.data || !s ? <LoadingSpinner /> : (
        <div id="print-area" className="space-y-4">
          <h2 className="hidden text-lg font-semibold print:block">Sales report: {from} to {to}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Orders", String(s.orders)], ["Gross sales", formatMoney(s.gross_sales)], ["Discounts", formatMoney(s.discounts)], ["Refunds", formatMoney(s.refunds)], ["Tax collected", formatMoney(s.tax_collected)], ["Total billed", formatMoney(s.total_billed)], ["Net sales (excl. tax)", formatMoney(s.net_sales)], ["Net collected", formatMoney(pay.data?.net_collected)]].map(([l, v]) => (
              <div key={l} className="card p-3"><p className="text-xs text-slate-500">{l}</p><p className="text-lg font-semibold">{v}</p></div>
            ))}
          </div>
          <section className="card p-4">
            <h3 className="mb-2 font-semibold">Sales by {group}</h3>
            {sales.data.series.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No sales in this period.</p> : (
              <div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={sales.data.series.map((r) => ({ ...r, total: Number(r.total) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => formatMoney(v)} /><Bar dataKey="total" name="Sales" fill="#16a34a" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            )}
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Payment methods"><DataTable rows={pay.data?.methods} rowKey={(r) => r.method} emptyTitle="No payments" columns={[{ key: "method", header: "Method" }, { key: "count", header: "Payments" }, { key: "total", header: "Amount", className: "text-right", render: (r) => formatMoney(r.total) }]} />
              {pay.data && <p className="px-4 py-2 text-xs text-slate-500">Received {formatMoney(pay.data.received)} − refunded {formatMoney(pay.data.refunded)} = {formatMoney(pay.data.net_collected)}</p>}</Block>
            <Block title="Best-selling items"><DataTable rows={top.data ?? undefined} rowKey={(r) => r.menu_item_id} emptyTitle="No items sold" columns={[{ key: "name", header: "Item" }, { key: "quantity", header: "Qty" }, { key: "revenue", header: "Revenue", className: "text-right", render: (r) => formatMoney(r.revenue) }]} /></Block>
            <Block title="Sales by category"><DataTable rows={sales.data.categories} rowKey={(r) => r.category} emptyTitle="No sales" columns={[{ key: "category", header: "Category" }, { key: "quantity", header: "Qty" }, { key: "revenue", header: "Revenue", className: "text-right", render: (r) => formatMoney(r.revenue) }]} /></Block>
            <Block title="Cashier-wise sales"><DataTable rows={sales.data.cashiers} rowKey={(r) => r.cashier} emptyTitle="No sales" columns={[{ key: "cashier", header: "Cashier" }, { key: "orders", header: "Orders" }, { key: "total", header: "Total", className: "text-right", render: (r) => formatMoney(r.total) }]} /></Block>
          </div>
          <p className="text-xs text-slate-500">Cancelled orders are excluded. Net sales = total billed − tax − refunds. Sales are counted on the day the order was placed.</p>
        </div>
      )}
    </>
  );
}

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="card"><h3 className="border-b border-slate-200 px-4 py-3 font-semibold">{title}</h3>{children}</section>;
