import { useEffect, useState } from "react";

import { Modal } from "./Modal";

interface Props {
  open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean;
  /** If set, shows a required text box and passes its value to onConfirm. */
  reasonLabel?: string;
  onConfirm: (reason: string) => void; onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, loading, reasonLabel, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  const blocked = loading || (!!reasonLabel && !reason.trim());
  return (
    <Modal open={open} title={title} onClose={onCancel} size="sm"
      footer={<>
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Keep as is</button>
        <button className={danger ? "btn-danger" : "btn-primary"} onClick={() => onConfirm(reason.trim())} disabled={blocked}>{loading ? "Working…" : confirmLabel}</button>
      </>}>
      <p className="text-sm text-slate-600">{message}</p>
      {reasonLabel && (
        <div className="mt-3">
          <label className="label" htmlFor="confirm-reason">{reasonLabel}</label>
          <textarea id="confirm-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}
