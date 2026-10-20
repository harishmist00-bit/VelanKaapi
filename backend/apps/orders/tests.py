from decimal import Decimal as D

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import PermissionDenied

from apps.audit.models import AuditLog
from apps.common.exceptions import BusinessRuleError
from apps.common.testing import client_for, make_user, seed_basic
from apps.inventory.models import Ingredient, Recipe, RecipeIngredient, StockMovement
from apps.orders.models import Order
from apps.orders.services import billing
from apps.payments.models import Payment
from apps.settings_app.models import RestaurantSettings
from apps.tables.models import RestaurantTable


def line(price, qty, rate):
    return {"unit_price": D(price), "quantity": qty, "tax_rate": D(rate)}


class BillingMathTests(SimpleTestCase):
    def test_exclusive_tax(self):
        r = billing.calculate([line("200.00", 2, "5")])
        self.assertEqual((r["subtotal"], r["tax_total"], r["grand_total"]), (D("400.00"), D("20.00"), D("420.00")))

    def test_mixed_rates(self):
        r = billing.calculate([line("200.00", 1, "5"), line("50.00", 1, "18")])
        self.assertEqual(r["tax_total"], D("19.00"))
        self.assertEqual(r["grand_total"], D("269.00"))

    def test_percent_discount_applied_before_tax(self):
        r = billing.calculate([line("200.00", 1, "5")], "PERCENT", 10)
        self.assertEqual((r["discount_amount"], r["tax_total"], r["grand_total"]), (D("20.00"), D("9.00"), D("189.00")))

    def test_fixed_discount_allocation_sums_exactly(self):
        r = billing.calculate([line("33.33", 1, "5"), line("33.33", 1, "5"), line("33.34", 1, "5")], "FIXED", "10.00")
        self.assertEqual(sum(l["line_discount"] for l in r["lines"]), D("10.00"))
        self.assertEqual(r["discount_amount"], D("10.00"))

    def test_tax_inclusive_does_not_change_total(self):
        r = billing.calculate([line("105.00", 1, "5")], prices_include_tax=True)
        self.assertEqual((r["grand_total"], r["tax_total"]), (D("105.00"), D("5.00")))

    def test_round_off(self):
        r = billing.calculate([line("99.50", 1, "5")], round_off_enabled=True)  # 104.475 -> 104.48 -> 104
        self.assertEqual(r["grand_total"], D("104"))
        self.assertEqual(r["round_off"], D("104") - D("104.48"))

    def test_half_up_rounding(self):
        self.assertEqual(billing.q(D("0.005")), D("0.01"))

    def test_rejects_bad_input(self):
        with self.assertRaises(BusinessRuleError):
            billing.calculate([line("10", 0, "5")])
        with self.assertRaises(BusinessRuleError):
            billing.calculate([line("10", 1, "5")], "PERCENT", 101)
        with self.assertRaises(BusinessRuleError):
            billing.calculate([line("10", 1, "5")], "FIXED", 11)
        with self.assertRaises(BusinessRuleError):
            billing.calculate([])


