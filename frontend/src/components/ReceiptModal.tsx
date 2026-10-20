import { Printer } from "lucide-react";
import { useState } from "react";

import { ordersApi } from "../api/endpoints";
import { useFetch } from "../hooks/useFetch";
import { printArea, PrintFormat } from "../utils/print";
import { ErrorState } from "./ErrorState";
import { LoadingSpinner } from "./LoadingSpinner";
import { Modal } from "./Modal";
import { Receipt } from "./Receipt";

export function ReceiptModal({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const [format, setFormat] = useState<PrintFormat>("thermal");
  const { data, loading, error, reload } = useFetch(() => (orderId ? ordersApi.receipt(orderId) : Promise.resolve(null)), [orderId]);
  return (
    <Modal open={orderId !== null} title="Bill / receipt" onClose={onClose} size="lg"
      footer={<>
        <div className="mr-auto flex items-center gap-2 text-sm">
          <label htmlFor="rfmt" className="text-slate-600">Paper</label>
          <select id="rfmt" className="input w-auto" value={format} onChange={(e) => setFormat(e.target.value as PrintFormat)}>
            <option value="thermal">80 mm thermal</option><option value="a4">A4 invoice</option>
          </select>
        </div>
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={!data} onClick={() => printArea(format)}><Printer size={16} /> Print</button>
      </>}>
      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="overflow-x-auto rounded-lg bg-slate-100 p-3">
            <div id="print-area" className="mx-auto w-fit bg-white shadow"><Receipt data={data} format={format} /></div>
          </div>
          <p className="no-print mt-2 text-xs text-slate-500">To save a PDF, choose “Save as PDF” as the printer in the print dialog.</p>
        </>
      )}
    </Modal>
  );
}
