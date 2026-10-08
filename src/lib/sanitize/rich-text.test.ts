import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "./rich-text";

describe("sanitizeRichText", () => {
  it("keeps allowed formatting", () => {
    const html = '<p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>One</li></ul><p><a href="https://example.org">link</a></p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("removes scripts, event handlers and styles", () => {
    expect(sanitizeRichText('<p onclick="x()" style="color:red">Hi<script>alert(1)</script></p>')).toBe("<p>Hi</p>");
    expect(sanitizeRichText('<img src=x onerror="alert(1)"><p>ok</p>')).toBe("<p>ok</p>");
    expect(sanitizeRichText('<iframe src="https://evil"></iframe><p>ok</p>')).toBe("<p>ok</p>");
  });

  it("drops dangerous link schemes", () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">x</a></p>')).toBe("<p><a>x</a></p>");
    expect(sanitizeRichText('<p><a href="data:text/html,hi">x</a></p>')).toBe("<p><a>x</a></p>");
  });

  it("adds rel to links that open a new tab", () => {
    expect(sanitizeRichText('<p><a href="https://a.org" target="_blank">x</a></p>')).toBe(
      '<p><a href="https://a.org" target="_blank" rel="noopener noreferrer">x</a></p>',
    );
  });

  it("opens off-site links in a new tab for respondents only", () => {
    const html = '<p><a href="https://example.org">Out</a> <a href="/quizzes/x">In</a> <a href="mailto:a@b.org">Mail</a></p>';
    expect(sanitizeRichText(html, { external: true })).toBe(
      '<p><a href="https://example.org" target="_blank" rel="noopener noreferrer">Out</a> <a href="/quizzes/x">In</a> <a href="mailto:a@b.org">Mail</a></p>',
    );
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps images uploaded here, with only safe attributes", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(sanitizeRichText(`<p><img src="/media/${id}" alt="A fern" width="640" height="480" onerror="x()" style="a" class="b"></p>`)).toBe(
      `<p><img src="/media/${id}" alt="A fern" width="640" height="480" /></p>`,
    );
    expect(sanitizeRichText(`<img src="/media/${id}">`)).toBe(`<img src="/media/${id}" alt="" />`); // alone, decorative
    expect(sanitizeRichText(`<p><img src="/media/${id}" width="-5" height="1e9"></p>`)).toBe(`<p><img src="/media/${id}" alt="" /></p>`);
  });

  it("drops images from anywhere else", () => {
    for (const src of ["https://evil.example/x.png", "//evil.example/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/media/../admin", "/media/not-a-uuid"]) {
      expect(sanitizeRichText(`<p>Hi<img src="${src}"></p>`)).toBe("<p>Hi</p>");
    }
  });

  it("returns null for empty content", () => {
    expect(sanitizeRichText("")).toBeNull();
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText("<p></p>")).toBeNull();
    expect(sanitizeRichText("<p>&nbsp; </p><p><br></p>")).toBeNull();
    expect(sanitizeRichText("<script>x</script>")).toBeNull();
  });
});
