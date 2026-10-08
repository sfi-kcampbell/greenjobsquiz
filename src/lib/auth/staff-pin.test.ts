import { describe, expect, it } from "vitest";
import { DUMMY_HASH, generatePin, hashPin, normalizePin, PIN_ALPHABET, verifyPin } from "./staff-pin";

describe("staff PINs", () => {
  it("generates readable 12-character PINs in groups of four", () => {
    const pins = new Set(Array.from({ length: 50 }, generatePin));
    expect(pins.size).toBe(50);
    for (const pin of pins) {
      expect(pin).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect([...normalizePin(pin)].every((c) => PIN_ALPHABET.includes(c))).toBe(true);
      expect(pin).not.toMatch(/[01ILO]/);
    }
  });

  it("ignores case, spaces and dashes", () => {
    expect(normalizePin(" abcd-efgh jkmn ")).toBe("ABCDEFGHJKMN");
  });

  it("verifies only the right PIN", async () => {
    const pin = generatePin();
    const hash = await hashPin(pin);
    expect(hash).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain(normalizePin(pin));
    expect(await verifyPin(pin, hash)).toBe(true);
    expect(await verifyPin(normalizePin(pin).toLowerCase(), hash)).toBe(true);
    expect(await verifyPin("WRONG-PINX-XXXX", hash)).toBe(false);
    expect(await verifyPin("", hash)).toBe(false);
    expect(await verifyPin(pin, hash.slice(0, -2) + "AA")).toBe(false);
    expect(await verifyPin(pin, "plain")).toBe(false);
  });

  it("salts every hash, and the dummy never matches", async () => {
    expect(await hashPin("ABCD")).not.toBe(await hashPin("ABCD"));
    expect(await verifyPin("anything", null)).toBe(false);
    expect(await verifyPin("anything", DUMMY_HASH)).toBe(false);
  });
});
