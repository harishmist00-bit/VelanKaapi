"""Pure billing maths. No database access here, so it is easy to test.

All amounts are Decimal, rounded half-up to 2 places. Nothing here trusts client-supplied totals.
"""
from decimal import ROUND_HALF_UP, Decimal

from rest_framework.exceptions import PermissionDenied

from apps.common.exceptions import BusinessRuleError
from apps.common.permissions import ADMIN, CASHIER, role_of

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def q(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def calculate(lines, discount_type="NONE", discount_value=0, prices_include_tax=False, round_off_enabled=False):
    """lines: iterable of dicts with unit_price, quantity, tax_rate. Returns totals and per-line values."""
    lines = list(lines)
    if not lines:
        raise BusinessRuleError("Add at least one item.")
    discount_value = Decimal(discount_value or 0)
    out = []
    for ln in lines:
        qty = int(ln["quantity"])
        if qty < 1 or qty > 99:
            raise BusinessRuleError("Quantity must be between 1 and 99.")
        price, rate = Decimal(ln["unit_price"]), Decimal(ln["tax_rate"])
        if price < 0 or not (Decimal("0") <= rate <= Decimal("100")):
            raise BusinessRuleError("Invalid price or tax rate.")
        out.append({"line_subtotal": q(price * qty), "tax_rate": rate})
    subtotal = sum((o["line_subtotal"] for o in out), ZERO)

    if discount_type == "PERCENT":
        if not (ZERO <= discount_value <= Decimal("100")):
            raise BusinessRuleError("Discount percent must be between 0 and 100.")
        discount = q(subtotal * discount_value / 100)
    elif discount_type == "FIXED":
        if discount_value < 0 or q(discount_value) > subtotal:
            raise BusinessRuleError("Discount cannot be negative or exceed the subtotal.")
        discount = q(discount_value)
    else:
        discount, discount_value = ZERO, ZERO

    # Allocate the discount across lines in proportion to their subtotals; the last line takes the remainder.
    allocated = ZERO
    for i, o in enumerate(out):
        if i == len(out) - 1:
            share = discount - allocated
        elif subtotal > 0:
            share = q(discount * o["line_subtotal"] / subtotal)
        else:
            share = ZERO
        share = min(max(share, ZERO), o["line_subtotal"])
        o["line_discount"] = share
        allocated += share
        after = o["line_subtotal"] - share
        rate = o["tax_rate"]
        if prices_include_tax:
            o["line_tax"] = q(after * rate / (100 + rate))
            o["line_total"] = after
        else:
            o["line_tax"] = q(after * rate / 100)
            o["line_total"] = after + o["line_tax"]

    tax_total = sum((o["line_tax"] for o in out), ZERO)
    grand = sum((o["line_total"] for o in out), ZERO)
    round_off = ZERO
    if round_off_enabled:
        rounded = grand.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        round_off, grand = rounded - grand, rounded
    return {
        "lines": out, "subtotal": subtotal, "discount_type": discount_type,
        "discount_value": discount_value, "discount_amount": sum((o["line_discount"] for o in out), ZERO),
        "tax_total": tax_total, "round_off": round_off, "grand_total": grand,
    }


def discount_limit_percent(user, cfg):
    if user.max_discount_percent is not None:
        return user.max_discount_percent
    return cfg.max_cashier_discount_percent if role_of(user) == CASHIER else Decimal("100")


def check_discount_permission(user, cfg, subtotal, discount_amount):
    if discount_amount <= 0 or subtotal <= 0:
        return
    percent = discount_amount * 100 / subtotal
    limit = discount_limit_percent(user, cfg)
    if percent > limit:
        raise PermissionDenied(f"Your discount limit is {limit}%. Ask a manager to approve a larger discount.")
