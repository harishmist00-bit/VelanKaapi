const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Display-only formatting of a decimal string from the API. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return inr.format(0);
  return inr.format(Number(value));
}

/** Convert a 2-decimal string to integer paise so UI sums (e.g. split payments) avoid float drift. */
export function toPaise(value: string | number): number {
  return Math.round(Number(value || 0) * 100);
}

export function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
