"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScoringBundle } from "@/lib/content/scoring-model";
import { score, type ScoringModel, type ScoringWarning, type Selection } from "@/lib/scoring/engine";
import { findAnswersFor } from "@/lib/scoring/search";

type Picks = Record<number, number[]>;

const storageKey = (quizId: number) => `pltq:simulate:${quizId}`;
const fmt = (n: number, digits = 3) => (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);

function readPicks(quizId: number, model: ScoringModel): Picks {
  try {
    const raw = JSON.parse(sessionStorage.getItem(storageKey(quizId)) ?? "{}") as Picks;
    const picks: Picks = {};
    for (const q of model.questions) {
      const valid = (raw[q.id] ?? []).filter((id) => q.answers.some((a) => a.id === id));
      if (valid.length) picks[q.id] = valid;
    }
    return picks;
  } catch {
    return {};
  }
}

export function Simulator({
  quizId,
  model,
  display,
  runnersUpCount,
}: {
  quizId: number;
  model: ScoringModel;
  display: ScoringBundle["display"];
  runnersUpCount: number;
}) {
  // Client-only component (see loader.tsx), so sessionStorage is safe here.
  const [picks, setPicks] = useState<Picks>(() => readPicks(quizId, model));
  const [target, setTarget] = useState<number | "">(display.results[0]?.id ?? "");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(quizId), JSON.stringify(picks));
    } catch {
      // Not persisted in private mode; fine.
    }
  }, [picks, quizId]);

  const selections: Selection[] = useMemo(
    () => Object.entries(picks).map(([questionId, answerIds]) => ({ questionId: Number(questionId), answerIds })),
    [picks],
  );
  const result = useMemo(() => score(model, selections), [model, selections]);

  const titleOf = (id: number) => display.results.find((r) => r.id === id)?.title ?? `Response ${id}`;
  const categoryOf = (id: number) => display.categories.find((c) => c.id === id);
  const answered = display.questions.filter((q) => (picks[q.id]?.length ?? 0) > 0).length;

  function choose(questionId: number, answerId: number, multi: boolean, maxSelect: number, checked: boolean) {
    setSearchMessage(null);
    setPicks((prev) => {
      const current = prev[questionId] ?? [];
      let next: number[];
      if (!multi) next = [answerId];
      else if (checked) next = current.length >= maxSelect ? current : [...current, answerId];
      else next = current.filter((id) => id !== answerId);
      const copy = { ...prev };
      if (next.length) copy[questionId] = next;
      else delete copy[questionId];
      return copy;
    });
  }

  function randomize() {
    setSearchMessage(null);
    const next: Picks = {};
    for (const q of display.questions) {
      if (q.answers.length === 0) continue;
      const shuffled = [...q.answers].sort(() => Math.random() - 0.5);
      const count = q.type === "multi" ? 1 + Math.floor(Math.random() * Math.min(q.maxSelect, q.answers.length)) : 1;
      next[q.id] = shuffled.slice(0, count).map((a) => a.id);
    }
    setPicks(next);
  }

  function search() {
    if (target === "") return;
    const outcome = findAnswersFor(model, target, selections);
    const next: Picks = {};
    for (const s of outcome.selections) next[s.questionId] = s.answerIds;
    setPicks(next);
    const points = Math.abs(outcome.margin * 100).toFixed(1);
    setSearchMessage(
      outcome.wins
        ? `Found answers where ${titleOf(target)} is the top match (ahead by ${points} similarity points).`
        : `${titleOf(target)} can't become the top match with the current weights. The closest it gets is ${points} points behind. Consider making its profile more distinct.`,
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Answers */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={randomize}
            className="rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5"
          >
            Random answers
          </button>
          <button
            type="button"
            onClick={() => {
              setPicks({});
              setSearchMessage(null);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/40"
          >
            Clear
          </button>
          <p className="text-sm text-muted" aria-live="polite">
            {answered} of {display.questions.length} answered
          </p>
        </div>

        {display.questions.length === 0 && <p className="text-muted">This quiz has no questions yet.</p>}

        {display.questions.map((q, i) => {
          const multi = q.type === "multi";
          const chosen = picks[q.id] ?? [];
          return (
            <fieldset key={q.id} className="rounded-lg border border-border bg-surface p-4">
              <legend className="px-1 font-medium">
                {i + 1}. {q.title}
              </legend>
              {multi && <p className="mb-2 text-xs text-muted">Pick up to {q.maxSelect}.</p>}
              <div className="flex flex-col gap-1.5">
                {q.answers.map((a) => {
                  const checked = chosen.includes(a.id);
                  const full = multi && !checked && chosen.length >= q.maxSelect;
                  return (
                    <label key={a.id} className={`flex items-start gap-2 text-sm ${full ? "text-muted" : ""}`}>
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name={`sim-q-${q.id}`}
                        checked={checked}
                        disabled={full}
                        onChange={(e) => choose(q.id, a.id, multi, q.maxSelect, e.target.checked)}
                        className="mt-0.5"
                      />
                      {a.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {/* Results */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Outcome result={result} titleOf={titleOf} />

        {result.ranked.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">All responses, ranked</caption>
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-medium">#</th>
                  <th scope="col" className="px-3 py-2 font-medium">Response</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Match</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Similarity</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Gap to first</th>
                </tr>
              </thead>
              <tbody>
                {result.ranked.map((r, i) => {
                  const role = i === 0 ? "Top match" : i <= runnersUpCount ? "Runner-up" : null;
                  return (
                    <tr
                      key={r.resultId}
                      className={`border-b border-border last:border-0 ${i === 0 ? "bg-brand/5 font-medium" : role ? "" : "text-muted"}`}
                    >
                      <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        {titleOf(r.resultId)}
                        {role && <span className="ml-2 text-xs font-normal text-muted">{role}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.percent}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(r.raw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {i === 0 ? "—" : `−${fmt(result.ranked[0].raw - r.raw)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Category profile</h3>
          <p className="text-xs text-muted">Score in each category compared with the most it can reach in this quiz.</p>
          <ul className="flex flex-col gap-1.5">
            {display.categories.map((c) => {
              const scored = c.id in result.normalized;
              const value = result.normalized[c.id] ?? 0;
              const width = `${Math.min(1, Math.abs(value)) * 50}%`;
              return (
                <li key={c.id} className="grid grid-cols-[minmax(6rem,10rem)_1fr_6.5rem] items-center gap-2 text-sm">
                  <span className="truncate" title={c.name}>
                    {c.name}
                  </span>
                  <div aria-hidden className="relative h-3 rounded bg-background">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    {scored && (
                      <div
                        className="absolute inset-y-0 rounded-sm"
                        style={{ backgroundColor: c.color, width, ...(value >= 0 ? { left: "50%" } : { right: "50%" }) }}
                      />
                    )}
                  </div>
                  <span className="text-right text-xs tabular-nums text-muted">
                    {scored
                      ? `${fmt(result.vector[c.id] ?? 0, 2)} of ${fmt(result.maxAchievable[c.id] ?? 0, 2)}`
                      : "not scored"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Find answers for a response</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sim-target" className="sr-only">
              Response to aim for
            </label>
            <select
              id="sim-target"
              value={target}
              onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {display.results.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={search}
              disabled={target === "" || display.questions.length === 0}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
            >
              Find answers
            </button>
          </div>
          {searchMessage && (
            <p role="status" className="text-sm">
              {searchMessage}
            </p>
          )}
        </div>

        <Warnings warnings={result.warnings} titleOf={titleOf} categoryName={(id) => categoryOf(id)?.name ?? `Category ${id}`} />
      </div>
    </div>
  );
}

function Outcome({ result, titleOf }: { result: ReturnType<typeof score>; titleOf: (id: number) => string }) {
  let body: React.ReactNode;
  if (result.status === "no_results") {
    body = <p>No response can be recommended yet. Add responses and give them weights.</p>;
  } else if (result.status === "insufficient_data") {
    body = (
      <>
        <p className="font-medium">Not enough information to choose a response.</p>
        <p className="text-sm text-muted">
          {result.isFallback && result.match
            ? `Respondents would see the fallback response: ${titleOf(result.match.resultId)}.`
            : "Respondents would be told we couldn't determine a match. Answer some questions, or set a fallback response in Quiz settings."}
        </p>
      </>
    );
  } else {
    const top = result.ranked[0];
    const second = result.ranked[1];
    body = (
      <>
        <p className="text-sm text-muted">Top match</p>
        <p className="text-xl font-semibold" data-testid="top-match">
          {titleOf(top.resultId)} <span className="text-base font-normal text-muted">· {top.percent}% match</span>
        </p>
        {result.isClose && second && (
          <p className="mt-1 text-sm text-amber-800">
            Close call: {titleOf(top.resultId)} and {titleOf(second.resultId)} are almost tied. Respondents would
            be told they&apos;re a strong fit for both.
          </p>
        )}
      </>
    );
  }
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-brand/30 bg-surface p-4">
      {body}
    </div>
  );
}

function Warnings({
  warnings,
  titleOf,
  categoryName,
}: {
  warnings: ScoringWarning[];
  titleOf: (id: number) => string;
  categoryName: (id: number) => string;
}) {
  const messages = [
    ...new Set(
      warnings.map((w) => {
        const c = w.context ?? {};
        switch (w.code) {
          case "unreachable_category":
            return `${categoryName(Number(c.categoryId))}: no answer scores this category, so it's ignored.`;
          case "empty_weight_vector":
            return `${titleOf(Number(c.resultId))} has no weights in the scored categories, so it can't be recommended.`;
          case "multiple_answers_single_question":
            return "A single-choice question had more than one answer; only the first counted.";
          default:
            return `Scoring note: ${w.code.replaceAll("_", " ")}.`;
        }
      }),
    ),
  ];
  if (messages.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
      <h3 className="mb-1 font-semibold text-foreground">Scoring notes</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
