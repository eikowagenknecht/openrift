import { describe, expect, it } from "vitest";

import { errorText } from "./error-text";

describe("errorText", () => {
  it("returns the message of a thrown Error", () => {
    expect(errorText(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns the message of an Error subclass", () => {
    expect(errorText(new TypeError("not found"), "fallback")).toBe("not found");
  });

  it("returns an empty message rather than the fallback", () => {
    const emptied = new Error("boom");
    emptied.message = "";
    expect(errorText(emptied, "fallback")).toBe("");
  });

  it("returns the fallback for a thrown string", () => {
    expect(errorText("a string", "fallback")).toBe("fallback");
  });

  it("returns the fallback for a plain object that carries a message", () => {
    expect(errorText({ message: "ignored" }, "fallback")).toBe("fallback");
  });

  it("returns the fallback for null and undefined", () => {
    expect(errorText(null, "fallback")).toBe("fallback");
    expect(errorText(undefined, "fallback")).toBe("fallback");
  });
});
