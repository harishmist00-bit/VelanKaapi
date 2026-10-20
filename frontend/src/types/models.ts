export type Role = "ADMIN" | "MANAGER" | "CASHIER";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type OrderStatus = "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type KitchenStatus = "NEW" | "PREPARING" | "READY" | "COMPLETED";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
export type PaymentMethod = "CASH" | "UPI" | "CARD" | "OTHER";
export type DiscountType = "NONE" | "PERCENT" | "FIXED";

// Money values arrive from the API as decimal strings; the UI never does billing maths with them.
export type Money = string;

export interface User {
  id: number; username: string; first_name: string; last_name: string; display_name: string; email: string; phone: string;
  role: Role; is_active: boolean; max_discount_percent: string | null; last_login: string | null;
}
export interface Category { id: number; name: string; sort_order: number; is_active: boolean; item_count?: number }
export interface MenuItem {
  id: number; category: number; category_name: string; name: string; sku: string; description: string; price: Money; tax_rate: string;
  is_veg: boolean; image: string | null; is_available: boolean; is_active: boolean;
}
export interface CurrentOrderRef { id: number; order_number: string; grand_total: Money; payment_status: PaymentStatus; status: OrderStatus; created_at: string }
export interface RestaurantTable { id: number; number: string; capacity: number; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; is_active: boolean; current_order: CurrentOrderRef | null }
export interface Customer { id: number; name: string; phone: string; email: string; loyalty_points: number; total_spent: Money | null; order_count: number; created_at: string }

export interface OrderListItem {
  id: number; order_number: string; invoice_number: string | null; order_type: OrderType; table: number | null; table_number: string | null;
  customer: number | null; customer_name: string | null; cashier: number; cashier_name: string; status: OrderStatus; kitchen_status: KitchenStatus;
  payment_status: PaymentStatus; subtotal: Money; discount_amount: Money; tax_total: Money; grand_total: Money; paid_total: Money; refunded_total: Money;
  item_count: number; created_at: string;
}
export interface OrderItem { id: number; menu_item: number; name: string; unit_price: Money; quantity: number; tax_rate: string; line_subtotal: Money; line_discount: Money; line_tax: Money; line_total: Money; notes: string }
export interface PaymentRecord { id: number; method: PaymentMethod; amount: Money; tendered: Money | null; change_due: Money; reference: string; received_by_name: string; created_at: string }
export interface RefundRecord { id: number; amount: Money; reason: string; restock: boolean; created_by_name: string; created_at: string }
export interface TaxRow { rate: string; taxable: Money; cgst: Money; sgst: Money; tax: Money }
export interface OrderDetail extends OrderListItem {
  items: OrderItem[]; payments: PaymentRecord[]; refunds: RefundRecord[]; customer_phone: string | null; amount_due: Money; tax_breakdown: TaxRow[];
  notes: string; cancel_reason: string; discount_type: DiscountType; discount_value: Money; round_off: Money; prices_include_tax: boolean; completed_at: string | null;
}
export interface RestaurantSettings {
  name: string; address: string; phone: string; gstin: string; currency: string; invoice_prefix: string; invoice_counter: number; order_counter: number;
  default_order_type: OrderType; default_tax_rate: string; prices_include_tax: boolean; round_off_enabled: boolean; allow_partial_payments: boolean;
  allow_negative_stock: boolean; max_cashier_discount_percent: string; enabled_payment_methods: PaymentMethod[]; receipt_footer: string;
  loyalty_enabled: boolean; loyalty_points_per_100: number;
}
export interface ReceiptData { order: OrderDetail; restaurant: RestaurantSettings }

export interface CalcLine { menu_item_id: number; name: string; unit_price: Money; quantity: number; line_subtotal: Money; line_discount: Money; line_tax: Money; line_total: Money }
export interface CalcResult { lines: CalcLine[]; subtotal: Money; discount_amount: Money; tax_total: Money; round_off: Money; grand_total: Money }

export interface Ingredient { id: number; name: string; unit: string; current_quantity: string; reorder_level: string; supplier: number | null; supplier_name: string | null; is_active: boolean; is_low: boolean }
export interface Supplier { id: number; name: string; phone: string; email: string; address: string; is_active: boolean }
export interface StockMovement { id: number; ingredient: number; ingredient_name: string; unit: string; movement_type: string; quantity_delta: string; balance_after: string; unit_cost: string | null; order_number: string | null; reason: string; created_by_name: string | null; created_at: string }
export interface Recipe { id: number; menu_item: number; menu_item_name: string; ingredients: { ingredient: number; ingredient_name: string; unit: string; quantity: string }[] }
export interface AuditEntry { id: number; created_at: string; username: string | null; action: string; entity_type: string; entity_id: string; before: unknown; after: unknown }

export interface KitchenOrder {
  id: number; order_number: string; order_type: OrderType; table_number: string | null; kitchen_status: KitchenStatus; payment_status: PaymentStatus;
  notes: string; created_at: string; items: { id: number; name: string; quantity: number; notes: string }[];
}
export interface DashboardSummary {
  date: string; total_sales: Money; orders: number; revenue_collected: Money; pending_payments: Money; pending_orders: number; cancelled_orders: number;
  average_order_value: Money; order_types: Record<OrderType, { orders: number; total: Money }>; top_items: { menu_item_id: number; name: string; quantity: number; revenue: Money }[];
  recent_transactions: OrderListItem[]; low_stock_count: number;
}
export interface SalesReport {
  summary: { orders: number; gross_sales: Money; discounts: Money; refunds: Money; tax_collected: Money; total_billed: Money; net_sales: Money };
  series: { period: string; orders: number; total: Money }[]; categories: { category: string; quantity: number; revenue: Money }[]; cashiers: { cashier: string; orders: number; total: Money }[];
}
export interface PaymentReport { methods: { method: string; count: number; total: Money }[]; received: Money; refunded: Money; net_collected: Money }