class OrderApiTests(TestCase):
    def setUp(self):
        self.a, self.b, self.t, self.t2 = seed_basic()
        self.cashier, self.manager = make_user("cash", "CASHIER"), make_user("mgr", "MANAGER")
        self.c, self.m = client_for(self.cashier), client_for(self.manager)
        cfg = RestaurantSettings.get()
        cfg.round_off_enabled = False
        cfg.save()

    def body(self, **kw):
        base = {"order_type": "TAKEAWAY", "items": [{"menu_item_id": self.a.id, "quantity": 2}, {"menu_item_id": self.b.id, "quantity": 1}]}
        base.update(kw)
        return base

    def test_total_is_computed_by_backend_ignoring_client_values(self):
        r = self.c.post("/api/orders/", self.body(grand_total="1.00", subtotal="1.00"), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["subtotal"], "450.00")
        self.assertEqual(r.data["grand_total"], "479.00")  # 450 + 20 (5% of 400) + 9 (18% of 50)

    def test_price_comes_from_menu_not_request(self):
        body = self.body()
        body["items"][0]["unit_price"] = "1.00"
        r = self.c.post("/api/orders/", body, format="json")
        self.assertEqual(r.data["items"][0]["unit_price"], "200.00")

    def test_unavailable_item_rejected(self):
        self.b.is_available = False
        self.b.save()
        self.assertEqual(self.c.post("/api/orders/", self.body(), format="json").status_code, 400)

    def test_invalid_quantity_rejected(self):
        body = self.body()
        body["items"][0]["quantity"] = -1
        self.assertEqual(self.c.post("/api/orders/", body, format="json").status_code, 400)

    def test_calculate_endpoint_matches_creation(self):
        calc = self.c.post("/api/orders/calculate/", self.body(), format="json").data
        order = self.c.post("/api/orders/", self.body(), format="json").data
        self.assertEqual(calc["grand_total"], D(order["grand_total"]))

    def test_discount_permission_cashier_vs_manager(self):
        body = self.body(discount_type="PERCENT", discount_value="25")
        self.assertEqual(self.c.post("/api/orders/", body, format="json").status_code, 403)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(self.m.post("/api/orders/", body, format="json").status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action="order.discount").exists())
        ok = self.c.post("/api/orders/", self.body(discount_type="PERCENT", discount_value="10"), format="json")
        self.assertEqual(ok.status_code, 201)

    def test_dine_in_needs_table_and_occupies_it(self):
        self.assertEqual(self.c.post("/api/orders/", self.body(order_type="DINE_IN"), format="json").status_code, 400)
        r = self.c.post("/api/orders/", self.body(order_type="DINE_IN", table_id=self.t.id), format="json")
        self.assertEqual(r.status_code, 201)
        self.t.refresh_from_db()
        self.assertEqual(self.t.status, "OCCUPIED")
        again = self.c.post("/api/orders/", self.body(order_type="DINE_IN", table_id=self.t.id), format="json")
        self.assertEqual(again.status_code, 409)

    def test_cash_payment_with_change_and_invoice_number(self):
        r = self.c.post("/api/orders/", self.body(payments=[{"method": "CASH", "amount": "479.00", "tendered": "500.00"}]), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["payment_status"], "PAID")
        self.assertEqual(r.data["payments"][0]["change_due"], "21.00")
        self.assertTrue(r.data["invoice_number"].startswith("INV-"))

    def test_split_payment_creates_separate_entries(self):
        r = self.c.post("/api/orders/", self.body(payments=[{"method": "CASH", "amount": "179.00", "tendered": "200"}, {"method": "UPI", "amount": "300.00", "reference": "UTR123"}]), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Payment.objects.count(), 2)
        self.assertEqual(r.data["payment_status"], "PAID")

    def test_overpayment_and_underpayment_rejected(self):
        self.assertEqual(self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "500.00"}]), format="json").status_code, 400)
        self.assertEqual(Order.objects.count(), 0)  # whole order rolled back
        self.assertEqual(self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "100.00"}]), format="json").status_code, 400)

    def test_partial_payment_when_allowed(self):
        cfg = RestaurantSettings.get()
        cfg.allow_partial_payments = True
        cfg.save()
        r = self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "100.00"}]), format="json")
        self.assertEqual((r.status_code, r.data["payment_status"]), (201, "PARTIAL"))
        pay = self.c.post(f"/api/orders/{r.data['id']}/payments/", {"payments": [{"method": "CASH", "amount": "379.00"}]}, format="json")
        self.assertEqual(pay.data["payment_status"], "PAID")

    def test_card_payment_rejects_full_number(self):
        r = self.c.post("/api/orders/", self.body(payments=[{"method": "CARD", "amount": "479.00", "reference": "4111111111111111"}]), format="json")
        self.assertEqual(r.status_code, 400)

    def test_cash_tendered_below_amount_rejected(self):
        r = self.c.post("/api/orders/", self.body(payments=[{"method": "CASH", "amount": "479.00", "tendered": "400"}]), format="json")
        self.assertEqual(r.status_code, 400)

    def test_idempotent_order_creation(self):
        body = self.body(payments=[{"method": "CASH", "amount": "479.00"}])
        r1 = self.c.post("/api/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY="abc-1")
        r2 = self.c.post("/api/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY="abc-1")
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))
        self.assertEqual(r1.data["id"], r2.data["id"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Payment.objects.count(), 1)
        r3 = self.c.post("/api/orders/", self.body(), format="json", HTTP_IDEMPOTENCY_KEY="abc-1")
        self.assertEqual(r3.status_code, 409)

    def test_idempotent_payment(self):
        o = self.c.post("/api/orders/", self.body(), format="json").data
        p = {"payments": [{"method": "UPI", "amount": "479.00"}]}
        self.c.post(f"/api/orders/{o['id']}/payments/", p, format="json", HTTP_IDEMPOTENCY_KEY="pay-1")
        again = self.c.post(f"/api/orders/{o['id']}/payments/", p, format="json", HTTP_IDEMPOTENCY_KEY="pay-1")
        self.assertEqual(again.status_code, 201)
        self.assertEqual(Payment.objects.count(), 1)
        no_key = self.c.post(f"/api/orders/{o['id']}/payments/", p, format="json")
        self.assertEqual(no_key.status_code, 400)  # exceeds amount due, so no double charge even without a key

    def test_failed_request_with_key_can_be_retried(self):
        bad = self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "1.00"}]), format="json", HTTP_IDEMPOTENCY_KEY="k9")
        self.assertEqual(bad.status_code, 400)
        good = self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "479.00"}]), format="json", HTTP_IDEMPOTENCY_KEY="k9")
        self.assertEqual(good.status_code, 201)  # the failed attempt rolled back, so the key is free to reuse
        self.assertEqual(Order.objects.count(), 1)

    def test_invoice_numbers_unique_and_sequential(self):
        nums = [self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "479.00"}]), format="json").data["invoice_number"] for _ in range(3)]
        self.assertEqual(len(set(nums)), 3)
        self.assertEqual(sorted(nums), nums)

    def test_cashier_sees_only_own_orders(self):
        self.c.post("/api/orders/", self.body(), format="json")
        self.m.post("/api/orders/", self.body(), format="json")
        self.assertEqual(self.c.get("/api/orders/").data["count"], 1)
        self.assertEqual(self.m.get("/api/orders/").data["count"], 2)

    def test_cancel_requires_manager_reason_and_releases_table(self):
        o = self.c.post("/api/orders/", self.body(order_type="DINE_IN", table_id=self.t.id), format="json").data
        self.assertEqual(self.c.post(f"/api/orders/{o['id']}/cancel/", {"reason": "x"}, format="json").status_code, 403)
        self.assertEqual(self.m.post(f"/api/orders/{o['id']}/cancel/", {"reason": ""}, format="json").status_code, 400)
        self.assertEqual(self.m.post(f"/api/orders/{o['id']}/cancel/", {"reason": "Customer left"}, format="json").status_code, 200)
        self.t.refresh_from_db()
        self.assertEqual(self.t.status, "AVAILABLE")
        self.assertTrue(AuditLog.objects.filter(action="order.cancel").exists())

    def test_completed_order_cannot_be_cancelled_or_repaid(self):
        o = self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "479.00"}]), format="json").data
        self.c.post(f"/api/orders/{o['id']}/complete/", format="json")
        self.assertEqual(self.m.post(f"/api/orders/{o['id']}/cancel/", {"reason": "oops"}, format="json").status_code, 409)

    def test_complete_requires_payment(self):
        o = self.c.post("/api/orders/", self.body(), format="json").data
        self.assertEqual(self.c.post(f"/api/orders/{o['id']}/complete/", format="json").status_code, 400)

    def test_refund_is_manager_only_and_bounded(self):
        o = self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "479.00"}]), format="json").data
        self.assertEqual(self.c.post(f"/api/orders/{o['id']}/refunds/", {"amount": "10", "reason": "x"}, format="json").status_code, 403)
        self.assertEqual(self.m.post(f"/api/orders/{o['id']}/refunds/", {"amount": "500", "reason": "x"}, format="json").status_code, 400)
        r = self.m.post(f"/api/orders/{o['id']}/refunds/", {"amount": "79", "reason": "Cold food"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Order.objects.get(pk=o["id"]).payment_status, "PARTIALLY_REFUNDED")
        self.assertTrue(AuditLog.objects.filter(action="refund.create").exists())

    def test_kitchen_flow_is_separate_from_payment(self):
        o = self.c.post("/api/orders/", self.body(), format="json").data
        k = self.c.get("/api/kitchen/orders/").data
        self.assertEqual(len(k), 1)
        for st in ("PREPARING", "READY", "COMPLETED"):
            self.assertEqual(self.c.patch(f"/api/kitchen/orders/{o['id']}/status/", {"status": st}, format="json").status_code, 200)
        order = Order.objects.get(pk=o["id"])
        self.assertEqual((order.kitchen_status, order.payment_status), ("COMPLETED", "UNPAID"))
        self.assertNotEqual(order.status, "COMPLETED")  # unpaid orders stay open
        self.c.post(f"/api/orders/{o['id']}/payments/", {"payments": [{"method": "UPI", "amount": "479.00"}]}, format="json")
        self.assertEqual(Order.objects.get(pk=o["id"]).status, "COMPLETED")  # auto-closes once paid

    def test_kitchen_cannot_skip_invalid_transition(self):
        o = self.c.post("/api/orders/", self.body(), format="json").data
        self.assertEqual(self.c.patch(f"/api/kitchen/orders/{o['id']}/status/", {"status": "COMPLETED"}, format="json").status_code, 400)

    def test_transfer_table(self):
        o = self.c.post("/api/orders/", self.body(order_type="DINE_IN", table_id=self.t.id), format="json").data
        r = self.c.post(f"/api/orders/{o['id']}/transfer-table/", {"table_id": self.t2.id}, format="json")
        self.assertEqual(r.status_code, 200)
        self.t.refresh_from_db(), self.t2.refresh_from_db()
        self.assertEqual((self.t.status, self.t2.status), ("AVAILABLE", "OCCUPIED"))

    def test_merge_orders(self):
        o1 = self.c.post("/api/orders/", self.body(order_type="DINE_IN", table_id=self.t.id), format="json").data
        o2 = self.c.post("/api/orders/", self.body(order_type="DINE_IN", table_id=self.t2.id), format="json").data
        r = self.m.post(f"/api/orders/{o1['id']}/merge/", {"source_order_id": o2["id"]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["grand_total"], "958.00")
        self.t2.refresh_from_db()
        self.assertEqual(self.t2.status, "AVAILABLE")

    def test_held_orders(self):
        r = self.c.post("/api/orders/held/", {"label": "Table 3", "payload": {"items": []}}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(self.c.get("/api/orders/held/").data), 1)
        self.assertEqual(self.c.delete(f"/api/orders/held/{r.data['id']}/").status_code, 204)

    def test_receipt_includes_restaurant_and_tax_breakdown(self):
        o = self.c.post("/api/orders/", self.body(payments=[{"method": "UPI", "amount": "479.00"}]), format="json").data
        rc = self.c.get(f"/api/orders/{o['id']}/receipt/").data
        self.assertIn("gstin", rc["restaurant"])
        self.assertEqual({row["rate"] for row in rc["order"]["tax_breakdown"]}, {"5.00", "18.00"})


class InventoryDeductionTests(TestCase):
    def setUp(self):
        self.a, self.b, self.t, _ = seed_basic()
        self.cashier, self.manager = make_user("cash", "CASHIER"), make_user("mgr", "MANAGER")
        self.c, self.m = client_for(self.cashier), client_for(self.manager)
        self.rice = Ingredient.objects.create(name="Rice", unit="kg", current_quantity=D("10"), reorder_level=D("2"))
        rec = Recipe.objects.create(menu_item=self.a)
        RecipeIngredient.objects.create(recipe=rec, ingredient=self.rice, quantity=D("0.5"))
        cfg = RestaurantSettings.get()
        cfg.round_off_enabled = False
        cfg.save()

    def make_paid(self):
        body = {"order_type": "TAKEAWAY", "items": [{"menu_item_id": self.a.id, "quantity": 2}], "payments": [{"method": "UPI", "amount": "420.00"}]}
        return self.c.post("/api/orders/", body, format="json").data

    def test_stock_deducted_once_on_completion(self):
        o = self.make_paid()
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.current_quantity, D("10"))  # not before completion
        self.c.post(f"/api/orders/{o['id']}/complete/", format="json")
        self.c.post(f"/api/orders/{o['id']}/complete/", format="json")  # retry
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.current_quantity, D("9.000"))
        self.assertEqual(StockMovement.objects.filter(movement_type="SALE").count(), 1)

    def test_db_constraint_blocks_duplicate_sale_movement(self):
        from django.db import IntegrityError, transaction
        o = self.make_paid()
        self.c.post(f"/api/orders/{o['id']}/complete/", format="json")
        with self.assertRaises(IntegrityError), transaction.atomic():
            StockMovement.objects.create(ingredient=self.rice, movement_type="SALE", quantity_delta=-1, balance_after=0, order_id=o["id"])

    def test_full_refund_with_restock_reverses_once(self):
        o = self.make_paid()
        self.c.post(f"/api/orders/{o['id']}/complete/", format="json")
        r = self.m.post(f"/api/orders/{o['id']}/refunds/", {"amount": "420.00", "reason": "Wrong order", "restock": True}, format="json")
        self.assertEqual(r.status_code, 201)
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.current_quantity, D("10.000"))
        self.assertEqual(StockMovement.objects.filter(movement_type="REVERSAL").count(), 1)

    def test_partial_refund_cannot_restock(self):
        o = self.make_paid()
        self.c.post(f"/api/orders/{o['id']}/complete/", format="json")
        r = self.m.post(f"/api/orders/{o['id']}/refunds/", {"amount": "20", "reason": "x", "restock": True}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_insufficient_stock_blocks_completion_when_negative_not_allowed(self):
        cfg = RestaurantSettings.get()
        cfg.allow_negative_stock = False
        cfg.save()
        self.rice.current_quantity = D("0.5")
        self.rice.save()
        o = self.make_paid()
        r = self.c.post(f"/api/orders/{o['id']}/complete/", format="json")
        self.assertEqual(r.status_code, 409)
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.current_quantity, D("0.5"))

    def test_purchase_and_adjustment_and_low_stock(self):
        r = self.m.post("/api/inventory/adjust/", {"ingredient": self.rice.id, "movement_type": "PURCHASE", "quantity": "5"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.m.post("/api/inventory/adjust/", {"ingredient": self.rice.id, "movement_type": "ADJUSTMENT", "quantity": "-14", "reason": "Count"}, format="json").status_code, 201)
        low = self.m.get("/api/inventory/items/?low_stock=true").data["results"]
        self.assertEqual([i["name"] for i in low], ["Rice"])
        self.assertEqual(self.c.post("/api/inventory/adjust/", {"ingredient": self.rice.id, "movement_type": "PURCHASE", "quantity": "5"}, format="json").status_code, 403)


class ReportTests(TestCase):
    def setUp(self):
        self.a, self.b, self.t, _ = seed_basic()
        self.cashier, self.manager = make_user("cash", "CASHIER"), make_user("mgr", "MANAGER")
        self.c, self.m = client_for(self.cashier), client_for(self.manager)
        cfg = RestaurantSettings.get()
        cfg.round_off_enabled = False
        cfg.save()
        for _ in range(2):
            self.c.post("/api/orders/", {"order_type": "TAKEAWAY", "items": [{"menu_item_id": self.a.id, "quantity": 1}], "payments": [{"method": "CASH", "amount": "210.00"}]}, format="json")

    def test_dashboard_values_come_from_database(self):
        d = self.m.get("/api/dashboard/summary/").data
        self.assertEqual((d["orders"], d["total_sales"], d["revenue_collected"]), (2, D("420.00"), D("420.00")))
        self.assertEqual(d["average_order_value"], D("210.00"))
        self.assertEqual(d["top_items"][0]["name"], "Biryani")

    def test_sales_and_payment_reports(self):
        s = self.m.get("/api/reports/sales/").data
        self.assertEqual(s["summary"]["orders"], 2)
        self.assertEqual(s["summary"]["tax_collected"], D("20.00"))
        p = self.m.get("/api/reports/payments/").data
        self.assertEqual(p["methods"][0]["method"], "CASH")

    def test_reports_forbidden_for_cashier_and_csv_exports(self):
        self.assertEqual(self.c.get("/api/reports/sales/").status_code, 403)
        r = self.m.get("/api/reports/export-csv/?type=orders")
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r["Content-Type"])

    def test_chart_has_one_row_per_day(self):
        self.assertEqual(len(self.m.get("/api/dashboard/sales-chart/?days=30").data), 30)
