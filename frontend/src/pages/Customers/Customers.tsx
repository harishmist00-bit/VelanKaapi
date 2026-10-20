import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { errorMessage } from "../../api/client";
import { customersApi } from "../../api/endpoints";
import { DataTable } from "../../components/DataTable";
import { FieldDef, FormModal } from "../../components/FormModal";
import { Modal } from "../../components/Modal";
import { OrderDetailModal } from "../../components/OrderDetailModal";
import { PageHeader } from "../../components/PageHeader";
import { SearchInput } from "../../components/SearchInput";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { useFetch } from "../../hooks/useFetch";
import { usePagination } from "../../hooks/usePagination";
import type { Customer } from "../../types/models";
import { formatDateTime, formatMoney } from "../../utils/money";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Name", required: true, maxLength: 120 },
  { name: "phone", label: "Phone", type: "tel", required: true, maxLength: 20, hint: "Digits only, 7 to 15, optional + prefix." },
  { name: "email", label: "Email", type: "email", colSpan: 2 },
];

export default function Customers() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const [history, setHistory] = useState<Customer | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const { page, setPage, pageSize } = usePagination(20);
  const q = useDebounce(search, 300);
  const list = useFetch(() => customersApi.list({ search: q, page, page_size: pageSize }), [q, page]);
  useEffect(() => setPage(1), [q, setPage]);
  const orders = useFetch(() => (history ? customersApi.orders(history.id) : Promise.resolve([])), [history?.id]);

  return (
    <>
      <PageHeader title="Customers" actions={<button className="btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Add customer</button>} />
      <div className="card">
        <div className="border-b border-slate-200 p-3"><SearchInput className="max-w-sm" value={search} onChange={setSearch} placeholder="Search name, phone or email" /></div>
        <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(c) => c.id} page={page} pageSize={pageSize} count={list.data?.count} onPage={setPage}
          emptyTitle="No customers found" emptyHint="Customers are added automatically when a phone number is entered at billing."
          columns={[
            { key: "name", header: "Name", render: (c) => <span className="font-medium">{c.name}</span> },
            { key: "phone", header: "Phone" },
            { key: "orders", header: "Orders", render: (c) => c.order_count },
            { key: "spent", header: "Total spent", render: (c) => formatMoney(c.total_spent) },
            { key: "points", header: "Loyalty points" },
            { key: "actions", header: "", className: "text-right", render: (c) => <div className="flex justify-end gap-2"><button className="btn-secondary btn-sm" onClick={() => setHistory(c)}>Order history</button><button className="btn-ghost btn-sm" onClick={() => setEdit(c)}>Edit</button></div> },
          ]} />
      </div>
      <FormModal open={edit !== null} title={edit === "new" ? "Add customer" : "Edit customer"} fields={FIELDS} initial={edit && edit !== "new" ? { ...edit } : {}} onClose={() => setEdit(null)}
        onSubmit={async (v) => { try { await customersApi.save(edit === "new" || !edit ? null : edit.id, v as Partial<Customer>); toast.success("Customer saved"); setEdit(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `${history.name} · order history` : ""} size="lg">
        <DataTable rows={orders.data ?? undefined} loading={orders.loading} error={orders.error} rowKey={(o) => o.id} onRowClick={(o) => setOrderId(o.id)} emptyTitle="No orders yet"
          columns={[
            { key: "n", header: "Order", render: (o) => <span className="font-medium">{o.order_number}</span> },
            { key: "d", header: "Date", render: (o) => formatDateTime(o.created_at) },
            { key: "s", header: "Status", render: (o) => <StatusBadge status={o.status} /> },
            { key: "t", header: "Total", className: "text-right", render: (o) => formatMoney(o.grand_total) },
          ]} />
      </Modal>
      <OrderDetailModal orderId={orderId} onClose={() => setOrderId(null)} />
    </>
  );
}
