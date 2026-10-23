"use client";

import Link from "next/link";
import { useState } from "react";
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

type Draft = { key: string; id: number | null; groupId: number; title: string; description: string; url: string };
const toDraft = (x: SubResponseView): Draft => ({
  key: `s${x.id}`,
  id: x.id,
  groupId: x.groupId,
  title: x.title,
  description: x.description ?? "",
  url: x.url ?? "",
});
const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** Groups (headings such as "Jobs") and their items, each saved on its own. */
export function SubResponsesEditor({
  quizId,
  initialGroups,
  initialItems,
}: {
  quizId: number;
  initialGroups: SubResponseGroupView[];
  initialItems: SubResponseView[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [newGroup, setNewGroup] = useState("");
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);

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
    if (await run("new-group", () => saveGroupAction(quizId, { id: null, name }), `Added group “${name}”.`)) setNewGroup("");
  };

  return (
    <div className="flex flex-col gap-6">
      <p role="status" className={`text-sm ${status?.error ? "text-danger" : "text-brand"}`}>
        {status?.text ?? ""}
      </p>

      <section aria-labelledby="groups-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h3 id="groups-heading" className="font-semibold">
          Groups
        </h3>
        {groups.length === 0 && <p className="text-sm text-muted">No groups yet. Add one, for example &ldquo;Jobs&rdquo;.</p>}
        <ul className="flex flex-col gap-2">
          {groups.map((g, i) => (
            <GroupRow
              key={g.id}
              group={g}
              index={i}
              count={groups.length}
              items={items.filter((x) => x.groupId === g.id).length}
              busy={busy}
              error={errors[`g${g.id}`]?.name}
              onRename={(name) => run(`g${g.id}`, () => saveGroupAction(quizId, { id: g.id, name }), `Renamed to “${name}”.`)}
              onMove={(to) => run(`g${g.id}`, () => reorderGroupsAction(quizId, move(groups, i, to).map((x) => x.id)), "Groups reordered.")}
              onDelete={() => {
                if (!window.confirm(`Delete the group “${g.name}”?`)) return;
                run(`g${g.id}`, () => deleteGroupAction(quizId, g.id, g.name), `Deleted group “${g.name}”.`);
              }}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-group" className="font-medium">
              New group
            </label>
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
              className={`${field} w-56`}
            />
          </div>
          <button type="button" onClick={addGroup} disabled={busy} className="rounded-md bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
            Add group
          </button>
        </div>
      </section>

      {groups.map((g) => {
        const saved = items.filter((x) => x.groupId === g.id);
        const pending = drafts.filter((d) => d.groupId === g.id && d.id === null);
        const headingId = `group-${g.id}`;
        return (
          <section key={g.id} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h3 id={headingId} className="text-lg font-semibold">
              {g.name}
            </h3>
            {saved.length === 0 && pending.length === 0 && <p className="text-sm text-muted">None yet.</p>}
            <ol className="flex flex-col gap-3">
              {saved.map((x, i) => (
                <ItemCard
                  key={x.id}
                  draft={drafts.find((d) => d.id === x.id) ?? toDraft(x)}
                  usedBy={x.usedBy}
                  quizId={quizId}
                  groups={groups}
                  index={i}
                  count={saved.length}
                  busy={busy}
                  errors={errors[`s${x.id}`] ?? {}}
                  onChange={(d) => setDrafts((ds) => [...ds.filter((y) => y.key !== d.key), d])}
                  onSave={async (d) => {
                    const ok = await run(`s${x.id}`, () => saveSubResponseAction(quizId, { ...d }), `Saved “${d.title.trim()}”.`);
                    if (ok) setDrafts((ds) => ds.filter((y) => y.key !== d.key));
                  }}
                  onMove={(to) => run(`s${x.id}`, () => reorderSubResponsesAction(quizId, g.id, move(saved, i, to).map((y) => y.id)), "Reordered.")}
                  onDelete={() => {
                    const where = x.usedBy.length ? ` It's listed under ${x.usedBy.map((r) => r.title).join(", ")}.` : "";
                    if (!window.confirm(`Delete “${x.title}”?${where}`)) return;
                    run(`s${x.id}`, () => deleteSubResponseAction(quizId, x.id, x.title), `Deleted “${x.title}”.`);
                  }}
                />
              ))}
              {pending.map((d) => (
                <ItemCard
                  key={d.key}
                  draft={d}
                  usedBy={[]}
                  quizId={quizId}
                  groups={groups}
                  index={0}
                  count={1}
                  busy={busy}
                  errors={errors[d.key] ?? {}}
                  onChange={(n) => setDrafts((ds) => ds.map((y) => (y.key === n.key ? n : y)))}
                  onSave={async (n) => {
                    const ok = await run(n.key, () => saveSubResponseAction(quizId, { ...n }), `Added “${n.title.trim()}”.`);
                    if (ok) setDrafts((ds) => ds.filter((y) => y.key !== n.key));
                  }}
                  onDelete={() => setDrafts((ds) => ds.filter((y) => y.key !== d.key))}
                />
              ))}
            </ol>
            <div>
              <button
                type="button"
                onClick={() => setDrafts((ds) => [...ds, { key: `new-${Date.now()}`, id: null, groupId: g.id, title: "", description: "", url: "" }])}
                className="text-sm font-medium text-brand underline underline-offset-4"
              >
                + Add to {g.name}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GroupRow({
  group,
  index,
  count,
  items,
  busy,
  error,
  onRename,
  onMove,
  onDelete,
}: {
  group: SubResponseGroupView;
  index: number;
  count: number;
  items: number;
  busy: boolean;
  error?: string;
  onRename: (name: string) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  const id = `group-name-${group.id}`;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={id} className="sr-only">
        Name of group {index + 1}
      </label>
      <input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} className={`${field} w-56`} />
      <button type="button" disabled={busy || !name.trim() || name.trim() === group.name} onClick={() => onRename(name.trim())} className={smallButton}>
        Rename<span className="sr-only"> {group.name}</span>
      </button>
      <button type="button" disabled={busy || index === 0} onClick={() => onMove(index - 1)} className={smallButton}>
        Move up<span className="sr-only"> {group.name}</span>
      </button>
      <button type="button" disabled={busy || index === count - 1} onClick={() => onMove(index + 1)} className={smallButton}>
        Move down<span className="sr-only"> {group.name}</span>
      </button>
      <button type="button" disabled={busy || items > 0} onClick={onDelete} title={items > 0 ? "Move or delete its sub-responses first" : undefined} className={`${smallButton} text-danger`}>
        Delete<span className="sr-only"> group {group.name}</span>
      </button>
      <span className="text-muted">
        {items} item{items === 1 ? "" : "s"}
      </span>
      {error && <span className="text-danger">{error}</span>}
    </li>
  );
}

function ItemCard({
  draft,
  usedBy,
  quizId,
  groups,
  index,
  count,
  busy,
  errors,
  onChange,
  onSave,
  onMove,
  onDelete,
}: {
  draft: Draft;
  usedBy: { id: number; title: string }[];
  quizId: number;
  groups: SubResponseGroupView[];
  index: number;
  count: number;
  busy: boolean;
  errors: Record<string, string>;
  onChange: (d: Draft) => void;
  onSave: (d: Draft) => void;
  onMove?: (to: number) => void;
  onDelete: () => void;
}) {
  const id = (f: string) => `sr-${f}-${draft.key}`;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const label = draft.title.trim() || "new sub-response";
  const err = (f: string) =>
    errors[f] ? (
      <p id={id(`${f}-error`)} className="text-xs text-danger">
        {errors[f]}
      </p>
    ) : null;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
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
        <div className="flex flex-col gap-1">
          <label htmlFor={id("description")} className="font-medium">
            Text (optional)
          </label>
          <textarea
            id={id("description")}
            value={draft.description}
            maxLength={500}
            rows={2}
            onChange={(e) => set({ description: e.target.value })}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? id("description-error") : undefined}
            className={field}
          />
          {err("description")}
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
      {draft.id !== null && (
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
        {onMove && (
          <>
            <button type="button" disabled={busy || index === 0} onClick={() => onMove(index - 1)} className={smallButton}>
              Move up<span className="sr-only"> {label}</span>
            </button>
            <button type="button" disabled={busy || index === count - 1} onClick={() => onMove(index + 1)} className={smallButton}>
              Move down<span className="sr-only"> {label}</span>
            </button>
          </>
        )}
        <button type="button" disabled={busy} onClick={onDelete} className={`${smallButton} ml-auto text-danger`}>
          {draft.id === null ? "Cancel" : "Delete"}
          <span className="sr-only"> {label}</span>
        </button>
      </div>
    </li>
  );
}
