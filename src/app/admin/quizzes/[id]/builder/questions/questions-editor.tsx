"use client";

import { closestCenter, DndContext, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useEffect, useId, useRef, useState } from "react";
import { useLatest, useSortSensors, useUnsavedChangesWarning } from "@/components/builder/hooks";
import { SaveAllBar } from "@/components/builder/save-all-bar";
import type { QuestionView } from "@/lib/content/questions";
import { MAX_QUESTIONS } from "@/lib/content/validation";
import { deleteQuestionAction, reorderQuestionsAction, saveQuestionAction } from "./actions";
import { cardFromServer, emptyCard, mergeCards, toInput, type Card, type CategoryHeader } from "./model";
import { QuestionCard } from "./question-card";

/** Which cards are open survives reloads within the tab (sessionStorage). */
function openStorageKey(quizId: number) {
  return `pltq:questions-open:${quizId}`;
}
function readOpen(quizId: number): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(openStorageKey(quizId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function QuestionsEditor({
  quizId,
  categories,
  initial,
}: {
  quizId: number;
  categories: CategoryHeader[];
  initial: QuestionView[];
}) {
  const [cards, setCards] = useState<Card[]>(() => initial.map((q) => cardFromServer(q)));
  // Rendered client-only (see loader.tsx), so sessionStorage is available here.
  const [open, setOpen] = useState<Set<string>>(() => readOpen(quizId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cardsRef = useLatest(cards);
  const dndId = useId();
  const focusKey = useRef<string | null>(null);

  const dirtyCount = cards.filter((c) => c.dirty).length;
  useUnsavedChangesWarning(dirtyCount > 0);

  useEffect(() => {
    try {
      sessionStorage.setItem(openStorageKey(quizId), JSON.stringify([...open]));
    } catch {
      // Storage can be unavailable (private mode); open state just won't persist.
    }
  }, [open, quizId]);

  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`q-title-${focusKey.current}`)?.focus();
    focusKey.current = null;
  }, [cards]);

  /** Saved cards are remembered by id (keys of new cards change after a reload). */
  const openId = (card: Card) => (card.id !== null ? `id:${card.id}` : card.key);
  const isOpen = (card: Card) => open.has(openId(card));
  function toggle(card: Card) {
    setOpen((prev) => {
      const next = new Set(prev);
      const k = openId(card);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  /** UI-only change (open drawers etc.): doesn't mark the card dirty. */
  function patch(key: string, fn: (c: Card) => Card) {
    setCards((cs) => cs.map((c) => (c.key === key ? fn(c) : c)));
  }
  /** Content change: marks dirty and clears the errors it might fix. */
  function edit(key: string, fn: (c: Card) => Card) {
    setCards((cs) =>
      cs.map((c) => (c.key === key ? { ...fn(c), dirty: true, rev: c.rev + 1, errors: {} } : c)),
    );
  }

  async function saveCard(key: string): Promise<boolean> {
    const card = cardsRef.current.find((c) => c.key === key);
    if (!card) return false;
    patch(key, (c) => ({ ...c, saving: true }));
    const result = await saveQuestionAction(quizId, toInput(card, categories));
    if (!result.ok) {
      patch(key, (c) => ({
        ...c,
        saving: false,
        errors: result.fieldErrors ?? { form: result.error ?? "Couldn't save this question." },
      }));
      setOpen((prev) => new Set(prev).add(openId(card))); // show the errors
      return false;
    }
    const saved = result.data.saved!;
    const wasOpen = isOpen(card);
    setCards((cs) => mergeCards(cs, result.data.questions, { key, ...saved, rev: card.rev }));
    if (wasOpen && card.id === null) {
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(card.key);
        next.add(`id:${saved.questionId}`);
        return next;
      });
    }
    return true;
  }

  async function saveAll() {
    setBusy(true);
    setError(null);
    for (const card of cardsRef.current.filter((c) => c.dirty)) await saveCard(card.key);
    setBusy(false);
  }

  function addCard() {
    if (cards.length >= MAX_QUESTIONS) return;
    const card = emptyCard();
    setCards((cs) => [...cs, card]);
    setOpen((prev) => new Set(prev).add(card.key));
    focusKey.current = card.key;
  }

  async function removeCard(card: Card, index: number) {
    if (card.id === null) {
      setCards((cs) => cs.filter((c) => c.key !== card.key));
      return;
    }
    const label = card.title.trim() ? `“${card.title.trim()}”` : `question ${index + 1}`;
    if (!window.confirm(`Delete ${label} with its answers and weights?`)) return;
    patch(card.key, (c) => ({ ...c, saving: true }));
    const result = await deleteQuestionAction(quizId, card.id);
    if (!result.ok) {
      patch(card.key, (c) => ({ ...c, saving: false, errors: { form: result.error ?? "Couldn't delete this question." } }));
      return;
    }
    setCards((cs) => mergeCards(cs.filter((c) => c.key !== card.key), result.data.questions));
  }

  /* ------------------------------ Reordering ------------------------------ */

  const sensors = useSortSensors();
  const titleOf = (key: string | number) => {
    const i = cardsRef.current.findIndex((c) => c.key === key);
    return `question ${i + 1}${cardsRef.current[i]?.title ? `, ${cardsRef.current[i].title}` : ""}`;
  };
  const positionOf = (key: string | number) => cardsRef.current.findIndex((c) => c.key === key) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ over }) => (over ? `Moving to position ${positionOf(over.id)}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Dropped at position ${positionOf(over.id)}.` : "Dropped."),
    onDragCancel: () => "Reordering cancelled.",
  };

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const before = cardsRef.current;
    const moved = arrayMove(
      before,
      before.findIndex((c) => c.key === active.id),
      before.findIndex((c) => c.key === over.id),
    );
    const saved = moved.filter((c) => c.id !== null);
    setCards([...saved, ...moved.filter((c) => c.id === null)]);
    setError(null);
    const result = await reorderQuestionsAction(
      quizId,
      saved.map((c) => c.id!),
    );
    if (!result.ok) {
      const order = new Map(before.map((c, i) => [c.key, i]));
      setCards((cs) => [...cs].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)));
      setError(result.error ?? "Couldn't save the new order. Reload the page and try again.");
      return;
    }
    setCards((cs) => mergeCards(cs, result.data.questions));
  }

  /* -------------------------------- Render -------------------------------- */

  const allOpen = cards.length > 0 && cards.every(isOpen);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-muted">
          No questions yet.
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(cards.map(openId)))}
              className="text-sm text-brand underline underline-offset-4"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ announcements }}
          >
            <SortableContext items={cards.map((c) => c.key)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-3" aria-label="Questions">
                {cards.map((card, index) => (
                  <QuestionCard
                    key={card.key}
                    card={card}
                    index={index}
                    categories={categories}
                    open={isOpen(card)}
                    onToggle={() => toggle(card)}
                    onPatch={(fn) => patch(card.key, fn)}
                    onEdit={(fn) => edit(card.key, fn)}
                    onSave={() => saveCard(card.key)}
                    onDelete={() => removeCard(card, index)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addCard}
          disabled={cards.length >= MAX_QUESTIONS}
          className="rounded-md border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add question
        </button>
        <p className="text-sm text-muted">
          {cards.length} {cards.length === 1 ? "question" : "questions"}
          {cards.length >= MAX_QUESTIONS ? ` (the maximum is ${MAX_QUESTIONS})` : ""}
        </p>
      </div>

      <SaveAllBar count={dirtyCount} singular="question" plural="questions" busy={busy} onSaveAll={saveAll} />
    </div>
  );
}
