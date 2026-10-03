import type { ComponentProps } from "react";

/** A labelled text input with an inline error, wired up for screen readers. */
export function TextField({
  id,
  label,
  error,
  hint,
  className = "",
  ...input
}: ComponentProps<"input"> & { id: string; label: string; error?: string; hint?: string }) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="rounded-md border border-border bg-surface px-3 py-2"
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
