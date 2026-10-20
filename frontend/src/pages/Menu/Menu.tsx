import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { errorMessage } from "../../api/client";
import { menuApi, settingsApi } from "../../api/endpoints";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable } from "../../components/DataTable";
import { FormField } from "../../components/FormField";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { VegMark } from "../../components/POSMenuGrid";
import { SearchInput } from "../../components/SearchInput";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { useFetch } from "../../hooks/useFetch";
import { usePagination } from "../../hooks/usePagination";
import type { MenuItem } from "../../types/models";
import { formatMoney } from "../../utils/money";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: z.string().trim().min(1, "SKU is required").max(30),
  category: z.coerce.number({ invalid_type_error: "Choose a category" }).int().positive("Choose a category"),
  price: z.coerce.number({ invalid_type_error: "Enter a price" }).min(0, "Price cannot be negative"),
  tax_rate: z.coerce.number({ invalid_type_error: "Enter a tax rate" }).min(0).max(100, "Tax rate is a percentage up to 100"),
  description: z.string().optional(),
  is_veg: z.boolean(), is_available: z.boolean(), is_active: z.boolean(),
});
type Form = z.infer<typeof schema>;

function ItemForm({ item, onClose, onSaved }: { item: MenuItem | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const cats = useFetch(() => menuApi.categories({ is_active: true }), []);
  const settings = useFetch(settingsApi.get, []);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const editing = item && item !== "new" ? item : null;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!item) return;
    setFile(null); setFileError(null);
    reset(editing ? { ...editing, price: Number(editing.price), tax_rate: Number(editing.tax_rate), description: editing.description }
      : { name: "", sku: "", category: undefined as unknown as number, price: 0, tax_rate: Number(settings.data?.default_tax_rate ?? 5), description: "", is_veg: true, is_available: true, is_active: true });
  }, [item, editing, reset, settings.data]);

  const pick = (f: File | undefined) => {
    setFileError(null);
    if (!f) return setFile(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setFileError("Use a JPG, PNG or WEBP image.");
    if (f.size > 2 * 1024 * 1024) return setFileError("The image must be 2 MB or smaller.");
    setFile(f);
  };

  const onSubmit = handleSubmit(async (v) => {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.append(k, typeof val === "boolean" ? String(val) : String(val ?? "")));
    if (file) fd.append("image", file);
    try { await menuApi.save(editing?.id ?? null, fd); toast.success("Menu item saved"); onSaved(); onClose(); }
    catch (e) { toast.error(errorMessage(e)); }
  });

  return (
    <Modal open={!!item} onClose={onClose} title={editing ? "Edit menu item" : "Add menu item"} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={onSubmit} disabled={isSubmitting || !!fileError}>{isSubmitting ? "Saving…" : "Save item"}</button></>}>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label="Name *" htmlFor="m-name" error={errors.name?.message}><input id="m-name" className="input" {...register("name")} /></FormField>
        <FormField label="SKU *" htmlFor="m-sku" error={errors.sku?.message}><input id="m-sku" className="input" {...register("sku")} /></FormField>
        <FormField label="Category *" htmlFor="m-cat" error={errors.category?.message}>
          <select id="m-cat" className="input" {...register("category")}><option value="">Select…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </FormField>
        <FormField label="Price (₹) *" htmlFor="m-price" error={errors.price?.message}><input id="m-price" className="input" type="number" step="0.01" min="0" {...register("price")} /></FormField>
        <FormField label="GST rate (%) *" htmlFor="m-tax" error={errors.tax_rate?.message} hint="Set this according to the rules that apply to this item. Ask your tax advisor if unsure."><input id="m-tax" className="input" type="number" step="0.01" min="0" max="100" {...register("tax_rate")} /></FormField>
        <FormField label="Photo (JPG, PNG, WEBP, up to 2 MB)" htmlFor="m-img" error={fileError ?? undefined}>
          <input id="m-img" className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
        </FormField>
        <FormField label="Description" htmlFor="m-desc" className="sm:col-span-2"><textarea id="m-desc" className="input" rows={2} {...register("description")} /></FormField>
        <div className="flex flex-wrap gap-5 sm:col-span-2">
          {([["is_veg", "Vegetarian"], ["is_available", "Available now"], ["is_active", "Active on the menu"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" {...register(k)} /> {l}</label>
          ))}
        </div>
      </form>
    </Modal>
  );
}

