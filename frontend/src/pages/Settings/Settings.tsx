import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { errorMessage } from "../../api/client";
import { settingsApi, usersApi } from "../../api/endpoints";
import { DataTable } from "../../components/DataTable";
import { ErrorState } from "../../components/ErrorState";
import { FieldDef, FormModal } from "../../components/FormModal";
import { FormField } from "../../components/FormField";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useFetch } from "../../hooks/useFetch";
import { usePagination } from "../../hooks/usePagination";
import type { PaymentMethod, User } from "../../types/models";
import { formatDateTime } from "../../utils/money";

const pct = z.coerce.number({ invalid_type_error: "Enter a number" }).min(0, "At least 0").max(100, "At most 100");
const schema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required").max(120), address: z.string(), phone: z.string().max(30),
  gstin: z.string().refine((v) => v === "" || v.length === 15, "GSTIN must be 15 characters"), invoice_prefix: z.string().trim().min(1, "Prefix is required").max(10),
  default_order_type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]), default_tax_rate: pct, max_cashier_discount_percent: pct, receipt_footer: z.string().max(255),
  prices_include_tax: z.boolean(), round_off_enabled: z.boolean(), allow_partial_payments: z.boolean(), allow_negative_stock: z.boolean(), loyalty_enabled: z.boolean(),
  loyalty_points_per_100: z.coerce.number().int().min(0).max(1000), enabled_payment_methods: z.array(z.string()).min(1, "Enable at least one payment method"),
});
type Form = z.infer<typeof schema>;
const TABS = ["Restaurant", "Billing and tax", "Users", "Audit log", "Backup"] as const;

export default function Settings() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Restaurant");
  const admin = hasRole("ADMIN");
  return (
    <>
      <PageHeader title="Settings" subtitle={admin ? undefined : "View only. Ask an Admin to change settings."} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.filter((t) => t !== "Users" || admin).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${tab === t ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t}</button>)}
      </div>
      {(tab === "Restaurant" || tab === "Billing and tax") && <SettingsForm section={tab} readOnly={!admin} />}
      {tab === "Users" && admin && <Users />}
      {tab === "Audit log" && <Audit />}
      {tab === "Backup" && <Backup />}
    </>
  );
}

function SettingsForm({ section, readOnly }: { section: string; readOnly: boolean }) {
  const toast = useToast();
  const { data, error, reload, setData } = useFetch(settingsApi.get, []);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => { if (data) reset({ ...data, default_tax_rate: Number(data.default_tax_rate), max_cashier_discount_percent: Number(data.max_cashier_discount_percent) } as unknown as Form); }, [data, reset]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingSpinner />;
  const methods = watch("enabled_payment_methods") ?? [];
  const toggleMethod = (m: PaymentMethod) => setValue("enabled_payment_methods", methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m], { shouldDirty: true });
  const submit = handleSubmit(async (v) => {
    try { setData(await settingsApi.update(v as never)); toast.success("Settings saved"); } catch (e) { toast.error(errorMessage(e)); }
  });
  const chk = (name: keyof Form, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" disabled={readOnly} {...register(name as never)} /><span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
  );
  return (
    <form onSubmit={submit} className="card max-w-3xl space-y-4 p-5" noValidate>
      <fieldset disabled={readOnly} className="space-y-4">
        {section === "Restaurant" ? (
          <>
            <FormField label="Restaurant name" htmlFor="s-name" error={errors.name?.message}><input id="s-name" className="input" {...register("name")} /></FormField>
            <FormField label="Address (printed on bills)" htmlFor="s-addr"><textarea id="s-addr" className="input" rows={2} {...register("address")} /></FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone" htmlFor="s-ph"><input id="s-ph" className="input" {...register("phone")} /></FormField>
              <FormField label="GSTIN" htmlFor="s-gst" error={errors.gstin?.message} hint="Leave blank if not registered."><input id="s-gst" className="input uppercase" maxLength={15} {...register("gstin")} /></FormField>
              <FormField label="Default order type" htmlFor="s-ot"><select id="s-ot" className="input" {...register("default_order_type")}><option value="DINE_IN">Dine-in</option><option value="TAKEAWAY">Takeaway</option><option value="DELIVERY">Delivery</option></select></FormField>
              <FormField label="Currency" htmlFor="s-cur"><input id="s-cur" className="input" value="Indian rupee (₹ INR)" disabled readOnly /></FormField>
            </div>
            <FormField label="Receipt footer" htmlFor="s-foot"><input id="s-foot" className="input" {...register("receipt_footer")} /></FormField>
            <div><p className="label">Payment methods accepted</p><div className="flex flex-wrap gap-4">{(["CASH", "UPI", "CARD", "OTHER"] as PaymentMethod[]).map((m) => <label key={m} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={methods.includes(m)} onChange={() => toggleMethod(m)} /> {m[0] + m.slice(1).toLowerCase()}</label>)}</div>{errors.enabled_payment_methods && <p className="mt-1 text-xs text-red-600">{errors.enabled_payment_methods.message}</p>}</div>
          </>
        ) : (
          <>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Tax rates are set per menu item (Menu → Edit item). The default below only pre-fills new items. Configure rates according to the rules that apply to your business and confirm them with a qualified tax professional. This software does not provide tax advice.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Default GST rate for new items (%)" htmlFor="s-tax" error={errors.default_tax_rate?.message}><input id="s-tax" className="input" type="number" step="0.01" {...register("default_tax_rate")} /></FormField>
              <FormField label="Cashier discount limit (%)" htmlFor="s-disc" error={errors.max_cashier_discount_percent?.message} hint="Larger discounts need a Manager or Admin."><input id="s-disc" className="input" type="number" step="0.01" {...register("max_cashier_discount_percent")} /></FormField>
              <FormField label="Invoice prefix" htmlFor="s-pre" error={errors.invoice_prefix?.message} hint={`Next invoice looks like ${data.invoice_prefix}${new Date().getFullYear()}-${String(data.invoice_counter + 1).padStart(6, "0")}`}><input id="s-pre" className="input" {...register("invoice_prefix")} /></FormField>
              <FormField label="Loyalty points per ₹100" htmlFor="s-lp" error={errors.loyalty_points_per_100?.message}><input id="s-lp" className="input" type="number" {...register("loyalty_points_per_100")} /></FormField>
            </div>
            <div className="space-y-3">
              {chk("prices_include_tax", "Menu prices already include tax", "Tax is then shown inside the price instead of added on top.")}
              {chk("round_off_enabled", "Round the final bill to the nearest rupee")}
              {chk("allow_partial_payments", "Allow part payments", "An order stays Partially paid until the balance is received.")}
              {chk("allow_negative_stock", "Allow ingredient stock to go below zero", "If off, completing an order is blocked when stock is short.")}
              {chk("loyalty_enabled", "Give loyalty points to customers on completed orders")}
            </div>
          </>
        )}
      </fieldset>
      {!readOnly && <div className="flex justify-end"><button className="btn-primary" disabled={isSubmitting || !isDirty}>{isSubmitting ? "Saving…" : "Save settings"}</button></div>}
    </form>
  );
}

