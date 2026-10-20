import { Plus } from "lucide-react";
import { useState } from "react";

import { errorMessage } from "../../api/client";
import { menuApi } from "../../api/endpoints";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable } from "../../components/DataTable";
import { FieldDef, FormModal } from "../../components/FormModal";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useFetch } from "../../hooks/useFetch";
import type { Category } from "../../types/models";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Category name", required: true, maxLength: 80 },
  { name: "sort_order", label: "Display order", type: "number", required: true, min: 0, hint: "Lower numbers appear first in POS." },
  { name: "is_active", label: "Active (shown in POS)", type: "checkbox" },
];

export default function Categories() {
  const toast = useToast();
  const list = useFetch(() => menuApi.categories({ is_active: undefined }), []);
  const [edit, setEdit] = useState<Category | "new" | null>(null);
  const [remove, setRemove] = useState<Category | null>(null);
  return (
    <>
      <PageHeader title="Categories" actions={<button className="btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Add category</button>} />
      <div className="card">
        <DataTable rows={list.data ?? undefined} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(c) => c.id} emptyTitle="No categories yet" emptyHint="Add a category such as Starters or Beverages."
          columns={[
            { key: "name", header: "Name", render: (c) => <span className="font-medium">{c.name}</span> },
            { key: "sort_order", header: "Order" },
            { key: "item_count", header: "Items" },
            { key: "active", header: "Status", render: (c) => <StatusBadge status={c.is_active ? "AVAILABLE" : "CANCELLED"} /> },
            { key: "actions", header: "", className: "text-right", render: (c) => <div className="flex justify-end gap-2"><button className="btn-secondary btn-sm" onClick={() => setEdit(c)}>Edit</button>{c.is_active && <button className="btn-secondary btn-sm text-red-600" onClick={() => setRemove(c)}>Deactivate</button>}</div> },
          ]} />
      </div>
      <FormModal open={edit !== null} title={edit === "new" ? "Add category" : "Edit category"} fields={FIELDS}
        initial={edit && edit !== "new" ? { ...edit } : { sort_order: 0, is_active: true }} onClose={() => setEdit(null)}
        onSubmit={async (v) => { try { await menuApi.saveCategory(edit === "new" || !edit ? null : edit.id, v as Partial<Category>); toast.success("Category saved"); setEdit(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
      <ConfirmDialog open={!!remove} title="Deactivate category?" message={`“${remove?.name}” will be hidden from POS. Existing items and past bills are kept.`} confirmLabel="Deactivate" danger onCancel={() => setRemove(null)}
        onConfirm={async () => { try { await menuApi.saveCategory(remove!.id, { is_active: false }); toast.success("Category deactivated"); setRemove(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </>
  );
}
