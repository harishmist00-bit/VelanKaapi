import { createContext, ReactNode, useContext, useReducer } from "react";

import { CartAction, CartLine, cartReducer } from "../utils/cart";

const Ctx = createContext<{ lines: CartLine[]; dispatch: React.Dispatch<CartAction> } | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  return <Ctx.Provider value={{ lines, dispatch }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
