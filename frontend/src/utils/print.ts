export type PrintFormat = "thermal" | "a4";

/** Print only the element with id="print-area". Injects an @page rule for the chosen paper size. */
export function printArea(format: PrintFormat = "a4") {
  const style = document.createElement("style");
  style.id = "print-page-style";
  style.textContent = format === "thermal" ? "@page { size: 80mm auto; margin: 0; }" : "@page { size: A4; margin: 10mm; }";
  document.head.appendChild(style);
  const cleanup = () => {
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
