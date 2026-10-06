"use client";

import { useSyncExternalStore, useState } from "react";

const noSubscribe = () => () => {};

/**
 * Print, share and printable-page actions under a result. Links use the
 * current site's address (a preview shares a preview link; an embed's link
 * points at the quiz site, not the page around it). Hidden when printing.
 */
export function ResultActions({ shareToken }: { shareToken: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const [status, setStatus] = useState("");
  const shareUrl = `${origin}/quiz-result/${shareToken}`;
  const canShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);

  const share = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: "My quiz result", url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy the link below.");
    }
  };

  const button = "rounded-md border border-border bg-surface px-4 py-2 font-medium hover:bg-border/40";
  return (
    <section aria-labelledby="keep-result" className="no-print flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h3 id="keep-result" className="font-semibold">
        Keep or share your result
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className={button}>
          Print
        </button>
        <button type="button" onClick={share} className={button}>
          {canShare ? "Share" : "Copy link"}
        </button>
        <a href={`/quiz-result/${shareToken}`} target="_blank" rel="noopener" className={`${button} inline-block`}>
          Printable page<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p role="status" className="text-sm text-brand">
          {status}
        </p>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="share-url" className="text-muted">
          Anyone with this link can see this result:
        </label>
        <input
          id="share-url"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
        />
      </div>
    </section>
  );
}
