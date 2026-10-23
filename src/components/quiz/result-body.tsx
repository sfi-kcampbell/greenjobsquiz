import type { Ref } from "react";
import type { SubResponseList } from "@/lib/content/sub-response-list";
import type { ResultPayload } from "@/lib/public/sessions";
import { RichHtml } from "./rich-html";
import { messagesFor } from "@/lib/i18n";

/**
 * The result itself: best match, runners-up and the category profile (every
 * bar with its percentage as text). No hooks, so the interactive result screen
 * and the printable /quiz-result page share it.
 */
export function ResultBody({ result, headingRef }: { result: ResultPayload; headingRef?: Ref<HTMLHeadingElement> }) {
  // In the language the quiz was taken in.
  const m = messagesFor(result.locale);
  const { match } = result;
  const scores = Object.entries(result.scores).sort((a, b) => b[1].percent - a[1].percent);

  return (
    <>
      <section aria-labelledby="result-title" className="pltq-response flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">{m.bestMatch}</p>
        {match ? (
          <>
            <h2 id="result-title" ref={headingRef} tabIndex={-1} className="pltq-response-title text-3xl font-semibold focus:outline-none">
              {match.title}
            </h2>
            {match.percent !== null && !result.isFallback && (
              <p className="text-lg">
                <strong className="text-brand">{m.percentMatch(match.percent)}</strong>
              </p>
            )}
            {result.isClose && (
              <p className="text-muted">{m.itWasClose}</p>
            )}
            {result.status === "insufficient_data" && (
              <p className="text-muted">{m.insufficientData}</p>
            )}
            <RichHtml html={match.bodyHtml} />
            {!match.bodyHtml && match.excerpt && <p>{match.excerpt}</p>}
            {match.ctaUrl && match.ctaLabel && (
              <p>
                <a
                  href={match.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pltq-cta inline-block rounded-md border border-transparent bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-strong"
                >
                  {match.ctaLabel}
                  <span className="sr-only">{m.opensInNewTab}</span>
                </a>
              </p>
            )}
            {match.subResponses?.length > 0 && <SubResponses lists={match.subResponses} newTab={m.opensInNewTab} />}
          </>
        ) : (
          <h2 id="result-title" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
            {m.noMatchFound}
          </h2>
        )}
      </section>

      {result.runnersUp.length > 0 && (
        <section aria-labelledby="runners-up" className="pltq-runners-up flex flex-col gap-3">
          <h3 id="runners-up" className="text-lg font-semibold">
            {m.alsoAGoodFit}
          </h3>
          <ul className="flex flex-col gap-3">
            {result.runnersUp.map((r) => (
              <li key={r.resultId} className="rounded-lg border border-border bg-surface p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{r.title}</span>
                  <span className="text-sm text-muted tabular-nums">{m.percentMatch(r.percent)}</span>
                </p>
                {r.excerpt && <p className="mt-1 text-muted">{r.excerpt}</p>}
                {r.subResponses?.length > 0 && <SubResponses lists={r.subResponses} newTab={m.opensInNewTab} compact />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {scores.length > 0 && (
        <section aria-labelledby="profile" className="pltq-profile flex flex-col gap-3">
          <h3 id="profile" className="text-lg font-semibold">
            {m.yourProfile}
          </h3>
          <ul className="flex flex-col gap-3">
            {scores.map(([id, s]) => (
              <li key={id} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-muted">{s.percent}%</span>
                </span>
                <span aria-hidden className="pltq-bar meter-track block h-3 overflow-hidden rounded-full bg-border">
                  <span className="meter-fill block h-full rounded-full" style={{ width: `${s.percent}%`, backgroundColor: s.color }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

    </>
  );
}

/** A response's sub-responses (e.g. jobs), a heading per group. Compact: titles only (runners-up). */
function SubResponses({ lists, newTab, compact = false }: { lists: SubResponseList; newTab: string; compact?: boolean }) {
  const Heading = compact ? "h4" : "h3";
  return (
    <div className={`pltq-sub-responses flex flex-col ${compact ? "mt-2 gap-2 text-sm" : "mt-2 gap-4"}`}>
      {lists.map((list) => (
        <div key={list.group} className="pltq-sub-response-group flex flex-col gap-1">
          <Heading className={compact ? "font-medium text-muted" : "text-lg font-semibold"}>{list.group}</Heading>
          <ul className={compact ? "flex flex-wrap gap-x-3 gap-y-1" : "flex list-disc flex-col gap-1.5 pl-5"}>
            {list.items.map((item, i) => (
              <li key={`${item.title}-${i}`} className="pltq-sub-response">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-4">
                    {item.title}
                    <span className="sr-only">{newTab}</span>
                  </a>
                ) : (
                  <span className="font-medium">{item.title}</span>
                )}
                {!compact && item.description && <p className="text-muted">{item.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
