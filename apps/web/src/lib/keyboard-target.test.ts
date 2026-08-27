import { describe, expect, it } from "vitest";

import { isTypingTarget } from "./keyboard-target";

describe("isTypingTarget", () => {
  it("is true for text inputs", () => {
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);
  });

  it("is true for textareas and selects", () => {
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("is true for contenteditable regions", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it("is false for ordinary elements and for null", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
