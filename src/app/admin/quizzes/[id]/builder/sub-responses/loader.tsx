"use client";

import dynamic from "next/dynamic";

/**
 * Client-only, like the Questions tab: it restores which cards were open from
 * sessionStorage and hosts rich-text editors.
 */
export const SubResponsesEditorLoader = dynamic(() => import("./sub-responses-editor").then((m) => m.SubResponsesEditor), {
  ssr: false,
  loading: () => <p className="text-muted">Loading sub-responses…</p>,
});
