/**
 * Client-side state for the Questions tab, plus pure helpers to convert
 * between server views and editable cards.
 */
import type { AnswerView, QuestionView } from "@/lib/content/questions";
import { cellValue, type CategoryHeader } from "@/components/builder/weight-matrix";

export type { CategoryHeader };

export type AnswerRow = {
  /** Stable key; never changes, so rich-text editors stay mounted across saves. */
  key: string;
  id: number | null;
  label: string;
  bodyHtml: string | null;
  bodyOpen: boolean;
  /** categoryId → cell text, so "-" and "" can be typed. */
  cells: Record<number, string>;
};

export type Card = {
  key: string;
  id: number | null;
  title: string;
  helpHtml: string | null;
  helpOpen: boolean;
  type: "single" | "multi";
  required: boolean;
  splitMulti: boolean;
  minSelect: string;
  maxSelect: string;
  answers: AnswerRow[];
  dirty: boolean;
  /** Bumped on every edit, so a save only clears `dirty` if nothing changed meanwhile. */
  rev: number;
  saving: boolean;
  /** Keyed by input path: "title", "answers.2.label", "form". */
  errors: Record<string, string>;
};

let counter = 0;
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

function answerFromServer(a: AnswerView, key: string, previous?: AnswerRow): AnswerRow {
  const cells: Record<number, string> = {};
  for (const [categoryId, weight] of Object.entries(a.weights)) cells[Number(categoryId)] = String(weight);
  return { key, id: a.id, label: a.label, bodyHtml: a.bodyHtml, bodyOpen: previous?.bodyOpen ?? false, cells };
}

export function cardFromServer(q: QuestionView, previous?: Card): Card {
  // Reuse previous keys by id so React keeps the same DOM (and editors).
  const keyById = new Map(previous?.answers.filter((a) => a.id !== null).map((a) => [a.id!, a]));
  return {
    key: previous?.key ?? `q${q.id}`,
    id: q.id,
    title: q.title,
    helpHtml: q.helpHtml,
    helpOpen: previous?.helpOpen ?? false,
    type: q.type,
    required: q.required,
    splitMulti: q.splitMulti,
    minSelect: String(q.minSelect),
    maxSelect: String(q.maxSelect),
    answers: q.answers.map((a) => {
      const prev = keyById.get(a.id);
      return answerFromServer(a, prev?.key ?? `a${a.id}`, prev);
    }),
    dirty: false,
    rev: 0,
    saving: false,
    errors: {},
  };
}

export function emptyAnswer(): AnswerRow {
  return { key: newKey("a"), id: null, label: "", bodyHtml: null, bodyOpen: false, cells: {} };
}

export function emptyCard(): Card {
  return {
    key: newKey("q"),
    id: null,
    title: "",
    helpHtml: null,
    helpOpen: false,
    type: "single",
    required: true,
    splitMulti: false,
    minSelect: "1",
    maxSelect: "1",
    answers: [emptyAnswer(), emptyAnswer()],
    dirty: true,
    rev: 1,
    saving: false,
    errors: {},
  };
}

/** What the save action receives. */
export function toInput(card: Card, categories: CategoryHeader[]) {
  return {
    id: card.id,
    title: card.title,
    helpHtml: card.helpHtml,
    type: card.type,
    required: card.required,
    splitMulti: card.splitMulti,
    minSelect: card.minSelect,
    maxSelect: card.maxSelect,
    answers: card.answers.map((a) => ({
      key: a.key,
      id: a.id,
      label: a.label,
      bodyHtml: a.bodyHtml,
      weights: Object.fromEntries(categories.map((c) => [String(c.id), cellValue(a.cells[c.id])])),
    })),
  };
}

/**
 * Merges a fresh server list into local cards: server order wins, cards with
 * unsaved edits keep their local values, unsaved new cards stay at the end.
 */
export function mergeCards(
  cards: Card[],
  server: QuestionView[],
  saved?: { key: string; questionId: number; answerIds: Record<string, number>; rev: number },
): Card[] {
  const local = new Map<number, Card>();
  for (const c of cards) if (c.id !== null) local.set(c.id, c);

  if (saved) {
    const card = cards.find((c) => c.key === saved.key);
    if (card) {
      const answers = card.answers.map((a) => ({ ...a, id: saved.answerIds[a.key] ?? a.id }));
      const withIds: Card = { ...card, id: saved.questionId, answers, saving: false, errors: {} };
      // If the card was edited while saving, keep those edits (still dirty).
      local.set(saved.questionId, card.rev === saved.rev ? { ...withIds, dirty: false } : withIds);
    }
  }

  const merged = server.map((q) => {
    const card = local.get(q.id);
    return card?.dirty ? card : cardFromServer(q, card);
  });
  const unsaved = cards.filter((c) => c.id === null && c.key !== saved?.key);
  return [...merged, ...unsaved];
}
