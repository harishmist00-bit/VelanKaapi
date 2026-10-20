import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CartPanel } from "../components/CartPanel";
import { PaymentModal } from "../components/PaymentModal";
import type { CalcResult } from "../types/models";
import type { CartLine } from "../utils/cart";

const lines: CartLine[] = [{ menu_item_id: 1, name: "Biryani", price: "200.00", is_veg: false, quantity: 2, notes: "" }];
const calc: CalcResult = {
  lines: [{ menu_item_id: 1, name: "Biryani", unit_price: "200.00", quantity: 2, line_subtotal: "400.00", line_discount: "0.00", line_tax: "20.00", line_total: "420.00" }],
  subtotal: "400.00", discount_amount: "0.00", tax_total: "20.00", round_off: "0.00", grand_total: "420.00",
};

describe("CartPanel", () => {
  it("shows the payable amount from the backend and dispatches quantity changes", () => {
    const dispatch = vi.fn();
    render(<CartPanel lines={lines} dispatch={dispatch} calc={calc} calcError={null} calcLoading={false} discountType="NONE" discountValue="" onDiscount={() => {}} orderNotes="" onOrderNotes={() => {}} />);
    expect(screen.getByTestId("payable")).toHaveTextContent("420.00");
    fireEvent.click(screen.getByLabelText("Increase Biryani"));
    expect(dispatch).toHaveBeenCalledWith({ type: "inc", id: 1 });
    fireEvent.click(screen.getByLabelText("Decrease Biryani"));
    expect(dispatch).toHaveBeenCalledWith({ type: "dec", id: 1 });
  });
  it("shows a backend error such as a discount limit", () => {
    render(<CartPanel lines={lines} dispatch={() => {}} calc={null} calcError="Your discount limit is 10%." calcLoading={false} discountType="PERCENT" discountValue="25" onDiscount={() => {}} orderNotes="" onOrderNotes={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("discount limit");
  });
});

describe("PaymentModal", () => {
  it("lets a full cash payment through and computes change", () => {
    const onSubmit = vi.fn();
    render(<PaymentModal open amountDue="420.00" methods={["CASH", "UPI"]} onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Cash given"), { target: { value: "500" } });
    expect(screen.getByText("Change to return").parentElement).toHaveTextContent("80.00");
    fireEvent.click(screen.getByText("Confirm payment"));
    expect(onSubmit).toHaveBeenCalledWith([{ method: "CASH", amount: "420.00", tendered: "500.00" }]);
  });
  it("blocks confirmation when a split does not add up", () => {
    render(<PaymentModal open amountDue="420.00" methods={["CASH", "UPI"]} onSubmit={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    expect(screen.getByText("Confirm payment")).toBeDisabled();
    fireEvent.click(screen.getByText(/Split: add another payment/));
    expect(screen.getAllByLabelText("Amount")).toHaveLength(2);
    expect(screen.getByText("Confirm payment")).not.toBeDisabled();
  });
});
