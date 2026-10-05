"use client";

import { closestCenter, DndContext, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLatest, useSortSensors, useUnsavedChangesWarning } from "@/components/builder/hooks";
import { SaveAllBar } from "@/components/builder/save-all-bar";
import {
  CategoryHeaderCells,
  cellValue,
  formatWeight,
  WeightCell,
  type CategoryHeader,
} from "@/components/builder/weight-matrix";
import type { ResponseView } from "@/lib/content/responses";
import { MAX_RESPONSES } from "@/lib/content/validation";
import { nearDuplicates, normalizeToSum, type Vector } from "@/lib/scoring/vector";
import {
  deleteResponseAction,
  reorderResponsesAction,
  saveResponseRowAction,
} from "./actions";

/* --------------------------------- State --------------------------------- */

type Row = {
  key: string;
  id: number | null;
  title: string;
  /** categoryId → cell text. */
  cells: Record<number, string>;
  dirty: boolean;
  rev: number;
  saving: boolean;
  errors: Record<string, string>;
  /** Set when "Normalize to 10" had to hold a weight at ±5. */
  note?: string;
};

function fromServer(r: ResponseView, key = `r${r.id}`): Row {
  const cells: Record<number, string> = {};
  for (const [categoryId, weight] of Object.entries(r.weights)) cells[Number(categoryId)] = String(weight);
  return { key, id: r.id, title: r.title, cells, dirty: false, rev: 0, saving: false, errors: {} };
}

function merge(rows: Row[], server: ResponseView[], saved?: { key: string; id: number; rev: number }): Row[] {
  const local = new Map<number, Row>();
  for (const r of rows) if (r.id !== null) local.set(r.id, r);
  if (saved) {
    const row = rows.find((r) => r.key === saved.key);
    if (row) {
      const withId = { ...row, id: saved.id, saving: false, errors: {} };
      local.set(saved.id, row.rev === saved.rev ? { ...withId, dirty: false } : withId);
    }
  }
  const merged = server.map((r) => {
    const row = local.get(r.id);
    return row?.dirty ? row : fromServer(r, row?.key);
  });
  return [...merged, ...rows.filter((r) => r.id === null && r.key !== saved?.key)];
}

const vectorOf = (row: Row, categories: CategoryHeader[]): Vector =>
  Object.fromEntries(categories.map((c) => [c.id, cellValue(row.cells[c.id])]).filter(([, w]) => w !== 0));

/* -------------------------------- Editor --------------------------------- */

