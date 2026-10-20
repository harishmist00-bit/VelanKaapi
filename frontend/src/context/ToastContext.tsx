import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useState } from "react";

interface Toast { id: number; kind: "success" | "error"; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void }
const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  const api: ToastApi = { success: (t) => push("success", t), error: (t) => push("error", t) };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-md ${t.kind === "success" ? "border-brand-100 bg-brand-50 text-brand-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {t.kind === "success" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside ToastProvider");
  return c;
}
