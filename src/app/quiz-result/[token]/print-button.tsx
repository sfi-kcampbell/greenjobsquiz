"use client";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="pltq-button pltq-button--primary rounded-md border border-transparent bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong"
    >
      {label}
    </button>
  );
}
