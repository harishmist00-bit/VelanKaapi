import { zodResolver } from "@hookform/resolvers/zod";
import { UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { errorMessage } from "../../api/client";
import { FormField } from "../../components/FormField";
import { useAuth } from "../../context/AuthContext";

const schema = z.object({ username: z.string().trim().min(1, "Enter your username"), password: z.string().min(1, "Enter your password") });
type Form = z.infer<typeof schema>;

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const u = await login(v.username, v.password);
      nav((loc.state as { from?: string } | null)?.from ?? (u.role === "CASHIER" ? "/pos" : "/dashboard"), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-900 p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6" noValidate>
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900"><UtensilsCrossed className="text-brand-600" /> Restaurant POS</div>
        <p className="text-sm text-slate-500">Sign in to start billing.</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <FormField label="Username" htmlFor="username" error={errors.username?.message}><input id="username" className="input" autoComplete="username" autoFocus {...register("username")} /></FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}><input id="password" type="password" className="input" autoComplete="current-password" {...register("password")} /></FormField>
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
