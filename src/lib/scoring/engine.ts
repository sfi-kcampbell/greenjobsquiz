/**
 * The scoring engine. PURE: no database, no fetch, no Next.js, no globals.
 * The caller loads the model; this turns selections into a ranked match.
 * See SPEC.md → "Scoring engine". Change behaviour only with tests, and bump
 * ENGINE_VERSION when results for the same input would change.
 */
import { dot, magnitude, type Vector } from "./vector";

export const ENGINE_VERSION = "1";

export type ScoringCategory = { id: number; importance: number };
export type ScoringAnswer = { id: number; weights: Vector };
export type ScoringQuestion = {
  id: number;
  type: "single" | "multi";
  splitMulti: boolean;
  maxSelect: number;
  answers: ScoringAnswer[];
};
export type ScoringResult = { id: number; position: number; weights: Vector };
export type ScoringOptions = {
  /** Divide each category by the most it can score in this quiz (default true). */
  normalizePerCategory?: boolean;
  /** Ignore categories no answer can reach (default true). */
  dropUnreachable?: boolean;
  /** Returned (as a fallback) when the answers carry no signal. */
  defaultResultId?: number | null;
};
export type ScoringModel = {
  /** In display order; this order is also the fixed dimension order. */
  categories: ScoringCategory[];
  questions: ScoringQuestion[];
  results: ScoringResult[];
  options?: ScoringOptions;
};

export type Selection = { questionId: number; answerIds: number[] };

export type ScoringWarning = {
  code:
    | "unknown_question"
    | "unknown_answer"
    | "multiple_answers_single_question"
    | "non_finite_weight"
    | "unknown_category"
    | "unreachable_category"
    | "empty_weight_vector";
  context?: Record<string, number | string>;
};

export type RankedResult = {
  resultId: number;
  /** Cosine similarity in [−1, 1]. */
  raw: number;
  /** Display percentage (see toPercentage). */
  percent: number;
  /** Un-normalized dot product; second tie-breaker. */
  dot: number;
  /** Categories where both the respondent and the response are non-zero. */
  overlap: number;
};

export type Contribution = { questionId: number; answerIds: number[]; vector: Vector };

export type ScoreResult = {
  status: "scored" | "insufficient_data" | "no_results";
  engine: string;
  /** Raw category totals (importance applied), for every category. */
  vector: Vector;
  /** Per-category normalized values, for the categories scored. */
  normalized: Vector;
  /** `normalized` scaled to length 1. */
  unit: Vector;
  /** Most each category can score in this quiz. */
  maxAchievable: Vector;
  /** What each answered question added. Snapshotted with submissions later. */
  contributions: Contribution[];
  ranked: RankedResult[];
  match: RankedResult | null;
  /** Top two are within 0.02 of each other: "a strong fit for both…". */
  isClose: boolean;
  /** `match` is the configured default because the answers carried no signal. */
  isFallback: boolean;
  warnings: ScoringWarning[];
};

const EPSILON = 1e-9;
const CLOSE_GAP = 0.02;

/* -------------------------------- Helpers -------------------------------- */

function finite(value: unknown, warn: () => void): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    if (value !== undefined) warn();
    return 0;
  }
  return value;
}

/** Categories that at least one answer in the quiz weights (the whole quiz, not the selection). */
export function reachableCategories(model: ScoringModel): Set<number> {
  const reachable = new Set<number>();
  for (const q of model.questions) {
    for (const a of q.answers) {
      for (const [k, w] of Object.entries(a.weights)) {
        if (typeof w === "number" && Number.isFinite(w) && w !== 0) reachable.add(Number(k));
      }
    }
  }
  return reachable;
}

/**
 * Most each category can score: per question, the best answer (single, or
 * multi split across picks) or the best `maxSelect` positive weights (multi),
 * times the category's importance.
 */
