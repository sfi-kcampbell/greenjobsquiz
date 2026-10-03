"use client";

/** Sticky "Unsaved changes in N …" bar with a Save all button. Renders nothing when clean. */
export function SaveAllBar({
  count,
  singular,
  plural,
  busy,
  onSaveAll,
}: {
  count: number;
  singular: string;
  plural: string;
  busy: boolean;
  onSaveAll: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/40 bg-surface p-3 shadow-md"
    >
      <p className="text-sm font-medium">
        Unsaved changes in {count} {count === 1 ? singular : plural}
      </p>
      <button
        type="button"
        onClick={onSaveAll}
        disabled={busy}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save all"}
      </button>
    </div>
  );
}