function Users() {
  const toast = useToast();
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const list = useFetch(() => usersApi.list({ page_size: 100 }), []);
  const fields: FieldDef[] = [
    { name: "username", label: "Username", required: true, maxLength: 150 }, { name: "first_name", label: "First name" }, { name: "last_name", label: "Last name" },
    { name: "role", label: "Role", type: "select", required: true, options: [{ value: "CASHIER", label: "Cashier" }, { value: "MANAGER", label: "Manager" }, { value: "ADMIN", label: "Admin" }] },
    { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Phone", type: "tel" },
    { name: "max_discount_percent", label: "Personal discount limit (%)", type: "number", min: 0, max: 100, step: "0.01", hint: "Optional. Overrides the role default." },
    { name: "password", label: edit === "new" ? "Password *" : "New password (leave blank to keep)", type: "password", required: edit === "new", hint: "At least 8 characters, not too common." },
    { name: "is_active", label: "Account is active", type: "checkbox" },
  ];
  return (
    <div className="card">
      <div className="flex justify-end border-b border-slate-200 p-3"><button className="btn-primary" onClick={() => setEdit("new")}><Plus size={16} /> Add user</button></div>
      <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(u) => u.id}
        columns={[{ key: "u", header: "User", render: (u) => <div><p className="font-medium">{u.display_name}</p><p className="text-xs text-slate-500">{u.username}</p></div> },
          { key: "r", header: "Role", render: (u) => u.role[0] + u.role.slice(1).toLowerCase() }, { key: "l", header: "Last login", render: (u) => (u.last_login ? formatDateTime(u.last_login) : "Never") },
          { key: "s", header: "Status", render: (u) => <StatusBadge status={u.is_active ? "AVAILABLE" : "CANCELLED"} /> },
          { key: "a", header: "", className: "text-right", render: (u) => <button className="btn-secondary btn-sm" onClick={() => setEdit(u)}>Edit</button> }]} />
      <FormModal open={edit !== null} title={edit === "new" ? "Add user" : "Edit user"} fields={fields} initial={edit && edit !== "new" ? { ...edit, password: "" } : { role: "CASHIER", is_active: true }} onClose={() => setEdit(null)}
        onSubmit={async (v) => { try { edit === "new" || !edit ? await usersApi.create(v as never) : await usersApi.update(edit.id, v as never); toast.success("User saved"); setEdit(null); void list.reload(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </div>
  );
}

function Audit() {
  const { page, setPage, pageSize } = usePagination(25);
  const list = useFetch(() => settingsApi.audit({ page, page_size: pageSize }), [page]);
  return (
    <div className="card">
      <DataTable rows={list.data?.results} loading={list.loading} error={list.error} onRetry={list.reload} rowKey={(a) => a.id} page={page} pageSize={pageSize} count={list.data?.count} onPage={setPage} emptyTitle="No audit entries yet"
        columns={[{ key: "t", header: "When", render: (a) => formatDateTime(a.created_at) }, { key: "u", header: "User", render: (a) => a.username ?? "system" }, { key: "a", header: "Action", render: (a) => <span className="font-medium">{a.action}</span> },
          { key: "e", header: "Record", render: (a) => `${a.entity_type} #${a.entity_id}` }, { key: "d", header: "Details", render: (a) => <code className="text-xs text-slate-500">{a.after ? JSON.stringify(a.after).slice(0, 90) : ""}</code> }]} />
    </div>
  );
}

function Backup() {
  return (
    <div className="card max-w-3xl space-y-3 p-5 text-sm text-slate-700">
      <h2 className="text-base font-semibold">Backup and restore</h2>
      <p>Your orders, invoices and stock live in the MySQL database. Back it up every day and before every upgrade.</p>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`# Back up (PowerShell, from the XAMPP mysql\\bin folder)
.\\mysqldump.exe -u root -p --single-transaction restaurant_pos > D:\\backups\\pos_2026-01-31.sql

# Restore into an empty database
.\\mysql.exe -u root -p restaurant_pos < D:\\backups\\pos_2026-01-31.sql`}</pre>
      <p>Also copy the <code>backend\media</code> folder (menu photos) and your <code>.env</code> file. Store copies on a different drive or cloud storage, and test a restore occasionally. Full steps are in the README.</p>
    </div>
  );
}
