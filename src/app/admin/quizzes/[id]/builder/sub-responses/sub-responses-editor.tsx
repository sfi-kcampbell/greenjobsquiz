"use client";

import { closestCenter, DndContext, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLatest, useSortSensors, useUnsavedChangesWarning } from "@/components/builder/hooks";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { ActionResult } from "@/lib/content/action-result";
import type { SubResponseGroupView, SubResponseView } from "@/lib/content/sub-responses";
import {
  deleteGroupAction,
  deleteSubResponseAction,
  reorderGroupsAction,
  reorderSubResponsesAction,
  saveGroupAction,
  saveSubResponseAction,
  type SubResponsesData,
} from "./actions";

const field = "w-full rounded-md border border-border bg-surface px-2 py-1.5";
const smallButton = "rounded-md border border-border px-2.5 py-1 text-sm font-medium hover:bg-border/40 disabled:opacity-40";
const handle = "cursor-grab rounded px-2 py-1 text-muted hover:bg-border/40 disabled:cursor-not-allowed disabled:opacity-40";

type Draft = { key: string; id: number | null; groupId: number; title: string; descriptionHtml: string; url: string };
const keyOf = (id: number) => `s${id}`;
const toDraft = (x: SubResponseView): Draft => ({
  key: keyOf(x.id),
  id: x.id,
  groupId: x.groupId,
  title: x.title,
  descriptionHtml: x.descriptionHtml ?? "",
  url: x.url ?? "",
});
const same = (a: Draft, b: Draft) =>
  a.groupId === b.groupId && a.title === b.title && a.descriptionHtml === b.descriptionHtml && a.url === b.url;

