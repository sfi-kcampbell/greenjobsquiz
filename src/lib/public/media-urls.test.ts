import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const { absolutizeMedia } = await import("./http");

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
