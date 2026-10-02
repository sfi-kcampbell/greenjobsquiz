import { describe, expect, it } from "vitest";
import { pinMatches, pinSignInEnabled } from "./pin-check";

describe("pinSignInEnabled", () => {
  it("is off when unset or too short", () => {
    expect(pinSignInEnabled(undefined)).toBe(false);
    expect(pinSignInEnabled("")).toBe(false);
    expect(pinSignInEnabled("12345")).toBe(false);
  });
  it("is on at 6+ characters", () => {
    expect(pinSignInEnabled("123456")).toBe(true);
    expect(pinSignInEnabled("a much longer pin")).toBe(true);
  });
});

describe("pinMatches", () => {
  it("accepts the exact PIN", () => {
    expect(pinMatches("482913", "482913")).toBe(true);
  });
  it("rejects wrong, empty and near-miss PINs", () => {
    expect(pinMatches("482914", "482913")).toBe(false);
    expect(pinMatches("", "482913")).toBe(false);
    expect(pinMatches("482913 ", "482913")).toBe(false);
  });
  it("rejects everything when the feature is off", () => {
    expect(pinMatches("12345", "12345")).toBe(false);
    expect(pinMatches("anything", undefined)).toBe(false);
  });
});