/** Which cards are open survives reloads within the tab (sessionStorage), like the Questions tab. */
const openKey = (quizId: number) => `pltq:subresponses-open:${quizId}`;
function readOpen(quizId: number): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(openKey(quizId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Groups on the left (pick one, drag to reorder); the chosen group's items on
 * the right as collapsible cards, each saved on its own and dragged to reorder.
 */
export function SubResponsesEditor({
  quizId,
  initialGroups,
  initialItems,
}: {
  quizId: number;
  initialGroups: SubResponseGroupView[];
  initialItems: SubResponseView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [groups, setGroups] = useState(initialGroups);
  const [items, setItems] = useState(initialItems);
  /** Edited or new items, by card key. */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Rendered client-only (see loader.tsx), so sessionStorage is available here.
  const [open, setOpen] = useState<Set<string>>(() => readOpen(quizId));
  const [filter, setFilter] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const groupsRef = useLatest(groups);
  const itemsRef = useLatest(items);
  const groupDndId = useId();
  const itemDndId = useId();
  const sensors = useSortSensors();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  const asked = Number(params.get("group"));
  const selected = groups.find((g) => g.id === asked) ?? groups[0] ?? null;

  const dirty = Object.values(drafts).filter((d) => {
    const saved = d.id === null ? null : items.find((x) => x.id === d.id);
    return !saved || !same(d, toDraft(saved));
  });
  useUnsavedChangesWarning(dirty.length > 0);

  useEffect(() => {
    try {
      sessionStorage.setItem(openKey(quizId), JSON.stringify([...open]));
    } catch {
      // Storage can be unavailable (private mode); open state just won't persist.
    }
  }, [open, quizId]);

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [selected?.id]);

  const select = (id: number) => {
    focusHeading.current = true;
    setFilter("");
    router.replace(`${pathname}?group=${id}`, { scroll: false });
  };

  async function run(key: string, call: () => Promise<ActionResult<SubResponsesData>>, ok: string): Promise<SubResponsesData | null> {
    setBusy(true);
    const res = await call();
    setBusy(false);
    if (!res.ok) {
      setErrors((e) => ({ ...e, [key]: res.fieldErrors ?? {} }));
      setStatus({ text: res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "Couldn't save that.", error: true });
      return null;
    }
    setErrors((e) => ({ ...e, [key]: {} }));
    setGroups(res.data.groups);
    setItems(res.data.items);
    setStatus({ text: ok, error: false });
    return res.data;
  }

  const addGroup = async () => {
    const name = newGroup.trim();
    if (!name) return setStatus({ text: "Enter a group name.", error: true });
    const data = await run("new-group", () => saveGroupAction(quizId, { id: null, name }), `Added group “${name}”.`);
    if (data?.savedId) {
      setNewGroup("");
      select(data.savedId);
    }
  };

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* ------------------------------ Reordering ------------------------------ */

  const groupName = (id: string | number) => groupsRef.current.find((g) => `g${g.id}` === id)?.name ?? "group";
  const groupAnnouncements: Announcements = {
    onDragStart: ({ active }) => `Picked up group ${groupName(active.id)}.`,
    onDragOver: ({ over }) => (over ? `Moving to position ${groupsRef.current.findIndex((g) => `g${g.id}` === over.id) + 1}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Dropped at position ${groupsRef.current.findIndex((g) => `g${g.id}` === over.id) + 1}.` : "Dropped."),
    onDragCancel: () => "Reordering cancelled.",
  };

  async function onGroupDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const before = groupsRef.current;
    const from = before.findIndex((g) => `g${g.id}` === active.id);
    const to = before.findIndex((g) => `g${g.id}` === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(before, from, to);
    setGroups(moved);
    if (!(await run("groups", () => reorderGroupsAction(quizId, moved.map((g) => g.id)), "Groups reordered."))) setGroups(before);
  }

  const inGroup = (list: SubResponseView[]) => list.filter((x) => x.groupId === selected?.id);
  const itemTitle = (id: string | number) => itemsRef.current.find((x) => keyOf(x.id) === id)?.title ?? "item";
  const itemPosition = (id: string | number) => inGroup(itemsRef.current).findIndex((x) => keyOf(x.id) === id) + 1;
  const itemAnnouncements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${itemTitle(active.id)}.`,
    onDragOver: ({ over }) => (over ? `Moving to position ${itemPosition(over.id)}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Dropped at position ${itemPosition(over.id)}.` : "Dropped."),
    onDragCancel: () => "Reordering cancelled.",
  };

  async function onItemDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !selected) return;
    const before = itemsRef.current;
    const list = inGroup(before);
    const from = list.findIndex((x) => keyOf(x.id) === active.id);
    const to = list.findIndex((x) => keyOf(x.id) === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(list, from, to);
    setItems([...before.filter((x) => x.groupId !== selected.id), ...moved]);
    const ok = await run(`group-${selected.id}`, () => reorderSubResponsesAction(quizId, selected.id, moved.map((x) => x.id)), "Reordered.");
    if (!ok) setItems(before);
  }

  /* -------------------------------- Render -------------------------------- */

  const term = filter.trim().toLowerCase();
  const savedHere = selected ? inGroup(items) : [];
  const shown = term ? savedHere.filter((x) => x.title.toLowerCase().includes(term)) : savedHere;
  const pending = Object.values(drafts).filter((d) => d.id === null && d.groupId === selected?.id);
  const cardKeys = [...shown.map((x) => keyOf(x.id)), ...pending.map((d) => d.key)];
  const allOpen = cardKeys.length > 0 && cardKeys.every((k) => open.has(k));

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className={`min-h-5 text-sm ${status?.error ? "text-danger" : "text-brand"}`}>
        {status?.text ?? ""}
      </p>

      <div className="grid items-start gap-6 md:grid-cols-[16rem_1fr]">
        {/* Groups */}
        <section aria-labelledby="groups-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
          <h3 id="groups-heading" className="font-semibold">
            Groups
          </h3>
          {groups.length === 0 ? (
            <p className="text-sm text-muted">No groups yet. Add one, for example &ldquo;Jobs&rdquo;.</p>
          ) : (
            <DndContext id={groupDndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onGroupDragEnd} accessibility={{ announcements: groupAnnouncements }}>
              <SortableContext items={groups.map((g) => `g${g.id}`)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-1" aria-label="Groups">
                  {groups.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      count={items.filter((x) => x.groupId === g.id).length}
                      selected={g.id === selected?.id}
                      onSelect={() => select(g.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
            <label htmlFor="new-group" className="font-medium">
              New group
            </label>
            <div className="flex gap-2">
              <input
                id="new-group"
                value={newGroup}
                maxLength={60}
                placeholder="Jobs"
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGroup();
                  }
                }}
                aria-invalid={errors["new-group"]?.name ? true : undefined}
                className={`${field} min-w-0`}
              />
              <button type="button" onClick={addGroup} disabled={busy} className="shrink-0 rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
                Add group
              </button>
            </div>
          </div>
        </section>

        {/* The chosen group's items */}
        {selected ? (
          <section aria-labelledby="group-heading" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="group-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
                {selected.name}
              </h3>
              <span className="text-sm text-muted">
                {savedHere.length} item{savedHere.length === 1 ? "" : "s"}
              </span>
            </div>
            <GroupSettings
              key={selected.id}
              group={selected}
              count={savedHere.length}
              busy={busy}
              error={errors[`g${selected.id}`]?.name}
              onRename={(name) => run(`g${selected.id}`, () => saveGroupAction(quizId, { id: selected.id, name }), `Renamed to “${name}”.`)}
              onDelete={() => {
                if (!window.confirm(`Delete the group “${selected.name}”?`)) return;
                run(`g${selected.id}`, () => deleteGroupAction(quizId, selected.id, selected.name), `Deleted group “${selected.name}”.`).then(
                  (data) => data && router.replace(pathname, { scroll: false }),
                );
              }}
            />

            {savedHere.length > 0 && (
              <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
                <div className="flex flex-col gap-1">
                  <label htmlFor="item-filter">Filter items</label>
                  <input id="item-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} className={`${field} w-56`} />
                </div>
                <button
                  type="button"
                  onClick={() => setOpen((s) => (allOpen ? new Set([...s].filter((k) => !cardKeys.includes(k))) : new Set([...s, ...cardKeys])))}
                  className="text-brand underline underline-offset-4"
                >
                  {allOpen ? "Collapse all" : "Expand all"}
                </button>
              </div>
            )}
            {term && <p className="text-sm text-muted">Clear the filter to drag items into a new order.</p>}
            {savedHere.length === 0 && pending.length === 0 && <p className="text-sm text-muted">No items in this group yet.</p>}
            {term && shown.length === 0 && <p className="text-sm text-muted">No items match &ldquo;{filter.trim()}&rdquo;.</p>}

            <DndContext id={itemDndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDragEnd} accessibility={{ announcements: itemAnnouncements }}>
              <SortableContext items={shown.map((x) => keyOf(x.id))} strategy={verticalListSortingStrategy}>
                <ol className="flex flex-col gap-2" aria-label={`Items in ${selected.name}`}>
                  {shown.map((x) => {
                    const draft = drafts[keyOf(x.id)] ?? toDraft(x);
                    return (
                      <ItemCard
                        key={x.id}
                        draft={draft}
                        dirty={!same(draft, toDraft(x))}
                        usedBy={x.usedBy}
                        quizId={quizId}
                        groups={groups}
                        open={open.has(draft.key)}
                        canDrag={!term}
                        busy={busy}
                        errors={errors[draft.key] ?? {}}
                        onToggle={() => toggle(draft.key)}
                        onChange={(d) => setDrafts((ds) => ({ ...ds, [d.key]: d }))}
                        onSave={async (d) => {
                          const ok = await run(d.key, () => saveSubResponseAction(quizId, { ...d }), `Saved “${d.title.trim()}”.`);
                          if (ok) setDrafts(({ [d.key]: _, ...rest }) => rest);
                        }}
                        onDelete={() => {
                          const where = x.usedBy.length ? ` It's listed under ${x.usedBy.map((r) => r.title).join(", ")}.` : "";
                          if (!window.confirm(`Delete “${x.title}”?${where}`)) return;
                          run(draft.key, () => deleteSubResponseAction(quizId, x.id, x.title), `Deleted “${x.title}”.`).then(
                            (ok) => ok && setDrafts(({ [draft.key]: _, ...rest }) => rest),
                          );
                        }}
                      />
                    );
                  })}
                </ol>
              </SortableContext>
            {pending.length > 0 && (
              <ol className="flex flex-col gap-2" aria-label="New items">
                {pending.map((d) => (
                  <ItemCard
                    key={d.key}
                    draft={d}
                    dirty
                    usedBy={[]}
                    quizId={quizId}
                    groups={groups}
                    open={open.has(d.key)}
                    canDrag={false}
                    busy={busy}
                    errors={errors[d.key] ?? {}}
                    onToggle={() => toggle(d.key)}
                    onChange={(n) => setDrafts((ds) => ({ ...ds, [n.key]: n }))}
                    onSave={async (n) => {
                      const data = await run(n.key, () => saveSubResponseAction(quizId, { ...n }), `Added “${n.title.trim()}”.`);
                      if (!data) return;
                      setDrafts(({ [n.key]: _, ...rest }) => rest);
                      // The saved card stays open where the new one was.
                      if (data.savedId) setOpen((s) => new Set([...[...s].filter((k) => k !== n.key), keyOf(data.savedId!)]));
                    }}
                    onDelete={() => setDrafts(({ [d.key]: _, ...rest }) => rest)}
                  />
                ))}
              </ol>
            )}
            </DndContext>
            <div>
              <button
                type="button"
                onClick={() => {
                  const key = `new-${Date.now()}`;
                  setDrafts((ds) => ({ ...ds, [key]: { key, id: null, groupId: selected.id, title: "", descriptionHtml: "", url: "" } }));
                  setOpen((s) => new Set([...s, key]));
                  setFilter("");
                  requestAnimationFrame(() => document.getElementById(`sr-title-${key}`)?.focus());
                }}
                className="text-sm font-medium text-brand underline underline-offset-4"
              >
                + Add to {selected.name}
              </button>
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted">Add a group to start listing items.</p>
        )}
      </div>
    </div>
  );
}

