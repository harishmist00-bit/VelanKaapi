import type { OrderType, RestaurantTable } from "../../types/models";

export interface Options { orderType: OrderType; tableId: string; customerName: string; customerPhone: string }

export function OrderOptions({ value, onChange, tables }: { value: Options; onChange: (o: Options) => void; tables: RestaurantTable[] }) {
  const set = (p: Partial<Options>) => onChange({ ...value, ...p });
  const types: [OrderType, string][] = [["DINE_IN", "Dine-in"], ["TAKEAWAY", "Takeaway"], ["DELIVERY", "Delivery"]];
  return (
    <div className="space-y-3 border-b border-slate-200 p-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Order type">
        {types.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={value.orderType === k} onClick={() => set({ orderType: k, tableId: k === "DINE_IN" ? value.tableId : "" })}
            className={`rounded-md py-1.5 text-sm ${value.orderType === k ? "bg-white font-medium text-brand-700 shadow-sm" : "text-slate-600"}`}>{label}</button>
        ))}
      </div>
      {value.orderType === "DINE_IN" && (
        <select className="input" aria-label="Table" value={value.tableId} onChange={(e) => set({ tableId: e.target.value })}>
          <option value="">Select a table…</option>
          {tables.map((t) => <option key={t.id} value={t.id} disabled={t.status === "OCCUPIED"}>{t.number} · seats {t.capacity}{t.status !== "AVAILABLE" ? ` (${t.status.toLowerCase()})` : ""}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Customer name (optional)" aria-label="Customer name" value={value.customerName} onChange={(e) => set({ customerName: e.target.value })} maxLength={120} />
        <input className="input" placeholder="Phone (optional)" aria-label="Customer phone" inputMode="tel" value={value.customerPhone} onChange={(e) => set({ customerPhone: e.target.value.replace(/[^\d+]/g, "") })} maxLength={16} />
      </div>
    </div>
  );
}
