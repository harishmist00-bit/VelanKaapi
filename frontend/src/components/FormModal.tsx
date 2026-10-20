import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "./FormField";
import { Modal } from "./Modal";

export interface FieldDef {
  name: string; label: string; type?: "text" | "number" | "email" | "password" | "select" | "checkbox" | "textarea" | "tel";
  required?: boolean; options?: { value: string | number; label: string }[]; min?: number; max?: number; step?: string; hint?: string; maxLength?: number; colSpan?: 2;
}
type Values = Record<string, string | number | boolean | null | undefined>;

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    const t = f.type ?? "text";
    if (t === "checkbox") shape[f.name] = z.boolean();
    else if (t === "number") {
      let n = z.coerce.number({ invalid_type_error: "Enter a number" });
      if (f.min !== undefined) n = n.min(f.min, `Must be at least ${f.min}`);
      if (f.max !== undefined) n = n.max(f.max, `Must be at most ${f.max}`);
      shape[f.name] = f.required ? n : z.union([z.literal(""), n]).optional();
    } else {
      let s: z.ZodTypeAny = z.string();
      if (f.maxLength) s = (s as z.ZodString).max(f.maxLength, `At most ${f.maxLength} characters`);
      if (t === "email") s = (s as z.ZodString).refine((v) => v === "" || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email");
      shape[f.name] = f.required ? (s as z.ZodString).trim().min(1, `${f.label} is required`) : s.optional();
    }
  }
  return z.object(shape);
}

interface Props {
  open: boolean; title: string; fields: FieldDef[]; initial?: Record<string, unknown>; submitLabel?: string; onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

/** A small schema-driven form dialog (React Hook Form + Zod) used by most CRUD screens. */
export function FormModal({ open, title, fields, initial, submitLabel = "Save changes", onClose, onSubmit }: Props) {
  const schema = useMemo(() => buildSchema(fields), [fields]);
  const defaults = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, (initial?.[f.name] as Values[string]) ?? (f.type === "checkbox" ? false : "")])), [fields, initial]);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  // Reset only when the dialog opens, never on parent re-renders (that would wipe what the user typed).
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  useEffect(() => { if (open) reset(defaultsRef.current); }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "password" && !v) continue; // blank password = keep current
      out[f.name] = v === "" && f.type !== "text" && f.type !== "textarea" ? null : v;
    }
    await onSubmit(out);
  });

  return (
    <Modal open={open} title={title} onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose} type="button">Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? "Saving…" : submitLabel}</button>
      </>}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        {fields.map((f) => {
          const err = errors[f.name]?.message as string | undefined;
          const id = `f-${f.name}`;
          const span = f.colSpan === 2 || f.type === "textarea" ? "sm:col-span-2" : "";
          if (f.type === "checkbox")
            return (
              <label key={f.name} className={`flex items-center gap-2 text-sm text-slate-700 ${span}`}>
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" {...register(f.name)} /> {f.label}
              </label>
            );
          return (
            <FormField key={f.name} label={f.label + (f.required ? " *" : "")} htmlFor={id} error={err} hint={f.hint} className={span}>
              {f.type === "select" ? (
                <select id={id} className="input" {...register(f.name)}>
                  {!f.required && <option value="">None</option>}
                  {f.required && <option value="" disabled>Select…</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea id={id} className="input" rows={3} {...register(f.name)} />
              ) : (
                <input id={id} className="input" type={f.type ?? "text"} step={f.step} autoComplete={f.type === "password" ? "new-password" : "off"} {...register(f.name)} />
              )}
            </FormField>
          );
        })}
      </form>
    </Modal>
  );
}