export function ResponsesEditor({
  quizId,
  runnersUpCount,
  categories,
  initial,
}: {
  quizId: number;
  runnersUpCount: number;
  categories: CategoryHeader[];
  initial: ResponseView[];
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => fromServer(r)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rowsRef = useLatest(rows);
  const dndId = useId();
  const nextKey = useRef(0);
  const focusKey = useRef<string | null>(null);

  const dirtyCount = rows.filter((r) => r.dirty).length;
  useUnsavedChangesWarning(dirtyCount > 0);

  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`resp-title-${focusKey.current}`)?.focus();
    focusKey.current = null;
  }, [rows]);

  // Live checks, recomputed from what's on screen (saved or not).
  const vectors = useMemo(
    () => rows.map((r) => ({ key: r.key, title: r.title.trim() || "Untitled", weights: vectorOf(r, categories) })),
    [rows, categories],
  );
  const duplicates = useMemo(() => nearDuplicates(vectors), [vectors]);
  const duplicateKeys = new Set(duplicates.flatMap((d) => [d.a.key, d.b.key]));
  const emptyKeys = new Set(vectors.filter((v) => Object.keys(v.weights).length === 0).map((v) => v.key));

  function patch(key: string, changes: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }
  function edit(key: string, fn: (r: Row) => Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, ...fn(r), dirty: true, rev: r.rev + 1, errors: {}, note: undefined } : r)),
    );
  }

  async function saveRow(key: string): Promise<boolean> {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return false;
    patch(key, { saving: true });
    const result = await saveResponseRowAction(quizId, {
      id: row.id,
      title: row.title,
      weights: Object.fromEntries(categories.map((c) => [String(c.id), cellValue(row.cells[c.id])])),
    });
    if (!result.ok) {
      patch(key, { saving: false, errors: result.fieldErrors ?? { form: result.error ?? "Couldn't save this response." } });
      return false;
    }
    setRows((rs) => merge(rs, result.data.responses, { key, id: result.data.savedId!, rev: row.rev }));
    return true;
  }

  async function saveAll() {
    setBusy(true);
    setError(null);
    for (const row of rowsRef.current.filter((r) => r.dirty)) await saveRow(row.key);
    setBusy(false);
  }

  function addRow() {
    if (rows.length >= MAX_RESPONSES) return;
    const key = `new-${nextKey.current++}`;
    setRows((rs) => [...rs, { key, id: null, title: "", cells: {}, dirty: true, rev: 1, saving: false, errors: {} }]);
    focusKey.current = key;
  }

  async function removeRow(row: Row) {
    if (row.id === null) {
      setRows((rs) => rs.filter((r) => r.key !== row.key));
      return;
    }
    if (!window.confirm(`Delete “${row.title || "this response"}”? Its content and weights are removed.`)) return;
    patch(row.key, { saving: true });
    const result = await deleteResponseAction(quizId, row.id);
    if (!result.ok) {
      patch(row.key, { saving: false, errors: { form: result.error ?? "Couldn't delete this response." } });
      return;
    }
    setRows((rs) => merge(rs.filter((r) => r.key !== row.key), result.data.responses));
  }

  function normalize(row: Row) {
    const { weights, clamped } = normalizeToSum(vectorOf(row, categories));
    const cells: Record<number, string> = {};
    for (const [id, w] of Object.entries(weights)) cells[Number(id)] = formatWeight(w);
    setRows((rs) =>
      rs.map((r) =>
        r.key === row.key
          ? {
              ...r,
              cells,
              dirty: true,
              rev: r.rev + 1,
              note: clamped ? "Some weights were held at ±5, so the total is below 10." : undefined,
            }
          : r,
      ),
    );
  }

  /* ------------------------------ Reordering ------------------------------ */

  const sensors = useSortSensors();
  const nameOf = (key: string | number) => rowsRef.current.find((r) => r.key === key)?.title || "response";
  const positionOf = (key: string | number) => rowsRef.current.findIndex((r) => r.key === key) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} moved to position ${positionOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)}.` : "Dropped."),
    onDragCancel: () => "Reordering cancelled.",
  };

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const before = rowsRef.current;
    const moved = arrayMove(
      before,
      before.findIndex((r) => r.key === active.id),
      before.findIndex((r) => r.key === over.id),
    );
    const saved = moved.filter((r) => r.id !== null);
    setRows([...saved, ...moved.filter((r) => r.id === null)]);
    setError(null);
    const result = await reorderResponsesAction(
      quizId,
      saved.map((r) => r.id!),
    );
    if (!result.ok) {
      const order = new Map(before.map((r, i) => [r.key, i]));
      setRows((rs) => [...rs].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)));
      setError(result.error ?? "Couldn't save the new order. Reload the page and try again.");
      return;
    }
    setRows((rs) => merge(rs, result.data.responses));
  }

  /* -------------------------------- Render -------------------------------- */

  const columnTotals = categories.map((c) => rows.reduce((sum, r) => sum + cellValue(r.cells[c.id]), 0));
  const needed = runnersUpCount + 1;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {(duplicates.length > 0 || emptyKeys.size > 0) && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-amber-600/40 bg-amber-50 p-3 text-sm">
          {duplicates.map((d) => (
            <p key={`${d.a.key}|${d.b.key}`}>
              <strong>{d.a.title}</strong> and <strong>{d.b.title}</strong> have nearly the same profile (
              {Math.round(d.similarity * 100)}% similar). Respondents may get either one almost by chance; make
              their weights more different.
            </p>
          ))}
          {emptyKeys.size > 0 && (
            <p>
              {emptyKeys.size === 1 ? "One response has" : `${emptyKeys.size} responses have`} no weights, so{" "}
              {emptyKeys.size === 1 ? "it" : "they"} can never be recommended.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-muted">No responses yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ announcements }}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Responses and their category weights</caption>
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="w-8 px-1 py-2">
                    <span className="sr-only">Reorder</span>
                  </th>
                  <th scope="col" className="sticky left-0 z-10 min-w-56 bg-surface px-2 py-2 text-left font-medium">
                    Response
                  </th>
                  <CategoryHeaderCells categories={categories} />
                  <th scope="col" className="px-2 py-2 text-center font-medium">
                    Total
                  </th>
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {rows.map((row, index) => (
                    <ResponseRow
                      key={row.key}
                      row={row}
                      index={index}
                      quizId={quizId}
                      categories={categories}
                      duplicate={duplicateKeys.has(row.key)}
                      empty={emptyKeys.has(row.key)}
                      onTitle={(title) => edit(row.key, () => ({ title }))}
                      onCell={(categoryId, text) => edit(row.key, (r) => ({ cells: { ...r.cells, [categoryId]: text } }))}
                      onNormalize={() => normalize(row)}
                      onSave={() => saveRow(row.key)}
                      onDelete={() => removeRow(row)}
                    />
                  ))}
                </tbody>
              </SortableContext>
              <tfoot className="border-t border-border bg-background/60 text-muted">
                <tr>
                  <td />
                  <th scope="row" className="sticky left-0 bg-background px-2 py-2 text-right text-xs font-medium">
                    Column totals
                  </th>
                  {columnTotals.map((total, i) => (
                    <td key={categories[i].id} className="px-1 py-2 text-center tabular-nums">
                      {formatWeight(total)}
                    </td>
                  ))}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </DndContext>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_RESPONSES}
          className="rounded-md border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add response
        </button>
        <p className="text-sm text-muted">
          {rows.length} {rows.length === 1 ? "response" : "responses"}
          {rows.length < needed
            ? `. Add at least ${needed} so results can show the top match and ${runnersUpCount} runner${runnersUpCount === 1 ? "" : "s"}-up.`
            : ""}
        </p>
      </div>

      <SaveAllBar count={dirtyCount} singular="response" plural="responses" busy={busy} onSaveAll={saveAll} />
    </div>
  );
}

/* ---------------------------------- Row ---------------------------------- */

function ResponseRow({
  row,
  index,
  quizId,
  categories,
  duplicate,
  empty,
  onTitle,
  onCell,
  onNormalize,
  onSave,
  onDelete,
}: {
  row: Row;
  index: number;
  quizId: number;
  categories: CategoryHeader[];
  duplicate: boolean;
  empty: boolean;
  onTitle: (title: string) => void;
  onCell: (categoryId: number, text: string) => void;
  onNormalize: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const unsaved = row.id === null;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: unsaved,
  });
  const label = row.title.trim() || `response ${index + 1}`;
  const total = categories.reduce((sum, c) => sum + cellValue(row.cells[c.id]), 0);
  const titleId = `resp-title-${row.key}`;

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`border-b border-border align-top ${isDragging ? "relative z-20 bg-surface shadow" : ""}`}
    >
      <td className="px-1 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={unsaved}
          aria-label={unsaved ? `Save ${label} before reordering` : `Reorder ${label}`}
          className="cursor-grab rounded px-1.5 py-1 text-muted hover:bg-border/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⠿
        </button>
      </td>
      <td className="sticky left-0 z-[5] bg-surface px-2 py-2">
        <div className="flex items-center gap-1.5">
          {duplicate && (
            <span className="text-amber-700" title="Nearly the same profile as another response">
              ⚠<span className="sr-only">Nearly the same profile as another response.</span>
            </span>
          )}
          <input
            id={titleId}
            value={row.title}
            maxLength={120}
            placeholder="Response title"
            aria-label={`Title of response ${index + 1}`}
            aria-invalid={row.errors.title ? true : undefined}
            aria-describedby={row.errors.title ? `${titleId}-error` : undefined}
            onChange={(e) => onTitle(e.target.value)}
            className="w-full min-w-44 rounded-md border border-border bg-surface px-2 py-1"
          />
        </div>
        {row.errors.title && (
          <p id={`${titleId}-error`} className="mt-1 text-xs text-danger">
            {row.errors.title}
          </p>
        )}
        {row.errors.form && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {row.errors.form}
          </p>
        )}
        {row.note && <p className="mt-1 text-xs text-muted">{row.note}</p>}
        <div className="mt-1 flex gap-3 text-xs">
          {unsaved ? (
            <span className="text-muted">Save to edit details</span>
          ) : (
            <Link
              href={`/admin/quizzes/${quizId}/builder/responses/${row.id}`}
              className="text-brand underline underline-offset-4"
            >
              Edit details →
            </Link>
          )}
          <button
            type="button"
            onClick={onNormalize}
            disabled={empty}
            className="text-brand underline underline-offset-4 disabled:text-muted disabled:no-underline"
            title="Scale this row so its weights add up to 10 (sizes only; the shape stays the same)"
          >
            Normalize to 10
          </button>
        </div>
      </td>
      {categories.map((c, col) => (
        <td key={c.id} className="px-1 py-2 text-center">
          <WeightCell
            matrix="responses"
            row={index}
            col={col}
            text={row.cells[c.id] ?? ""}
            label={`${c.name} weight for ${label}`}
            onText={(text) => onCell(c.id, text)}
          />
        </td>
      ))}
      <td className="px-2 py-2 pt-3 text-center tabular-nums text-muted">
        {empty ? (
          <span className="text-xs text-danger" title="All weights are zero, so this response can never be recommended.">
            never matched
          </span>
        ) : (
          formatWeight(total)
        )}
      </td>
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
