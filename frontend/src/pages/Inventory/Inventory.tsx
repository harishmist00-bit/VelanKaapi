import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { errorMessage } from "../../api/client";
import { inventoryApi, menuApi } from "../../api/endpoints";
import { DataTable } from "../../components/DataTable";
import { FieldDef, FormModal } from "../../components/FormModal";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { SearchInput } from "../../components/SearchInput";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { useFetch } from "../../hooks/useFetch";
import { usePagination } from "../../hooks/usePagination";
import type { Ingredient, Recipe, Supplier } from "../../types/models";
import { formatDateTime } from "../../utils/money";

type Tab = "items" | "suppliers" | "movements" | "recipes";
const TABS: [Tab, string][] = [["items", "Stock items"], ["suppliers", "Suppliers"], ["movements", "Stock history"], ["recipes", "Recipes"]];

export default function Inventory() {
  const [tab, setTab] = useState<Tab>("items");
  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock, suppliers and recipes" />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${tab === k ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{l}</button>)}
      </div>
      {tab === "items" && <Items />}{tab === "suppliers" && <Suppliers />}{tab === "movements" && <Movements />}{tab === "recipes" && <Recipes />}
    </>
  );
}

function Items() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [low, setLow] = useState(false);
  const [edit, setEdit] = useState<Ingredient | "new" | null>(null);
  const [adjust, setAdjust] = useState<Ingredient | null>(null);
  const [adj, setAdj] = useState({ movement_type: "PURCHASE", quantity: "", reason: "", unit_cost: "" });
  const { page, setPage, pageSize } = usePagination(20);
  const q = useDebounce(search, 300);
  const suppliers = useFetch(() => inventoryApi.suppliers({ page_size: 200 }), []);
  const list = useFetch(() => inventoryApi.items({ search: q, low_stock: low ? "true" : undefined, page, page_size: pageSize }), [q, low, page]);
  const fields: FieldDef[] = [
    { name: "name", label: "Ingredient", required: true, maxLength: 120 },
    { name: "unit", label: "Unit", required: true, maxLength: 10, hint: "kg, g, l, ml, pcs" },
    { name: "reorder_level", label: "Reorder level", type: "number", required: true, min: 0, step: "0.001", hint: "Low-stock alert at or below this." },
    { name: "supplier", label: "Supplier", type: "select", options: (suppliers.data?.results ?? []).map((s) => ({ value: s.id, label: s.name })) },
    { name: "is_active", label: "Active", type: "checkbox" },
  ];
  const save = async () => {
    try { await inventoryApi.adjust({ ingredient: adjust!.id, movement_type: adj.movement_type, quantity: adj.quantity, reason: adj.reason, unit_cost: adj.unit_cost || undefined }); toast.success("Stock updated"); setAdjust(null); void list.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
        <SearchInput className="w-60" value={search} onChange={setSearch} placeholder="Search ingredients" />
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only</label>
        <button className="btn-primary ml-auto" onClick={() => setEdit("new")}><Plus size={16} /> Add ingredient</button>
      </div>
      <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(i) => i.id} page={page} pageSize={pageSize} count={list.data?.count} onPage={setPage}
        emptyTitle="No ingredients" emptyHint="Add ingredients, then record purchases to set the starting stock."
        columns={[
          { key: "name", header: "Ingredient", render: (i) => <span className="font-medium">{i.name}</span> },
          { key: "qty", header: "In stock", render: (i) => <span className={i.is_low ? "font-semibold text-red-600" : ""}>{Number(i.current_quantity)} {i.unit}{i.is_low && <AlertTriangle size={13} className="ml-1 inline" aria-label="Low stock" />}</span> },
          { key: "re", header: "Reorder at", render: (i) => `${Number(i.reorder_level)} ${i.unit}` },
          { key: "sup", header: "Supplier", render: (i) => i.supplier_name ?? "—" },
          { key: "act", header: "", className: "text-right", render: (i) => <div className="flex justify-end gap-2"><button className="btn-secondary btn-sm" onClick={() => { setAdj({ movement_type: "PURCHASE", quantity: "", reason: "", unit_cost: "" }); setAdjust(i); }}>Update stock</button><button className="btn-ghost btn-sm" onClick={() => setEdit(i)}>Edit</button></div> },
        ]} />
      <FormModal open={edit !== null} title={edit === "new" ? "Add ingredient" : "Edit ingredient"} fields={fields} initial={edit && edit !== "new" ? { ...edit } : { unit: "kg", reorder_level: 0, is_active: true }} onClose={() => setEdit(null)}
        onSubmit={async (v) => { try { await inventoryApi.saveItem(edit === "new" || !edit ? null : edit.id, v as Partial<Ingredient>); toast.success("Ingredient saved"); setEdit(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={`Update stock: ${adjust?.name}`} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setAdjust(null)}>Cancel</button><button className="btn-primary" disabled={!adj.quantity} onClick={save}>Record</button></>}>
        <div className="space-y-3">
          <div><label className="label" htmlFor="mt">What happened?</label>
            <select id="mt" className="input" value={adj.movement_type} onChange={(e) => setAdj({ ...adj, movement_type: e.target.value })}>
              <option value="PURCHASE">Stock purchased (adds)</option><option value="WASTE">Wasted or spoiled (subtracts)</option><option value="ADJUSTMENT">Stock count correction (+ or −)</option></select></div>
          <div><label className="label" htmlFor="mq">Quantity ({adjust?.unit}){adj.movement_type === "ADJUSTMENT" && " — use a minus for a reduction"}</label><input id="mq" className="input" type="number" step="0.001" value={adj.quantity} onChange={(e) => setAdj({ ...adj, quantity: e.target.value })} /></div>
          {adj.movement_type === "PURCHASE" && <div><label className="label" htmlFor="mc">Cost per unit (₹, optional)</label><input id="mc" className="input" type="number" step="0.01" min="0" value={adj.unit_cost} onChange={(e) => setAdj({ ...adj, unit_cost: e.target.value })} /></div>}
          <div><label className="label" htmlFor="mr">Reason{adj.movement_type === "ADJUSTMENT" ? " (required)" : ""}</label><input id="mr" className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

function Suppliers() {
  const toast = useToast();
  const [edit, setEdit] = useState<Supplier | "new" | null>(null);
  const list = useFetch(() => inventoryApi.suppliers({ page_size: 200 }), []);
  const fields: FieldDef[] = [
    { name: "name", label: "Supplier name", required: true, maxLength: 120 }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" },
    { name: "address", label: "Address", type: "textarea" }, { name: "is_active", label: "Active", type: "checkbox" },
  ];
  return (
    <div className="card">
      <div className="flex justify-end border-b border-slate-200 p-3"><button className="btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Add supplier</button></div>
      <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(s) => s.id} emptyTitle="No suppliers yet"
        columns={[{ key: "name", header: "Name", render: (s) => <span className="font-medium">{s.name}</span> }, { key: "phone", header: "Phone" }, { key: "email", header: "Email" },
          { key: "act", header: "", className: "text-right", render: (s) => <button className="btn-secondary btn-sm" onClick={() => setEdit(s)}>Edit</button> }]} />
      <FormModal open={edit !== null} title={edit === "new" ? "Add supplier" : "Edit supplier"} fields={fields} initial={edit && edit !== "new" ? { ...edit } : { is_active: true }} onClose={() => setEdit(null)}
        onSubmit={async (v) => { try { await inventoryApi.saveSupplier(edit === "new" || !edit ? null : edit.id, v as Partial<Supplier>); toast.success("Supplier saved"); setEdit(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </div>
  );
}

function Movements() {
  const [type, setType] = useState("");
  const { page, setPage, pageSize } = usePagination(25);
  const list = useFetch(() => inventoryApi.movements({ movement_type: type, page, page_size: pageSize }), [type, page]);
  return (
    <div className="card">
      <div className="border-b border-slate-200 p-3">
        <select className="input !w-auto" aria-label="Movement type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">All movements</option>{["PURCHASE", "SALE", "WASTE", "ADJUSTMENT", "REVERSAL"].map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
        </select>
      </div>
      <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(m) => m.id} page={page} pageSize={pageSize} count={list.data?.count} onPage={setPage} emptyTitle="No stock movements yet"
        columns={[
          { key: "d", header: "When", render: (m) => formatDateTime(m.created_at) },
          { key: "i", header: "Ingredient", render: (m) => <span className="font-medium">{m.ingredient_name}</span> },
          { key: "t", header: "Type", render: (m) => <StatusBadge status={m.movement_type === "PURCHASE" ? "PAID" : m.movement_type === "SALE" ? "PREPARING" : m.movement_type === "REVERSAL" ? "READY" : "PENDING"} /> },
          { key: "q", header: "Change", render: (m) => <span className={Number(m.quantity_delta) < 0 ? "text-red-600" : "text-brand-700"}>{Number(m.quantity_delta) > 0 ? "+" : ""}{Number(m.quantity_delta)} {m.unit}</span> },
          { key: "b", header: "Balance", render: (m) => `${Number(m.balance_after)} ${m.unit}` },
          { key: "r", header: "Note", render: (m) => [m.order_number, m.reason, m.created_by_name].filter(Boolean).join(" · ") },
        ]} />
    </div>
  );
}

function Recipes() {
  const toast = useToast();
  const list = useFetch(inventoryApi.recipes, []);
  const items = useFetch(() => menuApi.items({ page_size: 200 }), []);
  const ings = useFetch(() => inventoryApi.items({ page_size: 200 }), []);
  const [edit, setEdit] = useState<{ id: number | null; menu_item: string; lines: { ingredient: string; quantity: string }[] } | null>(null);
  const open = (r?: Recipe) => setEdit(r ? { id: r.id, menu_item: String(r.menu_item), lines: r.ingredients.map((l) => ({ ingredient: String(l.ingredient), quantity: String(Number(l.quantity)) })) } : { id: null, menu_item: "", lines: [{ ingredient: "", quantity: "" }] });
  const valid = edit && edit.menu_item && edit.lines.length > 0 && edit.lines.every((l) => l.ingredient && Number(l.quantity) > 0);
  const save = async () => {
    try { await inventoryApi.saveRecipe(edit!.id, { menu_item: Number(edit!.menu_item), ingredients: edit!.lines.map((l) => ({ ingredient: Number(l.ingredient), quantity: l.quantity })) }); toast.success("Recipe saved"); setEdit(null); void list.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <p className="text-sm text-slate-500">Items with a recipe use up ingredients when an order is completed.</p>
        <button className="btn-primary" onClick={() => open()}><Plus size={16} /> Add recipe</button>
      </div>
      <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(r) => r.id} emptyTitle="No recipes yet" emptyHint="Recipes are optional. Add one to track ingredient use for a dish."
        columns={[{ key: "m", header: "Menu item", render: (r) => <span className="font-medium">{r.menu_item_name}</span> },
          { key: "i", header: "Uses (per portion)", render: (r) => r.ingredients.map((l) => `${l.ingredient_name} ${Number(l.quantity)}${l.unit}`).join(", ") },
          { key: "a", header: "", className: "text-right", render: (r) => <button className="btn-secondary btn-sm" onClick={() => open(r)}>Edit</button> }]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit recipe" : "Add recipe"} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={!valid} onClick={save}>Save recipe</button></>}>
        {edit && (
          <div className="space-y-3">
            <div><label className="label" htmlFor="rm">Menu item</label>
              <select id="rm" className="input" disabled={!!edit.id} value={edit.menu_item} onChange={(e) => setEdit({ ...edit, menu_item: e.target.value })}>
                <option value="">Select…</option>{items.data?.results.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            {edit.lines.map((l, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1"><label className="label" htmlFor={`ri${i}`}>Ingredient</label>
                  <select id={`ri${i}`} className="input" value={l.ingredient} onChange={(e) => setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? { ...x, ingredient: e.target.value } : x)) })}>
                    <option value="">Select…</option>{ings.data?.results.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select></div>
                <div className="w-32"><label className="label" htmlFor={`rq${i}`}>Per portion</label><input id={`rq${i}`} className="input" type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} /></div>
                <button className="btn-ghost btn-sm mb-1" aria-label="Remove ingredient" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="btn-secondary btn-sm" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { ingredient: "", quantity: "" }] })}><Plus size={14} /> Add ingredient</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
