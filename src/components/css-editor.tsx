"use client";

import { useRef, useState } from "react";
import { CSS_HOOKS, cssBlock } from "@/lib/content/css-hooks";
import { CSS_MAX } from "@/lib/content/validation";

/**
 * A plain CSS textarea with an "Add element" picker that inserts a ready-made
 * rule for one of the stable pltq-* hooks. Submits as `name` in its form.
 */
export function CssEditor({
  id,
  name,
  label,
  defaultValue,
  error,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
  describedBy?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [picked, setPicked] = useState("");

  function insert(text: string, cursorOffset: number) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    // Start a new block on its own line.
    const before = value.slice(0, start);
    const lead = text.includes("\n") && before && !before.endsWith("\n") ? "\n" : "";
    const next = before + lead + text + value.slice(end);
    setValue(next);
    const caret = start + lead.length + cursorOffset;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  const errorId = `${id}-error`;
  const countId = `${id}-count`;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-add`} className="font-medium">
          Add element
        </label>
        <select
          id={`${id}-add`}
          value={picked}
          onChange={(e) => {
            const hook = CSS_HOOKS.find((h) => h.selector === e.target.value);
            setPicked("");
            if (hook) {
              const block = cssBlock(hook);
              insert(block.text, block.cursor);
            }
          }}
          className="rounded-md border border-border bg-surface px-2 py-1.5"
        >
          <option value="">Choose an element…</option>
          {CSS_HOOKS.map((h) => (
            <option key={h.selector} value={h.selector}>
              {h.label}
            </option>
          ))}
        </select>
      </div>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Tab indents; Escape then Tab leaves the field (keyboard users aren't trapped).
          if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.currentTarget.dataset.escaped) {
            e.preventDefault();
            insert("  ", 2);
          }
          e.currentTarget.dataset.escaped = e.key === "Escape" ? "1" : "";
        }}
        rows={14}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        maxLength={CSS_MAX}
        aria-invalid={error ? true : undefined}
        aria-describedby={[describedBy, countId, error ? errorId : null].filter(Boolean).join(" ")}
        className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed"
      />
      <p id={countId} className="text-muted">
        {value.length.toLocaleString("en")} / {CSS_MAX.toLocaleString("en")} characters. Tab indents; press Escape
        then Tab to move on.
      </p>
      {error && (
        <p id={errorId} className="text-danger">
          {error}
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-medium">What can I style?</summary>
        <table className="mt-2 text-left">
          <thead>
            <tr>
              <th className="pr-4 font-medium">Element</th>
              <th className="font-medium">Selector</th>
            </tr>
          </thead>
          <tbody>
            {CSS_HOOKS.map((h) => (
              <tr key={h.selector}>
                <td className="pr-4">{h.label}</td>
                <td>
                  <code>{h.selector}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-muted">
          Images you&apos;ve uploaded can be used with <code>url(/media/…)</code>. Addresses on other sites,{" "}
          <code>@import</code> and <code>&lt;</code> aren&apos;t allowed.
        </p>
      </details>
    </div>
  );
}
