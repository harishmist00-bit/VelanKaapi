import { LogOut, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { NAV } from "./Sidebar";

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const title = NAV.find((n) => pathname.startsWith(n.to))?.label ?? "Restaurant POS";
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <button className="btn-ghost btn-sm lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-slate-800">{user?.display_name}</p>
          <p className="text-xs capitalize text-slate-500">{user?.role.toLowerCase()}</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={async () => { await logout(); nav("/login"); }}><LogOut size={15} /> Log out</button>
      </div>
    </header>
  );
}
