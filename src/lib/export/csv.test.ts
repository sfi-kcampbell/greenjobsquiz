import { describe, expect, it } from "vitest";
import { BOM, csvRow, exportFilename, guardCell, quoteCell, stripHtml } from "./csv";

/** A small RFC 4180 parser, to prove what a spreadsheet would read back. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else {
      cell += c;
    }
  }
  return rows;
}

describe("guardCell", () => {
  it.each(["=", "+", "-", "@", "\t", "\r"])("prefixes text starting with %j", (c) => {
    expect(guardCell(`${c}cmd`)).toBe(`'${c}cmd`);
  });

  it("neutralizes the classic payloads", () => {
    expect(guardCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(guardCell("@SUM(1+1)*cmd|' /C calc'!A0")).toBe("'@SUM(1+1)*cmd|' /C calc'!A0");
    expect(guardCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
  });

  it("leaves safe text, numbers and negative numbers alone", () => {
    expect(guardCell("Forester")).toBe("Forester");
    expect(guardCell("a=b")).toBe("a=b");
    expect(guardCell(-0.5)).toBe("-0.5");
    expect(guardCell(42)).toBe("42");
    expect(guardCell(true)).toBe("true");
    expect(guardCell(null)).toBe("");
    expect(guardCell(Number.NaN)).toBe("");
    expect(guardCell("")).toBe("");
  });

  it("does not HTML-escape", () => {
    expect(guardCell("<b>A & B</b>")).toBe("<b>A & B</b>");
  });
});

describe("rows", () => {
  it("quotes only when needed, doubling quotes", () => {
    expect(quoteCell("plain")).toBe("plain");
    expect(quoteCell('say "hi"')).toBe('"say ""hi"""');
    expect(quoteCell("a,b")).toBe('"a,b"');
    expect(quoteCell("line\nbreak")).toBe('"line\nbreak"');
    expect(quoteCell("cr\r")).toBe('"cr\r"');
  });

  it("round-trips through a CSV parser, guard included", () => {
    const values = ["=cmd|' /C calc'!A0", 'He said "go", then left', "multi\r\nline", -3.25, "", null, "Ünïcödé ✓", "+1"];
    const text = csvRow(["h1", "h2"]) + csvRow(values);
    expect(text.endsWith("\r\n")).toBe(true);
    const [header, row] = parseCsv(text);
    expect(header).toEqual(["h1", "h2"]);
    expect(row).toEqual(["'=cmd|' /C calc'!A0", 'He said "go", then left', "multi\r\nline", "-3.25", "", "", "Ünïcödé ✓", "'+1"]);
  });

  it("BOM is the UTF-8 byte order mark", () => {
    expect(new TextEncoder().encode(BOM)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  });
});

describe("stripHtml", () => {
  it("drops tags, decodes entities, collapses whitespace", () => {
    expect(stripHtml("<p>Trees &amp; <strong>forests</strong></p><p>Second&nbsp;para</p>")).toBe("Trees & forests Second para");
    expect(stripHtml("<ul><li>One</li><li>Two</li></ul>")).toBe("One Two");
    expect(stripHtml(null)).toBe("");
  });

  it("truncates long text", () => {
    const out = stripHtml(`<p>${"x".repeat(40_000)}</p>`);
    expect(out.length).toBe(32_000);
    expect(out.endsWith("…")).toBe(true);
    expect(stripHtml("<p>abcdef</p>", 4)).toBe("abc…");
  });
});

describe("exportFilename", () => {
  const day = new Date("2026-10-06T12:00:00Z");
  it("is safe for Content-Disposition", () => {
    expect(exportFilename("green-jobs", "wide", day)).toBe("submissions-green-jobs-wide-2026-10-06.csv");
    expect(exportFilename(null, "long", day)).toBe("submissions-all-long-2026-10-06.csv");
    expect(exportFilename('a"b\r\n;c/../d', "long", day)).toBe("submissions-a-b-c-d-long-2026-10-06.csv");
  });
});
