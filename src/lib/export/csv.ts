/**
 * CSV building blocks (RFC 4180) with a spreadsheet formula-injection guard.
 * Pure: shared by the export route and its tests.
 */
import sanitizeHtml from "sanitize-html";

export type Cell = string | number | boolean | null | undefined;

/** First characters that make Excel, Sheets or LibreOffice treat a cell as a formula. */
const FORMULA_START = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Neutralizes text that a spreadsheet would run as a formula (OWASP "CSV
 * injection") by prefixing an apostrophe, which spreadsheets show as text.
 * Numbers and booleans pass through as values: they can't be formulas, and
 * -0.5 must stay a number. Cells are deliberately NOT HTML-escaped: a CSV is
 * not HTML, and escaping would corrupt the data people export.
 */
export function guardCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return value.length > 0 && FORMULA_START.has(value[0]) ? `'${value}` : value;
}

/** Quotes a cell when it contains a quote, comma, CR or LF (quotes doubled). */
export function quoteCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV line, CRLF-terminated. */
export function csvRow(values: Cell[]): string {
  return values.map((v) => quoteCell(guardCell(v))).join(",") + "\r\n";
}

/** UTF-8 byte order mark, so Excel opens the file as UTF-8. */
export const BOM = "﻿";

export const MAX_CELL_TEXT = 32_000;

/** Rich text → plain text: tags dropped, entities decoded, whitespace collapsed, truncated. */
export function stripHtml(html: string | null | undefined, max = MAX_CELL_TEXT): string {
  if (!html) return "";
  const text = decodeEntities(sanitizeHtml(html.replace(/<\/(p|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, " "), { allowedTags: [], allowedAttributes: {} }))
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** "submissions-green-jobs-wide-2026-10-06.csv" (only a-z, 0-9 and hyphens). */
export function exportFilename(quizSlug: string | null, mode: "wide" | "long", date: Date): string {
  const slug = (quizSlug ?? "all").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "quiz";
  return `submissions-${slug}-${mode}-${date.toISOString().slice(0, 10)}.csv`;
}
