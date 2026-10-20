import { api } from "./client";
import type { Paginated } from "../types/api";
import type {
  AuditEntry, CalcResult, Category, Customer, DashboardSummary, Ingredient, KitchenOrder, MenuItem, OrderDetail, OrderListItem, PaymentMethod,
  PaymentReport, Recipe, ReceiptData, RestaurantSettings, RestaurantTable, SalesReport, StockMovement, Supplier, User,
} from "../types/models";

type Params = Record<string, string | number | boolean | undefined>;
const clean = (p?: Params) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== ""));
const get = <T,>(url: string, params?: Params) => api.get<T>(url, { params: clean(params) }).then((r) => r.data);

export interface CartPayload {
  items: { menu_item_id: number; quantity: number; notes?: string }[];
  discount_type: string; discount_value: string;
}
export interface PaymentInput { method: PaymentMethod; amount: string; tendered?: string; reference?: string }
export interface CreateOrderPayload extends CartPayload {
  order_type: string; table_id?: number | null; customer_name?: string; customer_phone?: string; notes?: string; payments?: PaymentInput[];
}

export const authApi = {
  login: (username: string, password: string) => api.post<{ access: string; refresh: string; user: User }>("/auth/login/", { username, password }).then((r) => r.data),
  me: () => get<User>("/auth/me/"),
  logout: (refresh: string | null) => api.post("/auth/logout/", { refresh }),
  updateMe: (data: Partial<User> & { password?: string }) => api.patch<User>("/auth/me/", data).then((r) => r.data),
  staff: () => get<{ id: number; name: string; role: string }[]>("/staff/"),
};

export const usersApi = {
  list: (params?: Params) => get<Paginated<User>>("/users/", params),
  create: (d: Partial<User> & { password: string }) => api.post<User>("/users/", d).then((r) => r.data),
  update: (id: number, d: Partial<User> & { password?: string }) => api.patch<User>(`/users/${id}/`, d).then((r) => r.data),
};

export const menuApi = {
  items: (params?: Params) => get<Paginated<MenuItem>>("/menu/items/", params),
  save: (id: number | null, form: FormData) =>
    (id ? api.patch<MenuItem>(`/menu/items/${id}/`, form) : api.post<MenuItem>("/menu/items/", form)).then((r) => r.data),
  patch: (id: number, d: Partial<MenuItem>) => api.patch<MenuItem>(`/menu/items/${id}/`, d).then((r) => r.data),
  deactivate: (id: number) => api.delete(`/menu/items/${id}/`),
  categories: (params?: Params) => get<Category[]>("/menu/categories/", params),
  saveCategory: (id: number | null, d: Partial<Category>) => (id ? api.patch(`/menu/categories/${id}/`, d) : api.post("/menu/categories/", d)).then((r) => r.data as Category),
};

export const tablesApi = {
  list: (params?: Params) => get<RestaurantTable[]>("/tables/", params),
  save: (id: number | null, d: Partial<RestaurantTable>) => (id ? api.patch(`/tables/${id}/`, d) : api.post("/tables/", d)).then((r) => r.data as RestaurantTable),
  deactivate: (id: number) => api.delete(`/tables/${id}/`),
};

export const customersApi = {
  list: (params?: Params) => get<Paginated<Customer>>("/customers/", params),
  save: (id: number | null, d: Partial<Customer>) => (id ? api.patch(`/customers/${id}/`, d) : api.post("/customers/", d)).then((r) => r.data as Customer),
  orders: (id: number) => get<OrderListItem[]>(`/customers/${id}/orders/`),
};

