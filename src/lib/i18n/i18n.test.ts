import { describe, expect, it } from "vitest";
import { longDate, messagesFor } from ".";
import { offeredLocales, pickLocale } from "./locales";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";

describe("pickLocale", () => {
  const offered = offeredLocales(["es"]);

  it("offers English first, then the quiz's supported languages", () => {
    expect(offeredLocales(["fr", "de", "es"])).toEqual(["en", "es", "fr"]);
    expect(offeredLocales([])).toEqual(["en"]);
  });

  it("uses ?lang= when the quiz offers it", () => {
    expect(pickLocale("es", "fr", offered)).toBe("es");
    expect(pickLocale("ES", null, offered)).toBe("es");
    expect(pickLocale("en", "es", offered)).toBe("en"); // asked for English explicitly
  });

  it("falls back to the browser's best offered language, then English", () => {
    expect(pickLocale(null, "fr-FR,fr;q=0.9,es;q=0.8,en;q=0.5", offered)).toBe("es");
    expect(pickLocale("fr", "es-MX", offered)).toBe("es"); // French isn't offered
    expect(pickLocale("de", "de-DE", offered)).toBe("en");
    expect(pickLocale(undefined, "es;q=0, en", offered)).toBe("en");
    expect(pickLocale(undefined, null, offered)).toBe("en");
  });
});

describe("catalogs", () => {
  it("every language has exactly the English keys", () => {
    for (const catalog of [es, fr]) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      expect(Object.keys(catalog.errors).sort()).toEqual(expect.arrayContaining(Object.keys(en.errors)));
    }
  });

  it("words numbers each language's way", () => {
    expect(en.questionCount(1)).toBe("1 question");
    expect(en.questionCount(3)).toBe("3 questions");
    expect(es.questionCount(1)).toBe("1 pregunta");
    expect(es.questionCount(3)).toBe("3 preguntas");
    expect(fr.answeredOf(1, 5)).toBe("1 sur 5 répondue");
    expect(fr.answeredOf(2, 5)).toBe("2 sur 5 répondues");
    expect(es.chooseUpTo(2, 1)).toBe("Puedes elegir hasta 2. Desmarca 1 para continuar.");
  });

  it("falls back to English for unknown languages, and formats dates in the language", () => {
    expect(messagesFor("de")).toBe(en);
    expect(messagesFor(null)).toBe(en);
    expect(longDate("es", "2026-03-04T12:00:00Z", { utc: true })).toBe("4 de marzo de 2026");
    expect(longDate("fr", "2026-03-04T12:00:00Z", { utc: true })).toBe("4 mars 2026");
    expect(longDate("en", "2026-03-04T12:00:00Z", { utc: true })).toBe("March 4, 2026");
  });
});
