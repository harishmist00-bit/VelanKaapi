import { ArrowRightLeft, Ban, CheckCircle2, CreditCard, Printer, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { errorMessage } from "../api/client";
import { ordersApi, PaymentInput, tablesApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useFetch } from "../hooks/useFetch";
import type { OrderDetail, OrderStatus } from "../types/models";
import { formatDateTime, formatMoney } from "../utils/money";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState } from "./ErrorState";
import { LoadingSpinner } from "./LoadingSpinner";
import { Modal } from "./Modal";
import { PaymentModal } from "./PaymentModal";
import { ReceiptModal } from "./ReceiptModal";
import { StatusBadge } from "./StatusBadge";

const OPEN: OrderStatus[] = ["PENDING", "PREPARING", "READY"];

export function OrderDetailModal({ orderId, onClose, onChanged }: { orderId: number | null; onClose: () => void; onChanged?: () => void }) {
  const { hasRole } = useAuth();
  const toast = useToast();
  const { data: o, loading, error, reload, setData } = useFetch<OrderDetail | null>(() => (orderId ? ordersApi.get(orderId) : Promise.resolve(null)), [orderId]);
  const [dlg, setDlg] = useState<"cancel" | "refund" | "transfer" | "pay" | "receipt" | null>(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [refund, setRefund] = useState({ amount: "", reason: "", restock: false });
  const [tableId, setTableId] = useState("");
  const tables = useFetch(() => (dlg === "transfer" ? tablesApi.list() : Promise.resolve([])), [dlg]);
  const manager = hasRole("ADMIN", "MANAGER");
  useEffect(() => { setDlg(null); }, [orderId]);

  const run = async (fn: () => Promise<OrderDetail | void>, ok: string) => {
    setBusy(true);
    try { const r = await fn(); if (r) setData(r); else await reload(); toast.success(ok); setDlg(null); onChanged?.(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const isOpen = o ? OPEN.includes(o.status) : false;
  const refundable = o ? (Number(o.paid_total) - Number(o.refunded_total)).toFixed(2) : "0.00";

  return (
    <>
      <Modal open={orderId !== null && dlg !== "receipt"} onClose={onClose} title={o ? `Order ${o.order_number}` : "Order"} size="lg"
        footer={o && (
          <>
            <button className="btn-secondary" onClick={() => setDlg("receipt")}><Printer size={16} /> {o.invoice_number ? "Reprint bill" : "Print bill"}</button>
            {isOpen && Number(o.amount_due) > 0 && <button className="btn-primary" onClick={() => { setPayError(null); setDlg("pay"); }}><CreditCard size={16} /> Take payment</button>}
            {isOpen && o.payment_status === "PAID" && <button className="btn-primary" disabled={busy} onClick={() => run(() => ordersApi.complete(o.id), "Order completed")}><CheckCircle2 size={16} /> Complete</button>}
            {isOpen && o.order_type === "DINE_IN" && <button className="btn-secondary" onClick={() => { setTableId(""); setDlg("transfer"); }}><ArrowRightLeft size={16} /> Move table</button>}
            {manager && isOpen && Number(o.paid_total) === 0 && <button className="btn-danger" onClick={() => setDlg("cancel")}><Ban size={16} /> Cancel order</button>}
            {manager && Number(refundable) > 0 && <button className="btn-secondary" onClick={() => { setRefund({ amount: refundable, reason: "", restock: false }); setDlg("refund"); }}><Undo2 size={16} /> Refund</button>}
          </>
        )}>
        {loading && !o && <LoadingSpinner />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {o && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={o.status} /><StatusBadge status={o.payment_status} />
              <span className="text-xs text-slate-500">Kitchen: {o.kitchen_status.toLowerCase()}</span>
              <span className="ml-auto text-sm text-slate-500">{formatDateTime(o.created_at)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div><dt className="text-slate-500">Invoice</dt><dd className="font-medium">{o.invoice_number ?? "Not yet issued"}</dd></div>
              <div><dt className="text-slate-500">Type</dt><dd className="font-medium">{o.order_type.replace("_", "-").toLowerCase()}{o.table_number ? ` · ${o.table_number}` : ""}</dd></div>
              <div><dt className="text-slate-500">Cashier</dt><dd className="font-medium">{o.cashier_name}</dd></div>
              <div><dt className="text-slate-500">Customer</dt><dd className="font-medium">{o.customer_name ?? "Walk-in"}</dd></div>
            </dl>
            {o.status === "CANCELLED" && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Cancelled: {o.cancel_reason}</p>}
            {o.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Note: {o.notes}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-slate-500"><tr><th className="py-1.5">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {o.items.map((i) => <tr key={i.id}><td className="py-1.5">{i.name}{i.notes && <span className="block text-xs text-slate-500">{i.notes}</span>}</td><td className="text-right">{i.quantity}</td><td className="text-right">{formatMoney(i.unit_price)}</td><td className="text-right">{formatMoney(i.line_subtotal)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <T l="Subtotal" v={formatMoney(o.subtotal)} />
              {Number(o.discount_amount) > 0 && <T l="Discount" v={`-${formatMoney(o.discount_amount)}`} />}
              <T l="Tax" v={formatMoney(o.tax_total)} />
              {Number(o.round_off) !== 0 && <T l="Round off" v={formatMoney(o.round_off)} />}
              <T l="Total" v={formatMoney(o.grand_total)} bold />
              <T l="Paid" v={formatMoney(o.paid_total)} />
              {Number(o.refunded_total) > 0 && <T l="Refunded" v={formatMoney(o.refunded_total)} />}
              {Number(o.amount_due) > 0 && o.status !== "CANCELLED" && <T l="Balance due" v={formatMoney(o.amount_due)} bold />}
            </dl>
            {(o.payments.length > 0 || o.refunds.length > 0) && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Payments and refunds</h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {o.payments.map((p) => <li key={`p${p.id}`} className="flex justify-between py-1.5"><span>{p.method} · {p.received_by_name} · {formatDateTime(p.created_at)}{p.reference && ` · ${p.reference}`}</span><span>{formatMoney(p.amount)}</span></li>)}
                  {o.refunds.map((r) => <li key={`r${r.id}`} className="flex justify-between py-1.5 text-red-700"><span>Refund · {r.reason} · {r.created_by_name}</span><span>-{formatMoney(r.amount)}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ReceiptModal orderId={dlg === "receipt" ? orderId : null} onClose={() => setDlg(null)} />
      <PaymentModal open={dlg === "pay"} amountDue={o?.amount_due ?? "0.00"} methods={["CASH", "UPI", "CARD"]} allowPartial loading={busy} error={payError} onClose={() => setDlg(null)}
        onSubmit={async (p: PaymentInput[]) => {
          if (!o) return;
          setBusy(true); setPayError(null);
          try { const r = await ordersApi.pay(o.id, p, crypto.randomUUID()); setData(r); toast.success("Payment recorded"); setDlg(null); onChanged?.(); }
          catch (e) { setPayError(errorMessage(e)); } finally { setBusy(false); }
        }} />
      <ConfirmDialog open={dlg === "cancel"} title="Cancel this order?" message="The kitchen will stop seeing it and the table is released. This is recorded in the audit log." confirmLabel="Cancel order" danger reasonLabel="Reason for cancelling" loading={busy}
        onCancel={() => setDlg(null)} onConfirm={(reason) => o && run(() => ordersApi.cancel(o.id, reason), "Order cancelled")} />
      <Modal open={dlg === "refund"} onClose={() => setDlg(null)} title="Refund" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setDlg(null)}>Back</button>
          <button className="btn-danger" disabled={busy || !refund.reason.trim() || Number(refund.amount) <= 0} onClick={() => o && run(async () => { await ordersApi.refund(o.id, refund.amount, refund.reason, refund.restock); }, "Refund recorded")}>Record refund</button></>}>
        <div className="space-y-3">
          <div><label className="label" htmlFor="ra">Amount (up to {formatMoney(refundable)})</label><input id="ra" className="input" type="number" step="0.01" min="0" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></div>
          <div><label className="label" htmlFor="rr">Reason</label><textarea id="rr" className="input" rows={2} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={refund.restock} onChange={(e) => setRefund({ ...refund, restock: e.target.checked })} /> Put ingredients back in stock (full refunds only)</label>
          <p className="text-xs text-slate-500">Hand the money back through the original payment method. The app records the refund; it does not move money.</p>
        </div>
      </Modal>
      <Modal open={dlg === "transfer"} onClose={() => setDlg(null)} title="Move to another table" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setDlg(null)}>Back</button><button className="btn-primary" disabled={busy || !tableId} onClick={() => o && run(() => ordersApi.transfer(o.id, Number(tableId)), "Order moved")}>Move order</button></>}>
        <select className="input" aria-label="New table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
          <option value="">Choose a free table…</option>
          {(tables.data ?? []).filter((t) => t.status !== "OCCUPIED" && t.id !== o?.table).map((t) => <option key={t.id} value={t.id}>{t.number} · seats {t.capacity}</option>)}
        </select>
      </Modal>
    </>
  );
}

const T = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => <div className={`flex justify-between ${bold ? "border-t pt-1 font-semibold" : "text-slate-600"}`}><dt>{l}</dt><dd>{v}</dd></div>;
