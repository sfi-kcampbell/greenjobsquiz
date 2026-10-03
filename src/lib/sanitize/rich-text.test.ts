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

  it("returns null for empty content", () => {
    expect(sanitizeRichText("")).toBeNull();
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText("<p></p>")).toBeNull();
    expect(sanitizeRichText("<p>&nbsp; </p><p><br></p>")).toBeNull();
    expect(sanitizeRichText("<script>x</script>")).toBeNull();
  });
});
