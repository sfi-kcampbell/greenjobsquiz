import { describe, expect, it } from "vitest";
import { withSslMode } from "./url";

describe("withSslMode", () => {
  it("asks for verify-full where pg already behaves that way", () => {
    expect(withSslMode("postgres://u:p@host/db?sslmode=require")).toBe("postgres://u:p@host/db?sslmode=verify-full");
    expect(withSslMode("postgres://u:p@host/db?sslmode=require&channel_binding=require")).toBe(
      "postgres://u:p@host/db?sslmode=verify-full&channel_binding=require",
    );
    expect(withSslMode("postgres://h/db?a=1&sslmode=prefer")).toBe("postgres://h/db?a=1&sslmode=verify-full");
    expect(withSslMode("postgres://h/db?sslmode=verify-ca")).toBe("postgres://h/db?sslmode=verify-full");
  });

  it("leaves other URLs alone", () => {
    expect(withSslMode("postgresql://postgres@localhost:5432/pltquiz")).toBe("postgresql://postgres@localhost:5432/pltquiz");
    expect(withSslMode("postgres://h/db?sslmode=disable")).toBe("postgres://h/db?sslmode=disable");
    expect(withSslMode("postgres://h/db?sslmode=verify-full")).toBe("postgres://h/db?sslmode=verify-full");
    expect(withSslMode(undefined)).toBeUndefined();
  });
});