function GroupRow({ group, count, selected, onSelect }: { group: SubResponseGroupView; count: number; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: `g${group.id}` });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md ${selected ? "bg-brand/10" : ""} ${isDragging ? "relative z-30 bg-surface shadow-lg" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder group ${group.name}`}
        title="Drag to reorder (or press Space, then arrow keys)"
        className={handle}
      >
        ⠿
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-border/30 ${selected ? "font-semibold" : ""}`}
      >
        <span className="truncate">{group.name}</span>
        <span className="shrink-0 text-xs text-muted">
          {count}
          <span className="sr-only"> item{count === 1 ? "" : "s"}</span>
        </span>
      </button>
    </li>
  );
}

function GroupSettings({
  group,
  count,
  busy,
  error,
  onRename,
  onDelete,
}: {
  group: SubResponseGroupView;
  count: number;
  busy: boolean;
  error?: string;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  return (
    <details className="rounded-md border border-border bg-surface p-3 text-sm">
      <summary className="cursor-pointer font-medium">Group settings</summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`group-name-${group.id}`}>Group name</label>
          <input
            id={`group-name-${group.id}`}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={`${field} w-56`}
          />
        </div>
        <button type="button" disabled={busy || !name.trim() || name.trim() === group.name} onClick={() => onRename(name.trim())} className={smallButton}>
          Rename
        </button>
        <button
          type="button"
          disabled={busy || count > 0}
          onClick={onDelete}
          className={`${smallButton} text-danger`}
          aria-describedby={count > 0 ? `group-delete-hint-${group.id}` : undefined}
        >
          Delete group
        </button>
        {count > 0 && (
          <p id={`group-delete-hint-${group.id}`} className="basis-full text-muted">
            Move or delete its items to delete the group.
          </p>
        )}
        {error && <p className="basis-full text-danger">{error}</p>}
      </div>
    </details>
  );
}

