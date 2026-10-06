"use client";

import { useEffect, useRef, type ReactNode } from "react";

const EVENTS = ["quiz:answer", "quiz:complete", "quiz:restart"] as const;

/**
 * Inside an iframe: tells the host page how tall the quiz is (so embed.js can
 * size the frame) and forwards the quiz events. Messages carry only heights,
 * ids and titles, never the respondent's key, so any parent may receive them.
 */
export function EmbedBridge({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window) return;
    const post = (data: Record<string, unknown>) => window.parent.postMessage(data, "*");

    // Measure the content, not the document: the body stretches to the frame's height.
    let last = 0;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        post({ type: "pltq:resize", height });
      }
    };
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();

    const forward = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      post({ type: "pltq:event", name: event.type, detail });
    };
    for (const name of EVENTS) el.addEventListener(name, forward);
    return () => {
      observer.disconnect();
      for (const name of EVENTS) el.removeEventListener(name, forward);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