export const ordersApi = {
  list: (params?: Params) => get<Paginated<OrderListItem>>("/orders/", params),
  get: (id: number) => get<OrderDetail>(`/orders/${id}/`),
  receipt: (id: number) => get<ReceiptData>(`/orders/${id}/receipt/`),
  calculate: (p: CartPayload) => api.post<CalcResult>("/orders/calculate/", p).then((r) => r.data),
  create: (p: CreateOrderPayload, idempotencyKey: string) => api.post<OrderDetail>("/orders/", p, { headers: { "Idempotency-Key": idempotencyKey } }).then((r) => r.data),
  pay: (id: number, payments: PaymentInput[], idempotencyKey: string) =>
    api.post<OrderDetail>(`/orders/${id}/payments/`, { payments }, { headers: { "Idempotency-Key": idempotencyKey } }).then((r) => r.data),
  cancel: (id: number, reason: string) => api.post<OrderDetail>(`/orders/${id}/cancel/`, { reason }).then((r) => r.data),
  complete: (id: number) => api.post<OrderDetail>(`/orders/${id}/complete/`).then((r) => r.data),
  refund: (id: number, amount: string, reason: string, restock: boolean) => api.post(`/orders/${id}/refunds/`, { amount, reason, restock }).then((r) => r.data),
  transfer: (id: number, tableId: number) => api.post<OrderDetail>(`/orders/${id}/transfer-table/`, { table_id: tableId }).then((r) => r.data),
  merge: (id: number, sourceId: number) => api.post<OrderDetail>(`/orders/${id}/merge/`, { source_order_id: sourceId }).then((r) => r.data),
  held: () => get<{ id: number; label: string; payload: unknown; cashier_name: string; created_at: string }[]>("/orders/held/"),
  hold: (label: string, payload: unknown) => api.post("/orders/held/", { label, payload }).then((r) => r.data),
  discardHeld: (id: number) => api.delete(`/orders/held/${id}/`),
};

export const kitchenApi = {
  list: () => get<KitchenOrder[]>("/kitchen/orders/"),
  setStatus: (id: number, status: string) => api.patch(`/kitchen/orders/${id}/status/`, { status }).then((r) => r.data),
};

export const inventoryApi = {
  items: (params?: Params) => get<Paginated<Ingredient>>("/inventory/items/", params),
  saveItem: (id: number | null, d: Partial<Ingredient>) => (id ? api.patch(`/inventory/items/${id}/`, d) : api.post("/inventory/items/", d)).then((r) => r.data as Ingredient),
  suppliers: (params?: Params) => get<Paginated<Supplier>>("/inventory/suppliers/", params),
  saveSupplier: (id: number | null, d: Partial<Supplier>) => (id ? api.patch(`/inventory/suppliers/${id}/`, d) : api.post("/inventory/suppliers/", d)).then((r) => r.data as Supplier),
  movements: (params?: Params) => get<Paginated<StockMovement>>("/inventory/movements/", params),
  adjust: (d: { ingredient: number; movement_type: string; quantity: string; reason?: string; unit_cost?: string }) => api.post("/inventory/adjust/", d).then((r) => r.data),
  recipes: () => get<Paginated<Recipe>>("/inventory/recipes/", { page_size: 200 }),
  saveRecipe: (id: number | null, d: { menu_item: number; ingredients: { ingredient: number; quantity: string }[] }) =>
    (id ? api.patch(`/inventory/recipes/${id}/`, d) : api.post("/inventory/recipes/", d)).then((r) => r.data as Recipe),
};

export const reportsApi = {
  summary: () => get<DashboardSummary>("/dashboard/summary/"),
  chart: (days: 7 | 30) => get<{ date: string; total: string; orders: number }[]>("/dashboard/sales-chart/", { days }),
  sales: (params: Params) => get<SalesReport>("/reports/sales/", params),
  payments: (params: Params) => get<PaymentReport>("/reports/payments/", params),
  topItems: (params: Params) => get<{ menu_item_id: number; name: string; quantity: number; revenue: string }[]>("/reports/top-items/", params),
  csv: (params: Params) => api.get<Blob>("/reports/export-csv/", { params: clean(params), responseType: "blob" }).then((r) => r.data),
};

export const settingsApi = {
  get: () => get<RestaurantSettings>("/settings/restaurant/"),
  update: (d: Partial<RestaurantSettings>) => api.patch<RestaurantSettings>("/settings/restaurant/", d).then((r) => r.data),
  audit: (params?: Params) => get<Paginated<AuditEntry>>("/audit-logs/", params),
};
