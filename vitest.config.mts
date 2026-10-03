import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

// Take only TEST_DATABASE_URL from .env; the rest of .env (SUPER_ADMINS,
// SECRET_PIN, …) must not leak into unit tests.
if (!process.env.TEST_DATABASE_URL && existsSync(".env")) {
  const fromFile = parse(readFileSync(".env")).TEST_DATABASE_URL;
  if (fromFile) process.env.TEST_DATABASE_URL = fromFile;
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
  },
});
