"use client";

import { closestCenter, DndContext, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useId, useRef, useState } from "react";
import { useLatest, useSortSensors, useUnsavedChangesWarning } from "@/components/builder/hooks";
import { SaveAllBar } from "@/components/builder/save-all-bar";
import type { CategoryView } from "@/lib/content/categories";
import {
  ABBR_MAX,
  CATEGORY_PALETTE,
  deriveAbbr,
  MAX_CATEGORIES,
  uniqueAbbr,
  WARN_CATEGORIES,
} from "@/lib/content/validation";
import {
  deleteCategoryAction,
  reorderCategoriesAction,
  saveCategoryAction,
  seedCategoriesAction,
} from "./actions";

/* --------------------------------- State --------------------------------- */

type Row = {
  /** Stable React/dnd key; survives a new row getting its database id. */
  key: string;
  id: number | null;
  name: string;
  abbr: string;
  /** Once the abbreviation is edited by hand, it stops following the name. */
  abbrTouched: boolean;
  color: string;
  importance: string;
  answerCount: number;
  resultCount: number;
  dirty: boolean;
  /** Bumped on every edit, so a save only clears `dirty` if nothing changed meanwhile. */
  rev: number;
  saving: boolean;
  errors: Record<string, string>;
};

function fromServer(c: CategoryView, key = `c${c.id}`): Row {
  return {
    key,
    id: c.id,
    name: c.name,
    abbr: c.abbr,
    abbrTouched: c.abbr !== deriveAbbr(c.name),
    color: c.color,
    importance: String(c.importance),
    answerCount: c.answerCount,
    resultCount: c.resultCount,
    dirty: false,
    rev: 0,
    saving: false,
    errors: {},
  };
}

/**
 * Merges a fresh server list into local rows. Server order wins; rows with
 * unsaved edits keep their local values; unsaved new rows stay at the end.
 */
function merge(
  rows: Row[],
  server: CategoryView[],
  saved?: { key: string; id: number; rev: number },
): Row[] {
  const local = new Map<number, Row>();
  for (const row of rows) if (row.id !== null) local.set(row.id, row);
  if (saved) {
    const row = rows.find((r) => r.key === saved.key);
    if (row) {
      const unchanged = row.rev === saved.rev;
      local.set(saved.id, { ...row, id: saved.id, dirty: !unchanged, saving: false, errors: {} });
    }
  }
  const merged = server.map((c) => {
    const row = local.get(c.id);
    return row?.dirty
      ? { ...row, answerCount: c.answerCount, resultCount: c.resultCount }
      : fromServer(c, row?.key);
  });
  const unsaved = rows.filter((r) => r.id === null && r.key !== saved?.key);
  return [...merged, ...unsaved];
}

function usageText(row: Row): string {
  if (row.id === null) return "Not saved yet";
  const a = `${row.answerCount} answer${row.answerCount === 1 ? "" : "s"}`;
  const r = `${row.resultCount} response${row.resultCount === 1 ? "" : "s"}`;
  return `${a} · ${r}`;
}

/* -------------------------------- Editor --------------------------------- */

