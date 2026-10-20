import type { ReceiptData } from "../types/models";
import { formatDateTime, formatMoney } from "../utils/money";
import type { PrintFormat } from "../utils/print";

const TYPE_LABEL = { DINE_IN: "Dine-in", TAKEAWAY: "Takeaway", DELIVERY: "Delivery" };

export function Receipt({ data, format }: { data: ReceiptData; format: PrintFormat }) {
  const { order: o, restaurant: r } = data;
  const thermal = format === "thermal";
  const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
  const change = o.payments.reduce((s, p) => s + Number(p.change_due), 0);
  return (
    <div className={`receipt ${thermal ? "receipt-thermal" : "receipt-a4"}`}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: thermal ? 16 : 22, fontWeight: 700 }}>{r.name}</div>
        {r.address && <div style={{ whiteSpace: "pre-line" }}>{r.address}</div>}
        {r.phone && <div>Tel: {r.phone}</div>}
        {r.gstin && <div>GSTIN: {r.gstin}</div>}
      </div>
      <hr />
      <div style={{ fontWeight: 700, textAlign: "center" }}>{o.invoice_number ? "TAX INVOICE" : "BILL (payment pending)"}</div>
      <table>
        <tbody>
          <tr><td>{o.invoice_number ? "Invoice" : "Order"}</td><td className="num">{o.invoice_number ?? o.order_number}</td></tr>
          {o.invoice_number && <tr><td>Order</td><td className="num">{o.order_number}</td></tr>}
          <tr><td>Date</td><td className="num">{formatDateTime(o.created_at)}</td></tr>
          <tr><td>Type</td><td className="num">{TYPE_LABEL[o.order_type]}{o.table_number ? ` · Table ${o.table_number}` : ""}</td></tr>
          {o.customer_name && <tr><td>Customer</td><td className="num">{o.customer_name}{o.customer_phone ? ` (${o.customer_phone})` : ""}</td></tr>}
          <tr><td>Cashier</td><td className="num">{o.cashier_name}</td></tr>
        </tbody>
      </table>
      <hr />
      <table>
        <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}{i.notes && <div style={{ fontSize: "0.85em" }}>({i.notes})</div>}</td>
              <td className="num">{i.quantity}</td>
              <td className="num">{formatMoney(i.unit_price)}</td>
              <td className="num">{formatMoney(i.line_subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          <tr><td>Subtotal</td><td className="num">{formatMoney(o.subtotal)}</td></tr>
          {Number(o.discount_amount) > 0 && <tr><td>Discount{o.discount_type === "PERCENT" ? ` (${Number(o.discount_value)}%)` : ""}</td><td className="num">-{formatMoney(o.discount_amount)}</td></tr>}
          {o.tax_breakdown.map((t) => (
            <tr key={t.rate}><td colSpan={2}>
              <table><tbody>
                <tr><td>CGST @ {Number(t.rate) / 2}%</td><td className="num">{formatMoney(t.cgst)}</td></tr>
                <tr><td>SGST @ {Number(t.rate) / 2}%</td><td className="num">{formatMoney(t.sgst)}</td></tr>
              </tbody></table>
            </td></tr>
          ))}
          {o.prices_include_tax && <tr><td colSpan={2} style={{ fontSize: "0.85em" }}>Prices include tax</td></tr>}
          {Number(o.round_off) !== 0 && <tr><td>Round off</td><td className="num">{formatMoney(o.round_off)}</td></tr>}
          <tr style={{ fontWeight: 700, fontSize: thermal ? 14 : 16 }}><td>TOTAL</td><td className="num">{formatMoney(o.grand_total)}</td></tr>
        </tbody>
      </table>
      <hr />
      {o.payments.length > 0 ? (
        <table>
          <tbody>
            {o.payments.map((p) => <tr key={p.id}><td>Paid by {p.method === "UPI" ? "UPI" : p.method.charAt(0) + p.method.slice(1).toLowerCase()}{p.method === "CARD" && p.reference ? ` ····${p.reference}` : ""}</td><td className="num">{formatMoney(p.amount)}</td></tr>)}
            <tr><td>Total paid</td><td className="num">{formatMoney(paid)}</td></tr>
            {change > 0 && <tr><td>Change due</td><td className="num">{formatMoney(change)}</td></tr>}
            {Number(o.amount_due) > 0 && <tr style={{ fontWeight: 700 }}><td>Balance due</td><td className="num">{formatMoney(o.amount_due)}</td></tr>}
            {Number(o.refunded_total) > 0 && <tr><td>Refunded</td><td className="num">{formatMoney(o.refunded_total)}</td></tr>}
          </tbody>
        </table>
      ) : <div style={{ textAlign: "center" }}>Amount due: {formatMoney(o.grand_total)}</div>}
      {r.receipt_footer && <><hr /><div style={{ textAlign: "center" }}>{r.receipt_footer}</div></>}
    </div>
  );
}
