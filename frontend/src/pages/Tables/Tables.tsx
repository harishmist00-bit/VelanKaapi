import { ArrowRightLeft, Plus, Users } from "lucide-react";
import { useState } from "react";

import { errorMessage } from "../../api/client";
import { tablesApi } from "../../api/endpoints";
import { EmptyState, ErrorState } from "../../components/ErrorState";
import { FieldDef, FormModal } from "../../components/FormModal";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { OrderDetailModal } from "../../components/OrderDetailModal";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useFetch } from "../../hooks/useFetch";
import { usePolling } from "../../hooks/usePolling";
import type { RestaurantTable } from "../../types/models";
import { formatMoney } from "../../utils/money";

const FIELDS: FieldDef[] = [
  { name: "number", label: "Table number or name", required: true, maxLength: 20 },
  { name: "capacity", label: "Seats", type: "number", required: true, min: 1, max: 50 },
  { name: "status", label: "Status", type: "select", required: true, options: [{ value: "AVAILABLE", label: "Available" }, { value: "RESERVED", label: "Reserved" }, { value: "OCCUPIED", label: "Occupied" }] },
];

export default function Tables() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const manager = hasRole("ADMIN", "MANAGER");
  const list = useFetch(() => tablesApi.list(), []);
  usePolling(() => { void list.reload(); }, 15000);
  const [edit, setEdit] = useState<RestaurantTable | "new" | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);

  const setStatus = async (t: RestaurantTable, status: RestaurantTable["status"]) => {
    try { await tablesApi.save(t.id, { status }); void list.reload(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <>
      <PageHeader title="Tables" subtitle="Live floor view" actions={manager && <button className="btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Add table</button>} />
      {list.error && !list.data ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data ? <LoadingSpinner /> : list.data.length === 0 ? (
        <EmptyState title="No tables yet" hint="Add tables so dine-in orders can be assigned to them." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.data.map((t) => (
            <div key={t.id} className={`card flex flex-col p-4 ${t.status === "OCCUPIED" ? "border-orange-300" : t.status === "RESERVED" ? "border-sky-300" : ""}`}>
              <div className="flex items-start justify-between">
                <div><p className="text-lg font-semibold text-slate-900">{t.number}</p><p className="flex items-center gap-1 text-xs text-slate-500"><Users size={12} /> {t.capacity} seats</p></div>
                <StatusBadge status={t.status} />
              </div>
              {t.current_order ? (
                <button className="mt-3 rounded-lg bg-slate-50 p-2.5 text-left text-sm hover:bg-slate-100" onClick={() => setOrderId(t.current_order!.id)}>
                  <span className="font-medium">{t.current_order.order_number}</span> · {formatMoney(t.current_order.grand_total)}
                  <span className="mt-1 flex gap-1"><StatusBadge status={t.current_order.status} /><StatusBadge status={t.current_order.payment_status} /></span>
                </button>
              ) : <p className="mt-3 text-sm text-slate-400">No open order</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {t.current_order && <button className="btn-secondary btn-sm" onClick={() => setOrderId(t.current_order!.id)}><ArrowRightLeft size={13} /> View / move</button>}
                {!t.current_order && t.status === "AVAILABLE" && <button className="btn-secondary btn-sm" onClick={() => setStatus(t, "RESERVED")}>Reserve</button>}
                {!t.current_order && t.status !== "AVAILABLE" && <button className="btn-secondary btn-sm" onClick={() => setStatus(t, "AVAILABLE")}>Release table</button>}
                {manager && <button className="btn-ghost btn-sm" onClick={() => setEdit(t)}>Edit</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <FormModal open={edit !== null} title={edit === "new" ? "Add table" : "Edit table"} fields={FIELDS} initial={edit && edit !== "new" ? { ...edit } : { capacity: 4, status: "AVAILABLE" }} onClose={() => setEdit(null)}
        onSubmit={async (v) => { try { await tablesApi.save(edit === "new" || !edit ? null : edit.id, v as Partial<RestaurantTable>); toast.success("Table saved"); setEdit(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
      <OrderDetailModal orderId={orderId} onClose={() => setOrderId(null)} onChanged={list.reload} />
    </>
  );
}