export default function Menu() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [veg, setVeg] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<MenuItem | "new" | null>(null);
  const [remove, setRemove] = useState<MenuItem | null>(null);
  const { page, setPage, pageSize } = usePagination(15);
  const q = useDebounce(search, 300);
  const cats = useFetch(() => menuApi.categories(), []);
  const list = useFetch(() => menuApi.items({ search: q, category, is_veg: veg, include_inactive: showInactive ? 1 : undefined, page, page_size: pageSize }), [q, category, veg, showInactive, page]);
  useEffect(() => setPage(1), [q, category, veg, showInactive, setPage]);

  const toggle = async (i: MenuItem) => {
    try { await menuApi.patch(i.id, { is_available: !i.is_available }); void list.reload(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <>
      <PageHeader title="Menu" subtitle="Items, prices and tax rates used by POS Billing" actions={<button className="btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Add item</button>} />
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <SearchInput className="w-60" value={search} onChange={setSearch} placeholder="Search name or SKU" />
          <select className="input !w-auto" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input !w-auto" aria-label="Veg or non-veg" value={veg} onChange={(e) => setVeg(e.target.value)}><option value="">Veg and non-veg</option><option value="true">Vegetarian</option><option value="false">Non-vegetarian</option></select>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
        </div>
        <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(i) => i.id} page={page} pageSize={pageSize} count={list.data?.count} onPage={setPage}
          emptyTitle="No menu items" emptyHint="Add your first item, or run the sample-data command described in the README."
          columns={[
            { key: "img", header: "", render: (i) => i.image ? <img src={i.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><ImageIcon size={18} /></span> },
            { key: "name", header: "Item", render: (i) => <div className="flex items-center gap-2"><VegMark veg={i.is_veg} /><div><p className="font-medium">{i.name}</p><p className="text-xs text-slate-500">{i.sku}</p></div></div> },
            { key: "cat", header: "Category", render: (i) => i.category_name },
            { key: "price", header: "Price", render: (i) => formatMoney(i.price) },
            { key: "tax", header: "GST", render: (i) => `${Number(i.tax_rate)}%` },
            { key: "avail", header: "Available", render: (i) => (
              <button role="switch" aria-checked={i.is_available} aria-label={`${i.name} available`} onClick={() => toggle(i)} className={`relative h-6 w-11 rounded-full transition-colors ${i.is_available ? "bg-brand-600" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${i.is_available ? "left-[22px]" : "left-0.5"}`} /></button>) },
            { key: "state", header: "Status", render: (i) => <StatusBadge status={i.is_active ? "AVAILABLE" : "CANCELLED"} /> },
            { key: "actions", header: "", className: "text-right", render: (i) => <div className="flex justify-end gap-2"><button className="btn-secondary btn-sm" onClick={() => setEdit(i)}>Edit</button>{i.is_active && <button className="btn-secondary btn-sm text-red-600" onClick={() => setRemove(i)}>Deactivate</button>}</div> },
          ]} />
      </div>
      <ItemForm item={edit} onClose={() => setEdit(null)} onSaved={list.reload} />
      <ConfirmDialog open={!!remove} title="Deactivate this item?" message={`“${remove?.name}” will disappear from POS. Past bills keep their record of it, and you can re-activate it later.`} confirmLabel="Deactivate" danger onCancel={() => setRemove(null)}
        onConfirm={async () => { try { await menuApi.deactivate(remove!.id); toast.success("Item deactivated"); setRemove(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </>
  );
}