function ItemCard({
  draft,
  dirty,
  usedBy,
  quizId,
  groups,
  open,
  canDrag,
  busy,
  errors,
  onToggle,
  onChange,
  onSave,
  onDelete,
}: {
  draft: Draft;
  dirty: boolean;
  usedBy: { id: number; title: string }[];
  quizId: number;
  groups: SubResponseGroupView[];
  open: boolean;
  canDrag: boolean;
  busy: boolean;
  errors: Record<string, string>;
  onToggle: () => void;
  onChange: (d: Draft) => void;
  onSave: (d: Draft) => void;
  onDelete: () => void;
}) {
  const saved = draft.id !== null;
  const dragDisabled = !saved || dirty || !canDrag;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: draft.key,
    disabled: dragDisabled,
  });
  const id = (f: string) => `sr-${f}-${draft.key}`;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const label = draft.title.trim() || "New sub-response";
  const bodyId = id("body");
  const err = (f: string) =>
    errors[f] ? (
      <p id={id(`${f}-error`)} className="text-xs text-danger">
        {errors[f]}
      </p>
    ) : null;
  const handleLabel = !saved
    ? `Save ${label} before reordering`
    : dirty
      ? `Save ${label} before reordering`
      : !canDrag
        ? `Clear the filter to reorder ${label}`
        : `Reorder ${label}`;

  return (
    <li
      ref={saved ? setNodeRef : undefined}
      style={saved ? { transform: CSS.Translate.toString(transform), transition } : undefined}
      className={`rounded-lg border bg-surface text-sm ${isDragging ? "relative z-30 shadow-lg" : ""} ${dirty ? "border-brand/50" : "border-border"}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          ref={saved ? setActivatorNodeRef : undefined}
          {...(saved ? attributes : {})}
          {...(saved ? listeners : {})}
          disabled={dragDisabled}
          aria-label={handleLabel}
          title={dragDisabled ? handleLabel : "Drag to reorder (or press Space, then arrow keys)"}
          className={handle}
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-border/30"
        >
          <span aria-hidden className="w-4 text-muted">
            {open ? "▾" : "▸"}
          </span>
          <span className={`truncate font-medium ${draft.title.trim() ? "" : "text-muted italic"}`}>{label}</span>
          {draft.url && (
            <span className="shrink-0 text-xs text-muted" title={draft.url}>
              ↗<span className="sr-only"> (has a link)</span>
            </span>
          )}
          {saved && (
            <span className="ml-auto shrink-0 text-xs text-muted">
              Used by {usedBy.length} response{usedBy.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {dirty && (
          <span className="text-brand" title="Unsaved changes">
            ●<span className="sr-only">Unsaved changes</span>
          </span>
        )}
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={id("title")} className="font-medium">
                Title
              </label>
              <input
                id={id("title")}
                value={draft.title}
                maxLength={120}
                onChange={(e) => set({ title: e.target.value })}
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={errors.title ? id("title-error") : undefined}
                className={field}
              />
              {err("title")}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={id("group")} className="font-medium">
                Group
              </label>
              <select id={id("group")} value={draft.groupId} onChange={(e) => set({ groupId: Number(e.target.value) })} className={field}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="font-medium">Text (optional)</span>
              <RichTextEditor
                id={id("description")}
                label={`Text for ${label}`}
                value={draft.descriptionHtml}
                onChange={(html) => set({ descriptionHtml: html })}
                quizId={quizId}
              />
              {err("descriptionHtml")}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={id("url")} className="font-medium">
                Link (optional)
              </label>
              <input
                id={id("url")}
                type="url"
                value={draft.url}
                maxLength={2000}
                placeholder="https://"
                onChange={(e) => set({ url: e.target.value })}
                aria-invalid={errors.url ? true : undefined}
                aria-describedby={errors.url ? id("url-error") : undefined}
                className={field}
              />
              {err("url")}
            </div>
          </div>
          {saved && (
            <p className="text-muted">
              {usedBy.length ? (
                <>
                  Used by:{" "}
                  {usedBy.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && ", "}
                      <Link href={`/admin/quizzes/${quizId}/builder/responses/${r.id}`} className="text-brand underline underline-offset-4">
                        {r.title}
                      </Link>
                    </span>
                  ))}
                </>
              ) : (
                "Not listed under any response yet."
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => onSave(draft)} className="rounded-md bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
              Save<span className="sr-only"> {label}</span>
            </button>
            <button type="button" disabled={busy} onClick={onDelete} className={`${smallButton} ml-auto text-danger`}>
              {saved ? "Delete" : "Cancel"}
              <span className="sr-only"> {label}</span>
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
