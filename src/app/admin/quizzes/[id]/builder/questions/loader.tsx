"use client";

import dynamic from "next/dynamic";

/**
 * The editor is client-only: it restores which cards were open from
 * sessionStorage and hosts rich-text editors, neither of which can render
 * on the server without a hydration mismatch.
 */
export const QuestionsEditorLoader = dynamic(
  () => import("./questions-editor").then((m) => m.QuestionsEditor),
  {
    ssr: false,
    loading: () => <p className="text-muted">Loading questions…</p>,
  },
);
