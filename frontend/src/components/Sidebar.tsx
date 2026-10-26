import { BarChart3, ChefHat, LayoutDashboard, LayoutGrid, Package, ReceiptText, Settings, ShoppingCart, Tags, UtensilsCrossed, Users, X } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import type { Role } from "../types/models";

const ALL: Role[] = ["ADMIN", "MANAGER", "CASHIER"];
const MGR: Role[] = ["ADMIN", "MANAGER"];
export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { to: "/pos", label: "POS Billing", icon: ShoppingCart, roles: ALL },
  { to: "/orders", label: "Orders", icon: ReceiptText, roles: ALL },
  { to: "/kitchen", label: "Kitchen", icon: ChefHat, roles: ALL },
  { to: "/tables", label: "Tables", icon: LayoutGrid, roles: ALL },
  { to: "/menu", label: "Menu", icon: UtensilsCrossed, roles: MGR },
  { to: "/categories", label: "Categories", icon: Tags, roles: MGR },
  { to: "/inventory", label: "Inventory", icon: Package, roles: MGR },
  { to: "/customers", label: "Customers", icon: Users, roles: ALL },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: MGR },
  { to: "/settings", label: "Settings", icon: Settings, roles: MGR },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  return (
    <>
      {open && <div className="no-print fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onClose} />}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-charcoal-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center justify-between px-5">
          <span className="flex items-center gap-2 text-base font-semibold text-white"><UtensilsCrossed size={20} className="text-brand-500" /> Velan Kaappi</span>
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
          {NAV.filter((n) => user && n.roles.includes(user.role)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-charcoal-700 font-medium text-white" : "hover:bg-charcoal-800 hover:text-white"}`}>
              {({ isActive }) => (<><Icon size={18} className={isActive ? "text-brand-500" : ""} />{label}</>)}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
