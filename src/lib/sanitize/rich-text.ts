import sanitizeHtml from "sanitize-html";

/**
 * The single allow-list for authored rich text (question help, answer and
 * response bodies). Runs when content is saved and again whenever it is
 * served, so older or hand-edited rows are still cleaned on the way out.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "blockquote", "h3", "h4", "code"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    // Tiptap emits <b>/<i> from pasted content in some browsers.
    b: "strong",
    i: "em",
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        href: attribs.href ?? "",
        ...(attribs.target === "_blank" ? { target: "_blank", rel: "noopener noreferrer" } : {}),
      },
    }),
  },
};

/** For respondents: links to other sites open in a new tab (spec: off-site links). */
const EXTERNAL_OPTIONS: sanitizeHtml.IOptions = {
  ...OPTIONS,
  transformTags: {
    ...OPTIONS.transformTags,
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const offSite = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: {
          href,
          ...(offSite || attribs.target === "_blank" ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        },
      };
    },
  },
};

/**
 * Cleans authored HTML. Returns null for empty content (e.g. a lone empty paragraph).
 * `external`: absolute http(s) links open in a new tab (use for what respondents see).
 */
export function sanitizeRichText(html: string | null | undefined, opts: { external?: boolean } = {}): string | null {
  if (!html) return null;
  const clean = sanitizeHtml(html, opts.external ? EXTERNAL_OPTIONS : OPTIONS).trim();
  const text = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim();
  return text ? clean : null;
}
