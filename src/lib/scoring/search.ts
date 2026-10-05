/**
 * "Find answers that produce X": greedy search used by the Simulate tab.
 * Pure. Picks one answer per question (single picks even on multi-select).
 */
import { score, type ScoringModel, type Selection } from "./engine";

export type SearchOutcome = {
  selections: Selection[];
  /** Target's similarity minus its strongest rival's (0 = tie). */
  margin: number;
  wins: boolean;
};

function margin(model: ScoringModel, selections: Selection[], targetId: number): number {
  const r = score(model, selections);
  if (r.status !== "scored") return Number.NEGATIVE_INFINITY;
  const target = r.ranked.find((x) => x.resultId === targetId);
  if (!target) return Number.NEGATIVE_INFINITY;
  const rival = r.ranked.find((x) => x.resultId !== targetId);
  return rival ? target.raw - rival.raw : target.raw;
}

export function findAnswersFor(
  model: ScoringModel,
  targetId: number,
  start: Selection[] = [],
  maxPasses = 3,
): SearchOutcome {
  const chosen = new Map<number, number>();
  for (const s of start) if (s.answerIds[0] !== undefined) chosen.set(s.questionId, s.answerIds[0]);
  const toSelections = () => [...chosen].map(([questionId, answerId]) => ({ questionId, answerIds: [answerId] }));

  let best = margin(model, toSelections(), targetId);
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (const q of model.questions) {
      if (q.answers.length === 0) continue;
      const current = chosen.get(q.id);
      // Unanswered questions always get an answer; answered ones change only if it helps.
      let pickId = current;
      let pickMargin = current === undefined ? Number.NEGATIVE_INFINITY : best;
      for (const a of q.answers) {
        if (a.id === current) continue;
        chosen.set(q.id, a.id);
        const m = margin(model, toSelections(), targetId);
        if (m > pickMargin + 1e-12 || pickId === undefined) {
          pickMargin = m;
          pickId = a.id;
        }
      }
      chosen.set(q.id, pickId!);
      if (pickId !== current && pickMargin > best + 1e-12) improved = true;
      best = margin(model, toSelections(), targetId);
    }
    if (!improved) break;
  }

  const selections = toSelections();
  const finalMargin = margin(model, selections, targetId);
  // A tie broken in the target's favour (by position) still counts as a win.
  const wins = score(model, selections).match?.resultId === targetId;
  return { selections, margin: finalMargin, wins };
}
