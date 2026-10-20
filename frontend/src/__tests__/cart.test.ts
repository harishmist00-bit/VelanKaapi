import { describe, expect, it } from "vitest";

import type { MenuItem } from "../types/models";
import { cartReducer, CartLine } from "../utils/cart";
import { formatMoney, fromPaise, toPaise } from "../utils/money";

const item = (id: number, name = "Biryani", price = "200.00"): MenuItem => ({
  id, category: 1, category_name: "Mains", name, sku: `S${id}`, description: "", price, tax_rate: "5.00", is_veg: false, image: null, is_available: true, is_active: true,
});

describe("cartReducer", () => {
  it("adds a new item and increments an existing one", () => {
    let s: CartLine[] = cartReducer([], { type: "add", item: item(1) });
    s = cartReducer(s, { type: "add", item: item(1) });
    expect(s).toHaveLength(1);
    expect(s[0].quantity).toBe(2);
  });
  it("decrement removes the line at zero", () => {
    let s = cartReducer([], { type: "add", item: item(1) });
    s = cartReducer(s, { type: "dec", id: 1 });
    expect(s).toEqual([]);
  });
  it("caps quantity at 99", () => {
    let s = cartReducer([], { type: "add", item: item(1) });
    for (let i = 0; i < 120; i++) s = cartReducer(s, { type: "inc", id: 1 });
    expect(s[0].quantity).toBe(99);
  });
  it("stores notes, removes and clears", () => {
    let s = cartReducer([], { type: "add", item: item(1) });
    s = cartReducer(s, { type: "add", item: item(2, "Cola", "50.00") });
    s = cartReducer(s, { type: "note", id: 1, notes: "less spicy" });
    expect(s[0].notes).toBe("less spicy");
    s = cartReducer(s, { type: "remove", id: 1 });
    expect(s.map((l) => l.menu_item_id)).toEqual([2]);
    expect(cartReducer(s, { type: "clear" })).toEqual([]);
  });
});

describe("money helpers", () => {
  it("formats rupees", () => expect(formatMoney("1234.5")).toContain("1,234.50"));
  it("avoids float drift when summing split payments", () => {
    expect(toPaise("0.1") + toPaise("0.2")).toBe(30);
    expect(fromPaise(toPaise("479.00"))).toBe("479.00");
  });
});
