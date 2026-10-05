import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage, saveErrorMessage } from "./messages";

describe("respondent error messages", () => {
  const network = new ApiError(0, "quiz_network_error", "offline");
  const server = new ApiError(500, "quiz_server_error", "Something went wrong. Please try again.");
  const conflict = new ApiError(409, "quiz_already_submitted", "This attempt was already submitted.");

  it("only blames the connection for network failures", () => {
    expect(errorMessage(network)).toMatch(/connection/);
    expect(errorMessage(server)).toMatch(/on our side/);
    expect(errorMessage(server)).not.toMatch(/connection/);
    expect(errorMessage(new Error("boom"))).toMatch(/on our side/);
  });

  it("passes on the server's own message for other errors", () => {
    expect(errorMessage(conflict)).toBe("This attempt was already submitted.");
    expect(saveErrorMessage(conflict)).toBe("This attempt was already submitted.");
  });

  it("says why a save failed", () => {
    expect(saveErrorMessage(network)).toMatch(/Check your connection/);
    expect(saveErrorMessage(server)).toMatch(/problem on our side/);
  });
});
