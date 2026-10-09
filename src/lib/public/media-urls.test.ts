import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const { absolutizeMedia, resultLinks } = await import("./http");
const { NextRequest } = await import("next/server");

describe("absolutizeMedia", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("rewrites /media paths in banner URLs and rich-text images", () => {
    const body = {
      quiz: {
        banner: { url: `/media/${id}`, alt: "Forest" },
        introHtml: `<p>Hi <img src="/media/${id}" alt="" /></p>`,
        title: "Not /media/ in prose",
      },
    };
    const out = absolutizeMedia(body, "https://quiz.example.org");
    expect(out.quiz.banner.url).toBe(`https://quiz.example.org/media/${id}`);
    expect(out.quiz.introHtml).toBe(`<p>Hi <img src="https://quiz.example.org/media/${id}" alt="" /></p>`);
    expect(out.quiz.title).toBe("Not /media/ in prose");
  });

  it("leaves bodies without media alone", () => {
    const body = { a: 1 };
    expect(absolutizeMedia(body, "https://x")).toBe(body);
    expect(absolutizeMedia(null, "https://x")).toBeNull();
  });
});

describe("resultLinks", () => {
  it("includes the share card image, absolute from the request", () => {
    const saved = process.env.APP_URL;
    delete process.env.APP_URL;
    const token = "a".repeat(32);
    const links = resultLinks(new NextRequest("https://preview.example.org/api/v1/quizzes/1/submit"), token);
    expect(links.shareImageUrl).toBe(`https://preview.example.org/quiz-result/${token}/card`);
    expect(links.shareUrl).toBe(`https://preview.example.org/quiz-result/${token}`);
    if (saved !== undefined) process.env.APP_URL = saved;
  });
});
