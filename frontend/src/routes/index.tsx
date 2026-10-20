import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { AppLayout } from "../layouts/AppLayout";
import Categories from "../pages/Categories/Categories";
import Customers from "../pages/Customers/Customers";
import Dashboard from "../pages/Dashboard/Dashboard";
import Inventory from "../pages/Inventory/Inventory";
import Kitchen from "../pages/Kitchen/Kitchen";
import Login from "../pages/Login/Login";
import Menu from "../pages/Menu/Menu";
import Orders from "../pages/Orders/Orders";
import POS from "../pages/POS/POS";
import Reports from "../pages/Reports/Reports";
import Settings from "../pages/Settings/Settings";
import Tables from "../pages/Tables/Tables";
import { ProtectedRoute } from "./ProtectedRoute";

function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "CASHIER" ? "/pos" : "/dashboard"} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="orders" element={<Orders />} />
          <Route path="kitchen" element={<Kitchen />} />
          <Route path="tables" element={<Tables />} />
          <Route path="customers" element={<Customers />} />
          <Route element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} />}>
            <Route path="menu" element={<Menu />} />
            <Route path="categories" element={<Categories />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
