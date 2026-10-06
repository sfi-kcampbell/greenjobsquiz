"use client";

import { useEffect } from "react";

/** ?autoprint=1: open the print dialog once, after the page has painted. */
export function AutoPrint() {
  useEffect(() => {
    const id = requestAnimationFrame(() => setTimeout(() => window.print(), 100));
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
