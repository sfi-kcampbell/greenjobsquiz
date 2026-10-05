"use client";

import type { KeyboardEvent } from "react";
import { WEIGHT_MAX, WEIGHT_MIN } from "@/lib/content/validation";

/**
 * Shared pieces of the weight grids (answers × categories on the Questions
 * tab, responses × categories on the Responses tab).
 */

export type CategoryHeader = { id: number; name: string; abbr: string; color: string };

/** Parses a cell's text; blanks and partial input ("-") count as 0. */
export function cellValue(text: string | undefined): number {
  const n = Number.parseFloat(text ?? "");
  return Number.isFinite(n) ? n : 0;
}

export function clampWeight(n: number): number {
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, n));
}

export const formatWeight = (n: number) => String(Math.round(n * 100) / 100);

/** Header cells for each category: abbreviation, full name on hover, color stripe. */
export function CategoryHeaderCells({ categories }: { categories: CategoryHeader[] }) {
  return categories.map((c) => (
    <th
      key={c.id}
      scope="col"
      title={c.name}
      style={{ borderTopColor: c.color }}
      className="border-t-4 px-1 py-2 text-center font-medium"
    >
      <abbr title={c.name} className="no-underline">
        {c.abbr}
      </abbr>
    </th>
  ));
}

/**
 * One weight input. Arrow keys move between cells of the same matrix;
 * Shift+↑/↓ changes the value by 1 (held within −5…+5).
 */
export function WeightCell({
  matrix,
  row,
  col,
  text,
  label,
  onText,
}: {
  /** Identifies the grid, so arrow keys stay inside it. */
  matrix: string;
  row: number;
  col: number;
  text: string;
  label: string;
  onText: (text: string) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const { key, shiftKey } = event;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;
    event.preventDefault();
    if (shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
      onText(String(clampWeight(Math.round(cellValue(text)) + (key === "ArrowUp" ? 1 : -1))));
      return;
    }
    const [r, c] = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
    }[key]!;
    const cell = document.querySelector<HTMLInputElement>(
      `[data-matrix="${matrix}"][data-row="${r}"][data-col="${c}"]`,
    );
    cell?.focus();
    cell?.select();
  }

  return (
    <input
      type="number"
      step={1}
      min={WEIGHT_MIN}
      max={WEIGHT_MAX}
      value={text}
      placeholder="0"
      data-matrix={matrix}
      data-row={row}
      data-col={col}
      aria-label={label}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={(e) => e.target.select()}
      className={`weight-cell w-12 rounded-md border border-border bg-surface px-1 py-1 text-center tabular-nums ${
        cellValue(text) === 0 ? "text-muted/60" : "font-semibold"
      }`}
    />
  );
}
