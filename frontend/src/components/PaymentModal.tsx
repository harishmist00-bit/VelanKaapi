import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { PaymentInput } from "../api/endpoints";
import type { PaymentMethod } from "../types/models";
import { formatMoney, fromPaise, toPaise } from "../utils/money";
import { Modal } from "./Modal";

interface Row { method: PaymentMethod; amount: string; tendered: string; reference: string }
const LABEL: Record<PaymentMethod, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" };

interface Props {
  open: boolean; title?: string; amountDue: string; methods: PaymentMethod[]; allowPartial?: boolean; loading?: boolean; error?: string | null;
  onSubmit: (payments: PaymentInput[]) => void; onClose: () => void;
}

export function PaymentModal({ open, title = "Take payment", amountDue, methods, allowPartial, loading, error, onSubmit, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { if (open) setRows([{ method: methods[0] ?? "CASH", amount: amountDue, tendered: "", reference: "" }]); }, [open, amountDue, methods]);

  const dueP = toPaise(amountDue);
  const sumP = rows.reduce((s, r) => s + toPaise(r.amount), 0);
  const remaining = dueP - sumP;
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const rowProblem = (r: Row): string | null => {
    if (toPaise(r.amount) <= 0) return "Enter an amount";
    if (r.method === "CASH" && r.tendered && toPaise(r.tendered) < toPaise(r.amount)) return "Cash given is less than the amount";
    if (r.method === "CARD" && r.reference && !/^\d{4}$/.test(r.reference)) return "Enter only the last 4 digits";
    return null;
  };
  const problem = rows.map(rowProblem).find(Boolean) ?? (remaining < 0 ? "Payments add up to more than the amount due" : !allowPartial && remaining > 0 ? `${formatMoney(fromPaise(remaining))} still to be paid` : null);
  const change = rows.reduce((s, r) => (r.method === "CASH" && r.tendered ? s + Math.max(0, toPaise(r.tendered) - toPaise(r.amount)) : s), 0);

  const submit = () => onSubmit(rows.map((r) => ({
    method: r.method, amount: Number(r.amount).toFixed(2),
    ...(r.method === "CASH" ? { tendered: Number(r.tendered || r.amount).toFixed(2) } : {}),
    ...(r.reference ? { reference: r.reference } : {}),
  })));

  return (
    <Modal open={open} title={title} onClose={onClose} size="md"
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={loading}>Back</button>
        <button className="btn-primary" disabled={!!problem || loading} onClick={submit}>{loading ? "Processing…" : `Confirm payment`}</button>
      </>}>
      <div className="mb-4 flex items-baseline justify-between rounded-lg bg-brand-50 px-4 py-3">
        <span className="text-sm text-brand-700">Amount due</span>
        <span className="text-2xl font-semibold text-brand-700">{formatMoney(amountDue)}</span>
      </div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {methods.map((m) => (
                <button key={m} type="button" onClick={() => patch(i, { method: m, reference: "" })} aria-pressed={r.method === m}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${r.method === m ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{LABEL[m]}</button>
              ))}
              {rows.length > 1 && <button className="btn-ghost btn-sm ml-auto" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove payment"><Trash2 size={15} /></button>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor={`amt${i}`}>Amount</label><input id={`amt${i}`} className="input" type="number" min="0" step="0.01" inputMode="decimal" value={r.amount} onChange={(e) => patch(i, { amount: e.target.value })} /></div>
              {r.method === "CASH" && <div><label className="label" htmlFor={`ten${i}`}>Cash given</label><input id={`ten${i}`} className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder={r.amount} value={r.tendered} onChange={(e) => patch(i, { tendered: e.target.value })} /></div>}
              {r.method === "UPI" && <div><label className="label" htmlFor={`ref${i}`}>UPI reference (optional)</label><input id={`ref${i}`} className="input" maxLength={40} value={r.reference} onChange={(e) => patch(i, { reference: e.target.value })} /></div>}
              {r.method === "CARD" && <div><label className="label" htmlFor={`ref${i}`}>Card last 4 digits (optional)</label><input id={`ref${i}`} className="input" maxLength={4} inputMode="numeric" value={r.reference} onChange={(e) => patch(i, { reference: e.target.value.replace(/\D/g, "") })} /></div>}
            </div>
            {rowProblem(r) && sumP > 0 && <p className="mt-2 text-xs text-red-600">{rowProblem(r)}</p>}
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <button className="btn-secondary mt-3 w-full" onClick={() => setRows((rs) => [...rs, { method: methods.find((m) => m !== rs[rs.length - 1].method) ?? methods[0], amount: fromPaise(remaining), tendered: "", reference: "" }])}>
          <Plus size={16} /> Split: add another payment ({formatMoney(fromPaise(remaining))} left)
        </button>
      )}
      {change > 0 && <div className="mt-4 flex justify-between rounded-lg bg-amber-50 px-4 py-2.5 text-amber-800"><span>Change to return</span><strong>{formatMoney(fromPaise(change))}</strong></div>}
      {problem && sumP > 0 && !rows.some(rowProblem) && <p className="mt-3 text-sm text-red-600" role="alert">{problem}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-slate-500">Never type full card numbers here. Card payments are taken on your card machine; only the last 4 digits are recorded.</p>
    </Modal>
  );
}