export function maxAchievable(model: ScoringModel): Vector {
  const out: Vector = {};
  for (const c of model.categories) {
    let total = 0;
    for (const q of model.questions) {
      const values = q.answers.map((a) => {
        const w = a.weights[c.id];
        return typeof w === "number" && Number.isFinite(w) ? w : 0;
      });
      if (values.length === 0) continue;
      if (q.type === "single" || q.splitMulti) {
        total += Math.max(0, ...values);
      } else {
        const positives = values.filter((v) => v > 0).sort((a, b) => b - a);
        total += positives.slice(0, Math.max(1, q.maxSelect)).reduce((s, v) => s + v, 0);
      }
    }
    out[c.id] = total * c.importance;
  }
  return out;
}

/**
 * Display percentage from cosine similarity. Raw cosine bunches up near the
 * top (everything looks like a 90% match), so use the angle instead:
 * cos .95 → 80, .80 → 59, .70 → 49, ≤ 0 → 0. 100 only for an exact match.
 */
export function toPercentage(cos: number): number {
  if (cos >= 0.9999) return 100;
  const angle = 1 - Math.acos(Math.max(-1, Math.min(1, cos))) / (Math.PI / 2);
  return Math.max(0, Math.min(99, Math.round(100 * angle)));
}

function restrict(v: Vector, dims: number[]): Vector {
  const out: Vector = {};
  for (const d of dims) if (v[d] !== undefined && v[d] !== 0) out[d] = v[d];
  return out;
}

/** Ranking order: similarity, then raw dot, then overlap, then author's order, then id. */
function compare(a: RankedResult & { position: number }, b: RankedResult & { position: number }): number {
  if (Math.abs(a.raw - b.raw) > EPSILON) return b.raw - a.raw;
  if (Math.abs(a.dot - b.dot) > EPSILON) return b.dot - a.dot;
  if (a.overlap !== b.overlap) return b.overlap - a.overlap;
  if (a.position !== b.position) return a.position - b.position;
  return a.resultId - b.resultId;
}

/* --------------------------------- Score --------------------------------- */