export function CategoriesEditor({ quizId, initial }: { quizId: number; initial: CategoryView[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((c) => fromServer(c)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(0);
  // dnd-kit's generated ids differ between server and client unless given a stable one.
  const dndId = useId();

  const rowsRef = useLatest(rows);

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const atLimit = rows.length >= MAX_CATEGORIES;

  useUnsavedChangesWarning(dirtyCount > 0);

  // Move focus to a newly added row's name field once it has rendered.
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`cat-name-${focusKey.current}`)?.focus();
    focusKey.current = null;
  }, [rows]);

  function patch(key: string, changes: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }

  function edit(key: string, changes: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...changes, dirty: true, rev: r.rev + 1 };
        if ("name" in changes && !next.abbrTouched) {
          const taken = rs.filter((o) => o.key !== key).map((o) => o.abbr);
          next.abbr = uniqueAbbr(next.name, taken);
        }
        const errors = { ...r.errors };
        for (const field of Object.keys(changes)) delete errors[field];
        delete errors.form;
        return { ...next, errors };
      }),
    );
  }

  async function saveRow(key: string): Promise<boolean> {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return false;
    patch(key, { saving: true });
    const result = await saveCategoryAction(quizId, {
      id: row.id,
      name: row.name,
      abbr: row.abbr,
      color: row.color,
      importance: row.importance,
    });
    if (!result.ok) {
      patch(key, {
        saving: false,
        errors: result.fieldErrors ?? { form: result.error ?? "Couldn't save this category." },
      });
      return false;
    }
    const savedId = result.data.savedId!;
    setRows((rs) => merge(rs, result.data.categories, { key, id: savedId, rev: row.rev }));
    return true;
  }

  async function saveAll() {
    setBusy(true);
    setError(null);
    // One at a time, in display order, so positions and errors stay predictable.
    for (const row of rowsRef.current.filter((r) => r.dirty)) {
      await saveRow(row.key);
    }
    setBusy(false);
  }

  function addRow() {
    if (atLimit) return;
    const key = `new-${nextKey.current++}`;
    setRows((rs) => [
      ...rs,
      {
        key,
        id: null,
        name: "",
        abbr: "",
        abbrTouched: false,
        color: CATEGORY_PALETTE[rs.length % CATEGORY_PALETTE.length],
        importance: "1",
        answerCount: 0,
        resultCount: 0,
        dirty: true,
        rev: 1,
        saving: false,
        errors: {},
      },
    ]);
    focusKey.current = key;
  }

  async function removeRow(row: Row) {
    if (row.id === null) {
      setRows((rs) => rs.filter((r) => r.key !== row.key));
      return;
    }
    const label = row.name || "this category";
    const used = row.answerCount + row.resultCount > 0;
    const message = used
      ? `“${label}” is used by ${usageText(row).replace(" · ", " and ")}. Deleting it removes those weights permanently.`
      : `Delete “${label}”?`;
    if (!window.confirm(message)) return;

    patch(row.key, { saving: true });
    const result = await deleteCategoryAction(quizId, row.id);
    if (!result.ok) {
      patch(row.key, { saving: false, errors: { form: result.error ?? "Couldn't delete this category." } });
      return;
    }
    setRows((rs) => merge(rs.filter((r) => r.key !== row.key), result.data.categories));
  }

  async function seed() {
    setBusy(true);
    setError(null);
    const result = await seedCategoriesAction(quizId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't add the suggested categories.");
      return;
    }
    setRows((rs) => merge(rs, result.data.categories));
  }

  /* ------------------------------ Reordering ------------------------------ */

  const sensors = useSortSensors();

  const nameOf = (key: string | number) => rowsRef.current.find((r) => r.key === key)?.name || "category";
  const positionOf = (key: string | number) => rowsRef.current.findIndex((r) => r.key === key) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} moved to position ${positionOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)}.` : `${nameOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Reordering cancelled. ${nameOf(active.id)} returned to its place.`,
  };

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const before = rowsRef.current;
    const moved = arrayMove(
      before,
      before.findIndex((r) => r.key === active.id),
      before.findIndex((r) => r.key === over.id),
    );
    // Unsaved rows can't be ordered on the server yet, so they stay at the end.
    const saved = moved.filter((r) => r.id !== null);
    const next = [...saved, ...moved.filter((r) => r.id === null)];
    setRows(next);
    setError(null);

    const result = await reorderCategoriesAction(
      quizId,
      saved.map((r) => r.id!),
    );
    if (!result.ok) {
      const order = new Map(before.map((r, i) => [r.key, i]));
      setRows((rs) => [...rs].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)));
      setError(result.error ?? "Couldn't save the new order. Reload the page and try again.");
      return;
    }
    setRows((rs) => merge(rs, result.data.categories));
  }

  /* -------------------------------- Render -------------------------------- */

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-surface p-6">
        <div>
          <p className="font-medium">This quiz has no categories yet.</p>
          <p className="mt-1 text-sm text-muted">
            Start with six common ones (Outdoors, Analytical, People-facing, Hands-on, Creative,
            Policy &amp; Advocacy) and adjust them, or add your own.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={seed}
            disabled={busy}
            className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {busy ? "Adding…" : "Start with a suggested set"}
          </button>
          <button
            type="button"
            onClick={addRow}
            className="rounded-md border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5"
          >
            + Add category
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements }}
        >
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">Reorder</span>
                </th>
                <th scope="col" className="px-2 py-2 font-medium">Name</th>
                <th scope="col" className="px-2 py-2 font-medium">Abbr</th>
                <th scope="col" className="px-2 py-2 font-medium">Color</th>
                <th scope="col" className="px-2 py-2 font-medium">Importance</th>
                <th scope="col" className="px-2 py-2 font-medium">Used by</th>
                <th scope="col" className="px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <CategoryRow
                    key={row.key}
                    row={row}
                    onEdit={(changes) => edit(row.key, changes)}
                    onSave={() => saveRow(row.key)}
                    onDelete={() => removeRow(row)}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={atLimit}
          className="rounded-md border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add category
        </button>
        <p className="text-sm text-muted" aria-live="polite">
          {atLimit
            ? `That's the maximum of ${MAX_CATEGORIES} categories.`
            : rows.length > WARN_CATEGORIES
              ? `${rows.length} categories. The weight grid gets hard to read past ${WARN_CATEGORIES}; consider merging some.`
              : `${rows.length} of ${MAX_CATEGORIES} categories.`}
        </p>
      </div>

      <SaveAllBar count={dirtyCount} singular="category" plural="categories" busy={busy} onSaveAll={saveAll} />
    </div>
  );
}

