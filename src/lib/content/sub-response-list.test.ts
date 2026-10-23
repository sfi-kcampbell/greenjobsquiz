import { describe, expect, it } from "vitest";
import { localizeContent, sourceFields } from "./localize";
import { subResponsesFor } from "./sub-response-list";
import { diffContent, type QuizContent } from "./versions";

const response = (id: number, title: string, subResponseIds: number[]) => ({
  id,
  title,
  excerpt: null,
  bodyHtml: "",
  ctaUrl: null,
  ctaLabel: null,
  position: id,
  weights: {},
  subResponseIds,
});

const content: QuizContent = {
  title: "Green Jobs",
  introHtml: "",
  scoring: { normalizePerCategory: true, runnersUpCount: 2, defaultResultId: null, subResponseLimit: 1 },
  categories: [],
  questions: [],
  responses: [response(1, "Social", [12, 10, 20, 11]), response(2, "Analyst", [11]), response(3, "Lonely", [])],
  groups: [
    { id: 7, name: "Jobs", position: 0 },
    { id: 8, name: "Clubs", position: 1 },
    { id: 9, name: "Empty", position: 2 },
  ],
  subResponses: [
    { id: 10, groupId: 7, title: "DJ", description: "Music", url: "https://example.org/dj", position: 0 },
    { id: 11, groupId: 7, title: "Sales", description: null, url: null, position: 1 },
    { id: 12, groupId: 7, title: "Teacher", description: null, url: null, position: 2 },
    { id: 20, groupId: 8, title: "Drama club", description: null, url: null, position: 0 },
  ],
  translations: { es: { "group:7:name": "Empleos", "subresponse:10:title": "Pinchadiscos" } },
};

describe("subResponsesFor", () => {
  it("lists groups in group order and items in the response's order, leaving out empty groups", () => {
    expect(subResponsesFor(content, 1)).toEqual([
      {
        group: "Jobs",
        items: [
          { title: "Teacher", description: null, url: null },
          { title: "DJ", description: "Music", url: "https://example.org/dj" },
          { title: "Sales", description: null, url: null },
        ],
      },
      { group: "Clubs", items: [{ title: "Drama club", description: null, url: null }] },
    ]);
  });

  it("limits each group (runners-up), with 0 meaning none", () => {
    expect(subResponsesFor(content, 1, 1).map((g) => [g.group, g.items.map((x) => x.title)])).toEqual([
      ["Jobs", ["Teacher"]],
      ["Clubs", ["Drama club"]],
    ]);
    expect(subResponsesFor(content, 1, 0)).toEqual([]);
    expect(subResponsesFor(content, 3)).toEqual([]);
    expect(subResponsesFor(content, 99)).toEqual([]);
  });

  it("shares items between responses (many-to-many)", () => {
    expect(subResponsesFor(content, 2)[0].items.map((x) => x.title)).toEqual(["Sales"]);
  });

  it("translates group names and items, falling back to English", () => {
    const es = subResponsesFor(localizeContent(content, "es"), 1);
    expect(es[0].group).toBe("Empleos");
    expect(es[0].items.map((x) => x.title)).toEqual(["Teacher", "Pinchadiscos", "Sales"]);
    expect(sourceFields(content).filter((f) => f.kind === "group" || f.kind === "subresponse").map((f) => f.key)).toEqual([
      "group:7:name",
      "subresponse:10:title",
      "subresponse:10:description",
      "subresponse:11:title",
      "subresponse:12:title",
      "group:8:name",
      "subresponse:20:title",
      "group:9:name",
    ]);
  });
});

describe("diffContent for sub-responses", () => {
  it("lists added, edited, removed, renamed, reordered and re-linked items", () => {
    const next = structuredClone(content);
    next.groups[0].name = "Careers";
    next.subResponses[0].title = "Radio DJ";
    next.subResponses = next.subResponses.filter((x) => x.id !== 20);
    next.subResponses.push({ id: 30, groupId: 8, title: "Chess club", description: null, url: null, position: 1 });
    next.responses[1].subResponseIds = [11, 12];
    next.scoring.subResponseLimit = 2;
    expect(diffContent(content, next)).toEqual([
      "Changed scoring settings",
      "Changed the sub-responses for response “Analyst”",
      "Renamed group “Jobs” to “Careers”",
      "Edited sub-response “Radio DJ”",
      "Added sub-response “Chess club”",
      "Removed sub-response “Drama club”",
    ]);
    const swapped = structuredClone(content);
    swapped.subResponses = [swapped.subResponses[1], swapped.subResponses[0], ...swapped.subResponses.slice(2)];
    expect(diffContent(content, swapped)).toEqual(["Reordered sub-responses"]);
  });
});
