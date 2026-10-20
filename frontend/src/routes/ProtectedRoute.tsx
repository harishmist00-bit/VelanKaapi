import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../types/models";

/** Requires a signed-in user; optionally restricts to certain roles (the backend enforces the same rules). */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner className="h-screen" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role))
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className="text-lg font-semibold">You don’t have access to this page</h1>
        <p className="mt-1 text-sm text-slate-500">Ask a manager or admin if you need it.</p>
      </div>
    );
  return <Outlet />;
}
