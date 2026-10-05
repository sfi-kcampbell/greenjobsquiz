"use client";

import dynamic from "next/dynamic";

/** Client-only: restores the last simulated answers from sessionStorage. */
export const SimulatorLoader = dynamic(() => import("./simulator").then((m) => m.Simulator), {
  ssr: false,
  loading: () => <p className="text-muted">Loading simulator…</p>,
});