/* ---------------------------------- Row ---------------------------------- */

function CategoryRow({
  row,
  onEdit,
  onSave,
  onDelete,
}: {
  row: Row;
  onEdit: (changes: Partial<Row>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const unsaved = row.id === null;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key, disabled: unsaved });

  const label = row.name || "new category";
  const id = (field: string) => `cat-${field}-${row.key}`;
  const err = (field: string) =>
    row.errors[field] ? (
      <p id={id(`${field}-error`)} className="mt-1 text-xs text-danger">
        {row.errors[field]}
      </p>
    ) : null;
  const invalid = (field: string) =>
    row.errors[field]
      ? { "aria-invalid": true as const, "aria-describedby": id(`${field}-error`) }
      : {};

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`align-top ${isDragging ? "relative z-10 bg-surface shadow-lg" : ""}`}
    >
      <td className="px-2 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={unsaved}
          aria-label={unsaved ? `Save ${label} before reordering` : `Reorder ${label}`}
          title={unsaved ? "Save before reordering" : "Drag to reorder (or press Space, then arrow keys)"}
          className="mt-1 cursor-grab rounded px-2 py-1 text-muted hover:bg-border/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⠿
        </button>
      </td>
      <td className="px-2 py-2">
        <input
          id={id("name")}
          aria-label={`Name of ${label}`}
          value={row.name}
          maxLength={60}
          onChange={(e) => onEdit({ name: e.target.value })}
          className="w-full min-w-40 rounded-md border border-border bg-surface px-2 py-1.5"
          {...invalid("name")}
        />
        {err("name")}
        {row.errors.form && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {row.errors.form}
          </p>
        )}
      </td>
      <td className="px-2 py-2">
        <input
          id={id("abbr")}
          aria-label={`Abbreviation for ${label}`}
          value={row.abbr}
          maxLength={ABBR_MAX}
          onChange={(e) => onEdit({ abbr: e.target.value, abbrTouched: true })}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 uppercase"
          {...invalid("abbr")}
        />
        {err("abbr")}
      </td>
      <td className="px-2 py-2">
        <input
          type="color"
          id={id("color")}
          aria-label={`Color for ${label}`}
          value={row.color}
          onChange={(e) => onEdit({ color: e.target.value })}
          className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
          {...invalid("color")}
        />
        {err("color")}
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          id={id("importance")}
          aria-label={`Importance of ${label}, 0 to 5`}
          value={row.importance}
          min={0}
          max={5}
          step={0.25}
          onChange={(e) => onEdit({ importance: e.target.value })}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5"
          {...invalid("importance")}
        />
        {err("importance")}
      </td>
      <td className="px-2 py-2 pt-3.5 whitespace-nowrap text-muted">{usageText(row)}</td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
          {row.dirty && (
            <span className="text-brand" title="Unsaved changes">
              ●<span className="sr-only">Unsaved changes</span>
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!row.dirty || row.saving}
            aria-label={`Save ${label}`}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-40"
          >
            {row.saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={row.saving}
            aria-label={`Delete ${label}`}
            className="text-sm text-danger underline underline-offset-4 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
