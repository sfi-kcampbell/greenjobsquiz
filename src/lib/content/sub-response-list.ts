/**
 * The sub-responses a response shows, grouped under their group's name. Pure,
 * so the result page, Simulate and tests share it.
 */
import type { QuizContent } from "./versions";

export type SubResponseItem = { title: string; description: string | null; url: string | null };
export type SubResponseList = { group: string; items: SubResponseItem[] }[];

/**
 * Groups in group order, items in the response's own order. `limit`: at most
 * this many per group (null: all). Empty groups are left out.
 */
export function subResponsesFor(content: QuizContent, responseId: number, limit: number | null = null): SubResponseList {
  const response = content.responses.find((r) => r.id === responseId);
  if (!response?.subResponseIds?.length || limit === 0) return [];
  const byId = new Map((content.subResponses ?? []).map((x) => [x.id, x]));
  const listed = response.subResponseIds.map((id) => byId.get(id)).filter((x) => x !== undefined);
  return (content.groups ?? [])
    .map((g) => {
      const items = listed.filter((x) => x.groupId === g.id).map(({ title, description, url }) => ({ title, description, url }));
      return { group: g.name, items: limit === null ? items : items.slice(0, limit) };
    })
    .filter((g) => g.items.length > 0);
}
