from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from apps.audit.services import log
from apps.common.exceptions import BusinessRuleError, ConflictError
from apps.settings_app.models import RestaurantSettings

from .models import Ingredient, StockMovement


def _consumption(order):
    """Total ingredient quantity needed for an order, from the recipes of its items."""
    need = defaultdict(lambda: Decimal("0"))
    for item in order.items.select_related("menu_item__recipe").prefetch_related("menu_item__recipe__ingredients"):
        recipe = getattr(item.menu_item, "recipe", None)
        if not recipe:
            continue
        for ri in recipe.ingredients.all():
            need[ri.ingredient_id] += ri.quantity * item.quantity
    return need


@transaction.atomic
def deduct_for_order(order, user):
    """Deduct recipe ingredients once per order. Safe to call repeatedly."""
    if order.stock_deducted:
        return
    need = _consumption(order)
    if need:
        cfg = RestaurantSettings.get()
        ingredients = {i.id: i for i in Ingredient.objects.select_for_update().filter(pk__in=need.keys()).order_by("id")}
        for ing_id, qty in need.items():
            ing = ingredients[ing_id]
            if ing.current_quantity - qty < 0 and not cfg.allow_negative_stock:
                raise ConflictError(f"Not enough stock of {ing.name} (have {ing.current_quantity} {ing.unit}, need {qty}).")
        for ing_id, qty in need.items():
            ing = ingredients[ing_id]
            ing.current_quantity -= qty
            ing.save(update_fields=["current_quantity", "updated_at"])
            StockMovement.objects.create(ingredient=ing, movement_type="SALE", quantity_delta=-qty, balance_after=ing.current_quantity,
                                         order=order, reason=f"Order {order.order_number}", created_by=user)
    order.stock_deducted = True
    order.save(update_fields=["stock_deducted", "updated_at"])


@transaction.atomic
def reverse_for_order(order, user):
    """Put deducted stock back after a full refund. Recorded as REVERSAL rows; runs once per order."""
    if not order.stock_deducted or StockMovement.objects.filter(order=order, movement_type="REVERSAL").exists():
        return
    for m in StockMovement.objects.filter(order=order, movement_type="SALE").select_related("ingredient"):
        ing = Ingredient.objects.select_for_update().get(pk=m.ingredient_id)
        ing.current_quantity -= m.quantity_delta  # delta is negative, so this adds back
        ing.save(update_fields=["current_quantity", "updated_at"])
        StockMovement.objects.create(ingredient=ing, movement_type="REVERSAL", quantity_delta=-m.quantity_delta, balance_after=ing.current_quantity,
                                     order=order, reason=f"Refund of {order.order_number}", created_by=user)


@transaction.atomic
def adjust_stock(ingredient_id, movement_type, quantity, reason, user, unit_cost=None):
    """PURCHASE adds `quantity`; WASTE subtracts it; ADJUSTMENT applies a signed quantity."""
    ing = Ingredient.objects.select_for_update().get(pk=ingredient_id)
    quantity = Decimal(quantity)
    if movement_type == "PURCHASE":
        if quantity <= 0:
            raise BusinessRuleError("Purchase quantity must be positive.")
        delta = quantity
    elif movement_type == "WASTE":
        if quantity <= 0:
            raise BusinessRuleError("Waste quantity must be positive.")
        delta = -quantity
    elif movement_type == "ADJUSTMENT":
        if quantity == 0:
            raise BusinessRuleError("Adjustment cannot be zero.")
        delta = quantity
        if not reason.strip():
            raise BusinessRuleError("A reason is required for stock adjustments.")
    else:
        raise BusinessRuleError("Unsupported movement type.")
    ing.current_quantity += delta
    ing.save(update_fields=["current_quantity", "updated_at"])
    mv = StockMovement.objects.create(ingredient=ing, movement_type=movement_type, quantity_delta=delta, balance_after=ing.current_quantity,
                                      unit_cost=unit_cost, reason=reason, created_by=user)
    log(user, f"stock.{movement_type.lower()}", "Ingredient", ing.id, after={"delta": delta, "balance": ing.current_quantity, "reason": reason})
    return mv
