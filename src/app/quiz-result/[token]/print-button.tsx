"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-transparent bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong"
    >
      Print or save as PDF
    </button>
  );
}
