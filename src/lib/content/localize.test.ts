import { describe, expect, it } from "vitest";
import { localizeContent, sourceFields, translationProgress } from "./localize";
import { diffContent, type QuizContent } from "./versions";

const content: QuizContent = {
  title: "Green Jobs",
  introHtml: "<p>Hi</p>",
  scoring: { normalizePerCategory: true, runnersUpCount: 2, defaultResultId: null, subResponseLimit: 3 },
  categories: [{ id: 1, name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1, position: 0 }],
  questions: [
    {
      id: 10,
      title: "Weekend?",
      helpHtml: null,
      type: "single",
      minSelect: 1,
      maxSelect: 1,
      required: true,
      splitMulti: false,
      part: "scored",
      position: 0,
      answers: [
        { id: 100, label: "Hike", bodyHtml: "<p>Trails</p>", position: 0, weights: { "1": 3 } },
        { id: 101, label: "Read", bodyHtml: null, position: 1, weights: {} },
      ],
    },
  ],
  responses: [{ id: 50, title: "Forester", excerpt: "Trees", bodyHtml: "<p>Forests</p>", ctaUrl: "https://example.org", ctaLabel: "More", position: 0, weights: { "1": 5 }, subResponseIds: [] }],
  groups: [],
  subResponses: [],
  translations: { es: { "quiz:0:title": "Empleos verdes", "question:10:title": "¿Fin de semana?", "answer:100:label": "Caminata", "category:1:name": "Aire libre" } },
};

describe("localizeContent", () => {
  it("replaces translated fields and leaves the rest in English", () => {
    const es = localizeContent(content, "es");
    expect(es.title).toBe("Empleos verdes");
    expect(es.introHtml).toBe("<p>Hi</p>");
    expect(es.questions[0].title).toBe("¿Fin de semana?");
    expect(es.questions[0].answers.map((a) => a.label)).toEqual(["Caminata", "Read"]);
    expect(es.questions[0].answers[0].bodyHtml).toBe("<p>Trails</p>");
    expect(es.categories[0].name).toBe("Aire libre");
    expect(es.responses[0].title).toBe("Forester");
  });

  it("keeps ids, order and weights, so scoring is the same", () => {
    const es = localizeContent(content, "es");
    expect(es.questions[0].answers.map((a) => [a.id, a.weights])).toEqual(content.questions[0].answers.map((a) => [a.id, a.weights]));
    expect(localizeContent(content, "fr")).toBe(content);
    expect(localizeContent(content, "en")).toBe(content);
  });

  it("lists every non-empty English text once, and counts progress", () => {
    const keys = sourceFields(content).map((f) => f.key);
    expect(keys).toEqual([
      "quiz:0:title",
      "quiz:0:introHtml",
      "category:1:name",
      "question:10:title",
      "answer:100:label",
      "answer:100:bodyHtml",
      "answer:101:label",
      "response:50:title",
      "response:50:excerpt",
      "response:50:bodyHtml",
      "response:50:ctaLabel",
    ]);
    expect(translationProgress(content, "es")).toEqual({ done: 4, total: 11 });
  });

  it("summarises translation changes per language in the draft's changes", () => {
    const next = structuredClone(content);
    next.translations.es["answer:101:label"] = "Leer";
    next.translations.fr = { "quiz:0:title": "Emplois verts" };
    expect(diffContent(content, next)).toEqual(["Updated Spanish translations (1)", "Updated French translations (1)"]);
  });
});
