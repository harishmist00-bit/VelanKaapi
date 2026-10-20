import { useEffect, useState } from "react";

import { authApi, ordersApi } from "../../api/endpoints";
import { DataTable } from "../../components/DataTable";
import { OrderDetailModal } from "../../components/OrderDetailModal";
import { PageHeader } from "../../components/PageHeader";
import { SearchInput } from "../../components/SearchInput";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useDebounce } from "../../hooks/useDebounce";
import { useFetch } from "../../hooks/useFetch";
import { usePagination } from "../../hooks/usePagination";
import { formatDateTime, formatMoney } from "../../utils/money";

const sel = "input !w-auto";

export default function Orders() {
  const { hasRole } = useAuth();
  const [f, setF] = useState({ search: "", status: "", payment_status: "", order_type: "", cashier: "", date_from: "", date_to: "" });
  const [openId, setOpenId] = useState<number | null>(null);
  const { page, setPage, pageSize } = usePagination(20);
  const search = useDebounce(f.search, 300);
  const staff = useFetch(() => (hasRole("ADMIN", "MANAGER") ? authApi.staff() : Promise.resolve([])), []);
  const list = useFetch(() => ordersApi.list({ ...f, search, page, page_size: pageSize }), [search, f.status, f.payment_status, f.order_type, f.cashier, f.date_from, f.date_to, page]);
  useEffect(() => setPage(1), [search, f.status, f.payment_status, f.order_type, f.cashier, f.date_from, f.date_to, setPage]);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  return (
    <>
      <PageHeader title="Orders" subtitle={hasRole("CASHIER") ? "Your orders" : "All orders"} />
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <SearchInput className="w-60" value={f.search} onChange={(v) => set({ search: v })} placeholder="Order, invoice or customer" />
          <select className={sel} aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All statuses</option>{["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
          </select>
          <select className={sel} aria-label="Payment status" value={f.payment_status} onChange={(e) => set({ payment_status: e.target.value })}>
            <option value="">All payments</option><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partially paid</option><option value="PAID">Paid</option><option value="PARTIALLY_REFUNDED">Partially refunded</option><option value="REFUNDED">Refunded</option>
          </select>
          <select className={sel} aria-label="Order type" value={f.order_type} onChange={(e) => set({ order_type: e.target.value })}>
            <option value="">All types</option><option value="DINE_IN">Dine-in</option><option value="TAKEAWAY">Takeaway</option><option value="DELIVERY">Delivery</option>
          </select>
          {!!staff.data?.length && (
            <select className={sel} aria-label="Cashier" value={f.cashier} onChange={(e) => set({ cashier: e.target.value })}>
              <option value="">All cashiers</option>{staff.data.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1 text-sm text-slate-500">From <input type="date" className={sel} value={f.date_from} onChange={(e) => set({ date_from: e.target.value })} /></label>
          <label className="flex items-center gap-1 text-sm text-slate-500">To <input type="date" className={sel} value={f.date_to} onChange={(e) => set({ date_to: e.target.value })} /></label>
        </div>
        <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(o) => o.id} onRowClick={(o) => setOpenId(o.id)}
          page={page} pageSize={pageSize} count={list.data?.count} onPage={setPage} emptyTitle="No orders match" emptyHint="Change the filters or place an order in POS Billing."
          columns={[
            { key: "order_number", header: "Order", render: (o) => <span className="font-medium">{o.order_number}</span> },
            { key: "invoice", header: "Invoice", render: (o) => o.invoice_number ?? "—" },
            { key: "created_at", header: "Date", render: (o) => formatDateTime(o.created_at) },
            { key: "type", header: "Type", render: (o) => o.order_type.replace("_", "-").toLowerCase() + (o.table_number ? ` · ${o.table_number}` : "") },
            { key: "cashier", header: "Cashier", render: (o) => o.cashier_name },
            { key: "status", header: "Status", render: (o) => <StatusBadge status={o.status} /> },
            { key: "pay", header: "Payment", render: (o) => <StatusBadge status={o.payment_status} /> },
            { key: "total", header: "Total", className: "text-right", render: (o) => formatMoney(o.grand_total) },
          ]} />
      </div>
      <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />
    </>
  );
}