export function score(model: ScoringModel, selections: Selection[]): ScoreResult {
  const warnings: ScoringWarning[] = [];
  const warnedCategories = new Set<number>();
  const options = { normalizePerCategory: true, dropUnreachable: true, defaultResultId: null, ...model.options };

  const importance = new Map(model.categories.map((c) => [c.id, finite(c.importance, () => {})]));
  const categoryIds = model.categories.map((c) => c.id);

  // 1. Fixed dimensions: optionally only categories the quiz can actually reach.
  let dims = categoryIds;
  if (options.dropUnreachable) {
    const reachable = reachableCategories(model);
    dims = categoryIds.filter((id) => reachable.has(id));
    for (const id of categoryIds) {
      if (!reachable.has(id)) warnings.push({ code: "unreachable_category", context: { categoryId: id } });
    }
  }

  // 2. Clean the selections.
  const questionsById = new Map(model.questions.map((q) => [q.id, q]));
  const chosen = new Map<number, number[]>();
  for (const s of selections) {
    const q = questionsById.get(s.questionId);
    if (!q) {
      warnings.push({ code: "unknown_question", context: { questionId: s.questionId } });
      continue;
    }
    const list = chosen.get(q.id) ?? [];
    for (const answerId of s.answerIds) {
      if (!q.answers.some((a) => a.id === answerId)) {
        warnings.push({ code: "unknown_answer", context: { questionId: q.id, answerId } });
      } else if (!list.includes(answerId)) {
        list.push(answerId);
      }
    }
    chosen.set(q.id, list);
  }

  // 3. Aggregate contributions (importance applied; optional split for multi).
  const vector: Vector = Object.fromEntries(categoryIds.map((id) => [id, 0]));
  const contributions: Contribution[] = [];
  for (const q of model.questions) {
    let answerIds = chosen.get(q.id) ?? [];
    if (answerIds.length === 0) continue;
    if (q.type === "single" && answerIds.length > 1) {
      warnings.push({ code: "multiple_answers_single_question", context: { questionId: q.id } });
      answerIds = answerIds.slice(0, 1);
    }
    const contribution: Vector = {};
    for (const answerId of answerIds) {
      const answer = q.answers.find((a) => a.id === answerId)!;
      for (const [key, raw] of Object.entries(answer.weights)) {
        const categoryId = Number(key);
        if (!importance.has(categoryId)) {
          if (!warnedCategories.has(categoryId)) {
            warnedCategories.add(categoryId);
            warnings.push({ code: "unknown_category", context: { categoryId } });
          }
          continue;
        }
        const w = finite(raw, () =>
          warnings.push({ code: "non_finite_weight", context: { answerId, categoryId } }),
        );
        contribution[categoryId] = (contribution[categoryId] ?? 0) + w * importance.get(categoryId)!;
      }
    }
    if (q.type === "multi" && q.splitMulti) {
      for (const k of Object.keys(contribution)) contribution[Number(k)] /= answerIds.length;
    }
    for (const [k, v] of Object.entries(contribution)) vector[Number(k)] += v;
    contributions.push({ questionId: q.id, answerIds, vector: contribution });
  }

  // 4. Per-category normalization against the most each category can score.
  const max = maxAchievable(model);
  const normalized: Vector = {};
  for (const d of dims) {
    normalized[d] = options.normalizePerCategory && max[d] > 0 ? vector[d] / max[d] : vector[d];
  }
  const userMagnitude = magnitude(normalized);
  const unit: Vector = {};
  for (const d of dims) unit[d] = userMagnitude > 0 ? normalized[d] / userMagnitude : 0;

  // 5. Candidate responses (a response with no weights can never match).
  const candidates: { id: number; position: number; weights: Vector }[] = [];
  for (const r of model.results) {
    const weights: Vector = {};
    for (const [key, raw] of Object.entries(r.weights)) {
      const categoryId = Number(key);
      if (!importance.has(categoryId)) {
        if (!warnedCategories.has(categoryId)) {
          warnedCategories.add(categoryId);
          warnings.push({ code: "unknown_category", context: { categoryId } });
        }
        continue;
      }
      const w = finite(raw, () => warnings.push({ code: "non_finite_weight", context: { resultId: r.id, categoryId } }));
      if (w !== 0) weights[categoryId] = w;
    }
    const scored = restrict(weights, dims);
    if (Object.keys(scored).length === 0) {
      warnings.push({ code: "empty_weight_vector", context: { resultId: r.id } });
      continue;
    }
    candidates.push({ id: r.id, position: r.position, weights: scored });
  }

  const base = {
    engine: ENGINE_VERSION,
    vector,
    normalized,
    unit,
    maxAchievable: max,
    contributions,
    warnings,
  };

  if (candidates.length === 0) {
    return { ...base, status: "no_results", ranked: [], match: null, isClose: false, isFallback: false };
  }

  if (userMagnitude === 0) {
    const fallback = model.results.find((r) => r.id === options.defaultResultId);
    return {
      ...base,
      status: "insufficient_data",
      ranked: [],
      match: fallback ? { resultId: fallback.id, raw: 0, percent: 0, dot: 0, overlap: 0 } : null,
      isClose: false,
      isFallback: Boolean(fallback),
    };
  }

  // 6. Cosine against each response, then deterministic ranking.
  const rawUser = restrict(vector, dims);
  const ranked = candidates
    .map((c) => {
      const responseMagnitude = magnitude(c.weights);
      const raw = Math.max(-1, Math.min(1, dot(unit, c.weights) / responseMagnitude));
      const overlap = Object.keys(c.weights).filter((k) => (rawUser[Number(k)] ?? 0) !== 0).length;
      return { resultId: c.id, position: c.position, raw, percent: toPercentage(raw), dot: dot(rawUser, c.weights), overlap };
    })
    .sort(compare)
    .map(({ position: _position, ...r }) => r);

  return {
    ...base,
    status: "scored",
    ranked,
    match: ranked[0],
    isClose: ranked.length > 1 && ranked[0].raw - ranked[1].raw < CLOSE_GAP,
    isFallback: false,
  };
}
