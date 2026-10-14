import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { messagesFor } from "@/lib/i18n";
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

  it("words known errors in the respondent's language, and passes on the server's message for others", () => {
    expect(errorMessage(conflict)).toBe("This attempt was already submitted. Start over to answer again.");
    expect(errorMessage(conflict, messagesFor("es"))).toBe("Este intento ya se envió. Empieza de nuevo para volver a responder.");
    const other = new ApiError(422, "quiz_something_new", "A new kind of problem.");
    expect(errorMessage(other)).toBe("A new kind of problem.");
    expect(saveErrorMessage(other, messagesFor("fr"))).toBe("A new kind of problem.");
    expect(errorMessage(network, messagesFor("fr"))).toMatch(/connexion/);
  });

  it("explains a quiz code problem by its reason", () => {
    const closed = new ApiError(422, "quiz_code_invalid", "That code has closed.", { reason: "closed" });
    expect(errorMessage(closed, messagesFor("es"))).toBe("Ese código ya no está activo.");
  });

  it("says why a save failed", () => {
    expect(saveErrorMessage(network)).toMatch(/Check your connection/);
    expect(saveErrorMessage(server)).toMatch(/problem on our side/);
  });
});
