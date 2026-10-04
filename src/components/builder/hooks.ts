"use client";

import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useRef } from "react";

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave this page and lose them?";

/**
 * While `active`, asks before leaving the page: on reload/close/typed URLs
 * (beforeunload) and on in-app links, which navigate without a page load and
 * so never fire beforeunload.
 */
export function useUnsavedChangesWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Capture phase on document runs before Next.js <Link>'s own handler.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);
}

/**
 * A ref that always holds the latest value. Async handlers (Save all) read
 * it instead of the stale snapshot captured when they started.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/** Pointer (with a small drag threshold, so clicks still work) plus keyboard sorting. */
export function useSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
