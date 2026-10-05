/**
 * Sparse category vectors: { categoryId: weight }. Pure functions, no I/O.
 * The Phase 4 scoring engine builds on these.
 */
import { WEIGHT_MAX } from "@/lib/content/validation";

export type Vector = Record<number, number>;

function keysOf(...vectors: Vector[]): number[] {
  const keys = new Set<number>();
  for (const v of vectors) for (const k of Object.keys(v)) keys.add(Number(k));
  return [...keys];
}

export function dot(a: Vector, b: Vector): number {
  let sum = 0;
  for (const k of Object.keys(a)) {
    const key = Number(k);
    if (b[key] !== undefined) sum += a[key] * b[key];
  }
  return sum;
}

export function magnitude(v: Vector): number {
  return Math.sqrt(dot(v, v));
}

/** Cosine similarity in [−1, 1], or null when either vector is all zero. */
export function cosine(a: Vector, b: Vector): number | null {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return null;
  return Math.max(-1, Math.min(1, dot(a, b) / (ma * mb)));
}

export type NearDuplicate<T> = { a: T; b: T; similarity: number };

/**
 * Pairs whose profiles point (almost) the same way. Near-identical response
 * profiles make the recommendation a coin flip between them.
 */
export function nearDuplicates<T extends { weights: Vector }>(
  items: T[],
  threshold = 0.95,
): NearDuplicate<T>[] {
  const pairs: NearDuplicate<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const similarity = cosine(items[i].weights, items[j].weights);
      if (similarity !== null && similarity >= threshold) {
        pairs.push({ a: items[i], b: items[j], similarity });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/**
 * Scales weights so their absolute values add up to `target`, rounded to
 * 2 decimals and held within ±5. `clamped` says whether the hold kicked in
 * (then the sum falls short of the target). Zero vectors come back unchanged.
 */
export function normalizeToSum(weights: Vector, target = 10): { weights: Vector; clamped: boolean } {
  const total = keysOf(weights).reduce((sum, k) => sum + Math.abs(weights[k]), 0);
  if (total === 0) return { weights: { ...weights }, clamped: false };
  const factor = target / total;
  let clamped = false;
  const out: Vector = {};
  for (const k of keysOf(weights)) {
    let w = Math.round(weights[k] * factor * 100) / 100;
    if (Math.abs(w) > WEIGHT_MAX) {
      w = Math.sign(w) * WEIGHT_MAX;
      clamped = true;
    }
    out[k] = w;
  }
  return { weights: out, clamped };
}
