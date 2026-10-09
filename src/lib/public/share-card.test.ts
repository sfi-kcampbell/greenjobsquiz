import { describe, expect, it } from "vitest";
import { cardContent, shareMetadataText, trimText } from "./share-card";
import type { ResultPayload } from "./sessions";

const base: ResultPayload = {
  quiz: { id: 1, title: "Green Jobs", slug: "green-jobs", deliveryMode: "hosted" },
  createdAt: "2026-10-09T00:00:00.000Z",
  attemptNo: 1,
  status: "scored",
  isClose: false,
  isFallback: false,
  match: { resultId: 1, title: "Forester", bodyHtml: null, excerpt: "Work among trees.", ctaUrl: null, ctaLabel: null, percent: 86, raw: 0.9 },
  runnersUp: [],
  scores: {
    1: { raw: 1, normalized: 1, percent: 40, label: "Analytical", color: "#2f6690" },
    2: { raw: 1, normalized: 1, percent: 90, label: "Outdoors", color: "#3f7d4e" },
    3: { raw: 1, normalized: 1, percent: 10, label: "Creative", color: "#8e4f9e" },
    4: { raw: 1, normalized: 1, percent: 60, label: "Hands-on", color: "#8a6a2f" },
  },
};

describe("share card", () => {
  it("shows the match, its percentage and the top 3 categories", () => {
    const c = cardContent(base);
    expect([c.lead, c.title, c.percent]).toEqual(["My best match", "Forester", 86]);
    expect(c.categories.map((x) => x.label)).toEqual(["Outdoors", "Hands-on", "Analytical"]);
    expect(c.alt).toBe("Green Jobs result: my best match is Forester, a 86% match.");
  });

  it("leaves out the percentage for a fallback, and handles no match", () => {
    expect(cardContent({ ...base, isFallback: true }).percent).toBeNull();
    const none = cardContent({ ...base, match: null });
    expect([none.title, none.percent]).toEqual(["Take the quiz to find your match", null]);
  });

  it("trims long text on a word boundary", () => {
    const long = "Environmental Restoration Specialist and Wetland Ecology Field Coordinator";
    const c = cardContent({ ...base, match: { ...base.match!, title: long } });
    expect(c.title.length).toBeLessThanOrEqual(48);
    expect(c.title.endsWith("…")).toBe(true);
    expect(trimText("short", 10)).toBe("short");
  });

  it("writes link-preview text", () => {
    expect(shareMetadataText(base)).toEqual({ title: "I got Forester on Green Jobs", description: "Work among trees." });
    expect(shareMetadataText({ ...base, match: null }).title).toBe("My result on Green Jobs");
  });
});
