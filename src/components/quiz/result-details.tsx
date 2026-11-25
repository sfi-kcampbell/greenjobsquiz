"use client";

import { useId, useState } from "react";
import type { SubResponseItem, SubResponseList } from "@/lib/content/sub-response-list";
import { messagesFor } from "@/lib/i18n";
import type { ResultPayload } from "@/lib/public/sessions";
import { RichHtml } from "./rich-html";

type RunnerUp = ResultPayload["runnersUp"][number];

/** ▸ / ▾, for a toggle's open state (aria-expanded says it to screen readers). */
const Chevron = ({ open }: { open: boolean }) => (
  <span aria-hidden className="pltq-chevron inline-block w-4 shrink-0 text-muted print:hidden">
    {open ? "▾" : "▸"}
  </span>
);

/**
 * A runner-up: title, match and summary, opening in place to its full
 * description, button and sub-responses. Printing always shows the details.
 */
export function RunnerUpCard({ runnerUp: r, locale }: { runnerUp: RunnerUp; locale: string }) {
  const m = messagesFor(locale);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetails = Boolean(r.bodyHtml || (r.ctaUrl && r.ctaLabel) || r.subResponses.some((g) => g.items.length));
  const header = (
    <>
      <span className="font-semibold">{r.title}</span>
      <span className="ml-auto text-sm text-muted tabular-nums">{m.percentMatch(r.percent)}</span>
    </>
  );
  return (
    <li className="pltq-runner-up rounded-lg border border-border bg-surface p-4">
      {hasDetails ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="pltq-runner-up-toggle -m-1 flex w-[calc(100%+0.5rem)] flex-wrap items-baseline gap-2 rounded p-1 text-left hover:bg-border/30"
        >
          <Chevron open={open} />
          {header}
          <span className="sr-only">{m.detailsHint}</span>
        </button>
      ) : (
        <p className="flex flex-wrap items-baseline gap-2">{header}</p>
      )}
      {r.excerpt && <p className="mt-1 text-muted">{r.excerpt}</p>}
      {/* Closed: job titles at a glance. Open (and in print): the full details instead. */}
      {r.subResponses.length > 0 && (
        <div className={open ? "hidden" : "print:hidden"}>
          <SubResponses lists={r.subResponses} locale={locale} compact />
        </div>
      )}
      {hasDetails && (
        <div id={panelId} className={`pltq-runner-up-details mt-3 flex-col gap-3 ${open ? "flex" : "hidden print:flex"}`}>
          <RichHtml html={r.bodyHtml} />
          {r.ctaUrl && r.ctaLabel && (
            <p>
              <a
                href={r.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pltq-cta inline-block rounded-md border border-transparent bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong"
              >
                {r.ctaLabel}
                <span className="sr-only">{m.opensInNewTab}</span>
              </a>
            </p>
          )}
          {r.subResponses.length > 0 && <SubResponses lists={r.subResponses} locale={locale} headingLevel="h4" />}
        </div>
      )}
    </li>
  );
}

/**
 * A response's sub-responses (e.g. jobs), a heading per group. Each item with
 * text or a link opens in place to show them. Compact: titles only.
 */
export function SubResponses({
  lists,
  locale,
  compact = false,
  headingLevel = "h3",
}: {
  lists: SubResponseList;
  locale: string;
  compact?: boolean;
  headingLevel?: "h3" | "h4";
}) {
  const Heading = compact ? "h4" : headingLevel;
  return (
    <div className={`pltq-sub-responses flex flex-col ${compact ? "mt-2 gap-2 text-sm" : "mt-2 gap-4"}`}>
      {lists.map((list) => (
        <div key={list.group} className="pltq-sub-response-group flex flex-col gap-1">
          <Heading className={compact ? "font-medium text-muted" : headingLevel === "h4" ? "font-semibold" : "text-lg font-semibold"}>
            {list.group}
          </Heading>
          <ul className={compact ? "flex flex-wrap gap-x-3 gap-y-1" : "flex flex-col gap-2"}>
            {list.items.map((item, i) =>
              compact ? (
                <li key={`${item.title}-${i}`} className="pltq-sub-response">
                  {item.title}
                </li>
              ) : (
                <SubResponseRow key={`${item.title}-${i}`} item={item} locale={locale} />
              ),
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A job as a full-width bar; one with text or a link opens to show them (chevron on the right). */
function SubResponseRow({ item, locale }: { item: SubResponseItem; locale: string }) {
  const m = messagesFor(locale);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const bar = "pltq-sub-response overflow-hidden rounded-lg border border-border bg-surface";
  if (!item.descriptionHtml && !item.url) {
    return (
      <li className={bar}>
        <span className="block px-4 py-2.5 font-medium">{item.title}</span>
      </li>
    );
  }
  return (
    <li className={`${bar} ${open ? "border-brand/40" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`pltq-sub-response-toggle flex w-full items-center gap-3 px-4 py-2.5 text-left font-medium hover:bg-brand/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${open ? "bg-brand/5" : ""}`}
      >
        <span className="flex-1">{item.title}</span>
        <span className="sr-only">{m.detailsHint}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`pltq-chevron size-5 shrink-0 text-muted motion-safe:transition-transform print:hidden ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        id={panelId}
        className={`pltq-sub-response-details flex-col gap-2 border-t border-border px-4 py-3 ${open ? "flex" : "hidden print:flex"}`}
      >
        <RichHtml html={item.descriptionHtml} className="text-muted" />
        {item.url && (
          <p>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-4">
              {m.learnMore}
              <span className="sr-only">
                : {item.title}
                {m.opensInNewTab}
              </span>
            </a>
          </p>
        )}
      </div>
    </li>
  );
}
