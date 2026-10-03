"use client";

import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, type KeyboardEvent } from "react";
import { useSortSensors } from "@/components/builder/hooks";
import { RichTextEditor } from "@/components/rich-text-editor";
import { MAX_ANSWERS } from "@/lib/content/validation";
import {
  cellValue,
  clampWeight,
  emptyAnswer,
  type AnswerRow,
  type Card,
  type CategoryHeader,
} from "./model";

type Props = {
  card: Card;
  index: number;
  categories: CategoryHeader[];
  open: boolean;
  onToggle: () => void;
  onPatch: (fn: (c: Card) => Card) => void;
  onEdit: (fn: (c: Card) => Card) => void;
  onSave: () => void;
  onDelete: () => void;
};

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function QuestionCard({ card, index, categories, open, onToggle, onPatch, onEdit, onSave, onDelete }: Props) {
  const unsaved = card.id === null;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.key, disabled: unsaved });

  const number = index + 1;
  const title = card.title.trim() || "Untitled question";
  const bodyId = `q-body-${card.key}`;
  const id = (field: string) => `q-${field}-${card.key}`;
  const err = (path: string) => card.errors[path];

  const set = <K extends keyof Card>(field: K, value: Card[K]) => onEdit((c) => ({ ...c, [field]: value }));
  const setAnswer = (key: string, fn: (a: AnswerRow) => AnswerRow) =>
    onEdit((c) => ({ ...c, answers: c.answers.map((a) => (a.key === key ? fn(a) : a)) }));
  const patchAnswer = (key: string, fn: (a: AnswerRow) => AnswerRow) =>
    onPatch((c) => ({ ...c, answers: c.answers.map((a) => (a.key === key ? fn(a) : a)) }));

  const formErrors = Object.entries(card.errors).filter(
    ([path]) => !["title", "minSelect", "maxSelect"].includes(path) && !/^answers\.\d+\.label$/.test(path),
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border bg-surface ${isDragging ? "relative z-30 shadow-lg" : ""} ${
        card.dirty ? "border-brand/50" : "border-border"
      }`}
    >
      {/* Header: always visible */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={unsaved}
          aria-label={unsaved ? `Save question ${number} before reordering` : `Reorder question ${number}`}
          title={unsaved ? "Save before reordering" : "Drag to reorder (or press Space, then arrow keys)"}
          className="cursor-grab rounded px-2 py-1 text-muted hover:bg-border/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-border/30"
        >
          <span aria-hidden className="w-4 text-muted">
            {open ? "▾" : "▸"}
          </span>
          <span className="shrink-0 font-semibold">{number}.</span>
          <span className={`truncate ${card.title.trim() ? "" : "text-muted italic"}`}>{title}</span>
          <span className="ml-auto shrink-0 text-xs text-muted">
            {card.type === "multi" ? "multi" : "single"} · {card.answers.length}{" "}
            {card.answers.length === 1 ? "answer" : "answers"}
          </span>
        </button>
        {card.dirty && (
          <span className="text-brand" title="Unsaved changes">
            ●<span className="sr-only">Unsaved changes</span>
          </span>
        )}
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col gap-4 border-t border-border px-4 py-4">
          {/* Question fields */}
          <div className="flex flex-col gap-1">
            <label htmlFor={id("title")} className="text-sm font-medium">
              Question
            </label>
            <input
              id={id("title")}
              value={card.title}
              maxLength={300}
              onChange={(e) => set("title", e.target.value)}
              aria-invalid={err("title") ? true : undefined}
              aria-describedby={err("title") ? id("title-error") : undefined}
              className="rounded-md border border-border bg-surface px-3 py-2"
            />
            {err("title") && (
              <p id={id("title-error")} className="text-sm text-danger">
                {err("title")}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
            <div className="flex flex-col gap-1">
              <label htmlFor={id("type")} className="font-medium">
                Type
              </label>
              <select
                id={id("type")}
                value={card.type}
                onChange={(e) => {
                  const type = e.target.value as Card["type"];
                  onEdit((c) => ({
                    ...c,
                    type,
                    ...(type === "single"
                      ? { minSelect: "1", maxSelect: "1", splitMulti: false }
                      : { maxSelect: String(Math.max(1, c.answers.length)) }),
                  }));
                }}
                className="rounded-md border border-border bg-surface px-2 py-1.5"
              >
                <option value="single">Single choice</option>
                <option value="multi">Multiple choice</option>
              </select>
            </div>
            {card.type === "multi" && (
              <>
                <NumberField
                  id={id("min")}
                  label="Min picks"
                  value={card.minSelect}
                  error={err("minSelect")}
                  onChange={(v) => set("minSelect", v)}
                />
                <NumberField
                  id={id("max")}
                  label="Max picks"
                  value={card.maxSelect}
                  error={err("maxSelect")}
                  onChange={(v) => set("maxSelect", v)}
                />
              </>
            )}
            <label className="flex items-center gap-2 py-1.5">
              <input type="checkbox" checked={card.required} onChange={(e) => set("required", e.target.checked)} />
              Required
            </label>
            {card.type === "multi" && (
              <label
                className="flex items-center gap-2 py-1.5"
                title="Divide each answer's weights by the number of answers picked, so picking more doesn't count more."
              >
                <input
                  type="checkbox"
                  checked={card.splitMulti}
                  onChange={(e) => set("splitMulti", e.target.checked)}
                />
                Split weight across picks
              </label>
            )}
          </div>

          {/* Help text drawer */}
          <div>
            <button
              type="button"
              onClick={() => onPatch((c) => ({ ...c, helpOpen: !c.helpOpen }))}
              aria-expanded={card.helpOpen}
              className="text-sm text-brand underline underline-offset-4"
            >
              {card.helpOpen ? "▾" : card.helpHtml ? "▸ Help text (has content)" : "▸"}{" "}
              {card.helpOpen ? "Help text" : card.helpHtml ? "" : "Add help text (optional)"}
            </button>
            {card.helpOpen && (
              <div className="mt-2">
                <RichTextEditor
                  id={id("help")}
                  label={`Help text for question ${number}`}
                  value={card.helpHtml}
                  onChange={(html) => set("helpHtml", html)}
                />
              </div>
            )}
          </div>

          <AnswerMatrix card={card} categories={categories} number={number} onEdit={onEdit} onPatch={onPatch} setAnswer={setAnswer} patchAnswer={patchAnswer} />

          {formErrors.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
              {formErrors.map(([path, message]) => (
                <li key={path}>{message}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={card.saving}
              className="text-sm text-danger underline underline-offset-4 disabled:opacity-40"
            >
              Delete question
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!card.dirty || card.saving}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-40"
            >
              {card.saving ? "Saving…" : "Save question"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function NumberField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        max={12}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-20 rounded-md border border-border bg-surface px-2 py-1.5"
      />
      {error && (
        <p id={`${id}-error`} className="max-w-48 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* --------------------------------- Matrix -------------------------------- */

function AnswerMatrix({
  card,
  categories,
  number,
  onEdit,
  onPatch,
  setAnswer,
  patchAnswer,
}: {
  card: Card;
  categories: CategoryHeader[];
  number: number;
  onEdit: (fn: (c: Card) => Card) => void;
  onPatch: (fn: (c: Card) => Card) => void;
  setAnswer: (key: string, fn: (a: AnswerRow) => AnswerRow) => void;
  patchAnswer: (key: string, fn: (a: AnswerRow) => AnswerRow) => void;
}) {
  const sensors = useSortSensors();
  const dndId = useId();
  const columnTotals = categories.map((c) => card.answers.reduce((sum, a) => sum + cellValue(a.cells[c.id]), 0));

  function onDragStart() {
    // Close body drawers first: the extra row can't travel with its answer.
    onPatch((c) => ({ ...c, answers: c.answers.map((a) => ({ ...a, bodyOpen: false })) }));
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onEdit((c) => ({
      ...c,
      answers: arrayMove(
        c.answers,
        c.answers.findIndex((a) => a.key === active.id),
        c.answers.findIndex((a) => a.key === over.id),
      ),
    }));
  }

  /** Arrow keys move between weight cells; Shift+↑/↓ changes the value. */
  function onCellKeyDown(event: KeyboardEvent<HTMLInputElement>, row: number, col: number, answer: AnswerRow, categoryId: number) {
    const { key, shiftKey } = event;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;
    event.preventDefault();
    if (shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
      const next = clampWeight(Math.round(cellValue(answer.cells[categoryId])) + (key === "ArrowUp" ? 1 : -1));
      setAnswer(answer.key, (a) => ({ ...a, cells: { ...a.cells, [categoryId]: String(next) } }));
      return;
    }
    const target = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
    }[key]!;
    const cell = document.querySelector<HTMLInputElement>(
      `[data-matrix="${card.key}"][data-row="${target[0]}"][data-col="${target[1]}"]`,
    );
    cell?.focus();
    cell?.select();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <table className="w-full text-sm">
            <caption className="sr-only">
              Answers and category weights for question {number}
            </caption>
            <thead className="sticky top-0 z-10 bg-surface text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="w-8 px-1 py-2">
                  <span className="sr-only">Reorder</span>
                </th>
                <th scope="col" className="sticky left-0 z-10 min-w-56 bg-surface px-2 py-2 text-left font-medium">
                  Answer
                </th>
                {categories.map((c) => (
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
                ))}
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Total
                </th>
                <th scope="col" className="w-8 px-1 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <SortableContext items={card.answers.map((a) => a.key)} strategy={verticalListSortingStrategy}>
              <tbody>
                {card.answers.map((answer, row) => (
                  <AnswerRowView
                    key={answer.key}
                    answer={answer}
                    row={row}
                    cardKey={card.key}
                    number={number}
                    categories={categories}
                    labelError={card.errors[`answers.${row}.label`]}
                    onLabel={(label) => setAnswer(answer.key, (a) => ({ ...a, label }))}
                    onCell={(categoryId, text) =>
                      setAnswer(answer.key, (a) => ({ ...a, cells: { ...a.cells, [categoryId]: text } }))
                    }
                    onCellKeyDown={(e, col, categoryId) => onCellKeyDown(e, row, col, answer, categoryId)}
                    onToggleBody={() => patchAnswer(answer.key, (a) => ({ ...a, bodyOpen: !a.bodyOpen }))}
                    onBody={(html) => setAnswer(answer.key, (a) => ({ ...a, bodyHtml: html }))}
                    onRemove={() => onEdit((c) => ({ ...c, answers: c.answers.filter((a) => a.key !== answer.key) }))}
                  />
                ))}
              </tbody>
            </SortableContext>
            {card.answers.length > 0 && (
              <tfoot className="border-t border-border bg-background/60 text-muted">
                <tr>
                  <td />
                  <th scope="row" className="sticky left-0 bg-background px-2 py-2 text-right text-xs font-medium">
                    Column totals
                  </th>
                  {columnTotals.map((total, i) => (
                    <td key={categories[i].id} className="px-1 py-2 text-center tabular-nums">
                      {fmt(total)}
                    </td>
                  ))}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </DndContext>
      </div>
      <div>
        <button
          type="button"
          onClick={() => onEdit((c) => ({ ...c, answers: [...c.answers, emptyAnswer()] }))}
          disabled={card.answers.length >= MAX_ANSWERS}
          className="rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-50"
        >
          + Add answer
        </button>
        {card.answers.length >= MAX_ANSWERS && (
          <span className="ml-3 text-sm text-muted">That&apos;s the maximum of {MAX_ANSWERS} answers.</span>
        )}
        {card.answers.length < 2 && (
          <span className="ml-3 text-sm text-muted">A question needs at least two answers to be useful.</span>
        )}
      </div>
    </div>
  );
}

function AnswerRowView({
  answer,
  row,
  cardKey,
  number,
  categories,
  labelError,
  onLabel,
  onCell,
  onCellKeyDown,
  onToggleBody,
  onBody,
  onRemove,
}: {
  answer: AnswerRow;
  row: number;
  cardKey: string;
  number: number;
  categories: CategoryHeader[];
  labelError?: string;
  onLabel: (label: string) => void;
  onCell: (categoryId: number, text: string) => void;
  onCellKeyDown: (e: KeyboardEvent<HTMLInputElement>, col: number, categoryId: number) => void;
  onToggleBody: () => void;
  onBody: (html: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: answer.key,
  });
  const label = answer.label.trim() || `answer ${row + 1}`;
  const total = categories.reduce((sum, c) => sum + cellValue(answer.cells[c.id]), 0);
  const noEffect = categories.every((c) => cellValue(answer.cells[c.id]) === 0);
  const labelId = `ans-label-${answer.key}`;

  return (
    <>
      <tr
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={`border-b border-border align-top ${isDragging ? "relative z-20 bg-surface shadow" : ""}`}
      >
        <td className="px-1 py-1.5">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${label} in question ${number}`}
            className="cursor-grab rounded px-1.5 py-1 text-muted hover:bg-border/40"
          >
            ⠿
          </button>
        </td>
        <td className="sticky left-0 z-[5] bg-surface px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleBody}
              aria-expanded={answer.bodyOpen}
              aria-label={`${answer.bodyOpen ? "Hide" : "Show"} details for ${label}${answer.bodyHtml ? " (has content)" : ""}`}
              title={answer.bodyHtml ? "Details (has content)" : "Add details (optional)"}
              className={`rounded px-1 ${answer.bodyHtml ? "text-brand" : "text-muted"} hover:bg-border/40`}
            >
              {answer.bodyOpen ? "▾" : answer.bodyHtml ? "▶" : "▷"}
            </button>
            <input
              id={labelId}
              value={answer.label}
              maxLength={200}
              placeholder="Answer label"
              aria-label={`Label for answer ${row + 1} of question ${number}`}
              aria-invalid={labelError ? true : undefined}
              aria-describedby={labelError ? `${labelId}-error` : undefined}
              onChange={(e) => onLabel(e.target.value)}
              className="w-full min-w-48 rounded-md border border-border bg-surface px-2 py-1"
            />
          </div>
          {labelError && (
            <p id={`${labelId}-error`} className="mt-1 text-xs text-danger">
              {labelError}
            </p>
          )}
        </td>
        {categories.map((c, col) => {
          const text = answer.cells[c.id] ?? "";
          const zero = cellValue(text) === 0;
          return (
            <td key={c.id} className="px-1 py-1.5 text-center">
              <input
                type="number"
                step={1}
                min={-5}
                max={5}
                value={text === "" ? "" : text}
                placeholder="0"
                data-matrix={cardKey}
                data-row={row}
                data-col={col}
                aria-label={`${c.name} weight for ${label}`}
                onChange={(e) => onCell(c.id, e.target.value)}
                onKeyDown={(e) => onCellKeyDown(e, col, c.id)}
                onFocus={(e) => e.target.select()}
                className={`weight-cell w-12 rounded-md border border-border bg-surface px-1 py-1 text-center tabular-nums ${
                  zero ? "text-muted/60" : "font-semibold"
                }`}
              />
            </td>
          );
        })}
        <td className="px-2 py-1.5 pt-2.5 text-center tabular-nums text-muted">
          {noEffect ? (
            <span className="text-xs text-danger" title="All weights are zero, so this answer doesn't affect the result.">
              no effect
            </span>
          ) : (
            fmt(total)
          )}
        </td>
        <td className="px-1 py-1.5">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            title="Remove answer"
            className="rounded px-1.5 py-1 text-danger hover:bg-danger/10"
          >
            ✕
          </button>
        </td>
      </tr>
      {answer.bodyOpen && (
        <tr className="border-b border-border bg-background/40">
          <td />
          <td colSpan={categories.length + 3} className="px-2 py-2">
            <RichTextEditor
              id={`ans-body-${answer.key}`}
              label={`Details for ${label}`}
              value={answer.bodyHtml}
              onChange={onBody}
            />
          </td>
        </tr>
      )}
    </>
  );
}
