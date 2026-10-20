import { UtensilsCrossed } from "lucide-react";

import type { MenuItem } from "../types/models";
import { formatMoney } from "../utils/money";
import { EmptyState } from "./ErrorState";
import { LoadingSpinner } from "./LoadingSpinner";

export function VegMark({ veg }: { veg: boolean }) {
  const c = veg ? "border-green-600" : "border-red-600";
  return (
    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 ${c}`} title={veg ? "Vegetarian" : "Non-vegetarian"} aria-label={veg ? "Vegetarian" : "Non-vegetarian"}>
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? "bg-green-600" : "bg-red-600"}`} />
    </span>
  );
}

export function POSMenuGrid({ items, loading, onAdd }: { items: MenuItem[]; loading: boolean; onAdd: (i: MenuItem) => void }) {
  if (loading && !items.length) return <LoadingSpinner />;
  if (!items.length) return <EmptyState title="No menu items found" hint="Try a different search or category." />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((i) => {
        const off = !i.is_available;
        return (
          <button key={i.id} disabled={off} onClick={() => onAdd(i)} aria-label={`Add ${i.name}`}
            className={`card flex flex-col overflow-hidden text-left transition hover:border-brand-500 hover:shadow ${off ? "opacity-50" : ""}`}>
            <div className="flex h-24 items-center justify-center bg-slate-100">
              {i.image ? <img src={i.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : <UtensilsCrossed className="text-slate-300" size={30} />}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <div className="flex items-start gap-1.5"><VegMark veg={i.is_veg} /><span className="line-clamp-2 text-sm font-medium leading-tight text-slate-800">{i.name}</span></div>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-sm font-semibold text-slate-900">{formatMoney(i.price)}</span>
                {off && <span className="text-xs font-medium text-red-600">Unavailable</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
