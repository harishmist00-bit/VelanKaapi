import type { MenuItem } from "../types/models";

export interface CartLine {
  menu_item_id: number; name: string; price: string; is_veg: boolean; quantity: number; notes: string;
}
export type CartAction =
  | { type: "add"; item: MenuItem }
  | { type: "inc"; id: number }
  | { type: "dec"; id: number }
  | { type: "remove"; id: number }
  | { type: "note"; id: number; notes: string }
  | { type: "set"; lines: CartLine[] }
  | { type: "clear" };

export const MAX_QTY = 99;

export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const existing = state.find((l) => l.menu_item_id === action.item.id && !l.notes);
      if (existing) return state.map((l) => (l === existing ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QTY) } : l));
      const { id, name, price, is_veg } = action.item;
      return [...state, { menu_item_id: id, name, price, is_veg, quantity: 1, notes: "" }];
    }
    case "inc":
      return state.map((l) => (l.menu_item_id === action.id ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QTY) } : l));
    case "dec":
      return state.flatMap((l) => (l.menu_item_id !== action.id ? [l] : l.quantity <= 1 ? [] : [{ ...l, quantity: l.quantity - 1 }]));
    case "remove":
      return state.filter((l) => l.menu_item_id !== action.id);
    case "note":
      return state.map((l) => (l.menu_item_id === action.id ? { ...l, notes: action.notes } : l));
    case "set":
      return action.lines;
    case "clear":
      return [];
  }
}
