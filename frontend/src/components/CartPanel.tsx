import { Minus, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { CalcResult, DiscountType } from "../types/models";
import type { CartAction, CartLine } from "../utils/cart";
import { formatMoney } from "../utils/money";
import { VegMark } from "./POSMenuGrid";

interface Props {
  lines: CartLine[]; dispatch: React.Dispatch<CartAction>; calc: CalcResult | null; calcError: string | null; calcLoading: boolean;
  discountType: DiscountType; discountValue: string; onDiscount: (t: DiscountType, v: string) => void;
  orderNotes: string; onOrderNotes: (v: string) => void;
}

export function CartPanel({ lines, dispatch, calc, calcError, calcLoading, discountType, discountValue, onDiscount, orderNotes, onOrderNotes }: Props) {
  const [noteOpen, setNoteOpen] = useState<number | null>(null);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-[120px] flex-1 divide-y divide-slate-100 overflow-y-auto">
        {lines.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">The cart is empty. Tap a menu item to add it.</p>}
        {lines.map((l) => (
          <div key={l.menu_item_id} className="px-4 py-2.5">
            <div className="flex items-start gap-2">
              <VegMark veg={l.is_veg} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{l.name}</p>
                <p className="text-xs text-slate-500">{formatMoney(l.price)} each</p>
              </div>
              <div className="flex items-center gap-1">
                <button className="btn-secondary btn-sm !px-1.5" onClick={() => dispatch({ type: "dec", id: l.menu_item_id })} aria-label={`Decrease ${l.name}`}><Minus size={14} /></button>
                <span className="w-7 text-center text-sm font-semibold" aria-label="Quantity">{l.quantity}</span>
                <button className="btn-secondary btn-sm !px-1.5" onClick={() => dispatch({ type: "inc", id: l.menu_item_id })} aria-label={`Increase ${l.name}`}><Plus size={14} /></button>
              </div>
              <div className="w-20 text-right text-sm font-medium">{formatMoney(calc?.lines.find((c) => c.menu_item_id === l.menu_item_id)?.line_subtotal ?? Number(l.price) * l.quantity)}</div>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-6">
              <button className="text-xs text-slate-500 hover:text-brand-700" onClick={() => setNoteOpen(noteOpen === l.menu_item_id ? null : l.menu_item_id)}><NotebookPen size={12} className="mr-1 inline" />{l.notes || "Add note"}</button>
              <button className="ml-auto text-xs text-red-500 hover:text-red-700" onClick={() => dispatch({ type: "remove", id: l.menu_item_id })} aria-label={`Remove ${l.name}`}><Trash2 size={13} className="inline" /> Remove</button>
            </div>
            {noteOpen === l.menu_item_id && <input autoFocus className="input mt-1.5 ml-6 !w-[calc(100%-1.5rem)]" maxLength={255} placeholder="e.g. less spicy, no onion" value={l.notes} onChange={(e) => dispatch({ type: "note", id: l.menu_item_id, notes: e.target.value })} onKeyDown={(e) => e.key === "Enter" && setNoteOpen(null)} />}
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <label htmlFor="disc-type" className="text-sm text-slate-600">Discount</label>
          <select id="disc-type" className="input !w-28" value={discountType} onChange={(e) => onDiscount(e.target.value as DiscountType, e.target.value === "NONE" ? "" : discountValue)}>
            <option value="NONE">None</option><option value="PERCENT">Percent %</option><option value="FIXED">Amount ₹</option>
          </select>
          {discountType !== "NONE" && <input aria-label="Discount value" className="input" type="number" min="0" step="0.01" inputMode="decimal" value={discountValue} onChange={(e) => onDiscount(discountType, e.target.value)} />}
        </div>
        <textarea className="input" rows={1} placeholder="Order note for the kitchen (optional)" value={orderNotes} onChange={(e) => onOrderNotes(e.target.value)} aria-label="Order notes" />

        {calcError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{calcError}</p>}
        <dl className={`space-y-1 text-sm ${calcLoading ? "opacity-60" : ""}`}>
          <Row label="Subtotal" value={calc ? formatMoney(calc.subtotal) : "—"} />
          {calc && Number(calc.discount_amount) > 0 && <Row label="Discount" value={`-${formatMoney(calc.discount_amount)}`} />}
          <Row label="Taxes (GST)" value={calc ? formatMoney(calc.tax_total) : "—"} />
          {calc && Number(calc.round_off) !== 0 && <Row label="Round off" value={formatMoney(calc.round_off)} />}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <dt>Payable</dt><dd className="text-xl text-brand-700" data-testid="payable">{calc ? formatMoney(calc.grand_total) : "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-slate-600"><dt>{label}</dt><dd>{value}</dd></div>
);
