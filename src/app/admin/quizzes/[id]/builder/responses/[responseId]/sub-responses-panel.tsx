"use client";

import { closestCenter, DndContext, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useId, useState } from "react";
import { useSortSensors } from "@/components/builder/hooks";
import { setResponseSubResponsesAction } from "../../sub-responses/actions";

type Group = { id: number; name: string };
type Item = { id: number; groupId: number; title: string };

const smallButton = "rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-border/40 disabled:opacity-40";

/**
 * Which sub-responses this response lists (e.g. its jobs), and their order.
 * Ticking adds an item at the end of its group; dragging in the list above
 * sets the order within each group (the order respondents see).
 */
export function SubResponsesPanel({
  quizId,
  responseId,
  responseTitle,
  groups,
  items,
  initialIds,
}: {
  quizId: number;
  responseId: number;
  responseTitle: string;
  groups: Group[];
  items: Item[];
  initialIds: number[];
}) {
  const [saved, setSaved] = useState(initialIds);
  const [ids, setIds] = useState(initialIds);
  const [filter, setFilter] = useState("");
  // Open to start with when nothing is listed; after that the admin opens and closes it.
  const [pickerOpen] = useState(initialIds.length === 0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const dndId = useId();
  const sensors = useSortSensors();
  const byId = new Map(items.map((x) => [x.id, x]));
  const dirty = ids.join() !== saved.join();

  if (groups.length === 0 || items.length === 0) {
    return (
      <p className="text-sm text-muted">
        No sub-responses yet. Set them up in the{" "}
        <Link href={`/admin/quizzes/${quizId}/builder/sub-responses`} className="text-brand underline underline-offset-4">
          Sub-responses
        </Link>{" "}
        tab, then add them here.
      </p>
    );
  }

  const toggle = (id: number, on: boolean) => setIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));
  /** Moves an item within its group; the other groups keep their places in the list. */
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setIds((cur) => {
      const groupId = byId.get(Number(active.id))?.groupId;
      if (groupId === undefined || byId.get(Number(over.id))?.groupId !== groupId) return cur;
      const same = cur.filter((x) => byId.get(x)?.groupId === groupId);
      const moved = arrayMove(same, same.indexOf(Number(active.id)), same.indexOf(Number(over.id)));
      let i = 0;
      return cur.map((x) => (byId.get(x)?.groupId === groupId ? moved[i++] : x));
    });
  };
  const titleOf = (id: string | number) => byId.get(Number(id))?.title ?? "item";
  const positionOf = (id: string | number) => {
    const groupId = byId.get(Number(id))?.groupId;
    return ids.filter((x) => byId.get(x)?.groupId === groupId).indexOf(Number(id)) + 1;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ over }) => (over ? `Moving to position ${positionOf(over.id)}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Dropped at position ${positionOf(over.id)}. Save to keep the new order.` : "Dropped."),
    onDragCancel: () => "Reordering cancelled.",
  };
  const term = filter.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          const listed = ids.filter((id) => byId.get(id)?.groupId === g.id);
          if (!listed.length) return null;
          return (
            <div key={g.id} className="flex flex-col gap-1">
              <h4 className="font-medium">{g.name}</h4>
              <DndContext id={`${dndId}-${g.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
                <SortableContext items={listed} strategy={verticalListSortingStrategy}>
                  <ol className="flex flex-col gap-1" aria-label={`${g.name} listed under this response`}>
                    {listed.map((id, i) => (
                      <ListedRow key={id} id={id} number={i + 1} title={byId.get(id)?.title ?? ""} onRemove={() => toggle(id, false)} />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            </div>
          );
        })}
        {ids.length === 0 && <p className="text-muted">None listed yet. Tick some below.</p>}
      </div>

      <details className="rounded-md border border-border p-3" open={pickerOpen}>
        <summary className="cursor-pointer font-medium">Add or remove sub-responses</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="sr-filter">Filter</label>
            <input id="sr-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64 rounded-md border border-border bg-surface px-2 py-1.5" />
          </div>
          {groups.map((g) => {
            const shown = items.filter((x) => x.groupId === g.id && (!term || x.title.toLowerCase().includes(term)));
            if (!shown.length) return null;
            return (
              <fieldset key={g.id} className="flex flex-col gap-1">
                <legend className="font-medium">{g.name}</legend>
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((x) => (
                    <label key={x.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={ids.includes(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} />
                      {x.title}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={async () => {
            setBusy(true);
            const res = await setResponseSubResponsesAction(quizId, responseId, ids, responseTitle);
            setBusy(false);
            if (res.ok) {
              setSaved(res.data.ids);
              setStatus({ text: "Sub-responses saved. Publish changes to make them live.", error: false });
            } else setStatus({ text: res.error ?? "Couldn't save the sub-responses.", error: true });
          }}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save sub-responses"}
        </button>
        <p role="status" className={status?.error ? "text-danger" : "text-brand"}>
          {status?.text ?? (dirty ? "Unsaved changes." : "")}
        </p>
      </div>
    </div>
  );
}

function ListedRow({ id, number, title, onRemove }: { id: number; number: number; title: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 ${isDragging ? "relative z-30 shadow-lg" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${title}`}
        title="Drag to reorder (or press Space, then arrow keys)"
        className="cursor-grab rounded px-1.5 text-muted hover:bg-border/40"
      >
        ⠿
      </button>
      <span className="mr-auto">
        {number}. {title}
      </span>
      <button type="button" onClick={onRemove} className={`${smallButton} text-danger`}>
        Remove<span className="sr-only"> {title}</span>
      </button>
    </li>
  );
}
