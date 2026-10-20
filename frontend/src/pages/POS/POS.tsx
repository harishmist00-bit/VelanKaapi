import { CreditCard, Pause, Play, Printer, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { errorMessage, isNetworkError } from "../../api/client";
import { CreateOrderPayload, menuApi, ordersApi, PaymentInput, settingsApi, tablesApi } from "../../api/endpoints";
import { CartPanel } from "../../components/CartPanel";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Modal } from "../../components/Modal";
import { PaymentModal } from "../../components/PaymentModal";
import { POSMenuGrid } from "../../components/POSMenuGrid";
import { ReceiptModal } from "../../components/ReceiptModal";
import { SearchInput } from "../../components/SearchInput";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { useFetch } from "../../hooks/useFetch";
import type { CalcResult, DiscountType } from "../../types/models";
import type { CartLine } from "../../utils/cart";
import { Options, OrderOptions } from "./OrderOptions";

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const DEFAULT_OPTS: Options = { orderType: "DINE_IN", tableId: "", customerName: "", customerPhone: "" };

export default function POS() {
  const toast = useToast();
  const { lines, dispatch } = useCart();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [opts, setOpts] = useState<Options>(DEFAULT_OPTS);
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [discountValue, setDiscountValue] = useState("");
  const [notes, setNotes] = useState("");
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const idemKey = useRef<string | null>(null);

  const debouncedSearch = useDebounce(search, 250);
  const categories = useFetch(() => menuApi.categories({ is_active: true }), []);
  const items = useFetch(() => menuApi.items({ search: debouncedSearch, category: category ?? undefined, page_size: 200 }), [debouncedSearch, category]);
  const tables = useFetch(() => tablesApi.list(), []);
  const settings = useFetch(settingsApi.get, []);
  const held = useFetch(ordersApi.held, []);

  // Totals always come from the backend so the screen can never disagree with the bill.
  const cartKey = useMemo(() => JSON.stringify([lines.map((l) => [l.menu_item_id, l.quantity]), discountType, discountValue]), [lines, discountType, discountValue]);
  const debouncedKey = useDebounce(cartKey, 200);
  useEffect(() => {
    idemKey.current = null; // cart changed: any earlier attempt no longer matches
    if (!lines.length) { setCalc(null); setCalcError(null); return; }
    let live = true;
    setCalcLoading(true);
    ordersApi.calculate({ items: lines.map((l) => ({ menu_item_id: l.menu_item_id, quantity: l.quantity })), discount_type: discountType, discount_value: discountValue || "0" })
      .then((r) => { if (live) { setCalc(r); setCalcError(null); } })
      .catch((e) => { if (live) { setCalc(null); setCalcError(errorMessage(e)); } })
      .finally(() => { if (live) setCalcLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey]);

  const reset = useCallback(() => {
    dispatch({ type: "clear" }); setDiscountType("NONE"); setDiscountValue(""); setNotes(""); setOpts((o) => ({ ...DEFAULT_OPTS, orderType: o.orderType }));
    idemKey.current = null;
  }, [dispatch]);

  const validate = (): string | null => {
    if (!lines.length) return "Add at least one item.";
    if (calcError) return calcError;
    if (!calc) return "Totals are still loading.";
    if (opts.orderType === "DINE_IN" && !opts.tableId) return "Select a table for a dine-in order.";
    return null;
  };

  const buildPayload = (payments?: PaymentInput[]): CreateOrderPayload => ({
    items: lines.map((l) => ({ menu_item_id: l.menu_item_id, quantity: l.quantity, notes: l.notes || undefined })),
    discount_type: discountType, discount_value: discountValue || "0", order_type: opts.orderType,
    table_id: opts.orderType === "DINE_IN" ? Number(opts.tableId) : null, customer_name: opts.customerName || undefined, customer_phone: opts.customerPhone || undefined,
    notes: notes || undefined, payments,
  });

  const submit = async (payments?: PaymentInput[]) => {
    setSubmitting(true); setPayError(null);
    idemKey.current = idemKey.current ?? newKey(); // reused on retry after a network failure
    try {
      const order = await ordersApi.create(buildPayload(payments), idemKey.current);
      toast.success(payments ? `Payment received. Invoice ${order.invoice_number ?? order.order_number}` : `Order ${order.order_number} placed`);
      setPayOpen(false); setLastOrderId(order.id); setReceiptId(order.id);
      reset(); void tables.reload(); void items.reload();
    } catch (e) {
      if (!isNetworkError(e)) idemKey.current = null; // definitive answer: a fresh attempt gets a new key
      const msg = errorMessage(e);
      payOpen ? setPayError(msg) : toast.error(msg);
    } finally { setSubmitting(false); }
  };

  const openPay = () => { const p = validate(); p ? toast.error(p) : setPayOpen(true); };
  const place = () => { const p = validate(); p ? toast.error(p) : void submit(); };

  const hold = async () => {
    if (!lines.length) return;
    try {
      await ordersApi.hold(opts.customerName || `Held ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`, { lines, opts, discountType, discountValue, notes });
      toast.success("Order held. Resume it from “Held orders”."); reset(); void held.reload();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const resume = async (h: NonNullable<typeof held.data>[number]) => {
    if (lines.length && !window.confirm("Replace the current cart with the held order?")) return;
    const p = h.payload as { lines: CartLine[]; opts: Options; discountType: DiscountType; discountValue: string; notes: string };
    dispatch({ type: "set", lines: p.lines }); setOpts(p.opts); setDiscountType(p.discountType); setDiscountValue(p.discountValue); setNotes(p.notes);
    try { await ordersApi.discardHeld(h.id); } catch { /* already removed */ }
    void held.reload(); setHeldOpen(false);
  };

  return (
    <div className="grid h-[calc(100vh-7.5rem)] min-h-[560px] gap-4 lg:grid-cols-[1fr_400px]">
      <section className="flex min-h-0 flex-col">
        <div className="mb-3 flex flex-wrap gap-2">
          <SearchInput className="min-w-[200px] flex-1" value={search} onChange={setSearch} placeholder="Search menu items" />
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
          {[{ id: null, name: "All" }, ...(categories.data ?? [])].map((c) => (
            <button key={c.id ?? "all"} role="tab" aria-selected={category === c.id} onClick={() => setCategory(c.id)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${category === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>{c.name}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {items.error ? <p className="text-sm text-red-600">{items.error}</p> : <POSMenuGrid items={items.data?.results ?? []} loading={items.loading} onAdd={(i) => dispatch({ type: "add", item: i })} />}
        </div>
      </section>

      <aside className="card flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-800">Current order</h2>
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => setHeldOpen(true)}><Play size={14} /> Held{held.data?.length ? ` (${held.data.length})` : ""}</button>
            <button className="btn-ghost btn-sm" disabled={!lines.length} onClick={hold}><Pause size={14} /> Hold</button>
            <button className="btn-ghost btn-sm text-red-600" disabled={!lines.length} onClick={() => setConfirmClear(true)}><Trash2 size={14} /> Clear</button>
          </div>
        </div>
        <OrderOptions value={opts} onChange={setOpts} tables={tables.data ?? []} />
        <CartPanel lines={lines} dispatch={dispatch} calc={calc} calcError={calcError} calcLoading={calcLoading} discountType={discountType} discountValue={discountValue}
          onDiscount={(t, v) => { setDiscountType(t); setDiscountValue(v); }} orderNotes={notes} onOrderNotes={setNotes} />
        <div className="grid grid-cols-3 gap-2 border-t border-slate-200 p-3">
          <button className="btn-secondary" disabled={!lastOrderId} onClick={() => setReceiptId(lastOrderId)} title="Print the last bill"><Printer size={16} /> Print bill</button>
          <button className="btn-secondary" disabled={!lines.length || submitting} onClick={place}><Send size={16} /> Place order</button>
          <button className="btn-primary" disabled={!lines.length || submitting || !!calcError} onClick={openPay}><CreditCard size={16} /> Pay</button>
        </div>
      </aside>

      <PaymentModal open={payOpen} amountDue={calc?.grand_total ?? "0.00"} methods={settings.data?.enabled_payment_methods ?? ["CASH", "UPI", "CARD"]}
        allowPartial={settings.data?.allow_partial_payments} loading={submitting} error={payError} onSubmit={(p) => void submit(p)} onClose={() => setPayOpen(false)} />
      <ReceiptModal orderId={receiptId} onClose={() => setReceiptId(null)} />
      <ConfirmDialog open={confirmClear} title="Clear the cart?" message="All items in the current order will be removed." confirmLabel="Clear cart" danger onCancel={() => setConfirmClear(false)} onConfirm={() => { reset(); setConfirmClear(false); }} />
      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held orders">
        {!held.data?.length ? <p className="py-6 text-center text-sm text-slate-500">No held orders.</p> : (
          <ul className="divide-y divide-slate-100">
            {held.data.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="text-sm font-medium">{h.label}</p><p className="text-xs text-slate-500">{h.cashier_name} · {new Date(h.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p></div>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm" onClick={() => void resume(h)}>Resume</button>
                  <button className="btn-secondary btn-sm" onClick={async () => { await ordersApi.discardHeld(h.id); void held.reload(); }}>Discard</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
